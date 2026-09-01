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

// ✅ CONCEPTION-classement-saisonnier.md, point 1 : doc de config singleton, nouveau
// pattern dans ce projet — lecture large (nécessaire à ClientDaily.tsx), écriture
// admin uniquement côté client (le job planifié écrit via l'Admin SDK, jamais soumis
// à ces règles, donc rien à tester ici pour lui).
describe('app_config/classement_saison : fenêtre de la saison en cours', () => {
  it('un client authentifié peut lire la fenêtre de saison', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'app_config', 'classement_saison'), {
        debut: '2026-09-15', fin: '2027-05-31', cloturee: false,
      });
    });
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(getDoc(doc(clientDb, 'app_config', 'classement_saison')));
  });

  it('un client ne peut pas écrire la fenêtre de saison', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(doc(clientDb, 'app_config', 'classement_saison'), {
      debut: '2000-01-01', fin: '2000-01-02', cloturee: false,
    }));
  });

  it('un admin peut écrire la fenêtre de saison', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'admin-1'), { roles: ['admin'] });
    });
    const adminDb = testEnv.authenticatedContext('admin-1').firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'app_config', 'classement_saison'), {
      debut: '2026-09-15', fin: '2027-05-31', cloturee: false,
    }));
  });
});

// ✅ CONCEPTION-classement-saisonnier.md : archive figée du top 10/10 de fin de
// saison — lecture large comme classement_profiles, écriture jamais côté client
// (même l'admin ne l'écrit pas depuis l'UI : seul le job planifié, Admin SDK).
describe('classement_saisons : archive du top 10/10 de fin de saison', () => {
  it('un client authentifié peut lire l\'archive d\'une saison', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'classement_saisons', '2026-2027'), {
        computed_at: '2027-06-01T00:00:00.000Z', top_garcons: [], top_filles: [],
      });
    });
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(getDoc(doc(clientDb, 'classement_saisons', '2026-2027')));
  });

  it('même un admin ne peut pas écrire l\'archive depuis le client (seul le job planifié le fait)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'admin-1'), { roles: ['admin'] });
    });
    const adminDb = testEnv.authenticatedContext('admin-1').firestore();
    await assertFails(setDoc(doc(adminDb, 'classement_saisons', '2026-2027'), {
      computed_at: '2027-06-01T00:00:00.000Z', top_garcons: [], top_filles: [],
    }));
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

// ✅ Défis entre potes (CONCEPTION-roulette-et-defis.md, Partie 2, V2.46) : lecture réservée
// aux participants, écriture d'un participant limitée à sa propre clé dans `progress`, clôture
// ouverte à n'importe quel participant (décision utilisateur du 19/08/2026).
describe('challenges : défis entre potes', () => {
  const baseChallenge = {
    created_by: CLIENT_UID,
    structure: 'seuil',
    catalog_id: null,
    title: 'Premier à 5 rouges',
    participants: [CLIENT_UID, OTHER_CLIENT_UID],
    progress: {
      [CLIENT_UID]: { value: 0, updated_at: new Date().toISOString() },
      [OTHER_CLIENT_UID]: { value: 0, updated_at: new Date().toISOString() },
    },
    status: 'en_cours',
    winner_uid: null,
    created_at: new Date().toISOString(),
    target_count: 5,
    target_color: 'rouge',
  };

  it('le créateur peut créer un défi où il figure parmi les participants', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(setDoc(doc(clientDb, 'challenges', 'defi-1'), baseChallenge));
  });

  it('impossible de créer un défi au nom de quelqu\'un d\'autre (created_by usurpé)', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(doc(clientDb, 'challenges', 'defi-1'), {
      ...baseChallenge, created_by: OTHER_CLIENT_UID,
    }));
  });

  it('impossible de créer un défi sans figurer soi-même dans les participants', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(doc(clientDb, 'challenges', 'defi-1'), {
      ...baseChallenge, created_by: CLIENT_UID, participants: [OTHER_CLIENT_UID, 'client-3'],
    }));
  });

  it('impossible de créer un défi à un seul participant (plancher 2)', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(doc(clientDb, 'challenges', 'defi-1'), {
      ...baseChallenge, participants: [CLIENT_UID], progress: { [CLIENT_UID]: { value: 0, updated_at: new Date().toISOString() } },
    }));
  });

  it('impossible de créer un défi à plus de 6 participants (plafond)', async () => {
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    const participants = [CLIENT_UID, 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
    await assertFails(setDoc(doc(clientDb, 'challenges', 'defi-1'), {
      ...baseChallenge, participants,
    }));
  });

  it('un tiers non participant ne peut pas lire le défi', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'client-3'), { roles: ['client'] });
      await setDoc(doc(context.firestore(), 'challenges', 'defi-1'), baseChallenge);
    });
    const thirdDb = testEnv.authenticatedContext('client-3').firestore();
    await assertFails(getDoc(doc(thirdDb, 'challenges', 'defi-1')));
  });

  it('un participant peut lire le défi', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'challenges', 'defi-1'), baseChallenge);
    });
    const otherDb = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertSucceeds(getDoc(doc(otherDb, 'challenges', 'defi-1')));
  });

  it('un participant peut mettre à jour sa propre progression', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'challenges', 'defi-1'), baseChallenge);
    });
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(updateDoc(doc(clientDb, 'challenges', 'defi-1'), {
      [`progress.${CLIENT_UID}`]: { value: 1, updated_at: new Date().toISOString() },
    }));
  });

  it('un participant ne peut pas modifier la ligne de progression d\'un autre', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'challenges', 'defi-1'), baseChallenge);
    });
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(updateDoc(doc(clientDb, 'challenges', 'defi-1'), {
      [`progress.${OTHER_CLIENT_UID}`]: { value: 99, updated_at: new Date().toISOString() },
    }));
  });

  it('un participant ne peut pas modifier sa progression ET un autre champ dans la même écriture', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'challenges', 'defi-1'), baseChallenge);
    });
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(updateDoc(doc(clientDb, 'challenges', 'defi-1'), {
      [`progress.${CLIENT_UID}`]: { value: 1, updated_at: new Date().toISOString() },
      title: 'Titre modifié',
    }));
  });

  it('un non-participant ne peut pas écrire dans le défi', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'client-3'), { roles: ['client'] });
      await setDoc(doc(context.firestore(), 'challenges', 'defi-1'), baseChallenge);
    });
    const thirdDb = testEnv.authenticatedContext('client-3').firestore();
    await assertFails(updateDoc(doc(thirdDb, 'challenges', 'defi-1'), {
      [`progress.${CLIENT_UID}`]: { value: 1, updated_at: new Date().toISOString() },
    }));
  });

  it('n\'importe quel participant peut clore un défi et figer le vainqueur', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'challenges', 'defi-1'), {
        ...baseChallenge,
        progress: {
          [CLIENT_UID]: { value: 5, updated_at: new Date().toISOString() },
          [OTHER_CLIENT_UID]: { value: 2, updated_at: new Date().toISOString() },
        },
      });
    });
    // Le participant qui clôture n'est pas forcément le vainqueur.
    const otherDb = testEnv.authenticatedContext(OTHER_CLIENT_UID).firestore();
    await assertSucceeds(updateDoc(doc(otherDb, 'challenges', 'defi-1'), {
      status: 'termine', winner_uid: CLIENT_UID,
    }));
  });

  it('impossible de rouvrir un défi déjà terminé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'challenges', 'defi-1'), {
        ...baseChallenge, status: 'termine', winner_uid: CLIENT_UID,
      });
    });
    const clientDb = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(updateDoc(doc(clientDb, 'challenges', 'defi-1'), {
      status: 'en_cours', winner_uid: null,
    }));
  });
});

describe('client_badges : auto-attribution des badges couleur par le client', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'badges', 'badge-auto'), {
        name: 'Duke of the Bloc', type: 'automatic',
        color: 'rouge', criteria: { color: 'rouge', count: '1' },
      });
      await setDoc(doc(db, 'badges', 'badge-manuel'), {
        name: 'Débutant', type: 'manual', criteria: 'Participe à 5 séances',
      });
    });
  });

  const autoPayload = (uid: string, badgeId: string) => ({
    userId: uid,
    badgeId,
    awardedAt: new Date().toISOString(),
    awardedBy: 'auto',
    awardedByName: 'Attribution automatique',
  });

  it('le client peut s\'auto-attribuer un badge type:automatic (ID canonique)', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertSucceeds(setDoc(
      doc(db, 'client_badges', `${CLIENT_UID}_badge-auto`),
      autoPayload(CLIENT_UID, 'badge-auto'),
    ));
  });

  it('refuse un badge type:manual', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(
      doc(db, 'client_badges', `${CLIENT_UID}_badge-manuel`),
      autoPayload(CLIENT_UID, 'badge-manuel'),
    ));
  });

  it('refuse un badge inexistant', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(
      doc(db, 'client_badges', `${CLIENT_UID}_badge-fantome`),
      autoPayload(CLIENT_UID, 'badge-fantome'),
    ));
  });

  it('refuse l\'auto-attribution pour un autre uid', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(
      doc(db, 'client_badges', `${OTHER_CLIENT_UID}_badge-auto`),
      autoPayload(OTHER_CLIENT_UID, 'badge-auto'),
    ));
  });

  it('refuse un ID de document non canonique', async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(setDoc(
      doc(db, 'client_badges', `${CLIENT_UID}_badge-auto_${Date.now()}`),
      autoPayload(CLIENT_UID, 'badge-auto'),
    ));
  });

  it('un badge auto-attribué reste non modifiable et non supprimable', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'client_badges', `${CLIENT_UID}_badge-auto`),
        autoPayload(CLIENT_UID, 'badge-auto'),
      );
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    await assertFails(updateDoc(doc(db, 'client_badges', `${CLIENT_UID}_badge-auto`), { awardedByName: 'Piraté' }));
    await assertFails(deleteDoc(doc(db, 'client_badges', `${CLIENT_UID}_badge-auto`)));
  });
});
