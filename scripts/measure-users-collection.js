// Mesure du poids de la collection `users`, telle que la transportent les écrans staff.
//
//   node measure-users-collection.js                → poids actuel (après la purge)
//   node measure-users-collection.js --avant <dump> → ajoute la reconstitution du poids
//                                                      d'avant la purge, depuis la sauvegarde
//
// Pourquoi ce script : §1 et §7 de docs/plans/PLAN-etat-ludique-hors-users.md demandaient une
// mesure avant/après du volume transféré par `getDocs(collection('users'))`, qu'aucun écran
// staff ne filtre et que le SDK client ne peut pas projeter. La mesure « avant » n'a jamais
// été consignée et la purge a été exécutée le 03/10/2026, donc elle n'est plus observable
// dans un navigateur — mais elle reste calculable depuis la sauvegarde des champs supprimés
// (`firestore-migration/dump-ludic-legacy-2026-10-02.json`), qui en contient les valeurs
// exactes. Même approche que measure-boulder-images.js pour le chantier images : mesurer
// directement en lecture seule plutôt que d'estimer.
//
// ⚠️ Ce que ce script mesure, et ce qu'il ne mesure pas. Il sérialise chaque document en JSON
// et en compte les octets UTF-8. Firestore transporte du protobuf, pas du JSON, et le SDK y
// ajoute ses propres en-têtes : le chiffre absolu n'est donc PAS le volume réseau exact, il
// en est un ordre de grandeur. Ce qui est fiable, c'est le RAPPORT entre les deux mesures et
// la PART des quatre champs — qui est précisément le critère du §7. Pour le volume réseau
// réel, l'onglet Réseau du navigateur reste le seul instrument.
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');
const LUDIC_FIELDS = ['weeklyGoalItems', 'wallCounts', 'rouletteChallengesCompleted', 'rouletteRecentChallenges'];

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

const app = initializeApp({ credential: cert(readServiceAccount()) });
const db = getFirestore(app);

const avantIndex = process.argv.indexOf('--avant');
const DUMP_PATH = avantIndex !== -1 ? process.argv[avantIndex + 1] : null;

const octets = (valeur) => Buffer.byteLength(JSON.stringify(valeur) || '', 'utf8');
const ko = (n) => (n / 1024).toFixed(2) + ' Ko';

async function main() {
  const snap = await db.collection('users').get();
  const comptes = snap.docs.length;

  let total = 0;
  const parChamp = {};
  for (const doc of snap.docs) {
    const data = doc.data();
    total += octets(data);
    for (const champ of Object.keys(data)) {
      parChamp[champ] = (parChamp[champ] || 0) + octets(data[champ]) + octets(champ);
    }
  }

  console.log(`Collection "users" : ${comptes} document(s)`);
  console.log(`Poids actuel (JSON, UTF-8) : ${ko(total)}  —  moyenne ${ko(total / comptes)} par compte`);
  console.log('');
  console.log('Répartition par champ, du plus lourd au plus léger :');
  Object.entries(parChamp)
    .sort((a, b) => b[1] - a[1])
    .forEach(([champ, poids]) => {
      const part = ((poids / total) * 100).toFixed(1);
      console.log(`  ${String(champ).padEnd(24)} ${String(ko(poids)).padStart(10)}   ${String(part).padStart(5)} %`);
    });

  const ludiqueRestant = LUDIC_FIELDS.reduce((s, f) => s + (parChamp[f] || 0), 0);
  console.log('');
  console.log(`Champs ludiques encore présents : ${ko(ludiqueRestant)}  (attendu : 0 Ko depuis le 03/10/2026)`);

  if (!DUMP_PATH) {
    console.log('');
    console.log('Passer --avant <dump.json> pour reconstituer le poids d\'avant la purge.');
    return;
  }

  // Reconstitution : on rajoute aux documents actuels les champs que la purge a supprimés,
  // avec leurs valeurs exactes telles que la sauvegarde les a figées.
  const dump = JSON.parse(fs.readFileSync(DUMP_PATH, 'utf8'));
  const comptesDump = dump.comptes || {};
  let ajoute = 0;
  let comptesTouches = 0;
  for (const [, entree] of Object.entries(comptesDump)) {
    const champs = (entree && entree.users) || {};
    const present = Object.keys(champs);
    if (!present.length) continue;
    comptesTouches += 1;
    for (const champ of present) ajoute += octets(champs[champ]) + octets(champ);
  }

  const avant = total + ajoute;
  console.log('');
  console.log(`Sauvegarde lue : ${DUMP_PATH}`);
  console.log(`   prise le ${dump.pris_le}, ${Object.keys(comptesDump).length} compte(s), dont ${comptesTouches} portant au moins un champ`);
  console.log('');
  console.log('AVANT / APRÈS');
  console.log(`  avant la purge : ${ko(avant)}  —  moyenne ${ko(avant / comptes)} par compte`);
  console.log(`  après la purge : ${ko(total)}  —  moyenne ${ko(total / comptes)} par compte`);
  console.log(`  gain           : ${ko(ajoute)}  soit ${((ajoute / avant) * 100).toFixed(1)} % du transfert`);
  console.log('');
  console.log('Critère du §7 : ce qui compte n\'est pas le gain absolu (modeste à ce nombre de');
  console.log('comptes) mais que le transfert cesse de croître avec l\'état ludique — il ne dépend');
  console.log('plus que du nombre de comptes et des champs d\'identité.');

  // ⚠️ Le gain ci-dessus est mesuré sur des valeurs FIGÉES : la purge a supprimé des copies
  // qui ne bougeaient plus depuis le 12/09 (passe C). Il sous-estime donc le coût réellement
  // évité, puisque l'état ludique vivant a continué de croître de son côté. Le chiffre qui
  // répond vraiment au §7 est celui-ci : ce que les quatre champs peseraient AUJOURD'HUI
  // dans `users` s'ils y étaient restés — c'est-à-dire leur poids actuel dans
  // `user_ludic_state`, qui est leur seule adresse depuis la passe C.
  const ludicSnap = await db.collection('user_ludic_state').get();
  let vivant = 0;
  let docsLudiques = 0;
  const parChampVivant = {};
  for (const doc of ludicSnap.docs) {
    const data = doc.data();
    let pourCeCompte = 0;
    for (const champ of LUDIC_FIELDS) {
      if (data[champ] === undefined) continue;
      const poids = octets(data[champ]) + octets(champ);
      parChampVivant[champ] = (parChampVivant[champ] || 0) + poids;
      pourCeCompte += poids;
    }
    if (pourCeCompte > 0) docsLudiques += 1;
    vivant += pourCeCompte;
  }

  const contrefactuel = total + vivant;
  console.log('');
  console.log('CE QUE LA PURGE ÉVITE RÉELLEMENT (contrefactuel)');
  console.log(`  état ludique vivant, ${docsLudiques} compte(s) sur ${comptes} : ${ko(vivant)}`);
  Object.entries(parChampVivant)
    .sort((a, b) => b[1] - a[1])
    .forEach(([champ, poids]) => console.log(`     ${String(champ).padEnd(28)} ${String(ko(poids)).padStart(10)}`));
  console.log(`  si ces champs étaient restés sur users : ${ko(contrefactuel)}`);
  console.log(`  part qu'ils représenteraient aujourd'hui : ${((vivant / contrefactuel) * 100).toFixed(1)} %`);
  console.log('');
  console.log('C\'est cette part qui croît avec l\'usage, pas avec le nombre de comptes — et c\'est');
  console.log('elle que le chantier a rendue structurellement nulle. Le gain mesuré sur les valeurs');
  console.log('figées en est le plancher, pas la mesure.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('MEASURE_FAILED', err);
  process.exit(1);
});
