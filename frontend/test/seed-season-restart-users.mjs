// Seed ponctuel (émulateurs locaux uniquement) : jeu "grandeur nature" pour tester le
// REDÉMARRAGE du classement de saison (V2.56, Modèle A). Plusieurs grimpeurs (2 F, 2 H,
// dont un opt-out), un inventaire de blocs quotidiens dont deux DÉSACTIVÉS (rotation de
// mur passée), des validations réparties sur blocs actifs ET retirés avec des essais
// variés et des dates anciennes, et des `classement_profiles` portant un `season.*`
// délibérément FAUX (avance de la période "injuste" + une clé orpheline) que le
// redémarrage doit recalculer proprement.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const PASSWORD = 'TestPassword123!';
const ADMIN_EMAIL = 'admin.restart.test@blocabrac.test';

// ✅ Barème quotidien (climbingPoints.ts) — recopié ici pour calculer les attendus dans
// le commentaire ci-dessous ; le test les revérifie côté backend.
// jaune25 vert50 bleu100 violet200 rouge400 noir600 blanc800 rose1000
// déduction (essais-1)* : jaune..violet 10, rouge/noir 20, blanc/rose 50

// `allTime` = valeurs all-time CORRECTES au moment du seed. Depuis V2.56 §3, le all-time
// est un compteur d'accumulation comme la saison : un bloc validé puis retiré garde ses
// points (couleur dernière connue). Donc les blocs violet/blanc "retirés" SONT comptés.
//   A : vert50 + bleu(2)90 + rouge400 + violet(retiré)200        = 740  {vert1,bleu1,rouge1,violet1}
//   B : vert50 + bleu100                                          = 150  {vert1,bleu1}
//   C : rouge(3)360 + noir600 + blanc(retiré,2)750                = 1710 {rouge1,noir1,blanc1}
//   D : vert50 + rouge400                                         = 450  {vert1,rouge1}
const CLIMBERS = [
  { key: 'A', email: 'climber.a.restart@blocabrac.test', first: 'Anna', last: 'Alpha', gender: 'Femme', level: 'rouge', optIn: true,
    allTime: { score: 740, colorCounts: { vert: 1, bleu: 1, rouge: 1, violet: 1 }, bouldersValidated: 4, bestColorRank: 4 } },
  { key: 'B', email: 'climber.b.restart@blocabrac.test', first: 'Bea', last: 'Bravo', gender: 'Femme', level: 'bleu', optIn: true,
    allTime: { score: 150, colorCounts: { vert: 1, bleu: 1 }, bouldersValidated: 2, bestColorRank: 2 } },
  { key: 'C', email: 'climber.c.restart@blocabrac.test', first: 'Cyril', last: 'Charlie', gender: 'Homme', level: 'noir', optIn: true,
    allTime: { score: 1710, colorCounts: { rouge: 1, noir: 1, blanc: 1 }, bouldersValidated: 3, bestColorRank: 6 } },
  { key: 'D', email: 'climber.d.restart@blocabrac.test', first: 'Dan', last: 'Delta', gender: 'Homme', level: 'rouge', optIn: false,
    allTime: { score: 450, colorCounts: { vert: 1, rouge: 1 }, bouldersValidated: 2, bestColorRank: 4 } },
];

// Blocs : 4 actifs + 2 retirés (is_active:false — rotation passée).
const BOULDERS = [
  { id: 'br-vert', color: 'vert', wall: 'Dalle', number: 11, is_active: true },
  { id: 'br-bleu', color: 'bleu', wall: 'Dalle', number: 12, is_active: true },
  { id: 'br-rouge', color: 'rouge', wall: 'Dévers', number: 21, is_active: true },
  { id: 'br-noir', color: 'noir', wall: 'Dévers', number: 22, is_active: true },
  { id: 'br-violet-retire', color: 'violet', wall: 'Mur ancien', number: 31, is_active: false },
  { id: 'br-blanc-retire', color: 'blanc', wall: 'Mur ancien', number: 32, is_active: false },
];

// Validations : { climber, boulderId, attempts, daysAgo }
// Attendus baseline (blocs retirés COMPTÉS, couleur actuelle, essais d'origine) :
//   A : vert(1)=50 + bleu(2)=90 + rouge(1)=400 + violet-retiré(1)=200        => 740  {vert1,bleu1,rouge1,violet1}
//   B : vert(1)=50 + bleu(1)=100                                             => 150  {vert1,bleu1}
//   C : rouge(3)=360 + noir(1)=600 + blanc-retiré(2)=800-50=750             => 1710 {rouge1,noir1,blanc1}
//   D : vert(1)=50 + rouge(1)=400                                            => 450  {vert1,rouge1}
const VALIDATIONS = [
  { climber: 'A', boulderId: 'br-vert', attempts: 1, daysAgo: 40 },
  { climber: 'A', boulderId: 'br-bleu', attempts: 2, daysAgo: 30 },
  { climber: 'A', boulderId: 'br-rouge', attempts: 1, daysAgo: 5 },
  { climber: 'A', boulderId: 'br-violet-retire', attempts: 1, daysAgo: 50 },
  { climber: 'B', boulderId: 'br-vert', attempts: 1, daysAgo: 20 },
  { climber: 'B', boulderId: 'br-bleu', attempts: 1, daysAgo: 2 },
  { climber: 'C', boulderId: 'br-rouge', attempts: 3, daysAgo: 33 },
  { climber: 'C', boulderId: 'br-noir', attempts: 1, daysAgo: 10 },
  { climber: 'C', boulderId: 'br-blanc-retire', attempts: 2, daysAgo: 55 },
  { climber: 'D', boulderId: 'br-vert', attempts: 1, daysAgo: 15 },
  { climber: 'D', boulderId: 'br-rouge', attempts: 1, daysAgo: 3 },
];

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

async function main() {
  const adminUser = await auth.createUser({ email: ADMIN_EMAIL, password: PASSWORD });
  await db.collection('users').doc(adminUser.uid).set({
    email: ADMIN_EMAIL, first_name: 'Ada', last_name: 'Min', roles: ['admin', 'client'],
  });

  const uidByKey = {};
  for (const c of CLIMBERS) {
    const u = await auth.createUser({ email: c.email, password: PASSWORD });
    uidByKey[c.key] = u.uid;
    await db.collection('users').doc(u.uid).set({
      email: c.email, first_name: c.first, last_name: c.last, roles: ['client'],
      gender: c.gender, level: c.level, dateOfBirth: '1998-01-01',
      inscritAuxCours: false, inscritAuxCompetitions: true, classementOptIn: c.optIn,
    });
    // ✅ Profil PRÉEXISTANT avec un season.* FAUX (avance injuste + clé orpheline) et
    // AUCUN season.baseScore — le redémarrage doit tout recalculer et poser base*.
    await db.collection('classement_profiles').doc(u.uid).set({
      score: c.allTime.score,
      bouldersValidated: c.allTime.bouldersValidated,
      bestColorRank: c.allTime.bestColorRank,
      colorCounts: c.allTime.colorCounts,
      gender: c.gender, classementOptIn: c.optIn, ffmeCategory: 'Séniors (20-39 ans)',
      season: { score: 99999, colorCounts: { vert: 9, bleu: 9, violet: 4, orpheline: 3 } },
    });
  }

  for (const b of BOULDERS) {
    await db.collection('boulders').doc(b.id).set({
      type: 'daily', color: b.color, wall: b.wall, number: b.number,
      is_active: b.is_active, is_child_route: false,
      created_at: isoDaysAgo(60), created_by: adminUser.uid,
    });
  }

  for (const v of VALIDATIONS) {
    const uid = uidByKey[v.climber];
    await db.collection('client_boulder_results').doc(`${uid}_${v.boulderId}`).set({
      userId: uid, boulderId: v.boulderId, success: true, attempts: v.attempts,
      rating: 0, comment: '', proposedDifficulty: null,
      createdAt: isoDaysAgo(v.daysAgo), updatedAt: isoDaysAgo(v.daysAgo),
    });
  }

  // Fenêtre de saison active : démarrée il y a 60 j, fin lointaine.
  await db.collection('app_config').doc('classement_saison').set({
    debut: isoDaysAgo(60).slice(0, 10),
    fin: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10),
    cloturee: false,
  });

  console.log('SEED_OK', JSON.stringify({ adminUid: adminUser.uid, uidByKey }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
