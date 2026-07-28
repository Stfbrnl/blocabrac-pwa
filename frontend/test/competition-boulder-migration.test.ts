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
import { setDoc, doc, getDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const OUVREUR_UID = 'ouvreur-1';
const CLIENT_UID = 'client-1';
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
    await setDoc(doc(db, 'boulders', 'b1'), {
      wall: 'Dalle', number: 1, difficulty: 'bleu', type: 'competition',
      competition_id: COMPETITION_ID, is_active: true,
    });
    await setDoc(doc(db, 'boulders', 'b2'), {
      wall: 'Dalle', number: 2, difficulty: 'rouge', type: 'competition',
      competition_id: COMPETITION_ID, is_active: true,
    });
  });
});

// Reproduit exactement handleConfirmMigrate() de CompetitionBouldersList.tsx.
async function migrateToDaily(db: Firestore, boulderIds: string[], difficultyById: Record<string, string>) {
  const batch = writeBatch(db);
  boulderIds.forEach((id) => {
    batch.update(doc(db, 'boulders', id), { type: 'daily', color: difficultyById[id] });
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
