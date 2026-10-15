// Seed du flux « palmarès officiel gelé » (émulateurs locaux uniquement).
//
// ⚠️ CE QUE CE JEU DE DONNÉES DOIT POUVOIR EXPRIMER — question à poser à tout nouveau seed
// (règle du 03/10/2026, après deux filets restés verts faute de pouvoir rougir) :
//
//   - UNE ÉGALITÉ RÉELLE au rang 1 (Amandine / Bruno : mêmes points, mêmes blocs, mêmes
//     essais, même échec). Sans elle, un palmarès numéroté en `index + 1` serait
//     indiscernable d'un palmarès correct — et c'est exactement le défaut du 03/10/2026 ;
//   - UN NON-CLIENT inscrit (Victor, rôle ouvreur seul). Sans lui, « classement général » et
//     « classement des clients » seraient la même liste et le filtre ne vérifierait rien. En
//     production ce cas n'existe pas : les 61 comptes portent tous `client` ;
//   - DES NOMS DE FAMILLE LONGS (Dupont-Lachaise, Vandenberghe) pour que la troncature soit
//     DÉTECTABLE. Avec « Li », tronqué et non tronqué se confondent ;
//   - UN GRIMPEUR SANS NOM DE FAMILLE ET SANS DATE DE NAISSANCE (Chloe), le cas réel du
//     compte rattrapé le 03/10/2026 — il doit produire un libellé explicite et la catégorie
//     « Inconnu », pas une cellule vide ni un plantage ;
//   - DEUX BLOCS de couleurs différentes, pour que la recotation de l'un (le test décisif du
//     §6) déplace réellement les scores. Avec un seul bloc, recoter changerait tout le monde
//     dans le même sens et ne prouverait rien sur les rangs ;
//   - DEUX NIVEAUX de grimpeurs, pour que le classement par niveau max ait plus d'un paquet.
import { resetEmulators } from './emulator-reset.mjs';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const admin = (await import('firebase-admin')).default;

// Ce flux lit TOUS les documents de `competition_rankings` (l'écran client les liste) : il
// doit donc partir d'un émulateur propre, sinon un palmarès laissé par un autre essai
// apparaîtrait dans la liste et ferait échouer des assertions de taille.
await resetEmulators();

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

const PASSWORD = 'TestPassword123!';
const ADMIN_EMAIL = 'admin.palmares@blocabrac.test';
const COMPETITION_ID = 'comp-palmares-essai';

const grimpeurs = [
  {
    cle: 'amandine', email: 'amandine.palmares@blocabrac.test',
    first_name: 'Amandine', last_name: 'Dupont-Lachaise',
    gender: 'Femme', dateOfBirth: '1996-04-12', level: 'rouge', roles: ['client'],
  },
  {
    cle: 'bruno', email: 'bruno.palmares@blocabrac.test',
    first_name: 'Bruno', last_name: 'Vandenberghe',
    gender: 'Homme', dateOfBirth: '1996-09-30', level: 'rouge', roles: ['client'],
  },
  {
    // Ni nom de famille, ni date de naissance : le cas réel du 03/10/2026.
    cle: 'chloe', email: 'chloe.palmares@blocabrac.test',
    first_name: 'Chloe', last_name: null,
    gender: 'Femme', dateOfBirth: null, level: 'bleu', roles: ['client'],
  },
  {
    // NON client : seul rôle « ouvreur ». Il doit apparaître au classement général et dans
    // AUCUN des quatre classements clients.
    cle: 'victor', email: 'victor.palmares@blocabrac.test',
    first_name: 'Victor', last_name: 'Visiteur',
    gender: 'Homme', dateOfBirth: '1996-01-05', level: 'noir', roles: ['ouvreur', 'client'],
    is_client_participation: false,
  },
];

async function main() {
  const adminUser = await auth.createUser({ email: ADMIN_EMAIL, password: PASSWORD });
  await db.collection('users').doc(adminUser.uid).set({
    email: ADMIN_EMAIL, first_name: 'Adam', last_name: 'Ine', roles: ['admin'],
    inscritAuxCompetitions: true,
  });

  const uids = {};
  for (const g of grimpeurs) {
    const u = await auth.createUser({ email: g.email, password: PASSWORD });
    uids[g.cle] = u.uid;
    await db.collection('users').doc(u.uid).set({
      email: g.email,
      first_name: g.first_name,
      last_name: g.last_name,
      gender: g.gender,
      dateOfBirth: g.dateOfBirth,
      level: g.level,
      baseLevel: g.level,
      roles: g.roles,
      inscritAuxCompetitions: true,
      inscritAuxCours: false,
      classementOptIn: true,
    });
  }

  // Compétition TERMINÉE : le palmarès ne se publie qu'après l'épreuve.
  await db.collection('competitions').doc(COMPETITION_ID).set({
    name: 'Contest essai palmares',
    date: '2026-11-05',
    status: 'terminée',
    access_code: '1234',
    max_participants: 50,
    registered_count: grimpeurs.length,
    liveDisplayEnabled: false,
    scoring_mode: 'blocabrac',
  });

  // ⚠️ COMPÉTITION HYBRIDE, et c'est la forme réelle du Contest du 5 novembre : des blocs
  // créés pour l'épreuve sur un mur neuf, PLUS des blocs du jour déjà en place réutilisés.
  //
  // Les deux formes sont disjointes en base (mesuré sur les 180 blocs de production le
  // 15/10/2026) : un bloc de compétition porte `difficulty` et PAS `color` ; un bloc du jour
  // porte `color` et PAS `difficulty`. Jusqu'à cette date, les trois seeds du dépôt
  // n'utilisaient QUE la première forme — la branche que l'événement allait emprunter était
  // donc la seule non exercée. Ne pas « simplifier » ce mélange.
  //
  // Barème blocabrac : rouge 400/-20, violet 200/-10, bleu 100/-10.
  await db.collection('boulders').doc('bloc-rouge-essai').set({
    type: 'competition', competition_id: COMPETITION_ID, number: 1, wall: 'Mur Neuf',
    difficulty: 'rouge', is_active: true, difficulty_types: [],
  });
  await db.collection('boulders').doc('bloc-bleu-essai').set({
    type: 'competition', competition_id: COMPETITION_ID, number: 2, wall: 'Mur Neuf',
    difficulty: 'bleu', is_active: true, difficulty_types: [],
  });
  // Le bloc du jour réutilisé : `type: 'daily'`, couleur PUBLIQUE, aucune `difficulty`, et
  // `competition_active: true` — l'état exact qu'un bloc tagué dans une compétition porte.
  await db.collection('boulders').doc('bloc-jour-reutilise').set({
    type: 'daily', competition_id: COMPETITION_ID, competition_active: true,
    number: 7, wall: 'Grande Face', color: 'violet', is_active: true, difficulty_types: [],
  });

  for (const g of grimpeurs) {
    const uid = uids[g.cle];
    await db.collection('competition_participants').doc(`${uid}_${COMPETITION_ID}`).set({
      user_id: uid,
      competition_id: COMPETITION_ID,
      email: g.email,
      first_name: g.first_name,
      last_name: g.last_name,
      age: null,
      dateOfBirth: g.dateOfBirth,
      gender: g.gender,
      level: g.level,
      level_at_start: g.level,
      registered_at: new Date().toISOString(),
      is_client: g.is_client_participation !== false,
    });
  }

  // Amandine et Bruno : rouge en 2 essais (380) + bleu en 1 (100) = 480, et le MÊME échec.
  // Égalité PARFAITE, que même le critère de départage ultime ne sépare pas.
  const resultats = [
    { uid: uids.amandine, boulder_id: 'bloc-rouge-essai', success: true, attempts: 2 },
    { uid: uids.amandine, boulder_id: 'bloc-bleu-essai', success: true, attempts: 1 },
    { uid: uids.bruno, boulder_id: 'bloc-rouge-essai', success: true, attempts: 2 },
    { uid: uids.bruno, boulder_id: 'bloc-bleu-essai', success: true, attempts: 1 },
    // Chloe : bleu en 1 essai (100) + LE BLOC DU JOUR, violet en 1 essai (200) = 300.
    // ⚠️ C'est la seule assertion qui distingue « la couleur du bloc du jour est lue » de
    // « elle est ignorée » : sans elle, Chloe serait à 100. Et le violet la fait MONTER du
    // paquet bleu au paquet violet — l'anti-sandbagging sur un bloc dont la couleur est
    // publique, c'est-à-dire le cas normal du 5 novembre.
    { uid: uids.chloe, boulder_id: 'bloc-bleu-essai', success: true, attempts: 1 },
    { uid: uids.chloe, boulder_id: 'bloc-jour-reutilise', success: true, attempts: 1 },
    // Victor (non client) : rouge au premier essai = 400.
    { uid: uids.victor, boulder_id: 'bloc-rouge-essai', success: true, attempts: 1 },
  ];
  for (const r of resultats) {
    await db.collection('competition_results').doc(`${r.uid}_${r.boulder_id}_${COMPETITION_ID}`).set({
      user_id: r.uid,
      competition_id: COMPETITION_ID,
      boulder_id: r.boulder_id,
      success: r.success,
      attempts: r.attempts,
      rating: 0,
      proposed_difficulty: '',
      zone: r.success,
      attempts_to_zone: r.attempts,
      submitted: true,
      submitted_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  console.log('SEED_OK', JSON.stringify({
    competitionId: COMPETITION_ID,
    adminEmail: ADMIN_EMAIL,
    adminUid: adminUser.uid,
    uids,
  }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('SEED_FAILED', err);
  process.exit(1);
});
