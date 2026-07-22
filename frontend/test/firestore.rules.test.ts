// ✅ Tests des règles Firestore (courses / client_course_results) pour la refonte
// des séances Moniteur : à exécuter via `npm run test:rules` (émulateur Firestore
// requis, cf. package.json). Volontairement hors de src/ pour ne pas être
// ramassé par `npm test` (qui doit rester rapide et sans dépendance à Java).
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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

describe('classement_profiles : fiche publique du classement', () => {
  it('un client peut écrire sur sa propre fiche', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(setDoc(doc(clientDb, 'classement_profiles', CLIENT_UID), {
      first_name: 'Cliff', last_name: 'Ent', gender: 'Homme', dateOfBirth: '2000-01-01', classementOptIn: true,
    }));
  });

  it('un client ne peut pas écrire sur la fiche d\'un autre client', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(doc(clientDb, 'classement_profiles', OTHER_CLIENT_UID), {
      first_name: 'Usurpé', classementOptIn: true,
    }));
  });

  it('un client authentifié quelconque peut lire la fiche de n\'importe qui (nécessaire au classement)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'classement_profiles', OTHER_CLIENT_UID), {
        first_name: 'Cliff', last_name: 'Ent', classementOptIn: true,
      });
    });
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(getDoc(doc(clientDb, 'classement_profiles', OTHER_CLIENT_UID)));
  });

  it('un admin peut écrire sur la fiche de n\'importe quel client', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'admin-1'), { roles: ['admin'] });
    });
    const adminDb = testEnv.authenticatedContext('admin-1').firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'classement_profiles', CLIENT_UID), {
      first_name: 'Modifié par admin',
    }, { merge: true }));
  });
});

// ✅ V2.10 : tout compte doit porter le rôle "client" (les 3 autres s'additionnant
// par-dessus), pour que "Mon espace personnel" (qui héberge désormais "Potes de
// grimpe") reste atteignable par le staff aussi. Garde-fou serveur en plus du
// verrou posé dans AdminUsers.tsx (case "Client" désactivée dans le multi-select).
describe('users : invariant "roles" contient toujours "client"', () => {
  it('un admin ne peut PAS créer un compte moniteur sans le rôle client', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'admin-1'), { roles: ['admin'] });
    });
    const adminDb = testEnv.authenticatedContext('admin-1').firestore();
    await assertFails(setDoc(doc(adminDb, 'users', 'new-staff-1'), {
      email: 'staff@test.com', first_name: 'S', last_name: 'T', roles: ['moniteur'],
    }));
  });

  it('un admin peut créer un compte moniteur qui porte aussi le rôle client', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'admin-1'), { roles: ['admin'] });
    });
    const adminDb = testEnv.authenticatedContext('admin-1').firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'users', 'new-staff-2'), {
      email: 'staff2@test.com', first_name: 'S', last_name: 'T', roles: ['moniteur', 'client'],
    }));
  });

  it('un admin ne peut PAS retirer le rôle client d\'un compte existant', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'admin-1'), { roles: ['admin'] });
    });
    const adminDb = testEnv.authenticatedContext('admin-1').firestore();
    await assertFails(updateDoc(doc(adminDb, 'users', MONITEUR_UID), { roles: ['moniteur'] }));
  });

  it('un client peut s\'auto-inscrire avec le rôle client (Register.tsx)', async () => {
    const selfDb = testEnv.authenticatedContext('self-register-1').firestore();
    await assertSucceeds(setDoc(doc(selfDb, 'users', 'self-register-1'), {
      email: 'moi@test.com', first_name: 'M', last_name: 'O', roles: ['client'],
    }));
  });
});

// ✅ "Potes de grimpe" (V2.10) : amitiés + statuts sociaux optionnels. pairId =
// les deux uids triés puis concaténés (voir friendPairId dans Friends.tsx et
// firestore.rules), pour qu'une seule relation existe entre deux personnes.
describe('friendships : demandes d\'ami', () => {
  const pairId = `${CLIENT_UID}_${OTHER_CLIENT_UID}`; // 'client-1' < 'client-2'

  it('un utilisateur peut envoyer une demande d\'ami avec le bon pairId', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(setDoc(doc(clientDb, 'friendships', pairId), {
      uids: [CLIENT_UID, OTHER_CLIENT_UID],
      status: 'pending',
      requestedBy: CLIENT_UID,
      createdAt: new Date().toISOString(),
    }));
  });

  it('impossible de créer une demande au nom de quelqu\'un d\'autre (requestedBy usurpé)', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(doc(clientDb, 'friendships', pairId), {
      uids: [CLIENT_UID, OTHER_CLIENT_UID],
      status: 'pending',
      requestedBy: OTHER_CLIENT_UID,
      createdAt: new Date().toISOString(),
    }));
  });

  it('impossible de créer une demande dont le pairId ne correspond pas aux uids triés', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(doc(clientDb, 'friendships', 'un-id-quelconque'), {
      uids: [CLIENT_UID, OTHER_CLIENT_UID],
      status: 'pending',
      requestedBy: CLIENT_UID,
      createdAt: new Date().toISOString(),
    }));
  });

  it('un tiers ne peut pas lire une demande qui ne le concerne pas', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'friendships', pairId), {
        uids: [CLIENT_UID, OTHER_CLIENT_UID], status: 'pending', requestedBy: CLIENT_UID, createdAt: new Date().toISOString(),
      });
      await setDoc(doc(context.firestore(), 'users', 'client-3'), { roles: ['client'] });
    });
    const thirdDb = testEnv.authenticatedContext('client-3').firestore();
    await assertFails(getDoc(doc(thirdDb, 'friendships', pairId)));
  });

  it('celui qui a envoyé la demande ne peut pas l\'accepter lui-même', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'friendships', pairId), {
        uids: [CLIENT_UID, OTHER_CLIENT_UID], status: 'pending', requestedBy: CLIENT_UID, createdAt: new Date().toISOString(),
      });
    });
    const requesterDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(updateDoc(doc(requesterDb, 'friendships', pairId), { status: 'accepted' }));
  });

  it('le destinataire peut accepter la demande', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'friendships', pairId), {
        uids: [CLIENT_UID, OTHER_CLIENT_UID], status: 'pending', requestedBy: CLIENT_UID, createdAt: new Date().toISOString(),
      });
    });
    const recipientDb = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertSucceeds(updateDoc(doc(recipientDb, 'friendships', pairId), { status: 'accepted' }));
  });

  it('n\'importe laquelle des deux personnes peut supprimer la relation (refus ou retrait d\'ami)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'friendships', pairId), {
        uids: [CLIENT_UID, OTHER_CLIENT_UID], status: 'accepted', requestedBy: CLIENT_UID, createdAt: new Date().toISOString(),
      });
    });
    const recipientDb = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertSucceeds(deleteDoc(doc(recipientDb, 'friendships', pairId)));
  });
});

describe('climbing_status / next_sessions : visibles seulement par les amis acceptés', () => {
  const pairId = `${CLIENT_UID}_${OTHER_CLIENT_UID}`;

  it('le propriétaire peut écrire et relire son propre statut', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(setDoc(doc(clientDb, 'climbing_status', CLIENT_UID), {
      active: true, since: new Date().toISOString(),
    }));
    await assertSucceeds(getDoc(doc(clientDb, 'climbing_status', CLIENT_UID)));
  });

  it('impossible d\'écrire le statut de quelqu\'un d\'autre', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(doc(clientDb, 'climbing_status', OTHER_CLIENT_UID), {
      active: true, since: new Date().toISOString(),
    }));
  });

  it('un non-ami ne peut pas lire le statut ou la prochaine session d\'un client', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'climbing_status', CLIENT_UID), { active: true, since: new Date().toISOString() });
      await setDoc(doc(context.firestore(), 'next_sessions', CLIENT_UID), { day: 'Lundi', timeSlot: '18h-20h', updatedAt: new Date().toISOString() });
    });
    const otherDb = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertFails(getDoc(doc(otherDb, 'climbing_status', CLIENT_UID)));
    await assertFails(getDoc(doc(otherDb, 'next_sessions', CLIENT_UID)));
  });

  it('un ami accepté peut lire le statut et la prochaine session', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'friendships', pairId), {
        uids: [CLIENT_UID, OTHER_CLIENT_UID], status: 'accepted', requestedBy: CLIENT_UID, createdAt: new Date().toISOString(),
      });
      await setDoc(doc(context.firestore(), 'climbing_status', CLIENT_UID), { active: true, since: new Date().toISOString() });
      await setDoc(doc(context.firestore(), 'next_sessions', CLIENT_UID), { day: 'Lundi', timeSlot: '18h-20h', updatedAt: new Date().toISOString() });
    });
    const otherDb = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertSucceeds(getDoc(doc(otherDb, 'climbing_status', CLIENT_UID)));
    await assertSucceeds(getDoc(doc(otherDb, 'next_sessions', CLIENT_UID)));
  });

  it('une demande encore "pending" (non acceptée) ne donne pas accès en lecture', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'friendships', pairId), {
        uids: [CLIENT_UID, OTHER_CLIENT_UID], status: 'pending', requestedBy: CLIENT_UID, createdAt: new Date().toISOString(),
      });
      await setDoc(doc(context.firestore(), 'climbing_status', CLIENT_UID), { active: true, since: new Date().toISOString() });
    });
    const otherDb = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertFails(getDoc(doc(otherDb, 'climbing_status', CLIENT_UID)));
  });
});
