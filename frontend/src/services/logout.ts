import { auth, db } from './firebaseConfig';
import { terminate, clearIndexedDbPersistence } from 'firebase/firestore';

/**
 * ⚠️ SEUL point de déconnexion de l'application. **Tout** nouveau point de sortie doit
 * appeler cette fonction, jamais un `auth.signOut()` nu.
 *
 * IndexedDB est attaché à l'origine du site, pas au compte connecté : sur un poste partagé
 * (station de l'admin, téléphone emprunté), les données en cache du compte précédent
 * survivraient à sa déconnexion. D'où la purge, et son ordre, imposé par l'API Firestore :
 *   1. `signOut` AVANT `terminate` — sinon les requêtes en cours empêchent l'arrêt propre ;
 *   2. `terminate` AVANT `clearIndexedDbPersistence` — celle-ci exige Firestore inactif ;
 *   3. rechargement de la page, l'instance Firestore étant inutilisable après `terminate()`.
 *
 * Le rechargement est dans un `finally` : même si une des étapes échoue, on ne laisse pas
 * l'utilisateur sur une page dont le SDK est à moitié arrêté.
 *
 * Extrait de `Navbar.tsx` le 03/10/2026, quand `AccessDenied.tsx` a eu besoin d'offrir une
 * issue de secours (docs/handoffs/RETOUR-labels-cloture.md et le retour de ClaudeNav qui a
 * suivi) : deux appelants, donc une seule implémentation — la règle de `CLAUDE.md` disait
 * déjà « must go through this same function », il fallait qu'elle en soit vraiment une.
 */
export async function performLogout(): Promise<void> {
  try {
    await auth.signOut();
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (error) {
    console.error('Erreur lors de la déconnexion :', error);
  } finally {
    window.location.reload();
  }
}
