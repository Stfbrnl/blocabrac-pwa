// RETIRE LES BLOCS `type: 'competition'` RATTACHÉS À UNE COMPÉTITION QUI N'EXISTE PLUS.
//
//   node retirer-blocs-competition-orphelins.js                      → simulation (défaut)
//   node retirer-blocs-competition-orphelins.js --fix --expected 7   → agit
//
// ── LE DÉFAUT ──────────────────────────────────────────────────────────────────────────────
// Un bloc `type: 'competition'` garde sa cotation dans `difficulty`, **cachée aux grimpeurs**
// jusqu'à « Terminer la compétition ». Quand sa compétition est supprimée, plus aucun écran ne
// l'atteint : `CompetitionBouldersList` et `ClientCompetitions` interrogent tous deux par le
// `competition_id` d'une compétition **sélectionnée**. Le bloc reste donc `is_active: true`,
// invisible, et sa cotation ne sera jamais révélée — hors d'atteinte de toute interface.
//
// Mesuré en production le 06/11/2026 : **7 blocs**, de deux compétitions supprimées
// (`q2QabuVYwTi8pGvfGHi5` et `comp_test_20260516`), créés les 25/05 et 13/06/2026, et portant
// **zéro validation** (ni `client_boulder_results`, ni `competition_results`).
//
// ⚠️ V2.79 a fermé la VOIE par laquelle il s'en créait de nouveaux (un bloc de compétition
// désactivé n'était jamais repassé en `daily`). Ce script traite les **existants**, qui sont
// antérieurs. Les deux sont nécessaires : fermer la voie ne vide pas le stock.
//
// ── CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS ─────────────────────────────────────────────────
// Il pose `is_active: false` — **le seul chemin de retrait documenté du dépôt** — et normalise
// `difficulty` quand elle n'est pas canonique. Il ne touche **ni `type`, ni `competition_id`**.
//
// 🔴 **JAMAIS UNE SUPPRESSION.** Invariant du dépôt : un document `boulders` ne se supprime
// pas. Ici la raison habituelle (les validations associées disparaîtraient) ne s'applique pas,
// puisqu'il n'y en a aucune — mais deux autres tiennent : les **images Cloudinary** de ces
// 7 blocs seraient orphelines, donc détruites par le nettoyage mensuel au bout de 7 jours ; et
// un invariant qui ne vaut que « quand sa raison s'applique » n'est plus un invariant, c'est
// une appréciation à refaire chaque fois, par quelqu'un qui aura moins de contexte.
//
// ⚠️ **Pourquoi PAS de conversion en `type: 'daily'`**, qui serait « ce que la clôture aurait
// fait » : avec 0 validation, aucun compteur ne lira jamais leur couleur, donc la conversion
// n'achète rien. Et laissés actifs, ils créeraient de vrais défauts — deux paires se
// télescopent (« Dévers 15° n°2 », « Dalle n°1 »), et des blocs vieux de cinq mois
// apparaîtraient aux grimpeurs comme posés aujourd'hui. Décision de l'utilisateur, 06/11/2026.
//
// ── LES GARDES ─────────────────────────────────────────────────────────────────────────────
// ① Simulation par défaut : `--fix` est le seul mode qui écrit, et il ANNONCE son effet.
// ② `--expected N` : refuse d'écrire si le nombre d'orphelins trouvés n'est pas celui attendu.
//    Même forme que `purge-orphan-competition-refs.js`. Un script de réparation qui agit sur
//    « ce qu'il trouve » est un script dont personne ne relit le périmètre.
// ③ Une `difficulty` non normalisable **arrête tout**, sans rien écrire : on ne devine pas une
//    cotation (voir `lib/couleur-canonique.cjs`).
// ④ Un bloc dont la compétition est VIVANTE n'est jamais candidat, même désactivé : ce script
//    ne connaît qu'un seul défaut, et ce n'est pas celui-là.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { normaliserCouleur, estCanonique } = require('./lib/couleur-canonique.cjs');

const FIX = process.argv.includes('--fix');
const idxAttendu = process.argv.indexOf('--expected');
const ATTENDU = idxAttendu !== -1 ? Number(process.argv[idxAttendu + 1]) : null;

const db = getFirestore(initializeApp({
  credential: cert(require(path.join(__dirname, '../firestore-migration/serviceAccountKey.json'))),
}));

(async () => {
  console.log(FIX
    ? 'Mode correction (--fix) : les blocs orphelins seront désactivés.'
    : 'Mode simulation : aucune écriture. Ajoutez --fix --expected N pour agir.');

  const [blocs, competitions] = await Promise.all([
    db.collection('boulders').where('type', '==', 'competition').get(),
    db.collection('competitions').get(),
  ]);
  const vivantes = new Set(competitions.docs.map((d) => d.id));
  console.log(`${blocs.size} bloc(s) type=competition, ${vivantes.size} compétition(s) vivante(s).`);

  // ④ Un `competition_id` absent compte comme orphelin : le bloc n'est rattaché à rien.
  const orphelins = blocs.docs.filter((d) => {
    const id = d.data().competition_id;
    return !id || !vivantes.has(id);
  });

  if (orphelins.length === 0) {
    console.log('✔ Aucun bloc de compétition orphelin. Rien à faire.');
    process.exit(0);
  }

  // ③ On décide AVANT d'écrire quoi que ce soit : une seule cotation illisible annule le lot.
  const plan = [];
  const refus = [];
  for (const docSnap of orphelins) {
    const b = docSnap.data();
    const actuelle = b.difficulty;
    const canonique = normaliserCouleur(actuelle);
    if (canonique === null) {
      refus.push(`${docSnap.id} : difficulty=${JSON.stringify(actuelle)} non normalisable`);
      continue;
    }
    plan.push({
      id: docSnap.id,
      competition: b.competition_id || '(aucune)',
      mur: b.wall || '(aucun)',
      numero: b.number,
      actuelle,
      canonique,
      aNormaliser: !estCanonique(actuelle),
      dejaInactif: b.is_active === false,
    });
  }

  console.log(`\n${orphelins.length} bloc(s) orphelin(s) :`);
  plan.forEach((p) => {
    const gestes = [];
    if (!p.dejaInactif) gestes.push('désactiver');
    if (p.aNormaliser) gestes.push(`difficulty ${JSON.stringify(p.actuelle)} → "${p.canonique}"`);
    console.log(`  ${p.id} | comp=${p.competition} | ${p.mur} n°${p.numero}`
      + ` | ${gestes.length ? gestes.join(' + ') : 'rien à faire'}`);
  });

  if (refus.length) {
    console.error(`\n🔴 ${refus.length} cotation(s) non normalisable(s) — AUCUNE écriture, le lot est annulé :`);
    refus.forEach((r) => console.error(`   ${r}`));
    console.error('   Corrigez ces valeurs à la main (ou ajoutez l\'alias dans lib/couleur-canonique.cjs'
      + ' si la forme est légitime), puis relancez.');
    process.exit(1);
  }

  const aDesactiver = plan.filter((p) => !p.dejaInactif).length;
  const aNormaliser = plan.filter((p) => p.aNormaliser).length;
  console.log(`\nRésumé : ${aDesactiver} à désactiver, ${aNormaliser} cotation(s) à normaliser.`);

  if (!FIX) {
    console.log('Simulation : rien n\'a été écrit, nulle part.');
    process.exit(0);
  }

  // ② Le garde de périmètre, évalué APRÈS l'affichage du détail pour qu'un refus soit instruit.
  if (ATTENDU === null || !Number.isInteger(ATTENDU)) {
    console.error('\n🔴 --fix exige --expected N (le nombre d\'orphelins attendu). Lancez d\'abord'
      + ' la simulation, lisez le nombre, puis repassez-le ici : un script de réparation qui agit'
      + ' sur « ce qu\'il trouve » est un script dont personne ne relit le périmètre.');
    process.exit(1);
  }
  if (orphelins.length !== ATTENDU) {
    console.error(`\n🔴 ${orphelins.length} orphelin(s) trouvé(s), ${ATTENDU} attendu(s) —`
      + ' AUCUNE écriture. La base a changé depuis la simulation : relisez le détail ci-dessus'
      + ' avant de relancer avec le bon nombre.');
    process.exit(1);
  }

  // 7 opérations : un lot unique suffit très largement (le plafond Firestore est à 500). Le
  // découpage de `utils/firestoreBatchChunks.ts` est un garde de SEUIL côté application ; ici
  // le périmètre est borné par `--expected`, donc il ne peut pas croître à notre insu.
  const batch = db.batch();
  plan.forEach((p) => {
    const patch = {};
    if (!p.dejaInactif) patch.is_active = false;
    if (p.aNormaliser) patch.difficulty = p.canonique;
    if (Object.keys(patch).length) batch.update(db.collection('boulders').doc(p.id), patch);
  });
  await batch.commit();

  // ⚠️ Annoncer l'EFFET, pas le succès : un script dont la raison d'être est un effet de bord
  // et qui réussit en silence est indiscernable d'un no-op.
  console.log(`\n✔ ${aDesactiver} bloc(s) désactivé(s), ${aNormaliser} cotation(s) normalisée(s).`);
  console.log('   `type` et `competition_id` inchangés (un competition_id pendant est normal et'
    + ' documenté — voir purge-orphan-competition-refs.js).');
  console.log('   Contrôle : relancez `node audit-prod-catalog.js`, qui doit repasser à 0 erreur.');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC : ' + (e && e.message ? e.message : e)); process.exit(1); });
