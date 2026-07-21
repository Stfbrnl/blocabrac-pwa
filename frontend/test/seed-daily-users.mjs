// Seed ponctuel (émulateurs locaux uniquement) : ouvreur + client, pour tester
// le flux blocs quotidiens de bout en bout.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const OUVREUR_EMAIL = 'ouvreur.daily.test@blocabrac.test';
const CLIENT_EMAIL = 'client.daily.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

async function main() {
  const ouvreur = await auth.createUser({ email: OUVREUR_EMAIL, password: PASSWORD });
  const client = await auth.createUser({ email: CLIENT_EMAIL, password: PASSWORD });

  await db.collection('users').doc(ouvreur.uid).set({
    email: OUVREUR_EMAIL, first_name: 'Ova', last_name: 'Reur', roles: ['ouvreur'],
  });
  await db.collection('users').doc(client.uid).set({
    email: CLIENT_EMAIL,
    first_name: 'Dali',
    last_name: 'Ente',
    roles: ['client'],
    gender: 'Homme',
    dateOfBirth: '2000-06-15',
    level: 'rouge',
    inscritAuxCours: false,
    inscritAuxCompetitions: false,
    classementOptIn: false,
  });

  console.log('SEED_OK', JSON.stringify({ ouvreurUid: ouvreur.uid, clientUid: client.uid }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
