// Seed de la RÉPÉTITION GÉNÉRALE du contest du 5 novembre, à l'échelle réelle
// (docs/handoffs/2026-10-19-CN-80-inscrits.md §6 : « le verrouillage groupé, aller-retour,
// à 80 comptes, pas à 5 », et « le comportement de l'écran live avec 80 lignes »).
//
// ⚠️ CE QUE CE JEU DE DONNÉES DOIT POUVOIR EXPRIMER — la question à poser à tout nouveau seed
// (règle du 03/10/2026 : deux filets étaient restés verts faute de pouvoir rougir) :
//
//   - LA MULTIPLICITÉ. 80 participants, pas 5. Un lot de 5 ne peut exprimer ni la pagination
//     de l'écran live (10 par page), ni le découpage des writeBatch, ni la durée d'une passe
//     manuelle. C'est toute la raison d'être de ce seed : les autres existent déjà et sont
//     meilleurs que lui sur la correction, ils sont juste aveugles à l'échelle ;
//
//   - DES COMPTES DÉJÀ VERROUILLÉS au départ (`DEJA_VERROUILLES`). Sans eux, « verrouiller
//     tout » et « verrouiller ce qui ne l'est pas » donneraient le même nombre d'écritures, et
//     l'idempotence ne serait pas vérifiable — or le geste est fait DEUX FOIS le même soir ;
//
//   - DES COMPTES SANS RÔLE `client` (`SANS_ROLE_CLIENT`). Les règles refusent une écriture
//     d'admin sur `users` dont le document résultant ne porte pas ce rôle, et un `writeBatch`
//     est ATOMIQUE : un seul de ces comptes ferait échouer le lot entier. En production il n'y
//     en a aucun (mesuré le 19/10/2026 : 0 sur 63) — c'est précisément pourquoi la production
//     ne peut pas servir de terrain d'essai pour cette branche-là, et pourquoi ce seed doit en
//     fabriquer. Sans eux, l'exclusion codée dans AdminUsers.tsx ne serait jamais exercée ;
//
//   - DES NIVEAUX RÉPARTIS sur plusieurs couleurs, pour que le classement par niveau max ait
//     plus d'un paquet, et des paquets de tailles différentes ;
//
//   - UN COMPTE SANS `dateOfBirth` MAIS AVEC LE CHAMP HÉRITÉ `age` (le cas des 10 comptes
//     réels mesurés le 19/10/2026), pour que le repli de `getSeasonAge` soit emprunté ;
//
//   - LA COMPÉTITION EN « À VENIR », pas en cours : c'est l'e2e qui doit donner le coup
//     d'envoi, puisque c'est ce geste qui fige `level_at_start`. Un seed qui figerait déjà les
//     niveaux rendrait l'étape invérifiable.
//
// ⚠️ CE QU'IL NE PEUT PAS EXPRIMER, et il faut le dire : la CONCURRENCE. Tout est écrit ici
// par le SDK admin, en lots, depuis un seul processus. La contention de Firestore (~1 écriture
// par seconde soutenue sur un même document) et le comportement de 80 téléphones écrivant en
// même temps restent hors de portée — c'est ce que seule une vraie salle montrera, et c'est
// déjà noté dans docs/suivi/SUIVI-quota-ecritures.md.
import { resetEmulators } from './emulator-reset.mjs';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const admin = (await import('firebase-admin')).default;

await resetEmulators();

admin.initializeApp({ projectId: 'blocabrac' });
const auth = admin.auth();
const db = admin.firestore();

export const PASSWORD = 'TestPassword123!';
export const ADMIN_EMAIL = 'admin.repetition@blocabrac.test';
export const COMPETITION_ID = 'comp-repetition-generale';

// Les grandeurs de la soirée. 80 inscrits est le chiffre annoncé par le gérant ; 20 blocs est
// l'ordre de grandeur d'un contest de salle (les mesures de quota de 2026-08 portaient sur 35,
// délibérément plus pessimiste — voir docs/suivi/SUIVI-quota-lectures-competition.md).
export const N_PARTICIPANTS = 80;
export const N_BLOCS = 20;
// Parmi les 80 : ceux qui arrivent déjà verrouillés, et ceux que les règles refuseront.
export const DEJA_VERROUILLES = 6;
export const SANS_ROLE_CLIENT = 2;
// ⚠️ Des grimpeurs dont le niveau d'INSCRIPTION diffère du niveau COURANT du compte : inscrits
// il y a trois semaines à `jaune`, corrigés depuis (par un badge, ou à la main le soir même).
// Sans eux, `competition_participants.level` et `users.level` seraient égaux partout et
// l'assertion « le niveau de départ est lu sur users.level au coup d'envoi » serait satisfaite
// par les deux sources à la fois — elle ne pourrait pas rougir. C'est exactement la question
// que pose le PDF du contest (« lu sur users.level, ou sur la valeur copiée à l'inscription ? »),
// et un seed qui ne la distingue pas y répond « oui » quoi qu'il arrive.
export const NIVEAUX_PERIMES = 12;
export const NIVEAU_A_L_INSCRIPTION = 'jaune';

const COULEURS = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir'];
const GENRES = ['Femme', 'Homme'];

export const emailParticipant = (i) => `grimpeur${String(i).padStart(2, '0')}.repetition@blocabrac.test`;

// Déterministe : un tirage pseudo-aléatoire rendrait deux exécutions incomparables, et la
// première chose qu'on veut d'une répétition générale est de pouvoir la rejouer.
const profilParticipant = (i) => ({
  first_name: `Grimpeur${String(i).padStart(2, '0')}`,
  last_name: `Essai${String(i).padStart(2, '0')}`,
  gender: GENRES[i % GENRES.length],
  // Un compte sur dix n'a pas de date de naissance mais porte le champ hérité `age` : la
  // proportion réelle mesurée en production (10 sur 63).
  ...(i % 10 === 0
    ? { dateOfBirth: null, age: 20 + (i % 35) }
    : { dateOfBirth: `${1975 + (i % 35)}-0${1 + (i % 9)}-1${i % 10}`, age: null }),
  // Jamais `jaune` : c'est la valeur que porte le niveau d'inscription périmé, et un
  // grimpeur dont les deux coïncideraient ne distinguerait plus les deux sources.
  level: COULEURS[1 + (i % (COULEURS.length - 1))],
  // Les deux derniers n'ont QUE le rôle ouvreur : les règles refuseront toute écriture
  // d'admin sur leur document (hasClientRole).
  roles: i > N_PARTICIPANTS - SANS_ROLE_CLIENT ? ['ouvreur'] : ['client'],
  levelOverride: i <= DEJA_VERROUILLES,
});

async function main() {
  const adminUser = await auth.createUser({ email: ADMIN_EMAIL, password: PASSWORD });
  await db.collection('users').doc(adminUser.uid).set({
    email: ADMIN_EMAIL, first_name: 'Admin', last_name: 'Repetition',
    roles: ['admin', 'client'], inscritAuxCompetitions: true,
  });

  // Compétition « à venir » : le coup d'envoi est un geste de l'e2e, pas du seed.
  await db.collection('competitions').doc(COMPETITION_ID).set({
    name: 'Répétition générale 80',
    date: '2026-11-05',
    status: 'à venir',
    access_code: '1234',
    max_participants: 100,
    registered_count: N_PARTICIPANTS,
    liveDisplayEnabled: true,
    scoring_mode: 'blocabrac',
  });

  // Compétition HYBRIDE, la forme réelle du 5 novembre : des blocs créés pour l'épreuve
  // (`type: 'competition'`, cotation dans `difficulty`, aucune `color`) PLUS des blocs du jour
  // réutilisés (`type: 'daily'`, couleur publique, `competition_active: true`). Les deux
  // formes sont disjointes en base — ne pas « simplifier » ce mélange.
  const blocs = [];
  const lotBlocs = db.batch();
  for (let b = 1; b <= N_BLOCS; b++) {
    const id = `bloc-repetition-${b}`;
    blocs.push(id);
    const couleur = COULEURS[2 + (b % 4)]; // bleu..noir : jamais `jaune` sur un contest réel
    if (b % 4 === 0) {
      lotBlocs.set(db.collection('boulders').doc(id), {
        type: 'daily', competition_id: COMPETITION_ID, competition_active: true,
        number: b, wall: 'Grande Face', color: couleur, is_active: true, difficulty_types: [],
      });
    } else {
      lotBlocs.set(db.collection('boulders').doc(id), {
        type: 'competition', competition_id: COMPETITION_ID,
        number: b, wall: 'Mur Neuf', difficulty: couleur, is_active: true, difficulty_types: [],
      });
    }
  }
  await lotBlocs.commit();

  const uids = [];
  for (let i = 1; i <= N_PARTICIPANTS; i++) {
    const email = emailParticipant(i);
    const p = profilParticipant(i);
    const u = await auth.createUser({ email, password: PASSWORD });
    uids.push(u.uid);
    await db.collection('users').doc(u.uid).set({
      email,
      first_name: p.first_name,
      last_name: p.last_name,
      gender: p.gender,
      dateOfBirth: p.dateOfBirth,
      age: p.age,
      level: p.level,
      baseLevel: p.level,
      roles: p.roles,
      levelOverride: p.levelOverride,
      inscritAuxCompetitions: true,
      inscritAuxCours: false,
      classementOptIn: true,
    });
  }

  // Les inscriptions, de la forme exacte de `buildCompetitionParticipant` — et SANS
  // `level_at_start` : ce champ se pose au coup d'envoi, que l'e2e déclenchera.
  const lotInscriptions = [];
  for (let i = 0; i < uids.length; i++) {
    const p = profilParticipant(i + 1);
    lotInscriptions.push({
      ref: db.collection('competition_participants').doc(`${uids[i]}_${COMPETITION_ID}`),
      data: {
        user_id: uids[i],
        competition_id: COMPETITION_ID,
        email: emailParticipant(i + 1),
        first_name: p.first_name,
        last_name: p.last_name,
        age: p.age ?? null,
        dateOfBirth: p.dateOfBirth ?? null,
        gender: p.gender,
        // Les `NIVEAUX_PERIMES` premiers portent leur niveau d'il y a trois semaines.
        level: i < NIVEAUX_PERIMES ? NIVEAU_A_L_INSCRIPTION : p.level,
        registered_at: '2026-10-20T10:00:00.000Z',
        is_client: p.roles.includes('client'),
      },
    });
  }
  await commitParLots(lotInscriptions);

  // Les résultats de la soirée : chaque grimpeur touche tous les blocs, plus ou moins bien.
  // C'est ce volume (80 × 20 = 1 600 documents) que l'écran live doit trier, et qu'aucun
  // autre seed du dépôt ne produit.
  const lotResultats = [];
  for (let i = 0; i < uids.length; i++) {
    for (let b = 0; b < blocs.length; b++) {
      const reussi = (i + b) % 3 !== 0;
      lotResultats.push({
        ref: db.collection('competition_results').doc(`${uids[i]}_${blocs[b]}`),
        data: {
          user_id: uids[i],
          competition_id: COMPETITION_ID,
          boulder_id: blocs[b],
          success: reussi,
          attempts: 1 + ((i + b) % 4),
          submitted: false,
        },
      });
    }
  }
  await commitParLots(lotResultats);

  console.log(`✔ Seed répétition générale : ${N_PARTICIPANTS} participants `
    + `(dont ${DEJA_VERROUILLES} déjà verrouillés et ${SANS_ROLE_CLIENT} sans rôle client), `
    + `${N_BLOCS} blocs, ${lotResultats.length} résultats, compétition « à venir ».`);
}

// Annonce son effet plutôt que de réussir en silence : un no-op et un succès se ressemblent.
async function commitParLots(operations, taille = 450) {
  for (let i = 0; i < operations.length; i += taille) {
    const lot = db.batch();
    operations.slice(i, i + taille).forEach(({ ref, data }) => lot.set(ref, data));
    await lot.commit();
  }
}

await main();
process.exit(0);
