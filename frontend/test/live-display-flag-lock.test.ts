// ✅ Verrouillage de `liveDisplayEnabled` (écran live TV, CONCEPTION-ecran-live-competition.md
// §7) : une fois la compétition déclenchée (status != 'à venir'), le drapeau ne doit plus
// pouvoir changer — y compris pour admin/ouvreur, à la différence du verrouillage de
// competition_results qui les exempte. C'est la garantie de consentement : un client ne voit
// la mention de diffusion qu'à l'inscription, qui n'arrive qu'une fois la compétition
// "en cours" (ClientCompetitions.tsx ne liste que status == 'en cours'). Si le drapeau restait
// modifiable après ce point, un admin pourrait l'activer après coup sans que les inscrits
// l'aient jamais su.
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
    projectId: 'blocabrac-live-display-flag-lock-test',
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
    liveDisplayEnabled: false,
    ...overrides,
  };
}

describe('competitions : verrouillage de liveDisplayEnabled au déclenchement', () => {
  it('un admin peut activer liveDisplayEnabled tant que la compétition est "à venir"', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'competitions', COMPETITION_ID), baseCompetitionData());
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'competitions', COMPETITION_ID), { liveDisplayEnabled: true }, { merge: true })
    );
  });

  it('un ouvreur peut désactiver liveDisplayEnabled tant que la compétition est "à venir"', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competitions', COMPETITION_ID),
        baseCompetitionData({ liveDisplayEnabled: true })
      );
    });
    const db = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'competitions', COMPETITION_ID), { liveDisplayEnabled: false }, { merge: true })
    );
  });

  it('un admin ne peut plus modifier liveDisplayEnabled une fois la compétition "en cours"', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competitions', COMPETITION_ID),
        baseCompetitionData({ status: 'en cours', liveDisplayEnabled: false })
      );
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competitions', COMPETITION_ID), { liveDisplayEnabled: true }, { merge: true })
    );
  });

  it('un ouvreur ne peut plus modifier liveDisplayEnabled une fois la compétition "terminée"', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competitions', COMPETITION_ID),
        baseCompetitionData({ status: 'terminée', liveDisplayEnabled: true })
      );
    });
    const db = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competitions', COMPETITION_ID), { liveDisplayEnabled: false }, { merge: true })
    );
  });

  it('un admin peut toujours modifier les autres champs une fois la compétition "en cours"', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competitions', COMPETITION_ID),
        baseCompetitionData({ status: 'en cours', liveDisplayEnabled: true })
      );
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'competitions', COMPETITION_ID), { name: 'Nouveau nom' }, { merge: true })
    );
  });

  it('écrire liveDisplayEnabled à la même valeur qu\'avant reste autorisé une fois "en cours" (pas de changement réel)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competitions', COMPETITION_ID),
        baseCompetitionData({ status: 'en cours', liveDisplayEnabled: true })
      );
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'competitions', COMPETITION_ID),
        { liveDisplayEnabled: true, name: 'Nouveau nom' },
        { merge: true }
      )
    );
  });

  it('un client ne peut pas modifier liveDisplayEnabled, même avant déclenchement', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'competitions', COMPETITION_ID), baseCompetitionData());
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competitions', COMPETITION_ID), { liveDisplayEnabled: true }, { merge: true })
    );
  });
});
