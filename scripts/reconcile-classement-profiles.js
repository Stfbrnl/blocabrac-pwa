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
//   node reconcile-classement-profiles.js --uid <uid>      → un seul profil (débogage)
//
// Traite les comptes par lots avec reprise après interruption (pagination sur
// l'identifiant de document) — recomputer tous les profils lit l'intégralité de
// client_boulder_results, à surveiller quand le volume grandira (même remarque que
// cleanup-orphan-boulder-images.js sur son propre coût de lecture).
//
// ✅ Vit dans scripts/ (suivi par git), pas dans firestore-migration/ (entièrement
// ignoré) : un Codespace est éphémère, voir cleanup-orphan-boulder-images.js pour la
// même raison. Les identifiants, eux, restent dans firestore-migration/ (jamais commités).
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

async function reconcileOne(uid, storedData, log, colorById) {
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

  log.push({ uid, drift, fixedAt: FIX ? new Date().toISOString() : null });
  if (FIX) {
    await db.collection('classement_profiles').doc(uid).set({
      score: expected.score,
      bouldersValidated: expected.bouldersValidated,
      bestColorRank: expected.bestColorRank,
      colorCounts: expected.colorCounts,
    }, { merge: true });
  }
  return { uid, drifted: true };
}

async function main() {
  console.log(FIX ? 'Mode correction (--fix) : les écarts seront écrits.' : 'Mode simulation : aucune écriture.');
  const colorById = await loadActiveColorById();
  console.log(`${colorById.size} bloc(s) quotidien(s) actif(s) chargé(s).`);
  const log = [];
  let checked = 0;
  let driftedCount = 0;

  // ✅ Parcourt "users" (TOUT compte porte "client", invariant vérifié séparément —
  // voir CLAUDE.md), PAS "classement_profiles" : un compte créé avant l'introduction
  // de ce document (via AdminUsers.tsx ou une ancienne version de Register.tsx) n'en a
  // jamais eu, même s'il a des validations réelles dans client_boulder_results. Partir
  // de "classement_profiles" manquerait ces comptes entièrement — c'est justement le
  // cas constaté en prod à l'écriture de ce script (12 comptes, 0 classement_profiles).
  // Les champs d'identité (first_name, classementOptIn, ...) restent la responsabilité
  // de Register.tsx/ClientProfile.tsx/AdminUsers.tsx : ce script ne touche jamais qu'aux
  // 4 champs dérivés des validations (score/bouldersValidated/bestColorRank/colorCounts).
  if (SINGLE_UID) {
    const userSnap = await db.collection('users').doc(SINGLE_UID).get();
    if (!userSnap.exists) {
      console.error(`Utilisateur introuvable : ${SINGLE_UID}`);
      process.exitCode = 1;
      return;
    }
    const profileSnap = await db.collection('classement_profiles').doc(SINGLE_UID).get();
    const result = await reconcileOne(SINGLE_UID, profileSnap.exists ? profileSnap.data() : {}, log, colorById);
    checked = 1;
    driftedCount = result.drifted ? 1 : 0;
  } else {
    // ✅ Pagination sur l'ID de document (pas d'offset) : reprise possible après
    // interruption en relançant simplement le script — chaque lot déjà traité et non
    // en écart n'a de toute façon rien écrit à annuler.
    let lastDoc = null;
    for (;;) {
      let q = db.collection('users').orderBy('__name__').limit(BATCH_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snapshot = await q.get();
      if (snapshot.empty) break;

      for (const userDoc of snapshot.docs) {
        const profileSnap = await db.collection('classement_profiles').doc(userDoc.id).get();
        const result = await reconcileOne(userDoc.id, profileSnap.exists ? profileSnap.data() : {}, log, colorById);
        checked += 1;
        if (result.drifted) driftedCount += 1;
      }
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      console.log(`${checked} compte(s) vérifié(s)...`);
    }
  }

  console.log(`\n${checked} profil(s) vérifié(s), ${driftedCount} en écart${FIX ? ' (corrigés)' : ''}.`);

  if (log.length > 0) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    console.log(`Détail des écarts journalisé dans ${LOG_PATH}`);
  }
  if (!FIX && driftedCount > 0) {
    console.log('Relancez avec --fix pour corriger ces profils.');
  }
}

main().catch((err) => {
  console.error('Erreur :', err);
  process.exitCode = 1;
});
