// Seed ponctuel (émulateurs locaux uniquement) : admin + ouvreur + client, pour tester
// le flux "classement de saison" de bout en bout (docs/plans/CONCEPTION-classement-saisonnier.md).
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';
import { resetEmulators } from './emulator-reset.mjs';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const ADMIN_EMAIL = 'admin.season.test@blocabrac.test';
const OUVREUR_EMAIL = 'ouvreur.season.test@blocabrac.test';
const CLIENT_EMAIL = 'client.season.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

async function main() {
  // RETOUR-v2681-v269-v270.md §5 : toujours repartir d'émulateurs vides (voir emulator-reset.mjs).
  await resetEmulators();
  const adminUser = await auth.createUser({ email: ADMIN_EMAIL, password: PASSWORD });
  const ouvreur = await auth.createUser({ email: OUVREUR_EMAIL, password: PASSWORD });
  const client = await auth.createUser({ email: CLIENT_EMAIL, password: PASSWORD });

  await db.collection('users').doc(adminUser.uid).set({
    email: ADMIN_EMAIL, first_name: 'Ada', last_name: 'Min', roles: ['admin', 'client'],
  });
  await db.collection('users').doc(ouvreur.uid).set({
    email: OUVREUR_EMAIL, first_name: 'Ova', last_name: 'Reur', roles: ['ouvreur'],
  });
  await db.collection('users').doc(client.uid).set({
    email: CLIENT_EMAIL,
    first_name: 'Sai',
    last_name: 'Zon',
    roles: ['client'],
    gender: 'Femme',
    dateOfBirth: '2001-03-10',
    level: 'bleu',
    inscritAuxCours: false,
    inscritAuxCompetitions: true,
    classementOptIn: false,
  });

  // ✅ V2.71.2 (RETOUR-v271.md §2) : deux profils préexistants pour vérifier « Enregistrer » :
  // l'admin SANS base de saison (doit recevoir baseScore = 0), l'ouvreur AVEC un crédit de
  // « Redémarrer » (baseScore = 300, ne doit JAMAIS être écrasé).
  await db.collection('classement_profiles').doc(adminUser.uid).set({ first_name: 'Ada', last_name: 'Min', score: 0, season: { score: 0, colorCounts: {} } });
  await db.collection('classement_profiles').doc(ouvreur.uid).set({ first_name: 'Ova', last_name: 'Reur', score: 300, season: { score: 300, colorCounts: {}, baseScore: 300, baseColorCounts: {} } });

  // ✅ Compétition officielle préexistante (créée directement, pas via l'UI — le
  // formulaire de création est déjà couvert par d'autres e2e), pour tester le bouton
  // "Générer le roster" sans repasser par tout le flux de création.
  const competitionRef = await db.collection('competitions').add({
    name: 'Finale de test',
    date: '2027-06-15',
    status: 'à venir',
    access_code: 'FINALE-TEST',
    max_participants: 20,
    registered_count: 0,
    scoring_mode: 'officiel',
  });

  console.log('SEED_OK', JSON.stringify({
    adminUid: adminUser.uid,
    ouvreurUid: ouvreur.uid,
    clientUid: client.uid,
    competitionId: competitionRef.id,
  }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
