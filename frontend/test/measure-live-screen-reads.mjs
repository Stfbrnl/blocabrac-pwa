// ✅ §3 de CONCEPTION-ecran-live-competition.md : personne n'avait chiffré le coût en
// lectures de l'écran live avant ce script. Même protocole que measure-competition-reads*.mjs
// (émulateur, vrai client SDK signé admin) : deux requêtes (`competition_results` et
// `competition_participants` filtrées sur `competition_id`) simulant les deux `onSnapshot`
// montés une fois par l'écran, plus les deltas d'une soirée complète et le rejeu du
// "remontage" (rechargement de page, qui repaie le snapshot initial en entier).
//
// Scénario délibérément pessimiste (upper bound pour le dimensionnement, pas une moyenne) :
// la grille de résultats est déjà pleine (90 × 35) au moment du premier montage — comme si
// l'admin ouvrait l'écran tard dans la soirée — ET la totalité des écritures d'une soirée
// (mesurées par measure-competition-writes-after.mjs : 82 écritures competition_results +
// 1 verrouillage competition_participants par grimpeur) est rejouée en delta par-dessus,
// comme si l'écran avait été ouvert dès le début. Les deux pires cas cumulés, pas un
// scénario réaliste unique — c'est le choix de CONCEPTION-ecran-live-competition.md §3.
//
// Les écritures sont faites via le SDK admin (pas de sign-in par grimpeur) : la facturation
// des lectures d'un onSnapshot ne dépend pas de qui a écrit le document, seulement du
// document lui-même — inutile de recréer 90 comptes réels pour ce qu'on mesure ici.

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, query, where, getDocs } from 'firebase/firestore';

const N_BOULDERS = 35;
const N_PARTICIPANTS = 90;
const N_CORRECTIONS = 10; // même hypothèse que measure-competition-writes.mjs
const N_REMONTAGES = 3; // critère de sortie du §3 : "total soirée sous 30 000 lectures ... 3 remontages"

const ADMIN_EMAIL = 'live.screen.admin@blocabrac.test';
const ADMIN_PASSWORD = 'TestPassword123!';

admin.initializeApp({ projectId: 'blocabrac' });
const adb = admin.firestore();
const aauth = admin.auth();

async function commitInChunks(ops, chunkSize = 450) {
  let batch = adb.batch();
  let count = 0;
  for (const op of ops) {
    op(batch);
    count++;
    if (count >= chunkSize) {
      await batch.commit();
      batch = adb.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

async function seed() {
  const adminUser = await aauth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await adb.collection('users').doc(adminUser.uid).set({
    email: ADMIN_EMAIL, first_name: 'Live', last_name: 'Screen', roles: ['admin', 'client'],
  });

  const compRef = adb.collection('competitions').doc();
  await compRef.set({
    name: 'Compétition mesure écran live', date: '2026-09-01', status: 'en cours',
    access_code: 'TEST', max_participants: N_PARTICIPANTS, registered_count: N_PARTICIPANTS,
    liveDisplayEnabled: true,
  });

  const boulderIds = [];
  await commitInChunks(
    Array.from({ length: N_BOULDERS }, (_, i) => (batch) => {
      const bRef = adb.collection('boulders').doc();
      boulderIds.push(bRef.id);
      batch.set(bRef, {
        number: i + 1, wall: 'Mur A', difficulty: '6a', type: 'competition',
        competition_id: compRef.id, is_active: true, color: null,
      });
    })
  );

  const climberIds = Array.from({ length: N_PARTICIPANTS }, (_, p) => `climber_${p}`);

  await commitInChunks(
    climberIds.map((uid) => (batch) => {
      batch.set(adb.collection('competition_participants').doc(`${uid}_${compRef.id}`), {
        user_id: uid, competition_id: compRef.id, email: `${uid}@blocabrac.test`,
        first_name: 'C', last_name: uid, registered_at: new Date().toISOString(),
        is_client: true, submitted: false,
      });
    })
  );

  // Grille complète de résultats (état "fin de soirée") au moment du premier montage.
  const resultOps = [];
  for (const uid of climberIds) {
    for (const boulderId of boulderIds) {
      resultOps.push((batch) => {
        batch.set(adb.collection('competition_results').doc(`${uid}_${boulderId}_${compRef.id}`), {
          user_id: uid, competition_id: compRef.id, boulder_id: boulderId,
          success: true, attempts: 1, rating: 0, proposed_difficulty: '',
          createdAt: new Date().toISOString(), submitted: false, updated_at: new Date().toISOString(),
        });
      });
    }
  }
  await commitInChunks(resultOps);

  return { competitionId: compRef.id, boulderIds, climberIds };
}

async function main() {
  const { competitionId, boulderIds, climberIds } = await seed();

  const app = initializeApp({ projectId: 'blocabrac', apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, 'localhost', 8080);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

  let totalReads = 0;
  const log = [];
  const record = (label, n) => { totalReads += n; log.push(`${label}: ${n} lecture(s) (cumul ${totalReads})`); };

  const fetchInitial = async (label) => {
    const resultsSnap = await getDocs(query(
      collection(db, 'competition_results'), where('competition_id', '==', competitionId)
    ));
    record(`${label} — snapshot competition_results`, resultsSnap.size);
    const participantsSnap = await getDocs(query(
      collection(db, 'competition_participants'), where('competition_id', '==', competitionId)
    ));
    record(`${label} — snapshot competition_participants`, participantsSnap.size);
  };

  // --- Montage de l'écran live (deux onSnapshot, montés une fois) ---
  await fetchInitial('Ouverture 1 (montage initial)');

  // --- Deltas d'une soirée complète, rejoués par-dessus (voir note en tête de fichier) ---
  let deltaResults = 0;
  let deltaParticipants = 0;
  for (const uid of climberIds) {
    for (const boulderId of boulderIds) {
      const resultRef = adb.collection('competition_results').doc(`${uid}_${boulderId}_${competitionId}`);
      await resultRef.set({ success: true, attempts: 1, updated_at: new Date().toISOString() }, { merge: true });
      deltaResults++;
      await resultRef.set({ attempts: 2, updated_at: new Date().toISOString() }, { merge: true });
      deltaResults++;
    }
    for (let c = 0; c < N_CORRECTIONS; c++) {
      const boulderId = boulderIds[c % boulderIds.length];
      const resultRef = adb.collection('competition_results').doc(`${uid}_${boulderId}_${competitionId}`);
      await resultRef.set({ attempts: 3, updated_at: new Date().toISOString() }, { merge: true });
      deltaResults++;
    }
    await adb.collection('competition_participants').doc(`${uid}_${competitionId}`)
      .set({ submitted: true, submitted_at: new Date().toISOString() }, { merge: true });
    deltaParticipants++;
  }
  record(`Deltas competition_results (${climberIds.length} grimpeurs × 82 écritures)`, deltaResults);
  record(`Deltas competition_participants (${climberIds.length} verrouillages)`, deltaParticipants);

  // --- Remontages : chaque rechargement de la page live repaie le snapshot initial ---
  for (let r = 2; r <= N_REMONTAGES; r++) {
    await fetchInitial(`Remontage ${r}`);
  }

  console.log(log.join('\n'));
  console.log('---');
  console.log(`TOTAL lectures écran live (${N_PARTICIPANTS} participants, ${N_BOULDERS} blocs, ${N_REMONTAGES} remontages) : ${totalReads}`);
  console.log(`Plafond quotidien Spark : 50000 lectures`);
  console.log(`Rappel lectures côté grimpeurs (mesuré séparément, HANDOFF-quota-ecritures-version-2026-08-15.md) : ~11000`);
  console.log(`Total soirée estimé : ${totalReads + 11000} lectures (${((totalReads + 11000) / 50000 * 100).toFixed(1)}% du plafond)`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('MEASURE_FAILED', err);
  process.exit(1);
});
