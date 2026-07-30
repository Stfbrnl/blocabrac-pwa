// Chantier 4 (PLAN-spark-images-competition.md) : nettoyage des images Cloudinary
// orphelines (bloc supprimé/remplacé après le Chantier 2, image jamais nettoyée côté
// Cloudinary puisque l'upload non signé ne peut pas être supprimé depuis le navigateur).
//
//   node cleanup-orphan-boulder-images.js            → mode simulation (par défaut, ne
//                                                        supprime jamais rien)
//   node cleanup-orphan-boulder-images.js --delete   → suppression réelle des orphelines
//
// Garde-fous non négociables (voir le plan) :
//   - simulation par défaut, suppression réelle seulement derrière --delete
//   - ne touche jamais une ressource Cloudinary de moins de 7 jours
//   - s'interrompt si le nombre de références chute de plus de 20 % par rapport à la
//     précédente exécution (cleanup-state.json) — signe probable d'une lecture
//     Firestore partielle ou d'une erreur d'authentification, pas de vraies suppressions
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
const STATE_DIR = path.join(__dirname, '../cleanup-state');
const STATE_PATH = path.join(STATE_DIR, 'state.json');
const LOG_PATH = path.join(STATE_DIR, 'orphan-images-log.json');
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'cloudinary-admin-credentials.json');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DROP_GUARD_RATIO = 0.8; // s'interrompt si les références chutent de plus de 20 %

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

async function fetchAllReferencedPublicIds(db) {
  // ✅ Aucun filtre (is_active, type, competition_active) : un bloc d'une compétition
  // passée reste consultable dans les stats, son image ne doit jamais être traitée
  // comme orpheline juste parce que le bloc est désactivé.
  const snapshot = await db.collection('boulders').get();
  const ids = new Set();
  snapshot.forEach((docSnap) => {
    const publicId = docSnap.data().image_public_id;
    if (publicId) ids.add(publicId);
  });
  return ids;
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

async function main() {
  const isDelete = process.argv.includes('--delete');
  const { apiKey, apiSecret } = readCloudinaryAdminCredentials();

  const app = initializeApp({ credential: cert(readServiceAccount()) });
  const db = getFirestore(app);

  console.log('Lecture des références Firestore (collection boulders, sans filtre)...');
  const referencedIds = await fetchAllReferencedPublicIds(db);
  console.log(`${referencedIds.size} image(s) référencée(s).`);

  const previousState = readState();
  if (previousState && referencedIds.size < previousState.referenceCount * DROP_GUARD_RATIO) {
    console.error(
      `❌ Arrêt de sécurité : ${referencedIds.size} références trouvées contre ` +
      `${previousState.referenceCount} lors de la précédente exécution ` +
      `(chute de plus de 20 %). Signe probable d'une lecture Firestore partielle ou ` +
      "d'une erreur d'authentification — aucune suppression n'a été effectuée."
    );
    process.exit(1);
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
