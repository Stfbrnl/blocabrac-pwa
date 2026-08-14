// ✅ Étape 4 (partielle, exécutée dès l'étape 2) du suivi quota-lectures-compétition :
// remesure après le correctif des étapes 1 et 2 (onSnapshot + dédoublonnage par
// compétition sur boulders/résultats/inscription). Même protocole que
// measure-competition-reads.mjs (script "avant"), pour comparer les deux directement.
//
// Simulation fidèle du nouveau code de ClientCompetitions.tsx : la garde
// `activeXListener.current?.compId === competition.id` (et son équivalent pour
// `confirmedRegistrations`) fait qu'une seule lecture initiale par requête est
// facturée par compétition et par montage de page — les ouvertures suivantes de la
// modale ne déclenchent plus aucune requête, exactement comme le fait
// `onSnapshot` une fois abonné (le comptage de documents retournés au premier
// snapshot correspond aux lectures facturées ; les snapshots suivants ne portent
// que sur les deltas, non simulés ici car nuls dans ce scénario mono-device).

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, collection, query, where, getDocs, getDoc, doc, setDoc
} from 'firebase/firestore';

const N_BOULDERS = 35;
const N_MODAL_OPENS = 35; // scénario "plancher" du suivi : une ouverture par bloc
const N_VALIDATIONS = 35; // tous les blocs finissent validés

const EMAIL = 'lecture.after.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

admin.initializeApp({ projectId: 'blocabrac' });
const adb = admin.firestore();
const aauth = admin.auth();

async function seed() {
  const user = await aauth.createUser({ email: EMAIL, password: PASSWORD });
  await adb.collection('users').doc(user.uid).set({
    email: EMAIL, first_name: 'Lec', last_name: 'Ture', roles: ['client'],
    level: 'bleu', inscritAuxCompetitions: true,
  });

  const compRef = adb.collection('competitions').doc();
  await compRef.set({
    name: 'Compétition mesure après', date: '2026-09-01', status: 'en cours',
    access_code: 'TEST', max_participants: 90, registered_count: 1,
  });

  const batch = adb.batch();
  for (let i = 1; i <= N_BOULDERS; i++) {
    const bRef = adb.collection('boulders').doc();
    batch.set(bRef, {
      number: i, wall: 'Mur A', difficulty: '6a', type: 'competition',
      competition_id: compRef.id, is_active: true, color: null,
    });
  }
  const partRef = adb.collection('competition_participants').doc();
  batch.set(partRef, {
    user_id: user.uid, competition_id: compRef.id, email: EMAIL,
    first_name: 'Lec', last_name: 'Ture', registered_at: new Date().toISOString(), is_client: true,
  });
  await batch.commit();

  return { uid: user.uid, competitionId: compRef.id };
}

async function main() {
  const { competitionId } = await seed();

  const app = initializeApp({ projectId: 'blocabrac', apiKey: 'fake-api-key' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, 'localhost', 8080);

  const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  const uid = cred.user.uid;

  let totalReads = 0;
  const log = [];
  const record = (label, n) => { totalReads += n; log.push(`${label}: ${n} lecture(s) (cumul ${totalReads})`); };

  // --- Montage de la page (1 fois) ---
  const userSnap = await getDoc(doc(db, 'users', uid));
  record('fetchOwnUser (montage page)', userSnap.exists() ? 1 : 0);

  const compsSnap = await getDocs(query(collection(db, 'competitions'), where('status', '==', 'en cours')));
  record('fetchCompetitions (montage page)', compsSnap.size);

  // --- Boucle : ouverture de la modale de validation N fois, avec les gardes
  // `confirmedRegistrations` / `activeBouldersListener` / `activeResultsListener` ---
  let registrationConfirmed = false;
  let bouldersSubscribed = false;
  let resultsSubscribed = false;
  const boulderIds = [];

  for (let i = 0; i < N_MODAL_OPENS; i++) {
    if (!registrationConfirmed) {
      const isRegSnap = await getDocs(query(
        collection(db, 'competition_participants'),
        where('competition_id', '==', competitionId),
        where('user_id', '==', uid)
      ));
      record(`isAlreadyRegistered (ouverture ${i + 1})`, isRegSnap.size);
      if (isRegSnap.size > 0) registrationConfirmed = true;
    } else {
      record(`isAlreadyRegistered (ouverture ${i + 1}, déjà confirmée)`, 0);
    }

    if (!bouldersSubscribed) {
      const classicSnap = await getDocs(query(
        collection(db, 'boulders'),
        where('competition_id', '==', competitionId),
        where('is_active', '==', true),
        where('type', '==', 'competition')
      ));
      record(`ensureBouldersListener — snapshot initial (ouverture ${i + 1})`, classicSnap.size);
      classicSnap.docs.forEach(d => boulderIds.push(d.id));
      bouldersSubscribed = true;
    } else {
      record(`ensureBouldersListener (ouverture ${i + 1}, déjà abonné)`, 0);
    }

    if (!resultsSubscribed) {
      const resultsSnap = await getDocs(query(
        collection(db, 'competition_results'),
        where('user_id', '==', uid),
        where('competition_id', '==', competitionId)
      ));
      record(`ensureResultsListener — snapshot initial (ouverture ${i + 1})`, resultsSnap.size);
      resultsSubscribed = true;
    } else {
      record(`ensureResultsListener (ouverture ${i + 1}, déjà abonné)`, 0);
    }

    // Valide quelques blocs entre certaines ouvertures — écho local via le
    // listener déjà actif, pas une nouvelle lecture de type getDocs.
    if (i < N_VALIDATIONS) {
      const boulderId = boulderIds[i];
      const resultId = `${uid}_${boulderId}_${competitionId}`;
      await setDoc(doc(db, 'competition_results', resultId), {
        user_id: uid, competition_id: competitionId, boulder_id: boulderId,
        success: true, attempts: 1, rating: 0, proposed_difficulty: '',
        createdAt: new Date().toISOString(), submitted: false, updated_at: new Date().toISOString(),
      }, { merge: true });
    }
  }

  console.log(log.join('\n'));
  console.log('---');
  console.log(`TOTAL lectures pour ce parcours (1 grimpeur, ${N_MODAL_OPENS} ouvertures de modale, ${N_BOULDERS} blocs) : ${totalReads}`);
  for (const n of [1, 90]) {
    console.log(`Extrapolation à ${n} participant(s) : ${totalReads * n} lectures`);
  }
  console.log(`Plafond quotidien Spark : 50000 lectures`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('MEASURE_FAILED', err);
  process.exit(1);
});
