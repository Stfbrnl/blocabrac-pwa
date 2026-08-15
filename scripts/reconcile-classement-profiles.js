// Chantier "compteur incrémental" (CONCEPTION-selecteur-marge-compteur-incremental.md
// §3) : classement_profiles/{uid}.colorCounts est désormais tenu à jour par petites
// variations (ClientDaily.tsx), pas recalculé depuis l'historique complet à chaque
// validation — un compteur incrémental qui dérive un jour (écriture perdue, bug
// transitoire, correction manuelle en base, migration incomplète) sans mécanisme de
// correction dérive silencieusement et définitivement. C'est CE script.
//
// Sert DEUX rôles avec le même calcul :
//   - Migration : peupler colorCounts sur les profils existants (créés avant ce
//     chantier, qui n'ont que score/bouldersValidated/bestColorRank).
//   - Réconciliation : à relancer périodiquement pour détecter/corriger une dérive de
//     l'incrémental par rapport à la source de vérité (client_boulder_results).
//
// Pour chaque profil, recalcule colorCounts/bouldersValidated/bestColorRank/score
// depuis client_boulder_results (résultats success:true de cet utilisateur), avec le
// MÊME calcul que utils/classementScore.ts (réimplémenté ici en JS pur — un script
// Node CommonJS ne peut pas importer les modules TS/ESM du frontend, même pattern que
// les autres scripts de ce dossier).
//
//   node reconcile-classement-profiles.js                → mode simulation (par
//                                                            défaut, n'écrit jamais rien),
//                                                            journalise chaque écart
//   node reconcile-classement-profiles.js --fix           → corrige les profils en écart
//   node reconcile-classement-profiles.js --uid <uid>      → un seul profil (débogage,
//                                                            ignore le garde-fou ci-dessous)
//   node reconcile-classement-profiles.js --fix --force    → applique --fix même si le
//                                                            garde-fou se déclenche
//
// ✅ Garde-fou anti-dérive massive (retour de ClaudeNav, 16/08/2026,
// CONCEPTION-mode-ffme-et-garde-fou-reconciliation.md §A) : "une dérive de compteur
// incrémental est corrective par construction" n'est vrai QUE pour une dérive de
// données — pas pour un bug du SCRIPT lui-même (dans son propre recalcul, ou après une
// évolution du barème). Sans garde-fou, un tel bug serait propagé sans contrôle par le
// cron mensuel à --fix à TOUS les profils, écrasant au passage les valeurs justes —
// exactement le scénario destructif contre lequel cleanup-orphan-boulder-images.js est
// déjà protégé (7 jours, chute > 20%). Repris ici : le calcul se fait TOUJOURS en
// simulation d'abord (aucune écriture avant d'avoir vérifié l'ampleur de l'écart) ;
// --fix n'écrit que si la proportion de profils en écart reste sous le seuil. Seuil
// hybride (pourcentage ET nombre absolu) — même leçon que le garde-fou de nettoyage :
// à 12 comptes, UN SEUL écart fait déjà 8%, un pur seuil en % se déclencherait à tort.
const DRIFT_GUARD_RATIO = 0.3; // s'interrompt si plus de 30% des profils sont en écart...
const DRIFT_GUARD_ABSOLUTE_MIN = 3; // ...ET qu'au moins 3 profils sont concernés

const path = require('path');
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');
const STATE_DIR = path.join(__dirname, '../cleanup-state');
const LOG_PATH = path.join(STATE_DIR, 'classement-profiles-reconcile-log.json');

// ✅ Même pattern que cleanup-orphan-boulder-images.js / rekey-competition-participants.js :
// variable d'environnement en priorité (CI/exécution distante), sinon fichier local.
function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

const app = initializeApp({ credential: cert(readServiceAccount()) });
const db = getFirestore(app);

const FIX = process.argv.includes('--fix');
const FORCE = process.argv.includes('--force');
const uidArgIndex = process.argv.indexOf('--uid');
const SINGLE_UID = uidArgIndex !== -1 ? process.argv[uidArgIndex + 1] : null;
const BATCH_SIZE = 200;

// ✅ Réimplémentation fidèle de climbingPoints.ts (basePoints/deductions) et
// competitionEligibility.ts (levelOrder) — tenir ces deux copies synchronisées si le
// barème change un jour (rare : le barème quotidien n'a pas changé depuis la création
// de l'app).
const LEVEL_ORDER = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];
const BASE_POINTS = { jaune: 25, vert: 50, bleu: 100, violet: 200, rouge: 400, noir: 600, blanc: 800, rose: 1000 };
const DEDUCTIONS = { jaune: 10, vert: 10, bleu: 10, violet: 10, rouge: 20, noir: 20, blanc: 50, rose: 50 };

function calculatePoints(color, attempts) {
  const base = BASE_POINTS[color] || 0;
  const deduction = attempts > 1 ? (attempts - 1) * (DEDUCTIONS[color] || 0) : 0;
  return Math.max(0, base - deduction);
}

// ✅ client_boulder_results ne stocke PAS la couleur du bloc (voir ClientDaily.tsx) :
// la couleur utilisée pour le calcul est toujours celle ACTUELLE du bloc (colorById),
// jamais figée au moment de la validation — un bloc recoloré change donc le calcul de
// TOUTES ses validations passées, à la prochaine réconciliation comme à la prochaine
// validation de ce bloc précis en usage normal (voir la note dans ClientDaily.tsx).
// Un bloc désactivé depuis (is_active: false) sort de cette carte, donc ses validations
// passées ne comptent plus — même comportement que l'app (voir colorById dans
// ClientDaily.tsx), reproduit ici pour que la réconciliation converge avec le calcul
// réellement fait par l'app, pas avec un calcul "plus complet" mais différent.
async function loadActiveColorById() {
  const snapshot = await db.collection('boulders')
    .where('type', '==', 'daily')
    .where('is_active', '==', true)
    .get();
  const colorById = new Map();
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    colorById.set(docSnap.id, data.color || data.difficulty || null);
  });
  return colorById;
}

// Recalcule le résumé complet d'un utilisateur depuis client_boulder_results — la
// source de vérité, jamais l'inverse.
async function computeExpectedProfile(uid, colorById) {
  const snapshot = await db.collection('client_boulder_results')
    .where('userId', '==', uid)
    .where('success', '==', true)
    .get();

  const colorCounts = {};
  let score = 0;
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const color = colorById.get(data.boulderId);
    const attempts = data.attempts || 1;
    if (!color || !LEVEL_ORDER.includes(color)) return; // bloc désactivé/couleur inconnue : ignoré, pas cassé
    colorCounts[color] = (colorCounts[color] || 0) + 1;
    score += calculatePoints(color, attempts);
  });

  let bouldersValidated = 0;
  let bestColorRank = -1;
  LEVEL_ORDER.forEach((level, idx) => {
    const count = colorCounts[level] || 0;
    bouldersValidated += count;
    if (count > 0 && idx > bestColorRank) bestColorRank = idx;
  });

  return { score, bouldersValidated, bestColorRank, colorCounts };
}

function colorCountsEqual(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    if ((a?.[key] || 0) !== (b?.[key] || 0)) return false;
  }
  return true;
}

// ✅ Calcul PUR (aucune écriture) : compare stocké vs attendu, renvoie l'écart le cas
// échéant. Séparé de l'écriture pour que le garde-fou puisse évaluer l'ampleur de la
// dérive AVANT que quoi que ce soit ne soit modifié — voir main().
async function diffOne(uid, storedData, colorById) {
  const expected = await computeExpectedProfile(uid, colorById);
  const stored = {
    score: storedData.score || 0,
    bouldersValidated: storedData.bouldersValidated || 0,
    bestColorRank: storedData.bestColorRank ?? -1,
    colorCounts: storedData.colorCounts || {},
  };

  const drift = {};
  if (stored.score !== expected.score) drift.score = { stored: stored.score, expected: expected.score };
  if (stored.bouldersValidated !== expected.bouldersValidated) {
    drift.bouldersValidated = { stored: stored.bouldersValidated, expected: expected.bouldersValidated };
  }
  if (stored.bestColorRank !== expected.bestColorRank) {
    drift.bestColorRank = { stored: stored.bestColorRank, expected: expected.bestColorRank };
  }
  if (!colorCountsEqual(stored.colorCounts, expected.colorCounts)) {
    drift.colorCounts = { stored: stored.colorCounts, expected: expected.colorCounts };
  }

  if (Object.keys(drift).length === 0) return { uid, drifted: false };
  return { uid, drifted: true, drift, expected };
}

async function fetchAllDiffs(colorById) {
  const results = [];

  if (SINGLE_UID) {
    const userSnap = await db.collection('users').doc(SINGLE_UID).get();
    if (!userSnap.exists) {
      throw new Error(`Utilisateur introuvable : ${SINGLE_UID}`);
    }
    const profileSnap = await db.collection('classement_profiles').doc(SINGLE_UID).get();
    results.push(await diffOne(SINGLE_UID, profileSnap.exists ? profileSnap.data() : {}, colorById));
    return results;
  }

  // ✅ Parcourt "users" (TOUT compte porte "client", invariant vérifié séparément —
  // voir CLAUDE.md), PAS "classement_profiles" : un compte créé avant l'introduction
  // de ce document (via AdminUsers.tsx ou une ancienne version de Register.tsx) n'en a
  // jamais eu, même s'il a des validations réelles dans client_boulder_results. Partir
  // de "classement_profiles" manquerait ces comptes entièrement — c'est justement le
  // cas constaté en prod à l'écriture de ce script (12 comptes, 0 classement_profiles).
  let lastDoc = null;
  for (;;) {
    let q = db.collection('users').orderBy('__name__').limit(BATCH_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snapshot = await q.get();
    if (snapshot.empty) break;

    for (const userDoc of snapshot.docs) {
      const profileSnap = await db.collection('classement_profiles').doc(userDoc.id).get();
      results.push(await diffOne(userDoc.id, profileSnap.exists ? profileSnap.data() : {}, colorById));
    }
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    console.log(`${results.length} compte(s) vérifié(s)...`);
  }
  return results;
}

async function main() {
  console.log(FIX ? 'Mode correction (--fix) : les écarts seront écrits si le garde-fou le permet.' : 'Mode simulation : aucune écriture.');
  const colorById = await loadActiveColorById();
  console.log(`${colorById.size} bloc(s) quotidien(s) actif(s) chargé(s).`);

  // ✅ Toujours calculé en simulation d'abord (aucune écriture ici) : le garde-fou a
  // besoin de connaître l'ampleur de la dérive AVANT toute décision d'écrire.
  const diffs = await fetchAllDiffs(colorById);
  const drifted = diffs.filter((d) => d.drifted);
  const checked = diffs.length;

  console.log(`\n${checked} profil(s) vérifié(s), ${drifted.length} en écart.`);

  // ✅ Journalisé même si le garde-fou interrompt ensuite tout — c'est ce journal qui
  // permettra de trancher entre "vraie dérive" et "bug du script" (retour de ClaudeNav §A).
  if (drifted.length > 0) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const log = drifted.map((d) => ({ uid: d.uid, drift: d.drift, fixedAt: null }));
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    console.log(`Détail des écarts journalisé dans ${LOG_PATH}`);
  }

  if (!FIX) {
    if (drifted.length > 0) console.log('Relancez avec --fix pour corriger ces profils.');
    return;
  }

  // ✅ Le garde-fou lui-même : ne se déclenche que si SINGLE_UID n'est pas utilisé (un
  // débogage ciblé sur un seul compte n'a pas de "proportion" à évaluer) et si --force
  // n'a pas été passé explicitement.
  const ratio = checked > 0 ? drifted.length / checked : 0;
  const guardTriggered = !SINGLE_UID && !FORCE &&
    ratio > DRIFT_GUARD_RATIO && drifted.length >= DRIFT_GUARD_ABSOLUTE_MIN;

  if (guardTriggered) {
    console.error(
      `\n🛑 Garde-fou déclenché : ${drifted.length}/${checked} profils en écart ` +
      `(${(ratio * 100).toFixed(1)}%, seuil ${DRIFT_GUARD_RATIO * 100}% ET ≥${DRIFT_GUARD_ABSOLUTE_MIN}). ` +
      `Une réconciliation saine trouve zéro ou un écart isolé — en trouver une telle proportion ` +
      `signifie probablement un bug du SCRIPT (ou une évolution du barème non répercutée ici), ` +
      `pas une dérive légitime à corriger. AUCUNE écriture effectuée. ` +
      `Relancez avec --force si l'écart est confirmé légitime.`
    );
    process.exitCode = 1; // ✅ Échec visible du workflow, pas un run vert qui aurait refusé d'agir en silence.
    return;
  }

  for (const d of drifted) {
    await db.collection('classement_profiles').doc(d.uid).set({
      score: d.expected.score,
      bouldersValidated: d.expected.bouldersValidated,
      bestColorRank: d.expected.bestColorRank,
      colorCounts: d.expected.colorCounts,
    }, { merge: true });
  }

  if (drifted.length > 0) {
    const log = drifted.map((d) => ({ uid: d.uid, drift: d.drift, fixedAt: new Date().toISOString() }));
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    console.log(`${drifted.length} profil(s) corrigé(s).`);
  }
}

main().catch((err) => {
  console.error('Erreur :', err);
  process.exitCode = 1;
});
