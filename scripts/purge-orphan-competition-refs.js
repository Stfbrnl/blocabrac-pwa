// Supprime les références laissées par une compétition supprimée :
//
//   node purge-orphan-competition-refs.js                      → simulation (par défaut)
//   node purge-orphan-competition-refs.js --fix --expected 23   → sauvegarde puis supprime
//   node purge-orphan-competition-refs.js --no-active           → ignore les competition_active
//
// ─── POURQUOI CE SCRIPT EXISTE ─────────────────────────────────────────────────────────
//
// Supprimer une compétition depuis l'écran d'administration ne supprime rien de ce qui
// pointait vers elle. Le 15/10/2026, la suppression de trois compétitions de test a laissé
// 10 résultats et 3 participations orphelins, et fait passer `audit-prod-catalog.js` de 0 à
// 13 erreurs — l'audit faisant exactement son travail (contrôle des références mortes ajouté
// le 02/10). Un audit rouge en permanence est précisément ce que ce projet refuse : il apprend
// à ignorer le rouge.
//
// Aucun écran ne peut plus lire ces documents — tous interrogent par `competition_id`, et la
// compétition n'existe plus. Et ils n'alimentent rien d'autre : `competition_results` ne nourrit
// que les classements de compétition, jamais `client_boulder_results` ni le classement annuel.
//
// ─── CE QU'IL NE TOUCHE PAS, ET C'EST LE POINT IMPORTANT ───────────────────────────────
//
// ⚠️ **Il ne supprime JAMAIS un document `boulders`, ni le champ `competition_id` d'un bloc.**
//
//   - « Ne jamais supprimer un document `boulders` » est un invariant du dépôt : la
//     monotonicité des classements en dépend (voir CLAUDE.md). La retraite d'un bloc se fait
//     par `is_active: false`, jamais autrement.
//   - `competition_id` sur un bloc n'est **jamais effacé**, par conception : les pages de
//     statistiques reconstruisent une compétition en interrogeant ce seul champ, et un bloc qui
//     garde l'identifiant d'une compétition disparue est un état NORMAL, pas une anomalie.
//     C'est pour cela que l'audit ne le signale pas, et il a raison.
//
// Ce qu'il efface en revanche, sauf `--no-active` : `competition_active: true` sur un bloc dont
// la compétition n'existe plus. Ce champ signifie « membre actif de cette compétition » — sans
// compétition, il ne veut plus rien dire. Inerte tant que le mur est démonté, c'est un piège le
// jour où on le remonte.
//
// ─── GARDES ────────────────────────────────────────────────────────────────────────────
//
// - Simulation par défaut. Une simulation n'écrit rien, nulle part — pas même la sauvegarde.
// - `--fix` exige `--expected <n>`, n = nombre total de documents touchés, écrit d'avance. Un
//   écart arrête le script sans rien écrire : c'est la mécanisation de « prédire avant de
//   mesurer », et ici elle compte double, puisque le script supprime.
// - Sauvegarde intégrale des documents supprimés AVANT la première écriture, dans
//   `firestore-migration/` (gitignoré).
// - Vérification finale par RELECTURE, jamais par absence d'exception.
//
// Usage ponctuel, à la demande : aucun cron. Il n'y a rien à nettoyer périodiquement — ce
// script traite les conséquences d'un geste humain.
const fs = require('fs');
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
const SANS_ACTIVE = process.argv.includes('--no-active');
const iExpected = process.argv.indexOf('--expected');
const EXPECTED = iExpected !== -1 ? Number(process.argv[iExpected + 1]) : null;

async function main() {
  console.log(`Mode : ${FIX ? '⚠️  SUPPRESSION (--fix)' : 'simulation (aucune écriture)'}`);
  console.log('');

  const [comps, parts, res, blocs] = await Promise.all([
    db.collection('competitions').get(),
    db.collection('competition_participants').get(),
    db.collection('competition_results').get(),
    db.collection('boulders').get(),
  ]);
  const vivantes = new Set(comps.docs.map((d) => d.id));
  console.log(`Compétitions existantes : ${vivantes.size}`);

  const estOrphelin = (d) => {
    const cid = d.data().competition_id;
    return cid && !vivantes.has(cid);
  };

  const partsOrph = parts.docs.filter(estOrphelin);
  const resOrph = res.docs.filter(estOrphelin);
  // ⚠️ On n'efface QUE le drapeau, et seulement si la compétition n'existe plus. Un bloc tagué
  // dans une compétition VIVANTE n'est évidemment pas concerné.
  const actifsOrph = SANS_ACTIVE ? [] : blocs.docs.filter((d) => {
    const b = d.data();
    if (b.competition_active !== true) return false;
    return !b.competition_id || !vivantes.has(b.competition_id);
  });

  console.log(`Participations orphelines à SUPPRIMER : ${partsOrph.length} / ${parts.size}`);
  partsOrph.forEach((d) => console.log(`  - ${d.id} → compétition ${d.data().competition_id}`));
  console.log(`Résultats orphelins à SUPPRIMER       : ${resOrph.length} / ${res.size}`);
  resOrph.forEach((d) => console.log(`  - ${d.id}`));
  console.log(`Blocs dont on efface competition_active : ${actifsOrph.length}`);
  actifsOrph.forEach((d) => {
    const b = d.data();
    console.log(`  - ${d.id} | n°${b.number} ${b.wall} | competition_id conservé : ${JSON.stringify(b.competition_id)}`);
  });

  const total = partsOrph.length + resOrph.length + actifsOrph.length;
  console.log('');
  console.log(`TOTAL de documents touchés : ${total}`);

  if (total === 0) {
    console.log('✅ Rien à faire : aucune référence morte.');
    return;
  }

  if (!FIX) {
    console.log('');
    console.log('Simulation terminée, rien n\'a été écrit. Pour agir réellement :');
    console.log(`  node scripts/purge-orphan-competition-refs.js --fix --expected ${total}`);
    return;
  }

  if (EXPECTED === null || Number.isNaN(EXPECTED)) {
    console.error(`❌ --fix exige --expected <n> (ici ${total}) : le nombre doit être écrit d'avance.`);
    process.exit(1);
  }
  if (EXPECTED !== total) {
    console.error(`❌ Écart avec la prédiction : ${total} documents touchés, --expected ${EXPECTED}.`);
    console.error('   Rien n\'a été écrit. Relire la simulation et comprendre l\'écart.');
    process.exit(1);
  }

  const jour = new Date().toISOString().slice(0, 10);
  const sauvegarde = path.join(
    CREDENTIALS_DIR,
    IS_EMULATOR ? `dump-orphelins-competition-${jour}.emulator.json` : `dump-orphelins-competition-${jour}.json`
  );
  fs.writeFileSync(sauvegarde, JSON.stringify({
    date: new Date().toISOString(),
    competitions_vivantes: [...vivantes],
    competition_participants: partsOrph.map((d) => ({ id: d.id, data: d.data() })),
    competition_results: resOrph.map((d) => ({ id: d.id, data: d.data() })),
    // Pour les blocs, on ne garde que ce qu'on modifie — le document lui-même reste en base.
    boulders_competition_active_efface: actifsOrph.map((d) => ({ id: d.id, competition_id: d.data().competition_id ?? null })),
  }, null, 2));
  console.log(`Sauvegarde intégrale : ${sauvegarde}`);

  const batch = db.batch();
  partsOrph.forEach((d) => batch.delete(d.ref));
  resOrph.forEach((d) => batch.delete(d.ref));
  const { FieldValue } = require('firebase-admin/firestore');
  actifsOrph.forEach((d) => batch.update(d.ref, { competition_active: FieldValue.delete() }));
  await batch.commit();

  // Garde par étape : vérifier par RELECTURE, jamais par l'absence d'exception.
  const [parts2, res2, blocs2] = await Promise.all([
    db.collection('competition_participants').get(),
    db.collection('competition_results').get(),
    db.collection('boulders').get(),
  ]);
  const restants = parts2.docs.filter(estOrphelin).length
    + res2.docs.filter(estOrphelin).length
    + (SANS_ACTIVE ? 0 : blocs2.docs.filter((d) => {
      const b = d.data();
      return b.competition_active === true && (!b.competition_id || !vivantes.has(b.competition_id));
    }).length);

  console.log('');
  if (restants !== 0) {
    console.error(`❌ ${restants} référence(s) morte(s) subsiste(nt) après l'opération. Vérifier à la main.`);
    process.exit(1);
  }
  // Et vérifier qu'on n'a supprimé AUCUN bloc : l'invariant du dépôt.
  if (blocs2.size !== blocs.size) {
    console.error(`❌ Le nombre de blocs a changé (${blocs.size} → ${blocs2.size}). C'est interdit.`);
    process.exit(1);
  }
  console.log(`✅ ${total} document(s) traité(s). ${blocs2.size} blocs, aucun supprimé.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
