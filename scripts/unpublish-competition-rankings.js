// Retire un palmarès officiel publié par erreur, pour que l'application puisse le republier :
//
//   node unpublish-competition-rankings.js --competitionId <id>         → simulation (par défaut)
//   node unpublish-competition-rankings.js --competitionId <id> --fix   → sauvegarde puis supprime
//
// ─── POURQUOI CE SCRIPT EXISTE, ET POURQUOI IL NE RECALCULE RIEN ───────────────────────
//
// `competition_rankings/{competitionId}` est le palmarès officiel GELÉ d'une compétition
// (docs/plans/PLAN-classements-competition-5-novembre.md §2). `firestore.rules` le rend
// IMMUABLE : `allow update, delete: if false` pour tout le monde, l'admin compris. L'admin peut
// seulement le CRÉER, depuis l'écran de gestion.
//
// Cette asymétrie est voulue : **publier est facile, dépublier ne l'est pas.** Un palmarès est
// un fait daté — si une recotation de bloc pouvait le faire bouger, il ne vaudrait rien. Mais
// il reste le cas humain : publier avant que toutes les saisies soient faites. Il faut donc un
// chemin de correction, et il doit coûter plus cher qu'un clic. Celui-ci passe par la clé de
// service, donc hors des règles.
//
// ⚠️ IL NE RECALCULE RIEN, ET C'EST LE POINT. Le classement est calculé par
// `frontend/src/utils/competitionRankings.ts`, en TypeScript, et il doit n'exister qu'UNE FOIS
// (§2.4 : deux implémentations du même classement, c'est la divergence que ce projet a déjà
// payée quatre fois — dont une le 03/10/2026, où un message publié numérotait 1, 2, 3 là où
// l'écran affichait 1, 1, 3). Un script Node ne peut pas exécuter ce TypeScript sans y ajouter
// un outil de compilation — essayé, et fragile : `rolldown` n'est accessible que depuis
// `frontend/node_modules`, et une étape de compilation dans un script qui sert le soir d'une
// épreuve est une pièce mobile de trop.
//
// Donc ce script SUPPRIME, et la republication se fait depuis l'application, avec l'unique
// calcul. C'est aussi plus sûr : le palmarès republié est recalculé sur la donnée corrigée, et
// non reconstitué par un second code qui pourrait ne pas dire la même chose.
//
// ─── GARDES ────────────────────────────────────────────────────────────────────────────
//
// - `--competitionId` est OBLIGATOIRE : aucune forme de masse. Il n'y a jamais de raison de
//   dépublier « tous les palmarès », et l'absence de forme groupée est la garde.
// - Simulation par défaut. Une simulation n'écrit rien, nulle part — pas même la sauvegarde
//   (règle du 02/10/2026, après qu'une simulation ait réécrit le journal d'un cron).
// - Sous `--fix`, le document est d'abord SAUVEGARDÉ intégralement dans `firestore-migration/`
//   (dossier gitignoré), puis supprimé. Un palmarès supprimé sans sauvegarde serait une perte
//   sèche : rien ne garantit que la donnée source permette de le reconstituer à l'identique —
//   c'est précisément la raison d'être du gel.
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
const idArgIndex = process.argv.indexOf('--competitionId');
const COMPETITION_ID = idArgIndex !== -1 ? process.argv[idArgIndex + 1] : null;

async function main() {
  if (!COMPETITION_ID) {
    console.error('❌ --competitionId <id> est obligatoire. Ce script n\'a aucune forme de masse,');
    console.error('   et c\'est volontaire : on ne dépublie jamais « tous les palmarès ».');
    process.exit(1);
  }

  console.log(`Mode : ${FIX ? '⚠️  SUPPRESSION (--fix)' : 'simulation (aucune écriture)'}`);
  console.log(`Compétition : ${COMPETITION_ID}`);
  console.log('');

  const ref = db.collection('competition_rankings').doc(COMPETITION_ID);
  const snap = await ref.get();

  if (!snap.exists) {
    // Pas une erreur : c'est l'état normal de toute compétition non publiée. Mais on le dit
    // clairement, parce qu'un identifiant mal saisi produit exactement le même message — et un
    // « rien à faire » rassurant sur un mauvais identifiant serait trompeur.
    console.log('Aucun palmarès publié sous cet identifiant.');
    console.log('→ Soit la compétition n\'a jamais été publiée, soit l\'identifiant est mal saisi.');
    const existants = await db.collection('competition_rankings').get();
    console.log(`Palmarès actuellement publiés (${existants.size}) :`);
    existants.docs.forEach((d) => {
      console.log(`  - ${d.id} | ${d.data().competition_name || '?'} | publié le ${d.data().published_at || '?'}`);
    });
    process.exit(1);
  }

  const data = snap.data();
  console.log(`Palmarès trouvé : « ${data.competition_name} » du ${data.competition_date}`);
  console.log(`Publié le       : ${data.published_at}`);
  console.log(`Mode de comptage: ${data.scoring_mode}`);
  console.log(`Classement général : ${(data.general_open || []).length} participant(s)`);
  console.log(`Classement client  : ${(data.client_open || []).length} participant(s)`);
  (data.general_open || []).slice(0, 3).forEach((e) => {
    console.log(`  ${e.rank}. ${e.display_name} — ${e.score} pts`);
  });
  console.log('');

  if (!FIX) {
    console.log('Simulation terminée, rien n\'a été supprimé. Pour dépublier réellement :');
    console.log(`  node scripts/unpublish-competition-rankings.js --competitionId ${COMPETITION_ID} --fix`);
    console.log('Puis republier depuis l\'écran d\'administration des compétitions.');
    return;
  }

  const jour = new Date().toISOString().slice(0, 10);
  const sauvegarde = path.join(
    CREDENTIALS_DIR,
    IS_EMULATOR
      ? `dump-palmares-${COMPETITION_ID}-${jour}.emulator.json`
      : `dump-palmares-${COMPETITION_ID}-${jour}.json`
  );
  fs.writeFileSync(sauvegarde, JSON.stringify({ id: snap.id, data }, null, 2));
  console.log(`Sauvegarde intégrale du palmarès : ${sauvegarde}`);

  await ref.delete();

  // Garde par étape : vérifier la suppression en RELISANT, jamais conclure de l'absence
  // d'exception (feedback-garde-par-etape, 03/10/2026).
  const apres = await ref.get();
  if (apres.exists) {
    console.error('❌ Le document existe encore après la suppression. Rien ne garantit l\'état : vérifier à la main.');
    process.exit(1);
  }

  console.log('');
  console.log('✅ Palmarès dépublié. L\'écran d\'administration propose à nouveau « Publier le palmarès ».');
  console.log('   Le nouveau palmarès sera recalculé sur la donnée COURANTE — vérifiez l\'aperçu avant de publier.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
