// ✅ Compétitions "régulières" (niveau limité, sur ~6 semaines, sans vider les
// murs) : l'ouvreur doit pouvoir ajouter des blocs QUOTIDIENS existants comme
// blocs de compétition. Ces blocs restent `type: 'daily'` (toujours visibles et
// grimpables normalement) et gagnent `competition_id` + `competition_active:
// true` — ils sont donc à la fois blocs quotidiens ET blocs de cette
// compétition. À la fin de la compétition, ils redeviennent uniquement
// quotidiens (on retire `competition_active`, `competition_id` reste pour
// l'historique des résultats, comme pour les blocs créés spécifiquement).
//
// `competition_active` (et non un simple `type in [...]`) est le point clé :
// un ancien bloc de "grosse" compétition redevenu `type: 'daily'` après
// "Terminer la compétition" garde son `competition_id` pour les statistiques,
// mais ne doit PLUS jamais réapparaître comme bloc validable d'une compétition
// — seul un bloc quotidien fraîchement tagué avec `competition_active: true`
// le doit. Ce test verrouille cette distinction en plus du tag/détag et de la
// permission (client ne peut pas taguer).
// À lancer via `npm run test:rules` (émulateur Firestore requis).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, updateDoc, writeBatch, deleteField, collection, query, where, getDocs, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const OUVREUR_UID = 'ouvreur-1';
const CLIENT_UID = 'client-1';
const COMPETITION_ID = 'comp-couleur-rouge';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'blocabrac-existing-daily-migration-test',
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
    // Blocs quotidiens déjà en place sur le mur, non liés à une compétition.
    await setDoc(doc(db, 'boulders', 'd1'), {
      wall: 'Dalle', number: 1, color: 'jaune', type: 'daily', is_active: true,
    });
    await setDoc(doc(db, 'boulders', 'd2'), {
      wall: 'Dalle', number: 2, color: 'rouge', type: 'daily', is_active: true,
    });
    await setDoc(doc(db, 'boulders', 'd3'), {
      wall: 'Dalle', number: 3, color: 'rose', type: 'daily', is_active: true,
    });
    // Bloc classique de "grosse" compétition (créé spécifiquement, caché).
    await setDoc(doc(db, 'boulders', 'c1'), {
      wall: 'Dalle', number: 1, difficulty: 'bleu', type: 'competition',
      competition_id: COMPETITION_ID, is_active: true,
    });
  });
});

// Reproduit exactement handleConfirmAddExisting() de CompetitionBouldersList.tsx.
async function addExistingToCompetition(db: Firestore, boulderIds: string[]) {
  const batch = writeBatch(db);
  boulderIds.forEach((id) => {
    batch.update(doc(db, 'boulders', id), { competition_id: COMPETITION_ID, competition_active: true });
  });
  await batch.commit();
}

// Reproduit la requête (deux appels fusionnés) de ClientCompetitions.tsx (loadBoulders).
async function loadCompetitionBouldersAsClient(db: Firestore) {
  const [classicSnap, reusedSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'boulders'),
      where('competition_id', '==', COMPETITION_ID),
      where('is_active', '==', true),
      where('type', '==', 'competition')
    )),
    getDocs(query(
      collection(db, 'boulders'),
      where('competition_id', '==', COMPETITION_ID),
      where('is_active', '==', true),
      where('type', '==', 'daily'),
      where('competition_active', '==', true)
    )),
  ]);
  return [...classicSnap.docs, ...reusedSnap.docs].map((d) => d.id).sort();
}

describe('Ouvreur : ajout de blocs quotidiens existants à une compétition', () => {
  it('taguer un bloc quotidien (rouge à rose) ne change ni son type ni sa couleur', async () => {
    const ouvreurDb = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await assertSucceeds(addExistingToCompetition(ouvreurDb, ['d2', 'd3']));

    const d2 = (await getDoc(doc(ouvreurDb, 'boulders', 'd2'))).data();
    const d3 = (await getDoc(doc(ouvreurDb, 'boulders', 'd3'))).data();
    expect(d2).toMatchObject({ type: 'daily', color: 'rouge', competition_id: COMPETITION_ID, competition_active: true });
    expect(d3).toMatchObject({ type: 'daily', color: 'rose', competition_id: COMPETITION_ID, competition_active: true });

    // Le bloc jaune, non sélectionné, n'est pas affecté.
    const d1 = (await getDoc(doc(ouvreurDb, 'boulders', 'd1'))).data();
    expect(d1?.competition_id).toBeUndefined();
  });

  it('le client retrouve, pour "Valider mes blocs", les blocs de compétition ET les blocs quotidiens tagués', async () => {
    const ouvreurDb = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await addExistingToCompetition(ouvreurDb, ['d2', 'd3']);

    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    const ids = await loadCompetitionBouldersAsClient(clientDb);
    expect(ids).toEqual(['c1', 'd2', 'd3']);
  });

  it('un client ne peut pas taguer un bloc quotidien dans une compétition', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(addExistingToCompetition(clientDb, ['d1']));
  });

  it('"Terminer la compétition" retire le tag actif des blocs réutilisés sans toucher couleur/type, et les fait disparaître de la validation', async () => {
    const ouvreurDb = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await addExistingToCompetition(ouvreurDb, ['d2', 'd3']);

    // Reproduit handleConfirmMigrate() : branche par origine.
    const batch = writeBatch(ouvreurDb);
    batch.update(doc(ouvreurDb, 'boulders', 'c1'), { type: 'daily', color: 'bleu' });
    batch.update(doc(ouvreurDb, 'boulders', 'd2'), { competition_active: deleteField() });
    batch.update(doc(ouvreurDb, 'boulders', 'd3'), { competition_active: deleteField() });
    await assertSucceeds(batch.commit());

    const c1 = (await getDoc(doc(ouvreurDb, 'boulders', 'c1'))).data();
    const d2 = (await getDoc(doc(ouvreurDb, 'boulders', 'd2'))).data();
    const d3 = (await getDoc(doc(ouvreurDb, 'boulders', 'd3'))).data();

    expect(c1).toMatchObject({ type: 'daily', color: 'bleu', competition_id: COMPETITION_ID });
    // Les blocs réutilisés gardent leur couleur ET leur competition_id (historique), mais plus le tag actif.
    expect(d2).toMatchObject({ type: 'daily', color: 'rouge', competition_id: COMPETITION_ID });
    expect(d3).toMatchObject({ type: 'daily', color: 'rose', competition_id: COMPETITION_ID });
    expect(d2?.competition_active).toBeUndefined();
    expect(d3?.competition_active).toBeUndefined();

    // Une fois la compétition terminée, plus aucun bloc (classique OU réutilisé)
    // ne doit réapparaître dans la validation côté client — c'est précisément le
    // piège qu'un simple `type in ['competition','daily']` ne détecterait pas,
    // puisque c1 est maintenant type='daily' avec le même competition_id.
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    const remaining = await loadCompetitionBouldersAsClient(clientDb);
    expect(remaining).toEqual([]);
  });

  it('"Retirer de la compétition" (avant la fin) efface aussi competition_id, contrairement à "Terminer"', async () => {
    const ouvreurDb = testEnv.authenticatedContext(OUVREUR_UID).firestore();
    await addExistingToCompetition(ouvreurDb, ['d2']);

    await updateDoc(doc(ouvreurDb, 'boulders', 'd2'), { competition_id: deleteField(), competition_active: deleteField() });

    const d2 = (await getDoc(doc(ouvreurDb, 'boulders', 'd2'))).data();
    expect(d2?.competition_id).toBeUndefined();
    expect(d2?.competition_active).toBeUndefined();
    expect(d2).toMatchObject({ type: 'daily', color: 'rouge' });
  });
});
