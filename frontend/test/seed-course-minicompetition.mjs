// Seed ponctuel (émulateurs locaux uniquement) : mêmes comptes que seed-emulator.mjs
// (moniteur + client), plus un bloc quotidien actif et une mini-compétition qui le
// référence — prérequis pour tester la file d'attente "blocs de mini-compétition" de
// ClientCourseSession.tsx (PROCESSUS-erreurs-avalees.md §3, useDebouncedFlushQueue),
// jamais couverte par e2e-course-flow.mjs (qui ne valide qu'un exercice).
// La mini-compétition est créée directement via firebase-admin plutôt que par le
// formulaire moniteur (Moniteur/MiniCompetitions/MiniCompetitionForm.tsx) : ce chantier
// vérifie le chemin d'écriture CLIENT (validation), pas l'écran de création moniteur,
// qui n'a pas changé.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const MONITEUR_EMAIL = 'moniteur.minicomp.test@blocabrac.test';
const CLIENT_EMAIL = 'client.minicomp.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

async function main() {
  const moniteur = await auth.createUser({ email: MONITEUR_EMAIL, password: PASSWORD });
  const client = await auth.createUser({ email: CLIENT_EMAIL, password: PASSWORD });

  await db.collection('users').doc(moniteur.uid).set({
    email: MONITEUR_EMAIL, first_name: 'Momo', last_name: 'MiniComp', roles: ['moniteur'],
  });
  await db.collection('users').doc(client.uid).set({
    email: CLIENT_EMAIL, first_name: 'Cliff', last_name: 'MiniComp', roles: ['client'],
    gender: 'Homme', dateOfBirth: '1995-05-01', inscritAuxCours: true,
  });

  await db.collection('Groups').doc('minicomp-group').set({
    name: 'Groupe Mini-compétition E2E',
    createdBy: moniteur.uid, moniteurId: moniteur.uid, students: [client.uid],
    createdAt: new Date(),
  });

  const boulder = await db.collection('boulders').add({
    type: 'daily', is_active: true, wall: 'Dalle', color: 'bleu', number: 42,
  });

  const miniCompetition = await db.collection('mini_competitions').add({
    name: 'Mini-compét E2E', boulderIds: [boulder.id],
  });

  console.log('SEED_OK', JSON.stringify({
    moniteurUid: moniteur.uid, clientUid: client.uid,
    boulderId: boulder.id, miniCompetitionId: miniCompetition.id,
  }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
