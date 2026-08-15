// ✅ Verrouillage des résultats de compétition (Chantier 1 de
// PLAN-spark-images-competition.md, ClientCompetitions.tsx), déplacé sur
// competition_participants au chantier écritures point 2
// (SUIVI-quota-ecritures.md) : le verrou (submitted/submitted_at) vit
// désormais sur la participation (1 document) plutôt que dupliqué sur chacun
// des ~35 documents de résultats (facturé par écriture). Un grimpeur peut
// modifier son résultat tant que sa participation n'est pas verrouillée, mais
// plus après — le verrouillage doit tenir même si le front est contourné.
// L'ancien champ submitted:true sur competition_results reste vérifié en
// repli (compétitions verrouillées avant ce chantier). Admin/ouvreur gardent
// leur droit de correction sans restriction (statu quo assumé, cf. « Écart à
// trancher » dans le plan).
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
const OUVREUR_UID = 'ouvreur-1';
const COMPETITION_ID = 'comp-1';
const BOULDER_ID = 'boulder-1';
const RESULT_ID = `${CLIENT_UID}_${BOULDER_ID}_${COMPETITION_ID}`;
const PARTICIPATION_ID = `${CLIENT_UID}_${COMPETITION_ID}`;
const OTHER_PARTICIPATION_ID = `${OTHER_CLIENT_UID}_${COMPETITION_ID}`;

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
    await setDoc(doc(db, 'users', OUVREUR_UID), { roles: ['ouvreur'] });
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

function baseParticipationData(overrides: Record<string, unknown> = {}) {
  return {
    user_id: CLIENT_UID,
    competition_id: COMPETITION_ID,
    email: 'client1@blocabrac.test',
    first_name: 'Cli',
    last_name: 'Ent',
    registered_at: new Date().toISOString(),
    is_client: true,
    ...overrides,
  };
}

describe('competition_results : verrouillage à la soumission', () => {
  it('un client peut créer et modifier son résultat tant que sa participation n\'est pas verrouillée', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'competition_participants', PARTICIPATION_ID), baseParticipationData());
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData()));
    await assertSucceeds(
      setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData({ attempts: 3 }), { merge: true })
    );
  });

  it('un client sans document de participation peut quand même écrire (repli sûr : exists() avant get(), pas de crash de règle)', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData()));
  });

  it('un client ne peut pas créer un résultat déjà marqué submitted: true', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData({ submitted: true }))
    );
  });

  it('un client ne peut plus modifier un résultat une fois sa PARTICIPATION verrouillée (nouveau mécanisme)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'competition_results', RESULT_ID), baseResultData());
      await setDoc(
        doc(context.firestore(), 'competition_participants', PARTICIPATION_ID),
        baseParticipationData({ submitted: true, submitted_at: new Date().toISOString() })
      );
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData({ attempts: 5 }), { merge: true })
    );
  });

  it('un client ne peut plus modifier un résultat déjà submitted:true à l\'ancienne (repli, compétitions verrouillées avant ce chantier)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competition_results', RESULT_ID),
        baseResultData({ submitted: true, submitted_at: new Date().toISOString() })
      );
      // Pas de participation verrouillée : uniquement le repli sur le champ historique.
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData({ attempts: 5 }), { merge: true })
    );
  });

  it('un admin peut modifier un résultat même si la participation est verrouillée', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'competition_results', RESULT_ID), baseResultData());
      await setDoc(
        doc(context.firestore(), 'competition_participants', PARTICIPATION_ID),
        baseParticipationData({ submitted: true, submitted_at: new Date().toISOString() })
      );
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData({ attempts: 5 }), { merge: true })
    );
  });

  it('un client ne peut pas écrire le résultat d\'un autre client', async () => {
    const db = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertFails(setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData()));
  });

  // ✅ Écran juge (ADDENDUM-mode-ffme-finale-annee.md §3) : un admin/ouvreur saisit les
  // résultats DE TOUS LES GRIMPEURS, pas seulement les siens — donc une CRÉATION (pas
  // une simple mise à jour, voir le test "peut modifier" plus haut) avec un user_id qui
  // n'est pas le sien. Confirmé par les règles telles qu'écrites (accès admin/ouvreur
  // déjà inconditionnel), vérifié ici comme demandé par la note.
  it('un admin peut créer le résultat d\'un autre utilisateur (écran juge)', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData()));
  });

  it('un ouvreur peut créer le résultat d\'un autre utilisateur (écran juge)', async () => {
    const db = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'competition_results', RESULT_ID), baseResultData()));
  });
});

describe('competition_participants : verrouillage (chantier écritures point 2)', () => {
  it('un client peut verrouiller sa propre participation (poser submitted:true)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'competition_participants', PARTICIPATION_ID), baseParticipationData());
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'competition_participants', PARTICIPATION_ID),
        { submitted: true, submitted_at: new Date().toISOString() },
        { merge: true }
      )
    );
  });

  it('un client ne peut pas verrouiller la participation d\'un autre', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competition_participants', OTHER_PARTICIPATION_ID),
        baseParticipationData({ user_id: OTHER_CLIENT_UID })
      );
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, 'competition_participants', OTHER_PARTICIPATION_ID),
        { submitted: true, submitted_at: new Date().toISOString() },
        { merge: true }
      )
    );
  });

  it('un client ne peut pas déverrouiller sa propre participation une fois verrouillée', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competition_participants', PARTICIPATION_ID),
        baseParticipationData({ submitted: true, submitted_at: new Date().toISOString() })
      );
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_participants', PARTICIPATION_ID), { submitted: false }, { merge: true })
    );
  });

  it('un client ne peut pas modifier un autre champ en même temps que le verrouillage', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'competition_participants', PARTICIPATION_ID), baseParticipationData());
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, 'competition_participants', PARTICIPATION_ID),
        { submitted: true, submitted_at: new Date().toISOString(), level: 'noir' },
        { merge: true }
      )
    );
  });

  it('un admin garde un accès libre sur competition_participants (y compris déverrouiller)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'competition_participants', PARTICIPATION_ID),
        baseParticipationData({ submitted: true, submitted_at: new Date().toISOString() })
      );
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'competition_participants', PARTICIPATION_ID), { submitted: false }, { merge: true })
    );
  });
});
