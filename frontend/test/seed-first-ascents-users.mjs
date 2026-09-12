// Seed ponctuel (émulateurs locaux uniquement) : trois clients avec l'opt-in "premiers
// ascensionnistes" déjà activé (bypass rules via l'Admin SDK), et un bloc noir dont la
// liste `firstAscents` est déjà à 3/5 entrées (fictives) — pour tester le remplissage puis
// le refus au-delà de 5 sans avoir à répéter 5 validations réelles.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const PASSWORD = 'TestPassword123!';
const CLIENT1_EMAIL = 'client1.firstascents.test@blocabrac.test';
const CLIENT2_EMAIL = 'client2.firstascents.test@blocabrac.test';
const CLIENT3_EMAIL = 'client3.firstascents.test@blocabrac.test';
const WALL = 'Grande Face';
const BOULDER_NUMBER = String(Math.floor(Math.random() * 9000) + 100);

const fakeAscent = (uid) => ({ uid, displayName: `Fictif ${uid}`, at: '2026-01-01T00:00:00.000Z' });

async function main() {
  const client1 = await auth.createUser({ email: CLIENT1_EMAIL, password: PASSWORD });
  const client2 = await auth.createUser({ email: CLIENT2_EMAIL, password: PASSWORD });
  const client3 = await auth.createUser({ email: CLIENT3_EMAIL, password: PASSWORD });

  for (const [i, u] of [client1, client2, client3].entries()) {
    await db.collection('users').doc(u.uid).set({
      email: [CLIENT1_EMAIL, CLIENT2_EMAIL, CLIENT3_EMAIL][i],
      first_name: `Client${i + 1}`,
      last_name: 'FirstAscents',
      roles: ['client'],
      gender: 'Homme',
      dateOfBirth: '2000-06-15',
      level: 'noir',
      inscritAuxCours: false,
      inscritAuxCompetitions: false,
      classementOptIn: false,
    });
    // ✅ Opt-in posé directement via l'Admin SDK (bypass rules) — ce que teste ce chantier
    // est le comportement de la règle sur "boulders", pas le formulaire ClientProfile.tsx
    // (déjà couvert par la présence du champ dans le fichier source).
    await db.collection('user_ludic_state').doc(u.uid).set({ firstAscentOptIn: true });
  }

  const boulderRef = await db.collection('boulders').add({
    type: 'daily',
    is_active: true,
    color: 'noir',
    wall: WALL,
    number: BOULDER_NUMBER,
    created_at: new Date().toISOString(),
    firstAscents: [fakeAscent('fictif-a'), fakeAscent('fictif-b'), fakeAscent('fictif-c')],
  });

  console.log('SEED_OK', JSON.stringify({
    client1Uid: client1.uid, client2Uid: client2.uid, client3Uid: client3.uid,
    boulderId: boulderRef.id, wall: WALL, boulderNumber: BOULDER_NUMBER,
  }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
