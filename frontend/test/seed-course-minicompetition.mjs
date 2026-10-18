// Seed ponctuel (émulateurs locaux uniquement) : mêmes comptes que seed-emulator.mjs
// (moniteur + client), plus un bloc quotidien actif et une mini-compétition qui le
// référence — prérequis pour tester la file d'attente "blocs de mini-compétition" de
// ClientCourseSession.tsx (docs/processus/PROCESSUS-erreurs-avalees.md §3, useDebouncedFlushQueue),
// jamais couverte par e2e-course-flow.mjs (qui ne valide qu'un exercice).
// La mini-compétition est créée directement via firebase-admin plutôt que par le
// formulaire moniteur (Moniteur/MiniCompetitions/MiniCompetitionForm.tsx) : ce chantier
// vérifie le chemin d'écriture CLIENT (validation), pas l'écran de création moniteur,
// qui n'a pas changé.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';
import { resetEmulators } from './emulator-reset.mjs';

// ⚠️ Remise à zéro OBLIGATOIRE, et elle doit être appelée ICI : `emulator-reset.mjs`
// n'exporte qu'une fonction, donc `node test/emulator-reset.mjs` ne fait RIEN — piège
// rencontré le 18/10/2026, où trois exécutions se sont empilées en silence (un classement
// attendu à 80 points en affichait 2780, et une « casse » a semblé faire rougir un pas
// qu'elle ne touchait pas). Ce flux en a besoin plus qu'un autre : son pas sur le
// classement affirme un état GLOBAL (« une seule mini-compétition en base »), et ses
// comptes sont créés par `createUser`, qui échoue en double sur un émulateur déjà peuplé.
await resetEmulators();

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const MONITEUR_EMAIL = 'moniteur.minicomp.test@blocabrac.test';
const CLIENT_EMAIL = 'client.minicomp.test@blocabrac.test';
// ⚠️ DEUX ÉLÈVES, et le second existe pour une raison précise : le classement de la
// mini-compétition partage le rang des ex æquo (1, 1, 3). Avec un seul élève, « tous les
// rangs valent 1 » est vrai sans rien prouver, et le défaut corrigé le 18/10/2026 — un rang
// calculé en `index + 1`, qui donnait 1 et 2 à deux élèves au même score — resterait
// invisible. Les deux valident le MÊME bloc avec le MÊME nombre d'essais.
const CLIENT2_EMAIL = 'client2.minicomp.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

async function main() {
  const moniteur = await auth.createUser({ email: MONITEUR_EMAIL, password: PASSWORD });
  const client = await auth.createUser({ email: CLIENT_EMAIL, password: PASSWORD });
  const client2 = await auth.createUser({ email: CLIENT2_EMAIL, password: PASSWORD });

  await db.collection('users').doc(moniteur.uid).set({
    email: MONITEUR_EMAIL, first_name: 'Momo', last_name: 'MiniComp', roles: ['moniteur'],
  });
  await db.collection('users').doc(client.uid).set({
    email: CLIENT_EMAIL, first_name: 'Cliff', last_name: 'MiniComp', roles: ['client'],
    gender: 'Homme', dateOfBirth: '1995-05-01', inscritAuxCours: true,
  });
  await db.collection('users').doc(client2.uid).set({
    email: CLIENT2_EMAIL, first_name: 'Alix', last_name: 'MiniComp', roles: ['client'],
    gender: 'Femme', dateOfBirth: '1996-02-02', inscritAuxCours: true,
  });

  await db.collection('Groups').doc('minicomp-group').set({
    name: 'Groupe Mini-compétition E2E',
    createdBy: moniteur.uid, moniteurId: moniteur.uid, students: [client.uid, client2.uid],
    createdAt: new Date(),
  });

  const boulder = await db.collection('boulders').add({
    type: 'daily', is_active: true, wall: 'Dalle', color: 'bleu', number: 42,
  });
  // ⚠️ DEUX blocs, et le second existe pour une raison précise : il fait rendre le Select
  // « Nombre d'essais » de ClientCourseSession.tsx DEUX FOIS sur le même écran. C'est la
  // seule façon de donner un sujet à la vérification des identifiants dupliqués de
  // test/assertNoOrphanLabels.mjs — avec un seul bloc, un identifiant figé dans la boucle de
  // rendu ne produirait aucun doublon et le filet resterait vert sans rien avoir vérifié.
  // Voir docs/handoffs/RETOUR-labels-apres-dom.md §4.
  const boulder2 = await db.collection('boulders').add({
    type: 'daily', is_active: true, wall: 'Dalle', color: 'rouge', number: 43,
  });

  // ⚠️ PAS DE `createdBy`, ET C'EST PORTEUR. C'est le cas d'une mini-compétition qu'un
  // collègue (ou l'admin) a créée et que ce moniteur fait seulement jouer dans sa séance.
  // L'écran de statistiques ne listait que celles dont il est l'auteur : le bloc
  // « Classement » disparaissait alors en entier, sans le moindre message (mesuré sur
  // l'écran rendu le 18/10/2026). Ajouter `createdBy` ici ferait passer le pas e2e
  // correspondant pour une raison qui n'a rien à voir — ne pas « compléter » ce document.
  const miniCompetition = await db.collection('mini_competitions').add({
    name: 'Mini-compét E2E', boulderIds: [boulder.id, boulder2.id],
  });

  console.log('SEED_OK', JSON.stringify({
    moniteurUid: moniteur.uid, clientUid: client.uid, client2Uid: client2.uid,
    boulderId: boulder.id, miniCompetitionId: miniCompetition.id,
  }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
