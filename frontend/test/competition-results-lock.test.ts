// ✅ Verrouillage des résultats de compétition (Chantier 1 de
// PLAN-spark-images-competition.md, ClientCompetitions.tsx).
// Un grimpeur peut modifier son résultat tant qu'il n'est pas soumis
// (submitted: true), mais plus après — le verrouillage doit tenir même si le
// front est contourné. Admin/ouvreur gardent leur droit de correction sans
// restriction (statu quo assumé, cf. « Écart à trancher » dans le plan).
// À lancer via `npm run test:rules` (émulateur Firestore requis).
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CLIENT_UID = 'client-1';
const OTHER_CLIENT_UID = 'client-2';
const ADMIN_UID = 'admin-1';
const COMPETITION_ID = 'comp-1';
const BOULDER_ID = 'boulder-1';
const RESULT_ID = `${CLIENT_UID}_${BOULDER_ID}_${COMPETITION_ID}`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'blocabrac-competition-results-lock-test',
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
    await setDoc(doc(db, 'users', ADMIN_UID), { roles: ['admin'] });
  });
});

function baseResultData(overrides: Record<string, unknown> = {}) {
  return {
    user_id: CLIENT_UID,
    competition_id: COMPETITION_ID,
    boulder_id: BOULDER_ID,
    success: true,
    attempts: 2,
    rating: 4,
    proposed_difficulty: 'bleu',
    submitted: false,
    createdAt: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('competition_results : verrouillage à la soumission', () => {
  it('un client peut créer et modifier son résultat non soumis', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData()));
    await assertSucceeds(
      setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData({ attempts: 3 }), { merge: true })
    );
  });

  it('un client ne peut pas créer un résultat déjà marqué submitted: true', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData({ submitted: true }))
    );
  });

  it('un client ne peut pas modifier son résultat une fois soumis', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competition_results', RESULT_ID),
        baseResultData({ submitted: true, submitted_at: new Date().toISOString() })
      );
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData({ attempts: 5 }), { merge: true })
    );
  });

  it('un admin peut modifier un résultat déjà soumis', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competition_results', RESULT_ID),
        baseResultData({ submitted: true, submitted_at: new Date().toISOString() })
      );
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData({ attempts: 5, submitted: true }), { merge: true })
    );
  });

  it('un client ne peut pas écrire le résultat d\'un autre client', async () => {
    const db = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertFails(setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData()));
  });
});
