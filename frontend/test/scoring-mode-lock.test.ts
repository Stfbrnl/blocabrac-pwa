// ✅ Verrouillage de `scoring_mode`/`custom_scoring` (chantier "comptes de points" :
// mode de comptage à choisir par compétition) : une fois la compétition déclenchée
// (status != 'à venir'), le mode ne doit plus pouvoir changer — même verrou côté règles
// que `liveDisplayEnabled` (voir live-display-flag-lock.test.ts), pour la même raison :
// changer le mode en cours d'épreuve changerait rétroactivement le classement de tout
// le monde, pas seulement des prochaines validations.
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

const ADMIN_UID = 'admin-1';
const OUVREUR_UID = 'ouvreur-1';
const CLIENT_UID = 'client-1';
const COMPETITION_ID = 'comp-1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'blocabrac-scoring-mode-lock-test',
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
    await setDoc(doc(db, 'users', ADMIN_UID), { roles: ['admin'] });
    await setDoc(doc(db, 'users', OUVREUR_UID), { roles: ['ouvreur'] });
    await setDoc(doc(db, 'users', CLIENT_UID), { roles: ['client'] });
  });
});

function baseCompetitionData(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Compétition test',
    date: '2026-09-01',
    status: 'à venir',
    access_code: 'TEST',
    max_participants: 50,
    registered_count: 0,
    scoring_mode: 'blocabrac',
    ...overrides,
  };
}

describe('competitions : verrouillage de scoring_mode/custom_scoring au déclenchement', () => {
  it('un admin peut changer scoring_mode tant que la compétition est "à venir"', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'competitions', COMPETITION_ID), baseCompetitionData());
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'competitions', COMPETITION_ID), { scoring_mode: 'blocs_valides' }, { merge: true })
    );
  });

  it('un ouvreur peut régler custom_scoring tant que la compétition est "à venir"', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competitions', COMPETITION_ID),
        baseCompetitionData({ scoring_mode: 'personnalise' })
      );
    });
    const db = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'competitions', COMPETITION_ID),
        { custom_scoring: { rouge: { base: 500, deduction: 100 } } },
        { merge: true }
      )
    );
  });

  it('un admin ne peut plus modifier scoring_mode une fois la compétition "en cours"', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competitions', COMPETITION_ID),
        baseCompetitionData({ status: 'en cours' })
      );
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competitions', COMPETITION_ID), { scoring_mode: 'blocs_valides' }, { merge: true })
    );
  });

  it('un ouvreur ne peut plus modifier custom_scoring une fois la compétition "terminée"', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competitions', COMPETITION_ID),
        baseCompetitionData({
          status: 'terminée',
          scoring_mode: 'personnalise',
          custom_scoring: { rouge: { base: 500, deduction: 100 } },
        })
      );
    });
    const db = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, 'competitions', COMPETITION_ID),
        { custom_scoring: { rouge: { base: 999, deduction: 0 } } },
        { merge: true }
      )
    );
  });

  it('un admin peut toujours modifier les autres champs une fois la compétition "en cours"', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competitions', COMPETITION_ID),
        baseCompetitionData({ status: 'en cours' })
      );
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'competitions', COMPETITION_ID), { name: 'Nouveau nom' }, { merge: true })
    );
  });

  it('un client ne peut pas modifier scoring_mode, même avant déclenchement', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'competitions', COMPETITION_ID), baseCompetitionData());
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competitions', COMPETITION_ID), { scoring_mode: 'blocs_valides' }, { merge: true })
    );
  });
});
