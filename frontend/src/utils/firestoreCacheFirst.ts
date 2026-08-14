import { getDocs, getDocsFromCache, type Query, type DocumentData, type QuerySnapshot } from 'firebase/firestore';

// ✅ Lit une requête depuis le cache IndexedDB local en priorité (jamais
// facturé — Firestore ne compte que les lectures qui atteignent le serveur),
// avec repli automatique sur `getDocs` (le serveur, qui réalimente le cache
// pour la prochaine fois) si le cache ne contient encore rien pour cette
// requête précise.
//
// Pourquoi pas `onSnapshot` : un `onSnapshot` délivre bien l'état en cache
// immédiatement, mais chaque NOUVEL abonnement (donc chaque remontage de
// composant — rechargement d'onglet, retour d'arrière-plan iOS/Android déchargé)
// relance un "listen" vers le serveur qui refacture le snapshot initial complet,
// même si la donnée est déjà en cache. Pour une donnée qui n'a pas besoin
// d'être temps réel (elle ne change pas pendant la session, ou l'écran met déjà
// à jour son propre état local à l'écriture), une lecture ponctuelle
// cache-first est strictement moins chère et tout aussi correcte.
// Voir SUIVI-quota-lectures-competition.md / SUIVI-remontages-et-version.md :
// c'est le seul levier qui rend un remontage de page aussi peu coûteux qu'une
// simple ré-ouverture de modale.
//
// Cas "cache vide" : soit rien ne correspond réellement encore (ex. tout début
// de compétition, aucun résultat), soit cette requête précise n'a encore
// jamais été résolue sur cet appareil (première visite, cache jamais alimenté,
// ou persistance désactivée en test/émulateur — voir firebaseConfig.ts). Dans
// les deux cas, retomber sur le serveur est le seul choix sûr : `getDocsFromCache`
// ne permet pas de distinguer "confirmé vide" de "pas encore mis en cache".
export async function getDocsCacheFirst<T = DocumentData>(q: Query<T>): Promise<QuerySnapshot<T>> {
  try {
    const cacheSnap = await getDocsFromCache(q);
    if (!cacheSnap.empty) return cacheSnap;
  } catch {
    // Rien en cache pour cette requête, ou persistance désactivée : repli
    // sur le serveur ci-dessous.
  }
  return getDocs(q);
}
