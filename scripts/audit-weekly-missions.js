// docs/handoffs/RETOUR-bug-missions-et-revalidation.md §3.2 : contrôle en LECTURE SEULE de
// l'état des missions hebdomadaires en production après le bug V2.68 (grille écrasée par un
// flush qui n'avait pas relu `user_ludic_state`). La grille elle-même repart à zéro chaque
// lundi ; `weeklyMissionsCompleted`, lui, est CUMULATIF et ne se réinitialise jamais — c'est
// lui qu'il faut vérifier, avec la cohérence du badge `type: 'mission'`.
//
//   node audit-weekly-missions.js     → n'écrit jamais rien, aucun mode --fix
//
// Rapporte, pour chaque compte portant un `weeklyMissions` :
//   - la semaine, le nombre de cases cochées, les murs ;
//   - `weeklyMissionsCompleted` ;
//   - les incohérences : badge mission attribué alors que le compteur vaut 0 (ou l'inverse),
//     grille complète (8/8) sans compteur ≥ 1.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');
const IS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
if (IS_EMULATOR) {
  console.warn('⚠️  FIRESTORE_EMULATOR_HOST détecté — lecture de l\'ÉMULATEUR, pas de la prod.');
}

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

const app = initializeApp(IS_EMULATOR ? { projectId: 'blocabrac' } : { credential: cert(readServiceAccount()) });
const db = getFirestore(app);

async function main() {
  const [ludicSnap, badgesSnap] = await Promise.all([
    db.collection('user_ludic_state').get(),
    db.collection('badges').where('type', '==', 'mission').get(),
  ]);
  const missionBadgeIds = badgesSnap.docs.map((d) => d.id);
  console.log(`Badges type "mission" au catalogue : ${JSON.stringify(missionBadgeIds)}`);

  const holders = new Set();
  for (const badgeId of missionBadgeIds) {
    const links = await db.collection('client_badges').where('badgeId', '==', badgeId).get();
    links.docs.forEach((d) => holders.add(d.data().userId || d.id.split('_')[0]));
  }

  let withGrid = 0;
  let anomalies = 0;
  for (const d of ludicSnap.docs) {
    const data = d.data();
    const completed = data.weeklyMissionsCompleted || 0;
    const hasBadge = holders.has(d.id);
    const wm = data.weeklyMissions;
    if (!wm && completed === 0 && !hasBadge) continue;
    withGrid += 1;
    const done = (wm && wm.done) || [];
    const walls = (wm && wm.walls) || [];
    console.log(`${d.id} : semaine ${wm ? wm.isoWeek : '—'}, ${done.length}/8 ${JSON.stringify(done)}, murs ${walls.length} ${JSON.stringify(walls)}, weeklyMissionsCompleted=${completed}, badge=${hasBadge}`);
    if (hasBadge && completed === 0) { anomalies += 1; console.warn(`  ⚠️  badge mission attribué mais compteur à 0`); }
    if (!hasBadge && completed >= 1) { console.log(`  ℹ️  compteur ≥ 1 sans badge (normal tant que "Mes stats" n'a pas été rouverte)`); }
    if (done.length >= 8 && completed === 0) { anomalies += 1; console.warn(`  ⚠️  grille complète mais compteur à 0`); }
  }

  console.log(`\n${ludicSnap.size} documents user_ludic_state, ${withGrid} avec une grille/compteur/badge mission, ${anomalies} anomalie(s).`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('AUDIT_FAILED', err);
  process.exit(1);
});
