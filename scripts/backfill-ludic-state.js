// PLAN-etat-ludique-hors-users.md, Passe B : peuple `user_ludic_state/{uid}` depuis les
// quatre champs legacy encore portés par `users/{uid}` (weeklyGoalItems, wallCounts,
// rouletteChallengesCompleted, rouletteRecentChallenges). Ne touche jamais `users` — ce
// script prépare la passe C (retrait), il ne la fait pas.
//
// ⚠️ OUTIL DE FENÊTRE DE DÉPLOIEMENT, PAS UN SCRIPT À RELANCER PAR RÉFLEXE. Sa seule
// raison d'être est de rattraper les comptes touchés par l'ANCIEN code (qui n'écrivait que
// sur `users`) pendant la bascule vers la passe C. Une fois la passe C confirmée stable en
// production (voir CLAUDE.md § "Ludic-state migration"), il n'y a plus rien à rattraper —
// ne pas le relancer avec `--fix` "pour être sûr" des mois plus tard sans relire ce
// commentaire ET sans repasser par une simulation d'abord.
//
//   node backfill-ludic-state.js            → mode simulation (par défaut, n'écrit rien)
//   node backfill-ludic-state.js --fix      → écrit user_ludic_state pour chaque compte
//                                              portant au moins un des quatre champs
//   node backfill-ludic-state.js --uid <uid> → un seul compte (débogage)
//
// ✅ Garde-fou structurel (retour ClaudeNav 17/09/2026, suite à un incident constaté en
// simulation — voir HANDOFF-ludic-state-backfill-simulation-2026-09-17.md) : CE SCRIPT
// N'ÉCRASE JAMAIS UN CHAMP DÉJÀ PRÉSENT DANS `user_ludic_state`, même avec `--fix`. Il ne
// fait que COMBLER une absence — exactement le même principe directionnel que le garde-fou
// de `purge-legacy-ludic-fields.js` (qui ne supprime jamais un champ absent ailleurs), lu
// dans l'autre sens : un champ n'est écrit ici QUE s'il n'existe encore nulle part côté
// `user_ludic_state`. Avant ce garde-fou, le script écrasait dans les deux sens sans
// distinction — repéré le 17/09 : un compte dont `user_ludic_state` était EN AVANCE sur la
// copie figée de `users` (le grimpeur avait continué à jouer après un précédent passage du
// script) aurait vu sa progression réelle écrasée par l'ancienne valeur si `--fix` avait
// été relancé ce jour-là. Ce garde-fou rend cette régression structurellement impossible,
// sans dépendre d'un horodatage externe à comparer ni d'un commentaire à lire avant de
// lancer la commande. Un champ présent des deux côtés mais dont la valeur diffère est
// signalé (jamais silencieux) mais jamais réécrit — à traiter à la main si besoin.
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

// ✅ Comparaison qui normalise l'ordre des clés des objets (Firestore ne garantit aucun
// ordre stable pour une map, ex. `wallCounts`) tout en préservant l'ordre des tableaux (où
// il est significatif, ex. `rouletteRecentChallenges`). Retour ClaudeNav 17/09/2026 :
// l'ancienne comparaison (`JSON.stringify` brut) produisait 10 faux positifs sur 11 lors
// d'une investigation manuelle — un même `wallCounts` réécrit à des moments différents peut
// tout à fait ressortir de Firestore avec des clés dans un ordre différent sans que la
// donnée ait changé.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function deepEqual(a, b) {
  return JSON.stringify(canonicalize(a ?? null)) === JSON.stringify(canonicalize(b ?? null));
}

async function main() {
  const usersSnapshot = SINGLE_UID
    ? { docs: [await db.collection('users').doc(SINGLE_UID).get()].filter((d) => d.exists) }
    : await db.collection('users').get();

  let candidateCount = 0;
  let accountsWithFillCount = 0;
  let fieldsFilledCount = 0;
  let guardedFieldCount = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const ludicFields = extractLudicFields(userData);
    if (!ludicFields) continue;
    candidateCount += 1;

    const uid = userDoc.id;
    const ludicRef = db.collection('user_ludic_state').doc(uid);
    const existingSnap = await ludicRef.get();
    const existingData = existingSnap.exists ? existingSnap.data() : {};

    const toFill = {};
    let hasFill = false;
    for (const field of Object.keys(ludicFields)) {
      if (existingData[field] === undefined) {
        // ✅ Absent des deux côtés : rien de `user_ludic_state` à comparer, c'est
        // exactement le cas que ce script existe pour rattraper.
        toFill[field] = ludicFields[field];
        hasFill = true;
      } else if (!deepEqual(existingData[field], ludicFields[field])) {
        // ✅ Présent des deux côtés mais différent : jamais écrasé (garde-fou), signalé.
        guardedFieldCount += 1;
        console.warn(`⛔ ${uid}.${field} : présent dans user_ludic_state avec une valeur différente de users — NON écrasé (ce script ne comble que les absences). Vérifier manuellement si besoin.`);
      }
      // Sinon : déjà identique, rien à dire.
    }

    if (!hasFill) continue;
    accountsWithFillCount += 1;
    fieldsFilledCount += Object.keys(toFill).length;

    console.log(`${FIX ? '✏️ ' : '👀'} ${uid} : comble ${Object.keys(toFill).join(', ')}`, JSON.stringify(toFill));
    if (FIX) {
      await ludicRef.set({ ...toFill, updated_at: new Date().toISOString() }, { merge: true });
    }
  }

  console.log('');
  console.log(`Comptes portant au moins un champ ludique legacy : ${candidateCount}`);
  console.log(`Comptes avec au moins un champ à combler : ${accountsWithFillCount}`);
  console.log(`Champs signalés comme divergents (jamais écrasés) : ${guardedFieldCount}`);
  console.log(FIX
    ? `Champs comblés : ${fieldsFilledCount}`
    : `Champs qui auraient été comblés avec --fix : ${fieldsFilledCount}`);
  if (!FIX) console.log('Mode simulation — relancer avec --fix pour écrire.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('BACKFILL_FAILED', err);
  process.exit(1);
});
