// Vérifie que reconcile-classement-profiles.js SUPPRIME une clé orpheline de colorCounts
// (défaut du set merge:true corrigé le 01/09/2026). Tourne contre l'émulateur Firestore.
//   npx firebase-tools emulators:exec --only firestore "node frontend/test/reconcile-orphan-key-emulator.mjs"
import { execFileSync } from 'node:child_process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const svc = JSON.parse(readFileSync(resolve(REPO, 'firestore-migration/serviceAccountKey.json'), 'utf8'));

process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';
const app = initializeApp({ credential: cert(svc), projectId: svc.project_id || 'demo-test' });
const db = getFirestore(app);

const UID = 'orphan-test-uid';

async function main() {
  // 1 bloc rouge actif + 1 validation succès -> colorCounts attendu { rouge: 1 }
  await db.collection('boulders').doc('b-rouge').set({
    color: 'rouge', number: 1, wall: 'Dalle', type: 'daily', is_active: true,
  });
  await db.collection('client_boulder_results').doc(`${UID}_b-rouge`).set({
    userId: UID, boulderId: 'b-rouge', success: true, attempts: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  await db.collection('users').doc(UID).set({ roles: ['client'], gender: 'Homme' });
  // profil stocké AVEC une clé orpheline "noire"
  await db.collection('classement_profiles').doc(UID).set({
    first_name: 'Test', last_name: 'Orphan', gender: 'Homme', classementOptIn: true,
    score: 999, bouldersValidated: 2, bestColorRank: 5,
    colorCounts: { rouge: 1, noire: 1 },
  });

  execFileSync('node', [resolve(REPO, 'scripts/reconcile-classement-profiles.js'), '--fix', '--uid', UID], {
    stdio: 'inherit', env: process.env,
  });

  const after = (await db.collection('classement_profiles').doc(UID).get()).data();
  const cc = after.colorCounts || {};
  if ('noire' in cc) throw new Error(`ÉCHEC : la clé orpheline "noire" est toujours présente : ${JSON.stringify(cc)}`);
  if (cc.rouge !== 1) throw new Error(`ÉCHEC : colorCounts.rouge attendu 1, obtenu ${JSON.stringify(cc)}`);
  console.log('✅ OK : clé orpheline supprimée, colorCounts =', JSON.stringify(cc));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
