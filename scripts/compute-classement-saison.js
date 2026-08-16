// Classement de saison (CONCEPTION-classement-saisonnier.md) : clôture la saison en
// cours dès que sa fenêtre `[debut, fin]` (app_config/classement_saison) est dépassée —
// archive le top 10 garçons / top 10 filles dans classement_saisons/{saisonId}, pose
// `cloturee: true`, puis remet season.score/season.colorCounts à zéro sur tous les
// profils. Fenêtre paramétrable par l'admin (AdminSeasonConfig.tsx), plus une date fixe
// codée en dur — le script doit donc la relire à chaque exécution, pas la déduire du
// calendrier.
//
//   node compute-classement-saison.js            → mode simulation (par défaut, comme
//                                                    reconcile-classement-profiles.js et
//                                                    cleanup-orphan-boulder-images.js) :
//                                                    calcule et journalise le top 10/10 et
//                                                    le nombre de profils qui seraient
//                                                    remis à zéro, n'écrit jamais rien
//   node compute-classement-saison.js --fix       → clôture réellement si la fenêtre est
//                                                    dépassée et pas déjà clôturée ; ne
//                                                    fait rien sinon (log explicite)
//
// ✅ Retour ClaudeNav (17/08/2026, RELECTURE-classement-saisonnier.md point 1) : c'est le
// reset le plus destructeur des trois scripts de ce projet (irréversible, jamais rejoué
// contre la prod), et c'était pourtant le seul sans simulation par défaut — asymétrie à
// l'envers, corrigée en alignant sur la convention des deux autres scripts.
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

const FIX = process.argv.includes('--fix');
const BATCH_SIZE = 400; // marge sous la limite de 500 écritures par batch Firestore
const TOP_N = 10;
const RECONFIGURATION_GRACE_DAYS = 7; // ✅ voir le commentaire au point d'usage ci-dessous

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
    // ✅ Retour ClaudeNav (17/08/2026, point 2) : un oubli de reconfiguration est
    // silencieux — indiscernable d'un début de saison normal (tout le monde à zéro dans
    // le classement de saison), et le rattrapage est impossible (la réconciliation
    // recompute sur la fenêtre courante, pas sur l'historique). Un log qui passe au vert
    // ne suffit pas : au-delà de RECONFIGURATION_GRACE_DAYS sans reconfiguration, le
    // workflow doit échouer visiblement, pas juste l'écrire dans une sortie que personne
    // ne relit.
    const closedAt = config.cloturee_at ? new Date(config.cloturee_at) : null;
    const daysSinceClosure = closedAt ? Math.floor((Date.now() - closedAt.getTime()) / 86400000) : null;
    if (daysSinceClosure !== null && daysSinceClosure > RECONFIGURATION_GRACE_DAYS) {
      console.error(
        `🛑 Saison clôturée depuis ${daysSinceClosure} jours (le ${config.cloturee_at}) sans reconfiguration ` +
        `de la fenêtre suivante par l'admin (seuil : ${RECONFIGURATION_GRACE_DAYS} jours). Le classement de ` +
        `saison est bloqué à zéro pour tout le monde pendant ce temps. Reconfigurer via /admin/season-config.`
      );
      process.exitCode = 1; // ✅ Échec visible du workflow, pas un run vert qui masquerait l'oubli.
      return;
    }
    console.log(`Saison déjà clôturée${daysSinceClosure !== null ? ` depuis ${daysSinceClosure} jour(s)` : ''}, en attente de reconfiguration par l'admin — rien à faire.`);
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

  if (!FIX) {
    console.log(`[simulation] Archiverait classement_saisons/${saisonId} :`, JSON.stringify(archive, null, 2));
    console.log(`[simulation] Remettrait ${profiles.length} profil(s) à zéro pour la saison suivante (season.score/season.colorCounts).`);
    console.log('[simulation] Ne pose pas cloturee. Relancez avec --fix pour clôturer réellement.');
    return;
  }

  // ✅ Ordre impératif (voir doc de conception) : archive + cloturee AVANT tout reset —
  // une remise à zéro avant que l'archivage ait réussi serait une perte de données
  // réelle, contrairement à une dérive du compteur incrémental (corrective par
  // construction). On s'arrête sans reset si l'une des deux écritures échoue.
  await db.collection('classement_saisons').doc(saisonId).set(archive);
  await configRef.set({ cloturee: true, cloturee_at: new Date().toISOString() }, { merge: true });
  console.log(`Archive écrite (classement_saisons/${saisonId}), cloturee posé à true.`);

  const allRefs = profiles.map((p) => db.collection('classement_profiles').doc(p.uid));
  await chunkedBatchUpdate(allRefs, () => ({ season: { score: 0, colorCounts: {} } }));
  console.log(`${allRefs.length} profil(s) remis à zéro pour la saison suivante.`);
}

main().catch((err) => {
  console.error('Erreur :', err);
  process.exitCode = 1;
});
