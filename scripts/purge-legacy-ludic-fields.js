// PLAN-etat-ludique-hors-users.md, Passe C (point de non-retour du plan, §6) : supprime
// les quatre champs legacy de `users/{uid}` (weeklyGoalItems, wallCounts,
// rouletteChallengesCompleted, rouletteRecentChallenges) une fois que `user_ludic_state`
// est confirmé comme SEULE source lue par l'application déployée.
//
//   node purge-legacy-ludic-fields.js            → mode simulation (par défaut, ne
//                                                    supprime jamais rien)
//   node purge-legacy-ludic-fields.js --fix      → deleteField() des quatre champs sur
//                                                    chaque document "users" qui les porte
//   node purge-legacy-ludic-fields.js --uid <uid> → un seul compte (débogage)
//
// ⚠️ NE PAS EXÉCUTER --fix EN PRODUCTION avant d'avoir vérifié, DANS CET ORDRE :
//   1. Le code déployé en production n'écrit/ne lit plus les quatre champs sur "users"
//      (services/ludicState.ts en passe C — plus de double écriture, plus de repli).
//      Tant que l'ancien code (passe A ou antérieur) est encore en ligne, supprimer ces
//      champs casse l'application en production pour de vrai (constaté empiriquement le
//      12/09/2026 : entre deux exécutions de backfill-ludic-state.js à quelques minutes
//      d'écart, des comptes réels avaient déjà dérivé — des grimpeurs utilisaient l'app
//      pendant ce laps de temps avec l'ANCIEN code, qui n'écrit que "users").
//   2. `backfill-ludic-state.js` a été relancé juste avant, pour rattraper toute activité
//      survenue entre le déploiement de la passe A et maintenant.
// Ce script ne vérifie NI l'un NI l'autre — il fait ce qu'on lui demande, sans deviner
// si le moment est le bon. La responsabilité de l'ordre reste humaine.
//
// Vérifie systématiquement, pour chaque compte, que user_ludic_state/{uid} porte déjà
// une valeur pour le champ avant de le supprimer sur "users" — un champ qui n'existerait
// QUE sur "users" (jamais migré) n'est jamais supprimé, il est signalé à part.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');
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

async function main() {
  const usersSnapshot = SINGLE_UID
    ? { docs: [await db.collection('users').doc(SINGLE_UID).get()].filter((d) => d.exists) }
    : await db.collection('users').get();

  let candidateCount = 0;
  let purgedFieldCount = 0;
  let unmigratedWarnings = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const fieldsPresent = LUDIC_FIELDS.filter((f) => userData[f] !== undefined);
    if (fieldsPresent.length === 0) continue;
    candidateCount += 1;

    const uid = userDoc.id;
    const ludicSnap = await db.collection('user_ludic_state').doc(uid).get();
    const ludicData = ludicSnap.exists ? ludicSnap.data() : {};

    const toPurge = [];
    for (const field of fieldsPresent) {
      if (ludicData[field] === undefined) {
        // ✅ Jamais migré vers user_ludic_state (backfill pas encore passé sur ce compte, ou
        // écart entre les deux) : ne JAMAIS supprimer une donnée qui n'existe nulle part
        // ailleurs — signalé pour relancer backfill-ludic-state.js d'abord.
        unmigratedWarnings += 1;
        console.warn(`⚠️  ${uid}.${field} : absent de user_ludic_state, PAS supprimé (relancer backfill-ludic-state.js d'abord).`);
        continue;
      }
      toPurge.push(field);
    }
    if (toPurge.length === 0) continue;

    console.log(`${FIX ? '🗑️ ' : '👀'} ${uid} : ${toPurge.join(', ')}`);
    if (FIX) {
      const update = {};
      toPurge.forEach((field) => { update[field] = FieldValue.delete(); });
      await userDoc.ref.update(update);
      purgedFieldCount += toPurge.length;
    }
  }

  console.log('');
  console.log(`Comptes portant au moins un champ legacy : ${candidateCount}`);
  console.log(`Champs signalés comme non migrés (jamais supprimés) : ${unmigratedWarnings}`);
  console.log(FIX
    ? `Champs supprimés : ${purgedFieldCount}`
    : 'Mode simulation — relancer avec --fix pour supprimer.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('PURGE_FAILED', err);
  process.exit(1);
});
