// ✅ Palmarès officiel gelé (`competition_rankings`, docs/plans/
// PLAN-classements-competition-5-novembre.md §2). Ce que ces tests verrouillent :
//
//   1. ⚠️ LIRE UN PALMARÈS QUI N'EXISTE PAS doit réussir en renvoyant « absent », jamais
//      échouer. C'est l'état NORMAL de toutes les compétitions passées, et de celle du
//      5 novembre jusqu'à sa publication. Le §4.3 l'exige explicitement, et pour cause : le
//      02/10/2026, une règle qui lisait `resource.data` sur un document supprimé PLANTAIT, et
//      un plantage de règle remonte au client en `permission-denied` — ce qui a fait perdre
//      des validations en production. Aucune règle de cette collection ne touche
//      `resource.data` ; ce test est ce qui l'empêche de revenir.
//
//   2. L'IMMUABILITÉ, côté serveur et non par convention d'outil : `update` et `delete` sont
//      refusés à TOUT LE MONDE, l'admin compris. Un palmarès est un fait daté ; une
//      recotation de bloc ultérieure ne doit pas pouvoir changer un podium publié.
//
//   3. La création est réservée à l'ADMIN — pas à l'ouvreur, bien qu'il ait un accès large
//      partout ailleurs sur les compétitions. Publier un résultat officiel est un acte de
//      gestion, pas d'ouverture de blocs. Ce test documente ce choix autant qu'il le garde.
//
// À lancer via `npm run test:rules` (émulateur Firestore requis).
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ADMIN_UID = 'admin-1';
const OUVREUR_UID = 'ouvreur-1';
const CLIENT_UID = 'client-1';
const COMPETITION_ID = 'comp-5-novembre';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'blocabrac-competition-rankings-test',
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

function palmaresValide(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    competition_id: COMPETITION_ID,
    competition_name: 'Contest Haloween',
    competition_date: '2026-11-05',
    scoring_mode: 'blocabrac',
    published_at: new Date().toISOString(),
    general_open: [{ user_id: 'u1', display_name: 'Vera D.', rank: 1, score: 480, boulders: 2, total_attempts: 3 }],
    client_open: [],
    client_gender: [],
    client_age: [],
    client_level_max: [],
    ...overrides,
  };
}

async function publierDirectement() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'competition_rankings', COMPETITION_ID), palmaresValide());
  });
}

describe('competition_rankings : lecture', () => {
  it('lire un palmarès INEXISTANT réussit (document absent), ce n\'est pas un refus', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'competition_rankings', 'competition-sans-palmares')));
  });

  it('un client peut lire un palmarès publié — c\'est la raison d\'être du document', async () => {
    await publierDirectement();
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'competition_rankings', COMPETITION_ID)));
  });

  it('un visiteur non connecté ne lit rien', async () => {
    await publierDirectement();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'competition_rankings', COMPETITION_ID)));
  });
});

describe('competition_rankings : publication', () => {
  it('un admin peut publier', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'competition_rankings', COMPETITION_ID), palmaresValide())
    );
  });

  it('un client ne peut pas publier', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_rankings', COMPETITION_ID), palmaresValide())
    );
  });

  it('un ouvreur ne peut pas publier (choix explicite : acte de gestion)', async () => {
    const db = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_rankings', COMPETITION_ID), palmaresValide())
    );
  });

  it('un admin ne peut pas publier sous un identifiant qui ne correspond pas à la compétition', async () => {
    // Un palmarès par compétition, et pas deux : l'identifiant du document EST celui de la
    // compétition. Sans ce contrôle, rien n'empêcherait deux palmarès concurrents pour la
    // même épreuve, dont aucun ne serait « le » palmarès.
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_rankings', 'un-autre-identifiant'), palmaresValide())
    );
  });

  it('un admin ne peut pas publier sans date de publication', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_rankings', COMPETITION_ID), palmaresValide({ published_at: null }))
    );
  });
});

describe('competition_rankings : immuabilité (côté serveur, pas par convention)', () => {
  it('un admin ne peut pas modifier un palmarès publié', async () => {
    await publierDirectement();
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'competition_rankings', COMPETITION_ID), { general_open: [] })
    );
  });

  it('un admin ne peut pas le republier par-dessus (un setDoc est un update ici)', async () => {
    // C'est le cas réel : republier après une recotation, « pour mettre à jour ». Refusé.
    await publierDirectement();
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'competition_rankings', COMPETITION_ID), palmaresValide({ competition_name: 'Autre' }))
    );
  });

  it('un admin ne peut pas supprimer un palmarès publié', async () => {
    // Dépublier exige la clé de service (scripts/unpublish-competition-rankings.js), qui
    // passe hors des règles. Publier est facile, dépublier non.
    await publierDirectement();
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'competition_rankings', COMPETITION_ID)));
  });

  it('un ouvreur ni un client non plus', async () => {
    await publierDirectement();
    for (const uid of [OUVREUR_UID, CLIENT_UID]) {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertFails(deleteDoc(doc(db, 'competition_rankings', COMPETITION_ID)));
      await assertFails(updateDoc(doc(db, 'competition_rankings', COMPETITION_ID), { general_open: [] }));
    }
  });
});
