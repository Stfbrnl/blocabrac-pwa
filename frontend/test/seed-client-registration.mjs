// Seed (émulateurs locaux uniquement) : vérifier l'AUTO-INSCRIPTION du grimpeur, telle
// qu'elle se passe réellement depuis « Mes compétitions » de « Mon espace ».
//
// Demandé par l'utilisateur le 03/10/2026, avant le déploiement : « les grimpeurs s'inscrivent
// à toutes les compétitions […] idéalement on doit pouvoir s'inscrire à une compétition à
// venir ou en cours (pour les retardataires), mais pas terminée ».
//
// Trois compétitions, une par statut, pour que le jeu d'essai puisse EXPRIMER la règle de
// statut au lieu de la supposer : un seul statut ne pourrait rien démontrer.
import { resetEmulators } from './emulator-reset.mjs';
import admin from 'firebase-admin';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const __dirname = dirname(fileURLToPath(import.meta.url));

await resetEmulators();
admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const PASSWORD = 'TestPassword123!';
const GRIMPEUR_EMAIL = 'grimpeur.inscription@blocabrac.test';
const ADMIN_EMAIL = 'admin.inscription@blocabrac.test';

// Né en 1982 : catégorie FFME « Vétérans 1 (40-49 ans) ». Choisi loin de « Séniors » pour
// qu'une catégorie mal résolue (« Inconnu », ou un repli silencieux) soit visible d'un coup
// d'œil au lieu de se confondre avec la bande la plus peuplée.
const DATE_NAISSANCE = '1982-06-15';
const CATEGORIE_ATTENDUE = 'Vétérans 1 (40-49 ans)';

const grimpeur = await auth.createUser({ email: GRIMPEUR_EMAIL, password: PASSWORD });
await db.collection('users').doc(grimpeur.uid).set({
  email: GRIMPEUR_EMAIL,
  first_name: 'Camille',
  last_name: 'Tardif',
  roles: ['client'],
  dateOfBirth: DATE_NAISSANCE,
  gender: 'Femme',
  level: 'rouge',
  classementOptIn: true,
  inscritAuxCompetitions: true,
});

const adminUser = await auth.createUser({ email: ADMIN_EMAIL, password: PASSWORD });
await db.collection('users').doc(adminUser.uid).set({
  email: ADMIN_EMAIL, first_name: 'Ada', last_name: 'Minne', roles: ['admin', 'client'],
});

const aujourdHui = new Date().toISOString().slice(0, 10);
const competitions = {};
for (const [cle, statut, nom] of [
  ['aVenir', 'à venir', 'Compétition à venir'],
  ['enCours', 'en cours', 'Compétition en cours'],
  ['terminee', 'terminée', 'Compétition terminée'],
]) {
  const ref = await db.collection('competitions').add({
    name: nom,
    status: statut,
    scoring_mode: 'blocabrac',
    date: aujourdHui,
    access_code: 'INSCR2026',
    max_participants: 50,
    registered_count: 0,
    liveDisplayEnabled: true,
  });
  competitions[cle] = { id: ref.id, name: nom, status: statut };

  // Un bloc par compétition, pour que l'écran de validation ait de quoi s'afficher.
  await db.collection('boulders').add({
    type: 'competition', competition_id: ref.id, competition_active: true,
    is_active: true, wall: 'Grande Face', number: 1, difficulty: 'rouge',
  });
}

writeFileSync(join(__dirname, '.inscription-attendu.json'), JSON.stringify({
  grimpeurEmail: GRIMPEUR_EMAIL,
  grimpeurUid: grimpeur.uid,
  grimpeurNom: 'Camille Tardif',
  adminEmail: ADMIN_EMAIL,
  dateNaissance: DATE_NAISSANCE,
  categorieAttendue: CATEGORIE_ATTENDUE,
  competitions,
}, null, 2));

console.log(`SEED_OK grimpeur=${grimpeur.uid} competitions=${Object.keys(competitions).length}`);
Object.values(competitions).forEach((c) => console.log(`   ${c.status.padEnd(10)} ${c.name}`));
process.exit(0);
