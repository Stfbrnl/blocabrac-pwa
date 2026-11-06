// RATTRAPAGE : poser `users.baseLevel` = `users.level` sur les comptes dont le niveau ne peut
// venir que d'une DÉCLARATION, et qui n'en ont aucune trace.
//
//   node scripts/backfill-base-level-declare.js            → SIMULATION (n'écrit rien)
//   node scripts/backfill-base-level-declare.js --fix       → écrit
//   node scripts/backfill-base-level-declare.js --fix --expected 9
//
// ⚠️ POURQUOI IL EXISTE, et pourquoi il doit tourner AVANT le déverrouillage des niveaux.
//
// V2.78 ajoute deux choses : un PLANCHER dans `utils/levelSync.ts` (sans `baseLevel` lisible,
// on n'écrit rien) et l'écriture de `baseLevel` par `AdminUsers.tsx` (régler un niveau à la
// main est une déclaration). Mais les 68 niveaux réglés nom par nom le soir du contest
// du 5 novembre l'ont été par l'ANCIEN écran, qui n'écrivait que `level`.
//
// 🔴 ET LE PLANCHER NE SUFFIT PAS, parce qu'il vit dans le bundle. Sous
// `registerType: 'prompt'`, un grimpeur qui n'a pas cliqué « Mettre à jour » continue de
// recevoir la 2.77 : s'il ouvre « Mes stats » après le déverrouillage, c'est l'ANCIEN code qui
// tourne, et il écrit `'bleu'`. Le correctif protège les appareils à jour ; ce rattrapage
// protège les autres. **Une protection qui vit dans le client ne couvre que les clients qui
// l'ont reçue** — et rien ne force personne à le recevoir, par conception.
//
// LA CIBLE, et pourquoi elle est sûre (mesurée à 9 comptes le 06/11/2026) :
//   - `level` ≥ violet (en dessous, aucun badge n'existe : le niveau est déjà une déclaration) ;
//   - AUCUN `baseLevel` lisible (rien vers quoi redescendre : c'est le cas du repli inventé) ;
//   - AUCUNE couleur ≥ violet encore posée en salle parmi ses réussites — donc la branche des
//     badges ne décide pas de son niveau, et celui-ci ne peut venir que d'une déclaration ou
//     d'un badge éteint depuis longtemps.
//
// ⚠️ CE QU'IL NE FAIT PAS, et c'est délibéré : il ne touche AUCUN compte dont une couleur est
// encore posée en salle. Pour ceux-là la branche des badges tranche, et écrire un `baseLevel`
// y figerait un niveau que le mécanisme doit pouvoir faire redescendre — « la redescente est le
// comportement VOULU ». Le rattrapage est borné aux comptes où il n'y a rien à casser.
//
// ⚠️ Il annonce son effet, même nul (« 0 compte modifié »), parce qu'un succès silencieux est
// indiscernable d'un no-op.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');
function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}
const db = getFirestore(initializeApp({ credential: cert(readServiceAccount()) }));

const ORDRE = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];
const AVEC_BADGE = ['violet', 'rouge', 'noir', 'blanc', 'rose'];
const rang = (c) => ORDRE.indexOf(c);

const FIX = process.argv.includes('--fix');
const iExp = process.argv.indexOf('--expected');
const EXPECTED = iExp >= 0 ? Number(process.argv[iExp + 1]) : null;

(async () => {
  console.log('════ RATTRAPAGE baseLevel — ' + (FIX ? '🔴 MODE ÉCRITURE' : 'SIMULATION (rien ne sera écrit)') + ' ════\n');

  const [blocs, users, res] = await Promise.all([
    db.collection('boulders').get(),
    db.collection('users').get(),
    db.collection('client_boulder_results').get(),
  ]);

  const actifDaily = new Map();
  blocs.forEach((b) => {
    const d = b.data();
    if (d.type === 'daily' && d.is_active === true) actifDaily.set(b.id, d.color);
  });

  const atteint = new Map();
  res.forEach((r) => {
    const d = r.data();
    if (d.success !== true) return;
    const c = actifDaily.get(d.boulderId);
    if (!c) return;
    const s = atteint.get(d.userId) || new Set();
    s.add(c);
    atteint.set(d.userId, s);
  });

  const cibles = [];
  let dejaUneBase = 0, sousLePlancher = 0, pilotesParBadge = 0;
  users.forEach((u) => {
    const d = u.data();
    if (!d.level || rang(d.level) < 0) return;
    if (rang(d.level) < rang('violet')) { sousLePlancher += 1; return; }
    if (d.baseLevel && ORDRE.includes(d.baseLevel)) { dejaUneBase += 1; return; }
    const att = [...(atteint.get(u.id) || [])].filter((c) => AVEC_BADGE.includes(c));
    if (att.length) { pilotesParBadge += 1; return; }
    cibles.push({
      uid: u.id,
      nom: (`${d.first_name || ''} ${d.last_name || ''}`).trim() || u.id.slice(0, 8),
      level: d.level,
      verrouille: !!d.levelOverride,
    });
  });

  // ⚠️ CES COMPTEURS SONT DES FILTRES SÉQUENTIELS, et le dire fait partie de l'honnêteté de
  // l'instrument : chaque ligne compte ce qui restait après les précédentes. « 0 piloté par
  // badge » ne veut donc PAS dire que personne ne l'est — seulement qu'aucun compte parmi
  // ceux qui n'avaient ni niveau sous violet ni baseLevel ne l'était. Un compteur dont on
  // ignore le dénominateur est parfaitement plausible et dit autre chose que ce qu'on lit.
  console.log(`${users.size} comptes examinés, écartés en cascade dans cet ordre :`);
  console.log(`  ${sousLePlancher} écartés : niveau sous violet (c'est déjà une déclaration)`);
  console.log(`  ${dejaUneBase} écartés ensuite : baseLevel déjà lisible (rien à faire)`);
  console.log(`  ${pilotesParBadge} écartés ensuite : une couleur ≥ violet encore posée`);
  console.log(`      (la branche des badges tranche pour eux — NON TOUCHÉS, exprès)`);
  console.log(`  ${cibles.length} CIBLES restantes\n`);

  cibles.sort((a, b) => rang(b.level) - rang(a.level)).forEach((c) => {
    console.log(`  ${c.verrouille ? '[verrouillé]' : '[LIBRE]     '} ${c.nom.padEnd(24)} baseLevel := ${c.level}`);
  });

  if (EXPECTED !== null && cibles.length !== EXPECTED) {
    console.error(`\n✘ REFUSÉ : ${cibles.length} cible(s) alors que --expected annonçait ${EXPECTED}.`);
    console.error('   La donnée a bougé depuis la simulation. Relancer la simulation et relire.');
    process.exit(1);
  }

  if (!FIX) {
    console.log(`\nSIMULATION TERMINÉE — 0 document écrit, ${cibles.length} le seraient avec --fix.`);
    console.log('Relancer avec :  node scripts/backfill-base-level-declare.js --fix --expected ' + cibles.length);
    process.exit(0);
  }

  let ecrits = 0;
  for (const c of cibles) {
    await db.collection('users').doc(c.uid).update({ baseLevel: c.level });
    ecrits += 1;
  }
  console.log(`\n✔ EFFET : ${ecrits} compte(s) modifié(s), champ baseLevel posé. 0 autre champ touché.`);
  console.log('  Le déverrouillage est désormais sûr sur l\'ANCIEN bundle comme sur le nouveau.');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC : ' + (e && e.message ? e.message : e)); process.exit(1); });
