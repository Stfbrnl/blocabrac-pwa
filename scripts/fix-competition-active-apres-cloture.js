// Efface `competition_active` sur les blocs d'une compétition qui N'EST PLUS EN COURS.
//
//   node scripts/fix-competition-active-apres-cloture.js              → SIMULATION
//   node scripts/fix-competition-active-apres-cloture.js --fix --expected 1
//
// ⚠️ LA CAUSE, trouvée dans le code le 06/11/2026 et non supposée.
// `CompetitionBouldersList.tsx` charge les blocs de la compétition SANS filtre `is_active`
// (la requête est juste), puis applique `.filter(boulder => boulder.is_active === true)`
// avant de poser l'état `boulders`. Or c'est cet état que « Terminer la compétition »
// (`handleConfirmMigrate`) parcourt. **Un bloc désactivé pendant qu'il était rattaché est donc
// invisible à l'écran ET sauté par la clôture** : il garde `competition_active: true` pour
// toujours, et aucune interface ne peut plus l'atteindre. Même famille que la verrue déjà
// documentée du sélecteur ×1/×2, qui ne s'affiche que pour un bloc rattaché.
//
// ⚠️ LE DOMMAGE EST LATENT, PAS ACTUEL, et il faut le dire dans cet ordre : un bloc désactivé
// ne peut recevoir aucune validation, donc rien n'est suspendu tant qu'il reste au placard.
// Mais `firestore.rules` refuse les premières ascensions ET les votes de méthode sur tout bloc
// `competition_active` — donc le jour où ce bloc est REMIS AU MUR (la routine d'une rotation),
// il revient avec le drapeau d'une compétition terminée et les deux fonctionnalités y sont
// muettes, sans terme et sans message. C'est pour ce jour-là que ce script existe.
//
// ⚠️ CE QU'IL N'EFFACE PAS : `competition_id` (conservé exprès, toute page de statistiques
// reconstruit une compétition en l'interrogeant seul) ni `points_multiplier` (conservé à la
// clôture par contrat — l'effacer rendrait au simple, pour toujours, les blocs doublés d'une
// épreuve terminée, puisque `competition_results` ne stocke aucun point). Un seul champ bouge.
//
// ⚠️ Et il ne touche AUCUN bloc d'une compétition « à venir » ou « en cours » : là le drapeau
// est légitime, et l'effacer sortirait un bloc d'une épreuve en train de se jouer.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, deleteField } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');
function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}
const db = getFirestore(initializeApp({ credential: cert(readServiceAccount()) }));

// Les seuls statuts pour lesquels le drapeau est LÉGITIME. Énumérés en positif : une liste
// d'exclusions laisserait passer tout statut futur qu'on n'aurait pas pensé à y ajouter.
const STATUTS_EN_VOL = ['à venir', 'en cours'];

const FIX = process.argv.includes('--fix');
const iExp = process.argv.indexOf('--expected');
const EXPECTED = iExp >= 0 ? Number(process.argv[iExp + 1]) : null;

(async () => {
  console.log('════ competition_active après clôture — '
    + (FIX ? '🔴 MODE ÉCRITURE' : 'SIMULATION (rien ne sera écrit)') + ' ════\n');

  const [blocs, comps] = await Promise.all([
    db.collection('boulders').where('competition_active', '==', true).get(),
    db.collection('competitions').get(),
  ]);
  const statutParId = new Map();
  comps.forEach((c) => statutParId.set(c.id, c.data().status || '(sans statut)'));

  console.log(`${blocs.size} bloc(s) portent competition_active = true.`);
  console.log('Répartition par statut de leur compétition :');
  const cibles = [];
  const parStatut = new Map();
  blocs.forEach((b) => {
    const d = b.data();
    const statut = statutParId.has(d.competition_id)
      ? statutParId.get(d.competition_id)
      : '(compétition absente)';
    parStatut.set(statut, (parStatut.get(statut) || 0) + 1);
    if (!STATUTS_EN_VOL.includes(statut)) {
      cibles.push({
        id: b.id,
        numero: d.number ?? d.numero ?? '?',
        mur: d.wall || d.mur || '?',
        actif: d.is_active === true,
        statut,
        compId: d.competition_id,
        mult: d.points_multiplier,
      });
    }
  });
  [...parStatut.entries()].forEach(([s, n]) => {
    console.log(`  ${String(n).padStart(3)} — ${s}${STATUTS_EN_VOL.includes(s) ? '   (LÉGITIME, non touché)' : '   → à effacer'}`);
  });

  console.log(`\n${cibles.length} CIBLE(S) :`);
  cibles.forEach((c) => {
    console.log(`  ${c.id}  n°${c.numero} ${c.mur}`);
    console.log(`     is_active=${c.actif}${c.actif ? '' : '  ← désactivé : c\'est le cas que la clôture saute'}`
      + `  | compétition ${c.compId} [${c.statut}]`
      + `  | points_multiplier ${c.mult ?? '(absent)'} → CONSERVÉ`);
  });

  if (EXPECTED !== null && cibles.length !== EXPECTED) {
    console.error(`\n✘ REFUSÉ : ${cibles.length} cible(s) alors que --expected annonçait ${EXPECTED}.`);
    process.exit(1);
  }

  if (!FIX) {
    console.log(`\nSIMULATION TERMINÉE — 0 document écrit, ${cibles.length} le serai(en)t avec --fix.`);
    if (cibles.length) {
      console.log('Relancer avec :  node scripts/fix-competition-active-apres-cloture.js --fix --expected ' + cibles.length);
    }
    process.exit(0);
  }

  let ecrits = 0;
  for (const c of cibles) {
    await db.collection('boulders').doc(c.id).update({ competition_active: deleteField() });
    ecrits += 1;
  }
  console.log(`\n✔ EFFET : ${ecrits} bloc(s) modifié(s), champ competition_active effacé.`);
  console.log('  competition_id et points_multiplier INTACTS. Aucun bloc supprimé.');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC : ' + (e && e.message ? e.message : e)); process.exit(1); });
