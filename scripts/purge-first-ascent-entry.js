// PLAN-premiers-ascensionnistes.md §4 : retire les entrées d'un grimpeur donné de toutes les
// listes `boulders/{id}.firstAscents` où il figure — pour honorer une demande explicite de
// retrait après désactivation du consentement (`firstAscentOptIn`). Le retrait du
// consentement N'EST PAS rétroactif tout seul (voir ClientProfile.tsx) : le nom reste sur les
// blocs déjà validés tant que ce script n'est pas lancé à la demande.
//
//   node purge-first-ascent-entry.js --uid <uid>            → mode simulation (par défaut,
//                                                               n'écrit rien)
//   node purge-first-ascent-entry.js --uid <uid> --fix      → retire réellement les entrées
//
// ⚠️ Retire l'entrée SANS réordonner ni combler (§4 du plan) : un simple filtre, jamais de
// promotion d'un éventuel sixième candidat (qui n'existe de toute façon jamais, la liste
// étant plafonnée à 5) — une liste à quatre entrées après retrait est correcte, on ne
// réécrit pas l'histoire des autres grimpeurs.
//
// Usage occasionnel (à la demande), pas de cron — contrairement aux scripts de
// réconciliation/nettoyage mensuels de ce dossier, il n'y a rien à corriger périodiquement
// ici : une dérive n'existe pas, seule une demande explicite déclenche ce script.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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
const TARGET_UID = uidArgIndex !== -1 ? process.argv[uidArgIndex + 1] : null;

if (!TARGET_UID) {
  console.error('Usage : node purge-first-ascent-entry.js --uid <uid> [--fix]');
  process.exit(1);
}

async function main() {
  // ✅ Aucun filtre is_active/type : un bloc désactivé garde sa liste (palmarès du mur
  // précédent, invariant V2.56 "ne jamais supprimer un document boulders") — la demande de
  // retrait doit s'appliquer partout où le nom figure, pas seulement sur les blocs actifs.
  const snapshot = await db.collection('boulders').get();
  let boulderCount = 0;

  for (const boulderDoc of snapshot.docs) {
    const firstAscents = boulderDoc.data().firstAscents;
    if (!Array.isArray(firstAscents)) continue;
    if (!firstAscents.some((entry) => entry && entry.uid === TARGET_UID)) continue;

    boulderCount += 1;
    const filtered = firstAscents.filter((entry) => !entry || entry.uid !== TARGET_UID);
    console.log(`${FIX ? '🗑️ ' : '👀'} ${boulderDoc.id} : ${firstAscents.length} → ${filtered.length} entrée(s)`);
    if (FIX) {
      await boulderDoc.ref.update({ firstAscents: filtered });
    }
  }

  console.log('');
  console.log(`Blocs portant une entrée de ${TARGET_UID} : ${boulderCount}`);
  if (!FIX) console.log('Mode simulation — relancer avec --fix pour retirer.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('PURGE_FAILED', err);
  process.exit(1);
});
