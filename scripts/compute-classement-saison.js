// Classement de saison (CONCEPTION-classement-saisonnier.md) : clôture la saison en
// cours dès que sa fenêtre `[debut, fin]` (app_config/classement_saison) est dépassée —
// archive le top 10 garçons / top 10 filles dans classement_saisons/{saisonId}, pose
// `cloturee: true`, puis remet season.score/season.colorCounts à zéro sur tous les
// profils. Fenêtre paramétrable par l'admin (AdminSeasonConfig.tsx), plus une date fixe
// codée en dur — le script doit donc la relire à chaque exécution, pas la déduire du
// calendrier.
//
//   node compute-classement-saison.js            → clôture réellement si la fenêtre est
//                                                    dépassée et pas déjà clôturée ; ne
//                                                    fait rien sinon (log explicite)
//   node compute-classement-saison.js --dry-run   → calcule et journalise le top 10/10
//                                                    sans rien écrire (débogage)
//
// Contrairement à reconcile-classement-profiles.js, ce script ne recalcule PAS
// season.score/season.colorCounts depuis client_boulder_results : le compteur
// incrémental (ClientDaily.tsx) est réputé à jour toute l'année, ce script se contente
// de trier/archiver/réinitialiser — voir la section dédiée de la réconciliation pour la
// vérification de dérive.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

const app = initializeApp({ credential: cert(readServiceAccount()) });
const db = getFirestore(app);

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 400; // marge sous la limite de 500 écritures par batch Firestore
const TOP_N = 10;

// ✅ Genre normalisé le temps du tri seulement (même logique que
// ClientClassement.tsx#normalizeGender) — les comptes sans genre renseigné, ou avec une
// valeur hors "Homme"/"Femme" (legacy), sortent des deux groupes plutôt que de fausser
// l'un des deux.
function normalizedGenderGroup(gender) {
  if (!gender) return null;
  const trimmed = gender.trim().toLowerCase();
  if (trimmed === 'homme') return 'garcons';
  if (trimmed === 'femme') return 'filles';
  return null;
}

function totalBouldersFromColorCounts(colorCounts) {
  return Object.values(colorCounts || {}).reduce((sum, n) => sum + (n || 0), 0);
}

// ✅ Départage à égalité décidé avec l'utilisateur (17/08/2026) : score de saison, puis
// nombre total de blocs validés dans la saison. Renvoie TOUS les comptes à égalité au
// seuil de la 10e place (potentiellement plus de 10 entrées) plutôt que de trancher
// arbitrairement — voir CONCEPTION-classement-saisonnier.md, "Départage à égalité".
function topNWithTies(entries, n) {
  const sorted = [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.totalBoulders - a.totalBoulders;
  });
  if (sorted.length <= n) return sorted;
  const cutoff = sorted[n - 1];
  return sorted.filter((e) => e.score > cutoff.score ||
    (e.score === cutoff.score && e.totalBoulders >= cutoff.totalBoulders));
}

async function fetchAllProfiles() {
  const snapshot = await db.collection('classement_profiles').get();
  return snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() }));
}

async function chunkedBatchUpdate(refs, dataFn) {
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.set(ref, dataFn(), { merge: true }));
    await batch.commit();
  }
}

async function main() {
  const configRef = db.collection('app_config').doc('classement_saison');
  const configSnap = await configRef.get();
  if (!configSnap.exists) {
    console.log('Aucune fenêtre de saison configurée (app_config/classement_saison absent) — rien à faire.');
    return;
  }
  const config = configSnap.data();
  if (!config.debut || !config.fin) {
    console.log('Fenêtre de saison incomplète (debut/fin manquant) — rien à faire.');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);

  // ✅ Garde-fou §2 relecture 17/08/2026 : ne clôture ni une saison en cours, ni une
  // saison déjà clôturée en attente de reconfiguration (évite une seconde archive
  // parasite ou un reset sans effet mais inutile en cas de rejeu du cron quotidien).
  if (today <= config.fin) {
    console.log(`Saison en cours (fin le ${config.fin}, aujourd'hui ${today}) — rien à faire.`);
    return;
  }
  if (config.cloturee) {
    console.log('Saison déjà clôturée, en attente de reconfiguration par l\'admin — rien à faire.');
    return;
  }

  console.log(`Clôture de la saison ${config.debut} → ${config.fin} (aujourd'hui ${today}).`);
  const profiles = await fetchAllProfiles();
  console.log(`${profiles.length} profil(s) chargé(s).`);

  // ✅ Décision §3 relecture 17/08/2026 : un compte opt-out du classement public est
  // exclu du tri de qualification (mais PAS du reset, plus bas — le reset s'applique à
  // tous les comptes).
  const optIn = profiles.filter((p) => p.classementOptIn === true);
  const excludedOptOut = profiles.length - optIn.length;

  const noGender = [];
  const garcons = [];
  const filles = [];
  optIn.forEach((p) => {
    const group = normalizedGenderGroup(p.gender);
    const entry = {
      uid: p.uid,
      score: p.season?.score || 0,
      totalBoulders: totalBouldersFromColorCounts(p.season?.colorCounts),
    };
    if (!group) { noGender.push(p.uid); return; }
    (group === 'garcons' ? garcons : filles).push(entry);
  });

  const topGarcons = topNWithTies(garcons, TOP_N);
  const topFilles = topNWithTies(filles, TOP_N);

  console.log(`Qualifiés : ${topGarcons.length} garçon(s), ${topFilles.length} fille(s).`);
  console.log(`Exclus opt-out : ${excludedOptOut}. Sans genre renseigné (exclus du tri) : ${noGender.length}${noGender.length ? ` [${noGender.join(', ')}]` : ''}.`);

  const saisonId = `${config.debut.slice(0, 4)}-${config.fin.slice(0, 4)}`;
  const withRank = (entries) => entries.map((e, idx) => ({ ...e, rank: idx + 1 }));
  const archive = {
    computed_at: new Date().toISOString(),
    top_garcons: withRank(topGarcons).map((e) => ({ uid: e.uid, score: e.score, bouldersValidated: e.totalBoulders, rank: e.rank })),
    top_filles: withRank(topFilles).map((e) => ({ uid: e.uid, score: e.score, bouldersValidated: e.totalBoulders, rank: e.rank })),
  };

  if (DRY_RUN) {
    console.log(`[--dry-run] Archiverait classement_saisons/${saisonId} :`, JSON.stringify(archive, null, 2));
    console.log('[--dry-run] Ne pose pas cloturee, ne remet rien à zéro.');
    return;
  }

  // ✅ Ordre impératif (voir doc de conception) : archive + cloturee AVANT tout reset —
  // une remise à zéro avant que l'archivage ait réussi serait une perte de données
  // réelle, contrairement à une dérive du compteur incrémental (corrective par
  // construction). On s'arrête sans reset si l'une des deux écritures échoue.
  await db.collection('classement_saisons').doc(saisonId).set(archive);
  await configRef.set({ cloturee: true }, { merge: true });
  console.log(`Archive écrite (classement_saisons/${saisonId}), cloturee posé à true.`);

  const allRefs = profiles.map((p) => db.collection('classement_profiles').doc(p.uid));
  await chunkedBatchUpdate(allRefs, () => ({ season: { score: 0, colorCounts: {} } }));
  console.log(`${allRefs.length} profil(s) remis à zéro pour la saison suivante.`);
}

main().catch((err) => {
  console.error('Erreur :', err);
  process.exitCode = 1;
});
