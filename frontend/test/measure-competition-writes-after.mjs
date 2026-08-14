// ✅ Remesure après le point 2 du suivi quota-écritures (SUIVI-quota-ecritures.md) :
// le verrouillage passe de 35 écritures (writeBatch sur competition_results) à 1
// (participation). Même protocole que measure-competition-writes.mjs (avant).

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, setDoc, getDoc
} from 'firebase/firestore';

const N_BOULDERS = 35;
const N_CORRECTIONS = 10;

const EMAIL = 'ecriture.after.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

admin.initializeApp({ projectId: 'blocabrac' });
const adb = admin.firestore();
const aauth = admin.auth();

async function seed() {
  const user = await aauth.createUser({ email: EMAIL, password: PASSWORD });
  await adb.collection('users').doc(user.uid).set({
    email: EMAIL, first_name: 'Ecri', last_name: 'Ture', roles: ['client'],
    level: 'bleu', inscritAuxCompetitions: true,
  });

  const compRef = adb.collection('competitions').doc();
  await compRef.set({
    name: 'Compétition mesure écritures après', date: '2026-09-01', status: 'en cours',
    access_code: 'TEST', max_participants: 90, registered_count: 1,
  });

  const batch = adb.batch();
  const boulderIds = [];
  for (let i = 1; i <= N_BOULDERS; i++) {
    const bRef = adb.collection('boulders').doc();
    boulderIds.push(bRef.id);
    batch.set(bRef, {
      number: i, wall: 'Mur A', difficulty: '6a', type: 'competition',
      competition_id: compRef.id, is_active: true, color: null,
    });
  }
  await batch.commit();

  return { competitionId: compRef.id, boulderIds };
}

async function main() {
  const { competitionId, boulderIds } = await seed();

  const app = initializeApp({ projectId: 'blocabrac', apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, 'localhost', 8080);

  const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  const uid = cred.user.uid;

  let totalWrites = 0;
  const log = [];
  const record = (label, n) => { totalWrites += n; log.push(`${label}: ${n} écriture(s) (cumul ${totalWrites})`); };

  // --- Inscription : ID déterministe (participationDocRef), 1 setDoc ---
  const participationRef = doc(db, 'competition_participants', `${uid}_${competitionId}`);
  await setDoc(participationRef, {
    user_id: uid, competition_id: competitionId, email: EMAIL,
    first_name: 'Ecri', last_name: 'Ture', registered_at: new Date().toISOString(), is_client: true,
  });
  record('Inscription (competition_participants)', 1);
  record('Inscription (competitions.registered_count)', 1);

  // --- 35 validations : Réussi + essais ---
  const persistedIds = new Set();
  const persistResult = async (boulderId, isFirstWrite) => {
    const resultId = `${uid}_${boulderId}_${competitionId}`;
    await setDoc(doc(db, 'competition_results', resultId), {
      user_id: uid, competition_id: competitionId, boulder_id: boulderId,
      success: true, attempts: 1, rating: 0, proposed_difficulty: '',
      ...(isFirstWrite ? { createdAt: new Date().toISOString(), submitted: false } : {}),
      updated_at: new Date().toISOString(),
    }, { merge: true });
  };

  for (const boulderId of boulderIds) {
    const isFirst = !persistedIds.has(boulderId);
    await persistResult(boulderId, isFirst);
    persistedIds.add(boulderId);
    record(`Validation bloc ${boulderId} (Réussi)`, 1);
    await persistResult(boulderId, false);
    record(`Validation bloc ${boulderId} (essais)`, 1);
  }

  // --- Corrections ---
  for (let i = 0; i < N_CORRECTIONS; i++) {
    const boulderId = boulderIds[i % boulderIds.length];
    await persistResult(boulderId, false);
    record(`Correction ${i + 1}`, 1);
  }

  // --- Verrouillage : 1 seule écriture sur la participation (point 2) ---
  const now = new Date().toISOString();
  await getDoc(participationRef); // relecture avant verrouillage, comme le fait loadResults côté app (lecture, pas comptée ici)
  await setDoc(participationRef, { submitted: true, submitted_at: now }, { merge: true });
  record('Verrouillage (1 écriture sur la participation)', 1);

  console.log(log.join('\n'));
  console.log('---');
  console.log(`TOTAL écritures pour ce parcours (1 grimpeur, ${N_BOULDERS} blocs, ${N_CORRECTIONS} corrections) : ${totalWrites}`);
  for (const n of [1, 90]) {
    console.log(`Extrapolation à ${n} participant(s) : ${totalWrites * n} écritures`);
  }
  console.log(`Plafond quotidien Spark : 20000 écritures`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('MEASURE_FAILED', err);
  process.exit(1);
});
