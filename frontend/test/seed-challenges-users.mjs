// Seed ponctuel (émulateurs locaux uniquement) : 2 clients déjà amis (structure attendue
// par "Défis entre potes" — voir ClientFriends.tsx, un défi ne se lance qu'entre potes
// acceptés) + un bloc quotidien rouge actif, pour pouvoir valider une structure "seuil"
// dans e2e-challenges-flow.mjs sans passer par tout le flux de demande d'ami.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const PASSWORD = 'TestPassword123!';
const CLIENT1_EMAIL = 'client1.challenges.test@blocabrac.test';
const CLIENT2_EMAIL = 'client2.challenges.test@blocabrac.test';

const friendPairId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

async function main() {
  const client1 = await auth.createUser({ email: CLIENT1_EMAIL, password: PASSWORD });
  const client2 = await auth.createUser({ email: CLIENT2_EMAIL, password: PASSWORD });

  await db.collection('users').doc(client1.uid).set({
    email: CLIENT1_EMAIL, first_name: 'Défi', last_name: 'Un', roles: ['client'],
    gender: 'Homme', dateOfBirth: '1997-02-11', level: 'rouge',
    inscritAuxCours: false, inscritAuxCompetitions: false, classementOptIn: false,
  });
  await db.collection('classement_profiles').doc(client1.uid).set({
    first_name: 'Défi', last_name: 'Un', gender: 'Homme', dateOfBirth: '1997-02-11', classementOptIn: false,
  });

  await db.collection('users').doc(client2.uid).set({
    email: CLIENT2_EMAIL, first_name: 'Défi', last_name: 'Deux', roles: ['client'],
    gender: 'Femme', dateOfBirth: '1999-09-05', level: 'rouge',
    inscritAuxCours: false, inscritAuxCompetitions: false, classementOptIn: false,
  });
  await db.collection('classement_profiles').doc(client2.uid).set({
    first_name: 'Défi', last_name: 'Deux', gender: 'Femme', dateOfBirth: '1999-09-05', classementOptIn: false,
  });

  await db.collection('friendships').doc(friendPairId(client1.uid, client2.uid)).set({
    uids: [client1.uid, client2.uid], status: 'accepted', requestedBy: client1.uid,
    createdAt: new Date().toISOString(),
  });

  // ✅ Deux blocs rouges actifs : "seuil" (2 rouges) doit pouvoir être atteint par une
  // seule validation par bloc (un même bloc revalidé ne recompte pas deux fois côté
  // classement_profiles, donc pas côté défi non plus — même logique de transition).
  const boulder1 = await db.collection('boulders').add({
    type: 'daily', is_active: true, wall: 'Grotte Adultes', color: 'rouge', number: 1,
  });
  const boulder2 = await db.collection('boulders').add({
    type: 'daily', is_active: true, wall: 'Grotte Adultes', color: 'rouge', number: 2,
  });

  console.log('SEED_OK', JSON.stringify({
    client1Uid: client1.uid, client2Uid: client2.uid,
    boulder1Id: boulder1.id, boulder2Id: boulder2.id,
  }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
