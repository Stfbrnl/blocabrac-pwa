// ✅ Fin de compétition : les blocs restent en place sur les murs et deviennent
// des blocs "quotidiens" (visibles du public), à recoter ensuite selon les
// retours des grimpeurs. Verrouille le comportement du bouton "Terminer la
// compétition" de CompetitionBouldersList.tsx : `type` passe de 'competition'
// à 'daily', et la cotation interne (`difficulty`, cachée pendant l'épreuve)
// devient la cotation publique (`color`) de départ.
// À lancer via `npm run test:rules` (émulateur Firestore requis).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, writeBatch, deleteField, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const OUVREUR_UID = 'ouvreur-1';
const CLIENT_UID = 'client-1';
// ✅ 07/11/2026 — la clôture est désormais déclenchable depuis l'écran d'ADMINISTRATION, au
// passage de la compétition hors du vol (utils/competitionClosureWrites.ts, partagé par les
// deux écrans). Le droit d'un admin sur ces écritures était LU dans `firestore.rules`, pas
// mesuré : un couplage qui échouerait en permission-denied échouerait le soir d'un contest,
// devant tout le monde. Le moniteur est la contre-épreuve — sans elle, un fichier de règles mal
// chargé rendrait le test de l'admin vert pour une mauvaise raison.
const ADMIN_UID = 'admin-1';
const MONITEUR_UID = 'moniteur-1';
const COMPETITION_ID = 'comp-1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'blocabrac-competition-migration-test',
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
    await setDoc(doc(db, 'users', OUVREUR_UID), { roles: ['ouvreur'] });
    await setDoc(doc(db, 'users', CLIENT_UID), { roles: ['client'] });
    await setDoc(doc(db, 'users', ADMIN_UID), { roles: ['admin', 'client'] });
    await setDoc(doc(db, 'users', MONITEUR_UID), { roles: ['moniteur', 'client'] });
    await setDoc(doc(db, 'boulders', 'b1'), {
      wall: 'Dalle', number: 1, difficulty: 'bleu', type: 'competition',
      competition_id: COMPETITION_ID, is_active: true,
    });
    await setDoc(doc(db, 'boulders', 'b2'), {
      wall: 'Dalle', number: 2, difficulty: 'rouge', type: 'competition',
      competition_id: COMPETITION_ID, is_active: true,
    });
    // Un bloc du jour RÉUTILISÉ : l'autre moitié de la clôture, dont l'écriture est une
    // SUPPRESSION de champs (`competition_active`, `points_value`) et non une mise à jour de
    // valeurs. ⚠️ Les deux formes passent par la même règle, mais le `diff()` qu'elles
    // produisent n'est pas le même — mesurer la seule bascule laisserait le détachement
    // reposer sur une lecture de la règle, pas sur une mesure.
    await setDoc(doc(db, 'boulders', 'b3'), {
      wall: 'Dalle', number: 3, color: 'vert', type: 'daily',
      competition_id: COMPETITION_ID, competition_active: true, points_value: 500,
      is_active: true,
    });
  });
});

// Reproduit la branche « bloc créé pour l'épreuve » de `executerCloture`
// (utils/competitionClosureWrites.ts), partagée par l'écran de l'ouvreur et celui de l'admin.
async function migrateToDaily(db: Firestore, boulderIds: string[], difficultyById: Record<string, string>) {
  const batch = writeBatch(db);
  boulderIds.forEach((id) => {
    batch.update(doc(db, 'boulders', id), { type: 'daily', color: difficultyById[id] });
  });
  await batch.commit();
}

// Et l'autre branche : le détachement d'un bloc du jour réutilisé. Une écriture qui SUPPRIME
// des champs, forme distincte au regard du `diff()` des règles.
async function detacherBlocReutilise(db: Firestore, boulderId: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'boulders', boulderId), {
    competition_active: deleteField(),
    points_value: deleteField(),
  });
  await batch.commit();
}

describe('Ouvreur : bascule des blocs de compétition en blocs quotidiens', () => {
  it('un ouvreur peut basculer les blocs : type -> daily, color = difficulty d\'origine', async () => {
    const ouvreurDb = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await assertSucceeds(
      migrateToDaily(ouvreurDb, ['b1', 'b2'], { b1: 'bleu', b2: 'rouge' })
    );

    const b1 = (await getDoc(doc(ouvreurDb, 'boulders', 'b1'))).data();
    const b2 = (await getDoc(doc(ouvreurDb, 'boulders', 'b2'))).data();

    expect(b1).toMatchObject({ type: 'daily', color: 'bleu', wall: 'Dalle', number: 1 });
    expect(b2).toMatchObject({ type: 'daily', color: 'rouge', wall: 'Dalle', number: 2 });
    // La cotation de compétition d'origine reste tracée, elle n'est plus lue nulle part.
    expect(b1?.difficulty).toBe('bleu');
  });

  it('un client ne peut pas basculer les blocs (écriture réservée ouvreur/admin)', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(migrateToDaily(clientDb, ['b1'], { b1: 'bleu' }));
  });
});

// ✅ 07/11/2026 — LE COUPLAGE CÔTÉ ADMINISTRATION. Le même geste, déclenché par l'écran
// d'administration au passage de la compétition hors du vol. Ce que ces tests mesurent n'est
// pas la logique (elle est pure et testée dans `src/utils/competitionClosure.test.ts`) mais le
// DROIT : un admin peut-il réellement écrire ces deux formes-là ?
describe('Admin : la clôture déclenchée depuis l\'écran d\'administration', () => {
  it('un admin peut basculer les blocs créés pour l\'épreuve', async () => {
    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(migrateToDaily(adminDb, ['b1', 'b2'], { b1: 'bleu', b2: 'rouge' }));
    expect((await getDoc(doc(adminDb, 'boulders', 'b1'))).data()).toMatchObject({ type: 'daily', color: 'bleu' });
  });

  it('un admin peut DÉTACHER un bloc du jour réutilisé — une écriture qui SUPPRIME des champs', async () => {
    const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(detacherBlocReutilise(adminDb, 'b3'));
    const b3 = (await getDoc(doc(adminDb, 'boulders', 'b3'))).data();
    // ⚠️ Affirmer l'EFFET écrit, pas « ça n'a pas planté » : c'est la disparition de ce drapeau
    // qui rend au bloc ses premières ascensions et ses votes de méthode, et c'est son maintien
    // qui a rendu 92 blocs muets le 06/11/2026.
    expect(b3?.competition_active).toBeUndefined();
    expect(b3?.points_value).toBeUndefined();
    // Et ce qui doit NE PAS changer : sa couleur publique est celle écrite sur la prise.
    expect(b3).toMatchObject({ color: 'vert', type: 'daily', competition_id: COMPETITION_ID });
  });

  it('un moniteur ne peut NI basculer NI détacher — la contre-épreuve du test ci-dessus', async () => {
    const moniteurDb = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    await assertFails(migrateToDaily(moniteurDb, ['b1'], { b1: 'bleu' }));
    await assertFails(detacherBlocReutilise(moniteurDb, 'b3'));
  });
});
