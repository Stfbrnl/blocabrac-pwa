// Chantier 4 (PLAN-spark-images-competition.md) : nettoyage des images Cloudinary
// orphelines (bloc supprimé/remplacé après le Chantier 2, image jamais nettoyée côté
// Cloudinary puisque l'upload non signé ne peut pas être supprimé depuis le navigateur).
//
//   node cleanup-orphan-boulder-images.js                     → mode simulation (par
//                                                                 défaut, ne supprime
//                                                                 jamais rien)
//   node cleanup-orphan-boulder-images.js --delete            → suppression réelle des
//                                                                 orphelines
//   node cleanup-orphan-boulder-images.js --backup <dossier>  → télécharge localement
//     toutes les images actuellement référencées (idempotent, relançable), combinable
//     avec --delete. Point 1 du suivi post-Spark (14/08/2026) : depuis la Passe B,
//     l'unique exemplaire de chaque image est chez Cloudinary sur un compte gratuit,
//     sans backup. Usage manuel occasionnel pour l'instant (pas d'automatisation CI).
//
// Garde-fous non négociables (voir le plan) :
//   - simulation par défaut, suppression réelle seulement derrière --delete
//   - ne touche jamais une ressource Cloudinary de moins de 7 jours
//   - s'interrompt si le nombre de références chute de plus de 20 % ET d'au moins
//     DROP_GUARD_ABSOLUTE_MIN références par rapport à la précédente exécution
//     (cleanup-state.json) — signe probable d'une lecture Firestore partielle ou d'une
//     erreur d'authentification, pas de vraies suppressions. Les deux conditions sont
//     nécessaires (point 2 du suivi post-Spark, 14/08/2026) : une rotation de secteur
//     retire légitimement un mur entier d'un coup (jusqu'à ~15 blocs), un pur seuil en
//     % se déclencherait à tort à faible volume (25 blocs aujourd'hui, 150 à pleine
//     capacité sur 10 murs) ; l'écart absolu seul serait lui trop permissif à bas volume.
//     `--force` (ou `--accept-drop`) contourne explicitement l'arrêt sans avoir à éditer
//     cleanup-state/state.json à la main.
//   - en l'absence de cleanup-state/state.json (premier run, ou fichier perdu), il n'y a
//     rien à comparer : le garde-fou ne peut pas s'appliquer. Ce cas est signalé
//     explicitement (pas de passage silencieux) et établit l'état de référence pour la
//     prochaine exécution.
//   - journalise chaque suppression (public_id, date, taille) dans un fichier conservé
//
// Piège spécifique à ce projet : certains blocs sont désactivés logiquement
// (is_active: false) mais leur image reste référencée pour l'historique des stats
// (compétitions passées). Ce script liste TOUS les documents "boulders" sans filtre sur
// is_active/type/competition_active — recensement confirmé exhaustif : aucune autre
// collection (boulder_reports, exercises, etc.) ne référence de image_public_id.
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ✅ Ce script vit dans scripts/ (suivi par git, contrairement à firestore-migration/
// qui est entièrement ignoré) pour que la GitHub Action puisse le checkout — sinon
// `actions/checkout` ne restaure jamais un fichier qui n'a jamais été commité. Les
// identifiants, eux, restent dans firestore-migration/ (jamais commités) pour
// l'exécution manuelle depuis le Codespace ; en CI ils viennent des secrets GitHub.
const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');

// ✅ Deux façons d'obtenir les identifiants : variables d'environnement (GitHub
// Action, secrets injectés à l'exécution) en priorité, sinon fichiers locaux
// (exécution manuelle depuis le Codespace, jamais commités).
function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

// ✅ cleanup-state/ est suivi normalement par git (contrairement à
// firestore-migration/) : le garde-fou anti-chute a besoin que l'état survive d'une
// exécution à l'autre, y compris depuis une machine CI vierge à chaque run (la
// GitHub Action commit ce fichier après chaque exécution — voir le workflow).
//
// ✅ Retour ClaudeNav (19/08/2026, PROCESSUS-erreurs-avalees.md, étendu depuis
// reconcile-classement-profiles.js) : le risque est ici PLUS grave que pour ce
// dernier — `state.json` alimente directement le garde-fou anti-chute (comparaison au
// run précédent). Un run local contre l'émulateur y écrirait un nombre de références
// sans rapport avec la production ; le cron du mois suivant comparerait la vraie prod
// à ce chiffre fantôme, avec un sens d'erreur imprévisible (arrêt sans raison, ou pire,
// garde-fou qui laisse passer une vraie chute). Même parade : chemin dérivé de
// `FIRESTORE_EMULATOR_HOST`, jamais le fichier de production quand elle est présente.
const IS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const STATE_DIR = path.join(__dirname, '../cleanup-state');
const STATE_PATH = path.join(STATE_DIR, IS_EMULATOR ? 'state.emulator.json' : 'state.json');
const LOG_PATH = path.join(STATE_DIR, IS_EMULATOR ? 'orphan-images-log.emulator.json' : 'orphan-images-log.json');
if (IS_EMULATOR) {
  console.warn(`⚠️  FIRESTORE_EMULATOR_HOST détecté — état/journal écrits sous *.emulator.json (jamais les fichiers de production).`);
}
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'cloudinary-admin-credentials.json');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DROP_GUARD_RATIO = 0.8; // se déclenche si les références tombent sous 80 % du run précédent...
const DROP_GUARD_ABSOLUTE_MIN_DROP = 20; // ...ET seulement si la chute dépasse aussi 20 références

function readEnvVar(name) {
  const envPath = path.join(__dirname, '../frontend/.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!match) throw new Error(`Variable ${name} introuvable dans frontend/.env`);
  return match[1].trim();
}

function readCloudinaryAdminCredentials() {
  if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    return { apiKey: process.env.CLOUDINARY_API_KEY, apiSecret: process.env.CLOUDINARY_API_SECRET };
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Fichier manquant : ${CREDENTIALS_PATH}\n` +
      'Créez-le (jamais commité, firestore-migration/ est ignoré par git) avec :\n' +
      '{ "apiKey": "...", "apiSecret": "..." }\n' +
      'Ces deux valeurs sont sur le Dashboard Cloudinary, à côté du cloud name. ' +
      "L'API secret ne doit JAMAIS être placé dans frontend/.env (côté navigateur)."
    );
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
}

function readState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function writeState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function appendLog(entry) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(LOG_PATH, line);
}

const CLOUD_NAME = process.env.VITE_CLOUDINARY_CLOUD_NAME || readEnvVar('VITE_CLOUDINARY_CLOUD_NAME');

async function fetchAllReferencedBoulderImages(db) {
  // ✅ Aucun filtre (is_active, type, competition_active) : un bloc d'une compétition
  // passée reste consultable dans les stats, son image ne doit jamais être traitée
  // comme orpheline juste parce que le bloc est désactivé.
  const snapshot = await db.collection('boulders').get();
  const boulderIdByPublicId = new Map();
  snapshot.forEach((docSnap) => {
    const publicId = docSnap.data().image_public_id;
    if (publicId) boulderIdByPublicId.set(publicId, docSnap.id);
  });
  return boulderIdByPublicId;
}

async function fetchAllCloudinaryResources(apiKey, apiSecret) {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const resources = [];
  let nextCursor;
  do {
    const url = new URL(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image/upload`);
    url.searchParams.set('prefix', 'blocabrac/boulders/');
    url.searchParams.set('type', 'upload');
    url.searchParams.set('max_results', '500');
    if (nextCursor) url.searchParams.set('next_cursor', nextCursor);

    const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Cloudinary Admin API a répondu ${response.status} : ${text}`);
    }
    const data = await response.json();
    resources.push(...data.resources);
    nextCursor = data.next_cursor;
  } while (nextCursor);
  return resources;
}

async function deleteCloudinaryResources(publicIds, apiKey, apiSecret) {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  // L'API Admin accepte au plus 100 public_ids par appel.
  for (let i = 0; i < publicIds.length; i += 100) {
    const batch = publicIds.slice(i, i + 100);
    const url = new URL(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image/upload`);
    batch.forEach((id) => url.searchParams.append('public_ids[]', id));
    const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Basic ${auth}` } });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Suppression Cloudinary échouée (${response.status}) : ${text}`);
    }
  }
}

// Point 1 du suivi post-Spark (14/08/2026) : avant la Passe B, les images vivaient dans
// Firestore (sauvegardées avec la base). Depuis, l'unique exemplaire de chaque photo est
// chez Cloudinary sur un compte gratuit, sans backup. Ce mode télécharge localement les
// images actuellement référencées — idempotent (skip celles déjà présentes), relançable.
// Usage manuel occasionnel décidé pour l'instant, pas d'automatisation CI.
function sanitizeFilename(publicId) {
  return publicId.replace(/\//g, '__');
}

const EXTENSION_BY_CONTENT_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif'
};

// Recherche un fichier déjà sauvegardé pour ce public_id, quelle que soit l'extension
// (le format Cloudinary d'origine ne change pas d'un run à l'autre, mais on ne le
// suppose pas pour rester idempotent même si l'extension déduite changeait).
function findExistingBackup(backupDir, sanitized) {
  return fs.readdirSync(backupDir).find((f) => f.startsWith(`${sanitized}.`));
}

async function backupReferencedImages(backupDir, boulderIdByPublicId) {
  fs.mkdirSync(backupDir, { recursive: true });
  const manifestPath = path.join(backupDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

  let downloaded = 0;
  let skipped = 0;
  for (const [publicId, boulderId] of boulderIdByPublicId) {
    const sanitized = sanitizeFilename(publicId);
    const existing = findExistingBackup(backupDir, sanitized);
    if (existing) {
      skipped += 1;
      manifest[publicId] = { boulderId, filename: existing };
      continue;
    }

    // URL non transformée (pas de f_auto/w_xxx) : on sauvegarde l'image source telle
    // qu'uploadée, pas une variante d'affichage.
    const url = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${publicId}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  ⚠️  Échec téléchargement ${publicId} (${response.status}), ignoré.`);
      continue;
    }
    const contentType = response.headers.get('content-type');
    const ext = EXTENSION_BY_CONTENT_TYPE[contentType] || 'bin';
    const filename = `${sanitized}.${ext}`;
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(path.join(backupDir, filename), buffer);
    manifest[publicId] = { boulderId, filename };
    downloaded += 1;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Sauvegarde : ${downloaded} téléchargée(s), ${skipped} déjà présente(s), manifeste écrit dans ${manifestPath}.`);
}

async function main() {
  const isDelete = process.argv.includes('--delete');
  const isForced = process.argv.includes('--force') || process.argv.includes('--accept-drop');
  const backupFlagIndex = process.argv.indexOf('--backup');
  const backupDir = backupFlagIndex >= 0 ? process.argv[backupFlagIndex + 1] : null;
  if (backupFlagIndex >= 0 && !backupDir) {
    throw new Error('--backup requiert un chemin de dossier, ex : --backup ../boulder-images-backup');
  }
  const { apiKey, apiSecret } = readCloudinaryAdminCredentials();

  const app = initializeApp({ credential: cert(readServiceAccount()) });
  const db = getFirestore(app);

  console.log('Lecture des références Firestore (collection boulders, sans filtre)...');
  const boulderIdByPublicId = await fetchAllReferencedBoulderImages(db);
  const referencedIds = new Set(boulderIdByPublicId.keys());
  console.log(`${referencedIds.size} image(s) référencée(s).`);

  if (backupDir) {
    console.log(`\nSauvegarde des images référencées vers ${backupDir}...`);
    await backupReferencedImages(backupDir, boulderIdByPublicId);
  }

  const previousState = readState();
  if (!previousState) {
    console.log(
      "ℹ️  Aucun état précédent trouvé (premier run, ou cleanup-state/state.json perdu) : " +
      'le garde-fou anti-chute ne peut pas être appliqué faute de référence. ' +
      `${referencedIds.size} référence(s) devien(nen)t la base de comparaison pour la ` +
      'prochaine exécution.'
    );
  } else {
    const drop = previousState.referenceCount - referencedIds.size;
    const ratioTripped = referencedIds.size < previousState.referenceCount * DROP_GUARD_RATIO;
    const absoluteTripped = drop >= DROP_GUARD_ABSOLUTE_MIN_DROP;
    if (ratioTripped && absoluteTripped && !isForced) {
      console.error(
        `❌ Arrêt de sécurité : ${referencedIds.size} références trouvées contre ` +
        `${previousState.referenceCount} lors de la précédente exécution ` +
        `(chute de ${drop} références, plus de 20 %). Signe probable d'une lecture ` +
        "Firestore partielle ou d'une erreur d'authentification — aucune suppression " +
        "n'a été effectuée. Si cette chute est légitime (rotation de secteur), relancer " +
        'avec --force.'
      );
      process.exit(1);
    }
    if (ratioTripped && absoluteTripped && isForced) {
      console.log(
        `⚠️  Chute de ${drop} références (plus de 20 %) détectée mais --force passé : ` +
        'poursuite du nettoyage.'
      );
    }
  }

  console.log('Lecture des ressources Cloudinary (dossier blocabrac/boulders)...');
  const cloudinaryResources = await fetchAllCloudinaryResources(apiKey, apiSecret);
  console.log(`${cloudinaryResources.length} ressource(s) trouvée(s) sur Cloudinary.`);

  const now = Date.now();
  const orphans = cloudinaryResources.filter((resource) => {
    if (referencedIds.has(resource.public_id)) return false;
    const ageMs = now - new Date(resource.created_at).getTime();
    return ageMs > SEVEN_DAYS_MS;
  });

  const recentUnreferenced = cloudinaryResources.filter((resource) => {
    if (referencedIds.has(resource.public_id)) return false;
    const ageMs = now - new Date(resource.created_at).getTime();
    return ageMs <= SEVEN_DAYS_MS;
  });
  if (recentUnreferenced.length > 0) {
    console.log(`${recentUnreferenced.length} ressource(s) non référencée(s) mais < 7 jours : ignorée(s) pour l'instant.`);
  }

  console.log(`\n${orphans.length} orpheline(s) détectée(s) (non référencée(s) et > 7 jours) :`);
  orphans.forEach((o) => {
    console.log(` - ${o.public_id} | créée le ${o.created_at} | ${(o.bytes / 1024).toFixed(1)} Ko`);
  });

  if (!isDelete) {
    console.log('\nMode simulation (par défaut) : aucune suppression effectuée.');
    console.log('Relancer avec --delete pour supprimer réellement ces ressources.');
  } else if (orphans.length > 0) {
    console.log('\nSuppression réelle en cours...');
    await deleteCloudinaryResources(orphans.map((o) => o.public_id), apiKey, apiSecret);
    orphans.forEach((o) => appendLog({ publicId: o.public_id, createdAt: o.created_at, bytes: o.bytes, action: 'delete' }));
    console.log(`${orphans.length} ressource(s) supprimée(s), journalisées dans ${LOG_PATH}.`);
  } else {
    console.log('\nRien à supprimer.');
  }

  writeState({ referenceCount: referencedIds.size, lastRunAt: new Date().toISOString() });
}

main().catch((err) => {
  console.error('❌ Nettoyage échoué :', err);
  process.exit(1);
});
