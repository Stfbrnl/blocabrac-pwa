// ✅ Tests des règles Firestore (courses / client_course_results) pour la refonte
// des séances Moniteur : à exécuter via `npm run test:rules` (émulateur Firestore
// requis, cf. package.json). Volontairement hors de src/ pour ne pas être
// ramassé par `npm test` (qui doit rester rapide et sans dépendance à Java).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MONITEUR_UID = 'moniteur-1';
const CLIENT_UID = 'client-1';
const OTHER_CLIENT_UID = 'client-2';
const GROUP_ID = 'group-1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'blocabrac-rules-test',
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
    await setDoc(doc(db, 'courses', 'course-1'), {
      createdBy: MONITEUR_UID,
      groupId: GROUP_ID,
      title: 'Séance test',
      date: '2026-07-21',
      Participants: [CLIENT_UID],
      optedOut: [],
    });
  });
});

describe('courses : désistement (optedOut)', () => {
  it('un participant peut se désister tant que la séance n\'est pas activée', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(clientDb, 'courses', 'course-1'), { optedOut: [CLIENT_UID] })
    );
  });

  it('un participant peut revenir sur son désistement', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(updateDoc(doc(clientDb, 'courses', 'course-1'), { optedOut: [CLIENT_UID] }));
    await assertSucceeds(updateDoc(doc(clientDb, 'courses', 'course-1'), { optedOut: [] }));
  });

  it('un participant ne peut modifier que le champ optedOut, pas le reste de la séance', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(updateDoc(doc(clientDb, 'courses', 'course-1'), { title: 'Piraté' }));
  });

  it('un non-participant ne peut pas se désister', async () => {
    const otherDb = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertFails(updateDoc(doc(otherDb, 'courses', 'course-1'), { optedOut: [OTHER_CLIENT_UID] }));
  });

  it('le désistement devient impossible une fois la séance activée', async () => {
    const moniteurDb = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(moniteurDb, 'courses', 'course-1'), { activatedAt: new Date().toISOString() })
    );
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(updateDoc(doc(clientDb, 'courses', 'course-1'), { optedOut: [CLIENT_UID] }));
  });
});

describe('client_course_results : validation des exercices', () => {
  const writeResult = (uid: string) => {
    const db = testEnv.authenticatedContext(uid).firestore();
    return setDoc(doc(db, 'client_course_results', `${uid}_ex1_course-1`), {
      userId: uid,
      courseId: 'course-1',
      exerciseId: 'ex1',
      success: true,
      attempts: 1,
      createdAt: new Date().toISOString(),
    });
  };

  it('un client ne peut pas valider tant que la séance n\'est pas activée', async () => {
    await assertFails(writeResult(CLIENT_UID));
  });

  it('un client participant et non désisté peut valider une fois la séance active', async () => {
    const moniteurDb = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    await updateDoc(doc(moniteurDb, 'courses', 'course-1'), { activatedAt: new Date().toISOString() });

    await assertSucceeds(writeResult(CLIENT_UID));
  });

  it('un client peut relire son propre résultat', async () => {
    const moniteurDb = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    await updateDoc(doc(moniteurDb, 'courses', 'course-1'), { activatedAt: new Date().toISOString() });
    await writeResult(CLIENT_UID);

    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(getDoc(doc(clientDb, 'client_course_results', `${CLIENT_UID}_ex1_course-1`)));
  });

  it('un client qui ne fait pas partie des participants ne peut pas valider', async () => {
    const moniteurDb = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    await updateDoc(doc(moniteurDb, 'courses', 'course-1'), { activatedAt: new Date().toISOString() });

    await assertFails(writeResult(OTHER_CLIENT_UID));
  });

  it('un client désisté ne peut pas valider même si la séance est active', async () => {
    const moniteurDb = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'courses', 'course-1'), {
        createdBy: MONITEUR_UID,
        groupId: GROUP_ID,
        title: 'Séance test',
        date: '2026-07-21',
        Participants: [CLIENT_UID],
        optedOut: [CLIENT_UID],
        activatedAt: new Date().toISOString(),
      });
    });

    await assertFails(writeResult(CLIENT_UID));
    void moniteurDb;
  });

  it('un client ne peut plus valider une fois la séance archivée', async () => {
    const moniteurDb = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    await updateDoc(doc(moniteurDb, 'courses', 'course-1'), { activatedAt: new Date().toISOString() });
    await updateDoc(doc(moniteurDb, 'courses', 'course-1'), { archivedAt: new Date().toISOString() });

    await assertFails(writeResult(CLIENT_UID));
  });
});
