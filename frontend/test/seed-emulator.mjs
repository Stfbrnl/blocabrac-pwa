// Script ponctuel : seed des données de test dans les émulateurs Auth/Firestore
// locaux, pour un test Playwright de bout en bout (moniteur crée une séance,
// client la voit/valide). Utilise firebase-admin (contourne les règles de
// sécurité, normal pour du seed) et ne touche jamais à la production.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const MONITEUR_EMAIL = 'moniteur.test@blocabrac.test';
const CLIENT_EMAIL = 'client.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

async function main() {
  const moniteur = await auth.createUser({ email: MONITEUR_EMAIL, password: PASSWORD });
  const client = await auth.createUser({ email: CLIENT_EMAIL, password: PASSWORD });

  await db.collection('users').doc(moniteur.uid).set({
    email: MONITEUR_EMAIL,
    first_name: 'Momo',
    last_name: 'Niteur',
    roles: ['moniteur'],
  });

  await db.collection('users').doc(client.uid).set({
    email: CLIENT_EMAIL,
    first_name: 'Cliff',
    last_name: 'Ent',
    roles: ['client'],
    gender: 'Homme',
    dateOfBirth: '1995-05-01',
    inscritAuxCours: true,
  });

  await db.collection('Groups').doc('test-group').set({
    name: 'Groupe Test E2E',
    description: 'Groupe pour test Playwright',
    createdBy: moniteur.uid,
    moniteurId: moniteur.uid,
    students: [client.uid],
    createdAt: new Date(),
  });

  await db.collection('exercises').doc('test-exercise').set({
    name: 'Grimpe équilibrée',
    description: 'Exercice de test',
    difficulty: 'bleu',
    type: 'validation',
    instructions: 'Grimper en gardant le bassin proche du mur.',
  });

  console.log('SEED_OK', JSON.stringify({ moniteurUid: moniteur.uid, clientUid: client.uid }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
