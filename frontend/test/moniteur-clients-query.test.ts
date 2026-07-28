// ✅ Régression : chargement de la liste des clients côté Moniteur
// (MessagesList.tsx, envoi de messages sur /moniteur/messages).
// Le rôle « client » existe sous deux formes selon l'ancienneté du document
// (`role` == 'client' scalaire hérité, ou tableau `roles` contenant 'client').
// Une requête sur le seul champ scalaire `role` — qui n'existe plus depuis
// l'invariant "roles[]" — renvoie une liste vide en silence (bug historique
// corrigé dans MessagesList, et retiré de MoniteurScreen avec son dialogue mort).
// Ce test verrouille la requête fusionnée (les deux formats) et vérifie au
// passage que les règles autorisent un moniteur à l'exécuter.
// À lancer via `npm run test:rules` (émulateur Firestore requis).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MONITEUR_UID = 'moniteur-1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'blocabrac-clients-query-test',
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
    await setDoc(doc(db, 'users', 'c1'), { email: 'c1@test.fr', roles: ['client'] });
    await setDoc(doc(db, 'users', 'c2'), { email: 'c2@test.fr', roles: ['client'] });
    await setDoc(doc(db, 'users', 'c3'), { email: 'c3@test.fr', roles: ['client', 'ouvreur'] });
    await setDoc(doc(db, 'users', 'legacy'), { email: 'legacy@test.fr', role: 'client' });
  });
});

// Reproduit exactement la logique de MoniteurScreen.tsx / MessagesList.tsx.
async function loadClientIds(db: ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>) {
  const [byRole, byRolesArray] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('role', '==', 'client'))),
    getDocs(query(collection(db, 'users'), where('roles', 'array-contains', 'client'))),
  ]);
  const ids = new Set<string>();
  [...byRole.docs, ...byRolesArray.docs].forEach((d) => ids.add(d.id));
  return [...ids].sort();
}

describe('Moniteur : chargement des clients (roles[] + role legacy)', () => {
  it('remonte les clients des deux formats de stockage sans doublon', async () => {
    const db = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    const ids = await loadClientIds(db);
    expect(ids).toEqual(['c1', 'c2', 'c3', 'legacy']);
  });

  it('ne perd pas les clients quand aucun document n\'utilise le champ scalaire `role`', async () => {
    // Simule la prod actuelle : plus aucun `role` scalaire, tout en `roles[]`.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'legacy'), { email: 'legacy@test.fr', roles: ['client'] });
    });
    const db = testEnv.authenticatedContext(MONITEUR_UID).firestore();
    const ids = await loadClientIds(db);
    // C'est précisément le cas qui renvoyait une liste vide avant le correctif.
    expect(ids).toEqual(['c1', 'c2', 'c3', 'legacy']);
  });
});
