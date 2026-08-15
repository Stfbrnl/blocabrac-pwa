// ✅ Garde-fou "resource == null ||" sur client_boulder_results (chantier compteur
// incrémental, CONCEPTION-selecteur-marge-compteur-incremental.md §3) : ClientDaily.tsx
// lit désormais l'ancien état d'UN SEUL bloc par un getDoc() direct sur son ID
// déterministe ("${uid}_${boulderId}") avant d'écrire le nouveau résultat. Pour un
// bloc jamais validé, ce document n'existe pas — sans le garde-fou, "resource.data.userId"
// plante l'évaluation de la règle (le même défaut déjà corrigé ailleurs, voir
// competition_results/competition_participants).
// À lancer via `npm run test:rules` (émulateur Firestore requis).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getDoc, doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CLIENT_UID = 'client-1';
const OTHER_CLIENT_UID = 'client-2';
const BOULDER_ID = 'boulder-1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'blocabrac-client-boulder-results-null-read-test',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', CLIENT_UID), { roles: ['client'] });
    await setDoc(doc(db, 'users', OTHER_CLIENT_UID), { roles: ['client'] });
  });
});

describe('client_boulder_results : lecture d\'un document inexistant', () => {
  it('un client peut lire (sans erreur de règle) le résultat inexistant de son propre bloc', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    const snap = await assertSucceeds(
      getDoc(doc(db, 'client_boulder_results', `${CLIENT_UID}_${BOULDER_ID}`))
    );
    expect(snap.exists()).toBe(false);
  });

  it('un client peut toujours lire son propre résultat existant', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'client_boulder_results', `${CLIENT_UID}_${BOULDER_ID}`), {
        userId: CLIENT_UID, boulderId: BOULDER_ID, success: true, attempts: 1,
      });
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'client_boulder_results', `${CLIENT_UID}_${BOULDER_ID}`)));
  });

  it('un client ne peut pas lire le résultat existant d\'un autre client', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'client_boulder_results', `${OTHER_CLIENT_UID}_${BOULDER_ID}`), {
        userId: OTHER_CLIENT_UID, boulderId: BOULDER_ID, success: true, attempts: 1,
      });
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(getDoc(doc(db, 'client_boulder_results', `${OTHER_CLIENT_UID}_${BOULDER_ID}`)));
  });
});
