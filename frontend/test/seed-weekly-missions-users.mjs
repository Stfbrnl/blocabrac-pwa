// Seed ponctuel (émulateurs locaux uniquement) : un grimpeur niveau rouge + 4 blocs
// quotidiens répartis sur 4 murs, dont un rouge DÉJÀ réussi (en 3 essais, le mois dernier)
// pour exercer la revalidation — docs/handoffs/RETOUR-bug-missions-et-revalidation.md §1.2/§5.4.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const CLIENT_EMAIL = 'client.missions.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

// Numéros hauts et fixes : le script e2e les retrouve par texte ("Bloc n°…").
export const MISSION_BOULDERS = [
  { id: 'missions-b1', number: 9101, color: 'violet', wall: 'Réta Adultes' }, // 1re réussite en 1 essai -> M6 + M3 (flash max-1)
  { id: 'missions-b2', number: 9102, color: 'noir', wall: 'Dévers 30°' },     // "J'ai testé ce bloc" -> M4, aucun résultat écrit
  { id: 'missions-b5', number: 9105, color: 'bleu', wall: 'Güllich' },        // échec -> flush "missions seules" (régression V2.68)
  { id: 'missions-b3', number: 9103, color: 'rouge', wall: 'Grande Face' },   // déjà réussi -> lecture seule + "Je l'ai refait" -> M1
  { id: 'missions-b4', number: 9104, color: 'vert', wall: 'Dalle' },          // 1re réussite -> M7, puis "Corriger ma saisie"
];

async function main() {
  let client;
  try {
    client = await auth.getUserByEmail(CLIENT_EMAIL);
  } catch {
    client = await auth.createUser({ email: CLIENT_EMAIL, password: PASSWORD });
  }

  await db.collection('users').doc(client.uid).set({
    email: CLIENT_EMAIL,
    first_name: 'Miss',
    last_name: 'Ions',
    roles: ['client'],
    gender: 'Femme',
    dateOfBirth: '1990-03-10',
    level: 'rouge',
    inscritAuxCours: false,
    inscritAuxCompetitions: false,
    classementOptIn: false,
  });
  // Rejouable : repart d'un état ludique et de résultats vierges à chaque seed.
  await db.collection('user_ludic_state').doc(client.uid).delete();
  await db.collection('classement_profiles').doc(client.uid).delete();

  const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString();
  for (const b of MISSION_BOULDERS) {
    await db.collection('boulders').doc(b.id).set({
      type: 'daily', is_active: true, wall: b.wall, number: b.number, color: b.color,
      created_by: client.uid, createdAt: lastMonth,
    });
    await db.collection('client_boulder_results').doc(`${client.uid}_${b.id}`).delete();
  }
  await db.collection('client_boulder_results').doc(`${client.uid}_missions-b3`).set({
    userId: client.uid, boulderId: 'missions-b3', success: true, attempts: 3, rating: 4,
    comment: 'Beau bloc', proposedDifficulty: null, methods: [], createdAt: lastMonth, updatedAt: lastMonth,
  });

  console.log('SEED_OK', JSON.stringify({ clientUid: client.uid }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
