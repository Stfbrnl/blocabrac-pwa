// Seed ponctuel (émulateurs locaux uniquement) : 2 clients + 1 moniteur, avec leurs
// fiches publiques ("classement_profiles"/"staff_directory") tenues à jour comme le
// ferait Register.tsx/AdminUsers.tsx en production — sans ça, la recherche de
// "Potes de grimpe" (Friends.tsx) ne trouverait personne, puisqu'elle ne lit jamais
// la collection "users" complète (un client ne peut pas la lister, cf. firestore.rules).
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const PASSWORD = 'TestPassword123!';
const CLIENT1_EMAIL = 'client1.friends.test@blocabrac.test';
const CLIENT2_EMAIL = 'client2.friends.test@blocabrac.test';
const MONITEUR_EMAIL = 'moniteur.friends.test@blocabrac.test';

async function main() {
  const client1 = await auth.createUser({ email: CLIENT1_EMAIL, password: PASSWORD });
  const client2 = await auth.createUser({ email: CLIENT2_EMAIL, password: PASSWORD });
  const moniteur = await auth.createUser({ email: MONITEUR_EMAIL, password: PASSWORD });

  await db.collection('users').doc(client1.uid).set({
    email: CLIENT1_EMAIL, first_name: 'Filou', last_name: 'Ami1', roles: ['client'],
    gender: 'Homme', dateOfBirth: '1997-02-11', level: 'vert',
    inscritAuxCours: false, inscritAuxCompetitions: false, classementOptIn: false,
  });
  await db.collection('classement_profiles').doc(client1.uid).set({
    first_name: 'Filou', last_name: 'Ami1', gender: 'Homme', dateOfBirth: '1997-02-11', classementOptIn: false,
  });

  await db.collection('users').doc(client2.uid).set({
    email: CLIENT2_EMAIL, first_name: 'Grimpe', last_name: 'Ami2', roles: ['client'],
    gender: 'Femme', dateOfBirth: '1999-09-05', level: 'bleu',
    inscritAuxCours: false, inscritAuxCompetitions: false, classementOptIn: false,
  });
  await db.collection('classement_profiles').doc(client2.uid).set({
    first_name: 'Grimpe', last_name: 'Ami2', gender: 'Femme', dateOfBirth: '1999-09-05', classementOptIn: false,
  });

  // ✅ "client" toujours présent (voir invariant firestore.rules/AdminUsers.tsx) :
  // "Mon espace personnel" (qui héberge "Potes de grimpe") est protégé par
  // role="client", donc un compte staff sans ce rôle ne pourrait jamais l'atteindre.
  await db.collection('users').doc(moniteur.uid).set({
    email: MONITEUR_EMAIL, first_name: 'Momo', last_name: 'Ami3', roles: ['moniteur', 'client'],
  });
  await db.collection('staff_directory').doc(moniteur.uid).set({
    displayName: 'Momo Ami3', roles: ['moniteur'],
  });
  await db.collection('classement_profiles').doc(moniteur.uid).set({
    first_name: 'Momo', last_name: 'Ami3', classementOptIn: false,
  });

  console.log('SEED_OK', JSON.stringify({
    client1Uid: client1.uid, client2Uid: client2.uid, moniteurUid: moniteur.uid,
  }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
