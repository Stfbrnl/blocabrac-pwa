// Seed ponctuel (émulateurs locaux uniquement) : admin + ouvreur + client,
// pour tester le flux compétition de bout en bout.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const ADMIN_EMAIL = 'admin.test@blocabrac.test';
const OUVREUR_EMAIL = 'ouvreur.test@blocabrac.test';
const CLIENT_EMAIL = 'client.competition.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

async function main() {
  const adminUser = await auth.createUser({ email: ADMIN_EMAIL, password: PASSWORD });
  const ouvreur = await auth.createUser({ email: OUVREUR_EMAIL, password: PASSWORD });
  const client = await auth.createUser({ email: CLIENT_EMAIL, password: PASSWORD });

  await db.collection('users').doc(adminUser.uid).set({
    email: ADMIN_EMAIL, first_name: 'Adam', last_name: 'Ine', roles: ['admin'],
  });
  await db.collection('users').doc(ouvreur.uid).set({
    email: OUVREUR_EMAIL, first_name: 'Ova', last_name: 'Reur', roles: ['ouvreur'],
  });
  await db.collection('users').doc(client.uid).set({
    email: CLIENT_EMAIL,
    first_name: 'Cliff',
    last_name: 'Ompete',
    roles: ['client'],
    gender: 'Femme',
    dateOfBirth: '1998-03-10',
    level: 'bleu',
    inscritAuxCompetitions: true,
    inscritAuxCours: false,
  });

  console.log('SEED_OK', JSON.stringify({ adminUid: adminUser.uid, ouvreurUid: ouvreur.uid, clientUid: client.uid }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
