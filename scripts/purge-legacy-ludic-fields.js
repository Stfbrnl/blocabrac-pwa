// docs/plans/PLAN-etat-ludique-hors-users.md, Passe C (point de non-retour du plan, §6) : supprime
// les quatre champs legacy de `users/{uid}` (weeklyGoalItems, wallCounts,
// rouletteChallengesCompleted, rouletteRecentChallenges) une fois que `user_ludic_state`
// est confirmé comme SEULE source lue par l'application déployée.
//
//   node purge-legacy-ludic-fields.js            → mode simulation (par défaut, ne
//                                                    supprime jamais rien)
//   node purge-legacy-ludic-fields.js --fix      → deleteField() des quatre champs sur
//                                                    chaque document "users" qui les porte
//   node purge-legacy-ludic-fields.js --uid <uid> → un seul compte (débogage, répétition
//                                                    sur un compte de test avant la masse)
//   node purge-legacy-ludic-fields.js --purge-unmigrated <uid>.<champ>
//                                                  → dérogation explicite au garde-fou
//                                                    ci-dessous, pour UN couple compte+champ
//                                                    nommé à la main (répétable). Voir plus bas.
//
// ⚠️ NE PAS EXÉCUTER --fix EN PRODUCTION avant d'avoir vérifié, DANS CET ORDRE :
//   1. Le code déployé en production n'écrit/ne lit plus les quatre champs sur "users"
//      (services/ludicState.ts en passe C — plus de double écriture, plus de repli).
//      Tant que l'ancien code (passe A ou antérieur) est encore en ligne, supprimer ces
//      champs casse l'application en production pour de vrai (constaté empiriquement le
//      12/09/2026 : entre deux exécutions de backfill-ludic-state.js à quelques minutes
//      d'écart, des comptes réels avaient déjà dérivé — des grimpeurs utilisaient l'app
//      pendant ce laps de temps avec l'ANCIEN code, qui n'écrit que "users").
//   2. 🔴 CE POINT A ÉTÉ CORRIGÉ LE 02/10/2026 — il disait "relancer
//      `backfill-ludic-state.js` juste avant, pour rattraper toute activité". NE PAS LE
//      FAIRE : ce script est devenu obsolète et dangereux (voir son propre en-tête). La
//      passe C étant déployée depuis V2.61, il n'y a plus d'activité à rattraper, et un
//      backfill rendrait à un grimpeur un champ qu'il a lui-même supprimé.
// Ce script ne vérifie pas le point 1 — il fait ce qu'on lui demande, sans deviner si le
// moment est le bon. La responsabilité de l'ordre reste humaine.
//
// Vérifie systématiquement, pour chaque compte, que user_ludic_state/{uid} porte déjà
// une valeur pour le champ avant de le supprimer sur "users" — un champ qui n'existerait
// QUE sur "users" n'est jamais supprimé d'office, il est signalé à part.
//
// ⚠️ CE QU'UN CHAMP "ABSENT DE user_ludic_state" VEUT DIRE, ET POURQUOI IL FAUT ENQUÊTER
// (02/10/2026, docs/handoffs/HANDOFF-purge-etat-ludique-2026-10-02.md §4) : deux situations
// indiscernables, parce qu'il n'existe aucune pierre tombale.
//   (a) jamais migré — le backfill n'est jamais passé sur ce compte. La valeur de `users`
//       est alors la seule copie, et la supprimer serait une perte sèche.
//   (b) supprimé en aval — le champ A ÉTÉ migré, puis le grimpeur l'a effacé depuis
//       l'application (`ClientScreen.tsx` fait `deleteField()` sur `weeklyGoalItems` quand
//       on retire ses objectifs de la semaine). La copie figée sur `users` est alors un
//       déchet d'avant la passe C, et c'est l'ABSENCE qui est la vérité : il faut supprimer.
// Le script ne peut pas trancher seul, donc il s'arrête et signale. Trancher demande de
// regarder le compte : `user_ludic_state` existe-t-il, est-il récent, porte-t-il les autres
// champs ? Si oui, c'est (b). Le cas (b) se règle avec `--purge-unmigrated <uid>.<champ>`,
// une dérogation qui doit nommer le couple exact — jamais en masse, jamais par défaut,
// jamais via le backfill.
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

// Dérogations explicites au garde-fou "jamais migré" : `--purge-unmigrated <uid>.<champ>`,
// répétable. Chaque couple doit être nommé à la main — il n'existe volontairement AUCUNE
// forme en masse ("tous les champs de ce compte", "tous les comptes") : la dérogation ne
// vaut que pour un cas (b) constaté compte par compte (voir l'en-tête). Un couple nommé
// mais dont le champ est en réalité présent dans `user_ludic_state` ne change rien : il
// suit le chemin normal, la dérogation est simplement inutile.
const DEROGATIONS = new Set();
process.argv.forEach((arg, i) => {
  if (arg !== '--purge-unmigrated') return;
  const spec = process.argv[i + 1];
  if (!spec || spec.startsWith('--')) {
    console.error('PURGE_FAILED: --purge-unmigrated attend un argument de la forme <uid>.<champ>.');
    process.exit(1);
  }
  const separator = spec.lastIndexOf('.');
  const uid = separator === -1 ? '' : spec.slice(0, separator);
  const field = separator === -1 ? '' : spec.slice(separator + 1);
  if (!uid || !LUDIC_FIELDS.includes(field)) {
    console.error(`PURGE_FAILED: dérogation "${spec}" illisible — attendu <uid>.<champ>, champ parmi ${LUDIC_FIELDS.join(', ')}.`);
    process.exit(1);
  }
  DEROGATIONS.add(spec);
});

async function main() {
  const usersSnapshot = SINGLE_UID
    ? { docs: [await db.collection('users').doc(SINGLE_UID).get()].filter((d) => d.exists) }
    : await db.collection('users').get();

  if (SINGLE_UID && usersSnapshot.docs.length === 0) {
    // Sans ce message, un uid mal recopié donne "0 compte candidat" — indiscernable d'un
    // compte réel qui ne porte plus aucun champ legacy, c'est-à-dire d'une purge déjà faite.
    console.error(`PURGE_FAILED: aucun document users/${SINGLE_UID} — uid inexistant ou mal recopié.`);
    process.exit(1);
  }

  let candidateCount = 0;
  let purgedFieldCount = 0;
  let unmigratedWarnings = 0;
  let derogationsUsed = 0;

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
        // Absent de user_ludic_state : soit jamais migré (la valeur de `users` est la seule
        // copie), soit supprimé en aval par le grimpeur (l'absence EST la vérité). Le script
        // ne peut pas trancher — voir l'en-tête. Par défaut il ne supprime rien et signale ;
        // une dérogation nommée à la main lève le refus pour ce seul couple.
        if (DEROGATIONS.has(`${uid}.${field}`)) {
          derogationsUsed += 1;
          console.warn(`🔓 ${uid}.${field} : absent de user_ludic_state, supprimé SUR DÉROGATION EXPLICITE (absence considérée comme la vérité).`);
          toPurge.push(field);
          continue;
        }
        unmigratedWarnings += 1;
        if (!ludicSnap.exists) {
          // Cas (a) CERTAIN : pas de document ludique du tout, donc rien n'a jamais été
          // migré pour ce compte. La valeur de `users` est la seule copie — ne pas la
          // supprimer, et ne pas proposer la dérogation, qui serait ici une perte sèche.
          console.warn(`⚠️  ${uid}.${field} : AUCUN user_ludic_state pour ce compte — jamais migré, PAS supprimé. Ne pas déroger : cette copie est la seule qui existe.`);
        } else {
          // Cas ambigu, le seul qui demande une enquête : le document ludique vit, mais ce
          // champ-là lui manque. Suppression en aval probable (voir l'en-tête), à confirmer
          // en regardant le compte avant de déroger.
          console.warn(`⚠️  ${uid}.${field} : absent de user_ludic_state alors que le document existe (écrit le ${ludicData.updated_at || 'date inconnue'}) — PAS supprimé. Suppression en aval probable : vérifier, puis --purge-unmigrated ${uid}.${field}. NE PAS relancer backfill-ludic-state.js.`);
        }
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
  console.log(`Champs signalés comme non migrés (non supprimés) : ${unmigratedWarnings}`);
  if (DEROGATIONS.size > 0) {
    console.log(`Dérogations demandées : ${DEROGATIONS.size}, appliquées : ${derogationsUsed}`);
    if (derogationsUsed < DEROGATIONS.size) {
      // Une dérogation qui ne sert pas est presque toujours un uid mal recopié, et son
      // silence ferait croire que le cas a été traité alors qu'il reste entier.
      console.warn('⚠️  Au moins une dérogation n\'a trouvé aucun champ à lever : uid mal recopié, ou champ déjà présent dans user_ludic_state (dérogation alors inutile).');
    }
  }
  console.log(FIX
    ? `Champs supprimés : ${purgedFieldCount}`
    : 'Mode simulation — relancer avec --fix pour supprimer.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('PURGE_FAILED', err);
  process.exit(1);
});
