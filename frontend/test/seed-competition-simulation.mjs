// Seed (émulateurs locaux uniquement) : une compétition grandeur réelle, demandée par
// l'utilisateur le 03/10/2026 avant d'en organiser une vraie.
//
//   3 murs en ouverture x 10 blocs (du bleu au blanc) = 30 blocs
//   10 participants, étalés sur plusieurs catégories FFME et les deux genres
//   réussites et nombres d'essais tirés au hasard (générateur à GRAINE -> reproductible)
//
// ⚠️ Ce script calcule aussi le classement ATTENDU, avec un barème recopié à la main et
// NON importé du code de l'application : c'est ce qui permet à e2e-competition-simulation.mjs
// de vérifier l'écran réel contre un calcul indépendant, au lieu de comparer l'app à
// elle-même. Le résultat est écrit dans test/.simulation-attendu.json (gitignoré) pour que
// l'e2e le relise.
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
const ADMIN_EMAIL = 'admin.simu@blocabrac.test';
const COMPETITION_NAME = 'Simulation 3 murs';
const GRAINE = Number(process.env.SIMU_GRAINE || 20261003);

const MURS = ['Grande Face', 'Dévers 30°', 'Dalle'];
const COULEURS = ['bleu', 'violet', 'rouge', 'noir', 'blanc'];

// Oracle indépendant : barème recopié à la main, jamais importé de climbingPoints.ts.
const BASE = { bleu: 100, violet: 200, rouge: 400, noir: 600, blanc: 800 };
const MALUS = { bleu: 10, violet: 10, rouge: 20, noir: 20, blanc: 50 };
const pointsAttendus = (couleur, essais, reussi) =>
  reussi ? Math.max(0, BASE[couleur] - (essais > 1 ? (essais - 1) * MALUS[couleur] : 0)) : 0;

function rng(graine) {
  let a = graine;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mêmes bandes que gymConfig.ts, recopiées à la main (oracle).
const CATEGORIES = [
  [6, 7, 'U8 (6-7 ans)'], [8, 9, 'U10 (8-9 ans)'], [10, 11, 'U12 (10-11 ans)'],
  [12, 13, 'U14 (12-13 ans)'], [14, 15, 'U16 (14-15 ans)'], [16, 17, 'U18 (16-17 ans)'],
  [18, 19, 'U20 (18-19 ans)'], [20, 39, 'Séniors (20-39 ans)'],
  [40, 49, 'Vétérans 1 (40-49 ans)'], [50, 200, 'Vétérans 2 (50 ans et +)'],
];
const categoriePour = (age) => (CATEGORIES.find(([min, max]) => age >= min && age <= max) || [])[2] || 'Inconnu';

async function main() {
  const alea = rng(GRAINE);
  const anneeCourante = new Date().getFullYear();

  const adminUser = await auth.createUser({ email: ADMIN_EMAIL, password: PASSWORD });
  await db.collection('users').doc(adminUser.uid).set({
    email: ADMIN_EMAIL, first_name: 'Ada', last_name: 'Minne', roles: ['admin', 'client'],
  });

  // 10 participants : années de naissance choisies pour toucher plusieurs bandes FFME.
  const annees = [2019, 2017, 2015, 2013, 2011, 2008, 2004, 1995, 1982, 1970];
  const grimpeurs = [];
  for (let i = 0; i < annees.length; i += 1) {
    const email = `grimpeur${i}.simu@blocabrac.test`;
    const u = await auth.createUser({ email, password: PASSWORD });
    const dateOfBirth = `${annees[i]}-06-15`;
    const gender = i % 2 === 0 ? 'Homme' : 'Femme';
    await db.collection('users').doc(u.uid).set({
      email, first_name: `Prenom${i}`, last_name: `Nom${i}`,
      roles: ['client'], dateOfBirth, gender, level: 'rouge',
      classementOptIn: true, inscritAuxCompetitions: true,
    });
    grimpeurs.push({
      uid: u.uid, nom: `Prenom${i} Nom${i}`, dateOfBirth, gender,
      age: anneeCourante - annees[i],
    });
  }

  const competition = await db.collection('competitions').add({
    name: COMPETITION_NAME,
    status: 'en cours',
    scoring_mode: 'blocabrac',
    date: new Date().toISOString().slice(0, 10),
    access_code: 'SIMU2026',
    liveDisplayEnabled: false,
  });

  // 30 blocs : 3 murs x (2 par couleur, bleu -> blanc).
  const blocs = [];
  for (const mur of MURS) {
    for (const couleur of COULEURS) {
      for (let n = 0; n < 2; n += 1) {
        const numero = blocs.length + 1;
        const ref = await db.collection('boulders').add({
          type: 'competition', competition_id: competition.id, competition_active: true,
          is_active: true, wall: mur, number: numero, difficulty: couleur,
          points_value: numero * 10,
        });
        blocs.push({ id: ref.id, couleur, mur, numero });
      }
    }
  }

  // Inscriptions + résultats tirés au hasard.
  const attendu = {};
  let nbResultats = 0;
  for (const g of grimpeurs) {
    await db.collection('competition_participants').doc(`${g.uid}_${competition.id}`).set({
      competition_id: competition.id, user_id: g.uid, submitted: false,
      registered_at: new Date().toISOString(),
    });
    attendu[g.uid] = { nom: g.nom, score: 0, blocs: 0, categorie: categoriePour(g.age), genre: g.gender };

    for (const bloc of blocs) {
      if (alea() > 0.7) continue;                 // ~70 % des blocs tentés
      const reussi = alea() > 0.35;
      const essais = 1 + Math.floor(alea() * 8);  // 1 à 8 essais
      await db.collection('competition_results')
        .doc(`${g.uid}_${bloc.id}_${competition.id}`)
        .set({
          user_id: g.uid, competition_id: competition.id, boulder_id: bloc.id,
          success: reussi, attempts: essais, rating: 0, proposed_difficulty: '',
          zone: reussi, attempts_to_zone: essais,
          createdAt: new Date().toISOString(), submitted: false,
          updated_at: new Date().toISOString(),
        });
      nbResultats += 1;
      attendu[g.uid].score += pointsAttendus(bloc.couleur, essais, reussi);
      if (reussi) attendu[g.uid].blocs += 1;
    }
  }

  // Classement Open attendu : score décroissant. Les ex æquo sont signalés à part, l'écran
  // affichant la position comme `index + 1` sans les départager (constat documenté).
  const open = Object.entries(attendu)
    .map(([uid, d]) => ({ uid, ...d }))
    .sort((a, b) => b.score - a.score);
  const exAequo = open.filter((e, i) => i > 0 && e.score === open[i - 1].score).map((e) => e.score);

  const parCategorie = {};
  for (const e of open) {
    if (!parCategorie[e.categorie]) parCategorie[e.categorie] = [];
    parCategorie[e.categorie].push({ nom: e.nom, score: e.score });
  }

  const sortie = {
    graine: GRAINE,
    competitionId: competition.id,
    competitionName: COMPETITION_NAME,
    adminEmail: ADMIN_EMAIL,
    nbBlocs: blocs.length,
    nbParticipants: grimpeurs.length,
    nbResultats,
    open: open.map((e) => ({ nom: e.nom, score: e.score, blocs: e.blocs, categorie: e.categorie, genre: e.genre })),
    exAequo,
    parCategorie,
  };
  writeFileSync(join(__dirname, '.simulation-attendu.json'), JSON.stringify(sortie, null, 2));

  console.log(`SEED_OK graine=${GRAINE} blocs=${blocs.length} participants=${grimpeurs.length} resultats=${nbResultats}`);
  console.log('Classement Open attendu (oracle indépendant) :');
  sortie.open.forEach((e, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${e.nom.padEnd(18)} ${String(e.score).padStart(5)} pts  ${String(e.blocs).padStart(2)} blocs  ${e.categorie}`);
  });
  console.log(`Ex æquo dans ce tirage : ${exAequo.length ? exAequo.join(', ') : 'aucun'}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
