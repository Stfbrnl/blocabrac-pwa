// ✅ Mini-compétitions moniteur : petit défi noté (blocs quotidiens existants)
// inclus dans une séance, distinct du système de compétitions officielles.
// Verrouille : permissions de la collection `mini_competitions` (mêmes que
// `exercises` : lecture ouverte, écriture moniteur/admin/ouvreur), et le fait
// que l'écriture d'un résultat de bloc de mini-compétition dans
// `client_course_results` (avec boulderId/miniCompetitionId/boulderColor) suit
// exactement la même règle `canValidateCourse` que les résultats d'exercices —
// aucune règle Firestore dédiée n'a été ajoutée pour ce cas, il fallait
// vérifier que la règle existante s'applique bien telle quelle.
// À lancer via `npm run test:rules` (émulateur Firestore requis).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MONITEUR_UID = 'moniteur-1';
const CLIENT_UID = 'client-1';
const OTHER_CLIENT_UID = 'client-2';
const GROUP_ID = 'group-1';
const ACTIVE_COURSE_ID = 'course-active';
const SCHEDULED_COURSE_ID = 'course-scheduled';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'blocabrac-mini-competitions-test',
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
    await setDoc(doc(db, 'users', MONITEUR_UID), { roles: ['moniteur'] });
    await setDoc(doc(db, 'users', CLIENT_UID), { roles: ['client'] });
    await setDoc(doc(db, 'users', OTHER_CLIENT_UID), { roles: ['client'] });
    await setDoc(doc(db, 'Groups', GROUP_ID), {
      createdBy: MONITEUR_UID,
      moniteurId: MONITEUR_UID,
      students: [CLIENT_UID],
    });
    await setDoc(doc(db, 'boulders', 'b1'), {
      wall: 'Dalle', number: 1, color: 'rouge', type: 'daily', is_active: true,
    });
    await setDoc(doc(db, 'courses', ACTIVE_COURSE_ID), {
      createdBy: MONITEUR_UID,
      groupId: GROUP_ID,
      title: 'Séance active',
      date: '2026-07-21',
      activatedAt: '2026-07-21T18:00:00.000Z',
      Participants: [CLIENT_UID],
      optedOut: [],
      miniCompetitions: ['mc-1'],
    });
    await setDoc(doc(db, 'courses', SCHEDULED_COURSE_ID), {
      createdBy: MONITEUR_UID,
      groupId: GROUP_ID,
      title: 'Séance à venir',
      date: '2026-08-01',
      Participants: [CLIENT_UID],
      optedOut: [],
      miniCompetitions: ['mc-1'],
    });
  });
});

describe('Permissions de la collection mini_competitions', () => {
  it('un moniteur peut créer une mini-compétition', async () => {
    const moniteurDb = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    await assertSucceeds(setDoc(doc(moniteurDb, 'mini_competitions', 'mc-1'), {
      name: 'Défi rouge du mois',
      boulderIds: ['b1'],
      createdBy: MONITEUR_UID,
    }));
  });

  it('un client peut lire une mini-compétition mais pas la créer', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'mini_competitions', 'mc-1'), {
        name: 'Défi rouge du mois', boulderIds: ['b1'], createdBy: MONITEUR_UID,
      });
    });
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(getDocs(collection(clientDb, 'mini_competitions')));
    await assertFails(setDoc(doc(clientDb, 'mini_competitions', 'mc-2'), {
      name: 'Triche', boulderIds: [], createdBy: CLIENT_UID,
    }));
  });

  it('un moniteur peut supprimer sa mini-compétition', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'mini_competitions', 'mc-1'), {
        name: 'Défi rouge du mois', boulderIds: ['b1'], createdBy: MONITEUR_UID,
      });
    });
    const moniteurDb = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    await assertSucceeds(deleteDoc(doc(moniteurDb, 'mini_competitions', 'mc-1')));
  });
});

describe('Résultats de blocs de mini-compétition dans client_course_results', () => {
  it('un participant peut soumettre un résultat de bloc sur une séance active', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    const resultId = `${CLIENT_UID}_mini_b1_${ACTIVE_COURSE_ID}`;
    await assertSucceeds(setDoc(doc(clientDb, 'client_course_results', resultId), {
      userId: CLIENT_UID,
      courseId: ACTIVE_COURSE_ID,
      miniCompetitionId: 'mc-1',
      boulderId: 'b1',
      boulderColor: 'rouge',
      success: true,
      attempts: 2,
      createdAt: new Date().toISOString(),
    }));

    const stored = (await getDoc(doc(clientDb, 'client_course_results', resultId))).data();
    expect(stored).toMatchObject({ boulderColor: 'rouge', success: true, attempts: 2 });
  });

  it('un participant ne peut pas soumettre de résultat tant que la séance n\'est pas active', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    const resultId = `${CLIENT_UID}_mini_b1_${SCHEDULED_COURSE_ID}`;
    await assertFails(setDoc(doc(clientDb, 'client_course_results', resultId), {
      userId: CLIENT_UID,
      courseId: SCHEDULED_COURSE_ID,
      miniCompetitionId: 'mc-1',
      boulderId: 'b1',
      boulderColor: 'rouge',
      success: true,
      attempts: 1,
      createdAt: new Date().toISOString(),
    }));
  });

  it('un client ne peut pas soumettre un résultat au nom d\'un autre participant', async () => {
    const otherClientDb = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    const resultId = `${CLIENT_UID}_mini_b1_${ACTIVE_COURSE_ID}`;
    await assertFails(setDoc(doc(otherClientDb, 'client_course_results', resultId), {
      userId: CLIENT_UID,
      courseId: ACTIVE_COURSE_ID,
      miniCompetitionId: 'mc-1',
      boulderId: 'b1',
      boulderColor: 'rouge',
      success: true,
      attempts: 1,
      createdAt: new Date().toISOString(),
    }));
  });
});
