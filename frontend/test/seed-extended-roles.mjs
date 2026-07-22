// Seed ponctuel (émulateurs locaux uniquement) : admin + moniteur + 2 clients,
// plus quelques documents de fond (badge, résultat de cours) pour tester les
// surfaces des 4 rôles qui n'avaient pas encore été exercées via Playwright
// (gestion utilisateurs/annonces admin, groupes/exercices/messages/stats moniteur,
// profil/stats client).
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const PASSWORD = 'TestPassword123!';
const ADMIN_EMAIL = 'admin.ext.test@blocabrac.test';
const MONITEUR_EMAIL = 'moniteur.ext.test@blocabrac.test';
const CLIENT1_EMAIL = 'client1.ext.test@blocabrac.test';
const CLIENT2_EMAIL = 'client2.ext.test@blocabrac.test';

async function main() {
  const adminUser = await auth.createUser({ email: ADMIN_EMAIL, password: PASSWORD });
  const moniteur = await auth.createUser({ email: MONITEUR_EMAIL, password: PASSWORD });
  const client1 = await auth.createUser({ email: CLIENT1_EMAIL, password: PASSWORD });
  const client2 = await auth.createUser({ email: CLIENT2_EMAIL, password: PASSWORD });

  await db.collection('users').doc(adminUser.uid).set({
    email: ADMIN_EMAIL, first_name: 'Adam', last_name: 'Ine', roles: ['admin'],
  });
  await db.collection('users').doc(moniteur.uid).set({
    email: MONITEUR_EMAIL, first_name: 'Momo', last_name: 'Niteur', roles: ['moniteur'],
  });
  // Normalement tenu à jour par AdminUsers.tsx (batch avec "users") ; ce seed écrit
  // directement via l'admin SDK, donc il faut aussi écrire ce miroir pour que
  // ClientMessages.tsx (qui lit "staff_directory", jamais "users") trouve le moniteur.
  await db.collection('staff_directory').doc(moniteur.uid).set({
    displayName: 'Momo Niteur',
  });
  await db.collection('users').doc(client1.uid).set({
    email: CLIENT1_EMAIL,
    first_name: 'Cliff',
    last_name: 'Ombardier',
    roles: ['client'],
    gender: 'Homme',
    dateOfBirth: '1995-03-10',
    level: 'violet',
    inscritAuxCours: true,
    inscritAuxCompetitions: true,
    classementOptIn: false,
  });
  await db.collection('users').doc(client2.uid).set({
    email: CLIENT2_EMAIL,
    first_name: 'Clara',
    last_name: 'Sset',
    roles: ['client'],
    gender: 'Femme',
    dateOfBirth: '1998-07-22',
    level: 'bleu',
    inscritAuxCours: true,
    inscritAuxCompetitions: true,
    classementOptIn: false,
  });

  // Équipement pré-existant (créé par un ouvreur/admin) pour que l'Autocomplete
  // d'ExerciseForm.tsx (Moniteur > Exercices) ait au moins une option à afficher :
  // le composant reste caché tant que la collection est vide.
  await db.collection('equipment').doc('seed-equipment-test').set({
    name: 'Élastique de résistance',
    description: 'Équipement de test',
    number: 1,
    type: 'autre',
  });

  // Badge disponible pour le test d'attribution manuelle (Moniteur > Stats)
  await db.collection('badges').doc('seed-badge-test').set({
    name: 'Grimpeur assidu',
    feminineName: 'Grimpeuse assidue',
    description: 'Badge de test attribué manuellement',
    type: 'manual',
    color: 'violet',
  });

  // Exercice + résultat de cours pour que client1 apparaisse dans le tableau de
  // Moniteur > Stats (nécessaire pour afficher le bouton "Attribuer un badge/diplôme")
  const exerciseRef = await db.collection('exercises').add({
    name: 'Traction lestée',
    description: 'Exercice de test',
    difficulty: 'Moyen',
    category: 'Renforcement musculaire',
    type: 'validation',
    createdBy: moniteur.uid,
    createdAt: new Date(),
  });
  // ✅ Le document "courses/seed-course-ext" référencé ci-dessous doit exister :
  // firestore.rules évalue un get() sur son "groupId" pour décider du droit de
  // lecture, et une référence orpheline (courseId sans document correspondant)
  // fait planter cette évaluation de règle (erreur "Null value") plutôt que de
  // simplement renvoyer "non trouvé" — ça faisait échouer tout ClientStats.tsx,
  // badges et diplômes compris, avant que cette même lecture ne soit isolée dans
  // son propre try/catch côté frontend.
  await db.collection('courses').doc('seed-course-ext').set({
    title: 'Séance de test (extended-roles)',
    description: 'Séance seedée pour client_course_results',
    date: new Date().toISOString().split('T')[0],
    time: '18:00',
    createdBy: moniteur.uid,
    groupId: 'seed-group-ext',
  });
  await db.collection('Groups').doc('seed-group-ext').set({
    name: 'Groupe seed (extended-roles)',
    description: '',
    createdBy: moniteur.uid,
    moniteurId: moniteur.uid,
    students: [client1.uid],
    createdAt: new Date(),
  });
  await db.collection('client_course_results').add({
    userId: client1.uid,
    exerciseId: exerciseRef.id,
    exerciseName: 'Traction lestée',
    success: true,
    createdAt: new Date(),
    courseId: 'seed-course-ext',
  });

  console.log('SEED_OK', JSON.stringify({
    adminUid: adminUser.uid,
    moniteurUid: moniteur.uid,
    client1Uid: client1.uid,
    client2Uid: client2.uid,
  }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
