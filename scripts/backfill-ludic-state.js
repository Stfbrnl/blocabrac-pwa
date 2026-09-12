// PLAN-etat-ludique-hors-users.md, Passe B : peuple `user_ludic_state/{uid}` depuis les
// quatre champs legacy encore portés par `users/{uid}` (weeklyGoalItems, wallCounts,
// rouletteChallengesCompleted, rouletteRecentChallenges). Purement ADDITIF — ne touche
// jamais `users` — ce script prépare la passe C (retrait), il ne la fait pas.
//
//   node backfill-ludic-state.js            → mode simulation (par défaut, n'écrit rien)
//   node backfill-ludic-state.js --fix      → écrit user_ludic_state pour chaque compte
//                                              portant au moins un des quatre champs
//   node backfill-ludic-state.js --uid <uid> → un seul compte (débogage)
//
// Idempotent et relançable : recalcule et réécrit (merge) à chaque passage, jamais un
// "skip si déjà présent" — un compte qui aurait validé entre deux passages doit voir sa
// dernière valeur reprise (le service ludicState.ts écrit déjà les deux côtés depuis la
// passe A, donc en pratique les deux copies restent synchronisées ; ce script sert
// surtout à couvrir les comptes inactifs depuis le déploiement de la passe A).
//
// ✅ Pas de garde-fou anti-dérive massive ici, contrairement à reconcile-classement-
// profiles.js/cleanup-orphan-boulder-images.js : cette écriture ne peut jamais faire
// reculer une valeur (elle recopie une valeur déjà en place sur `users` — la source de
// vérité de la passe A), donc il n'y a pas de "dérive" à borner, seulement un rattrapage.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');

// ✅ Même garde qu'ailleurs dans ce dossier (reconcile-classement-profiles.js) : ce script
// n'écrit jamais de journal suivi par git, donc rien à dériver ici, mais on garde le même
// avertissement pour éviter toute confusion si on l'exécute par erreur contre l'émulateur
// en pensant toucher la prod.
const IS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
if (IS_EMULATOR) {
  console.warn('⚠️  FIRESTORE_EMULATOR_HOST détecté — ce script va agir sur l\'ÉMULATEUR, pas sur la prod.');
}

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

const app = initializeApp(IS_EMULATOR ? { projectId: 'blocabrac' } : { credential: cert(readServiceAccount()) });
const db = getFirestore(app);

const FIX = process.argv.includes('--fix');
const uidArgIndex = process.argv.indexOf('--uid');
const SINGLE_UID = uidArgIndex !== -1 ? process.argv[uidArgIndex + 1] : null;

const LUDIC_FIELDS = ['weeklyGoalItems', 'wallCounts', 'rouletteChallengesCompleted', 'rouletteRecentChallenges'];

function extractLudicFields(userData) {
  const out = {};
  let hasAny = false;
  for (const field of LUDIC_FIELDS) {
    if (userData[field] !== undefined) {
      out[field] = userData[field];
      hasAny = true;
    }
  }
  return hasAny ? out : null;
}

async function main() {
  const usersSnapshot = SINGLE_UID
    ? { docs: [await db.collection('users').doc(SINGLE_UID).get()].filter((d) => d.exists) }
    : await db.collection('users').get();

  let candidateCount = 0;
  let writtenCount = 0;
  let skippedIdenticalCount = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const ludicFields = extractLudicFields(userData);
    if (!ludicFields) continue;
    candidateCount += 1;

    const uid = userDoc.id;
    const ludicRef = db.collection('user_ludic_state').doc(uid);
    const existingSnap = await ludicRef.get();
    const existingData = existingSnap.exists ? existingSnap.data() : {};
    const alreadyIdentical = LUDIC_FIELDS.every(
      (field) => JSON.stringify(existingData[field] ?? null) === JSON.stringify(ludicFields[field] ?? null)
    );
    if (alreadyIdentical) {
      skippedIdenticalCount += 1;
      console.log(`= ${uid} : déjà à jour dans user_ludic_state, rien à faire.`);
      continue;
    }

    console.log(`${FIX ? '✏️ ' : '👀'} ${uid} :`, JSON.stringify(ludicFields));
    if (FIX) {
      await ludicRef.set({ ...ludicFields, updated_at: new Date().toISOString() }, { merge: true });
      writtenCount += 1;
    }
  }

  console.log('');
  console.log(`Comptes portant au moins un champ ludique legacy : ${candidateCount}`);
  console.log(`Déjà à jour dans user_ludic_state : ${skippedIdenticalCount}`);
  console.log(FIX
    ? `Écrits/mis à jour dans user_ludic_state : ${writtenCount}`
    : `Auraient été écrits avec --fix : ${candidateCount - skippedIdenticalCount}`);
  if (!FIX) console.log('Mode simulation — relancer avec --fix pour écrire.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('BACKFILL_FAILED', err);
  process.exit(1);
});
