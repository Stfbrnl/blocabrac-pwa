// ✅ Un `writeBatch` Firestore accepte au maximum 500 opérations, et son échec est
// TOUT-OU-RIEN : au-delà, le `commit()` lève et absolument rien n'est écrit. Le défaut
// appartient donc à la classe que ce dépôt redoute le plus — une panne PERMANENTE et
// DÉTERMINISTE (chaque nouvelle tentative échoue à l'identique) déguisée en panne
// transitoire par un « Une erreur est survenue » générique.
//
// ⚠️ CE MODULE N'EST PAS UNE OPTIMISATION, C'EST UN GARDE DE SEUIL : en dessous de
// `MAX_OPS_PAR_LOT` il rend exactement un lot, donc le comportement est identique à
// l'ancien code, atomicité comprise. Il ne change quelque chose QUE dans le cas qui,
// sans lui, ne marcherait pas du tout.
//
// Pourquoi il existe (03/11/2026) : le gérant a ouvert la compétition du 5 novembre à
// TOUS les blocs de la salle (10 murs) au lieu des quelques dizaines prévues. Les gestes
// de l'écran « Blocs de compétition » écrivent une opération PAR BLOC — rattachement,
// multiplicateur en masse, clôture, renumérotation. Ce qui était hors d'atteinte avec 23
// blocs devient une question de marge avec toute la salle.
//
// 450 et non 500 : la marge absorbe une opération ajoutée plus tard dans la même boucle
// sans rouvrir ce calcul. Même valeur que le découpage déjà en place dans `AdminUsers.tsx`
// (`setLevelOverrideForAll`), dont ce module généralise le motif — ce n'est pas un
// deuxième chiffre à tenir synchronisé, c'est le même, désormais nommé une seule fois.
export const MAX_OPS_PAR_LOT = 450;

// Découpe en tranches d'au plus `taille`. Fonction pure, sans aucun import Firestore :
// c'est ce qui la rend testable sans émulateur, même discipline que `classementFlushWrites.ts`.
//
// ⚠️ Rend `[]` sur une entrée vide, et JAMAIS `[[]]` : un appelant qui boucle dessus pour
// committer ne doit pas envoyer un lot vide à Firestore. C'est la propriété la plus facile
// à casser en « simplifiant » cette fonction, donc elle est épinglée par un test.
export const decouperEnLots = <T>(items: readonly T[], taille: number = MAX_OPS_PAR_LOT): T[][] => {
  if (taille < 1) throw new Error(`decouperEnLots : taille de lot invalide (${taille})`);
  const lots: T[][] = [];
  for (let i = 0; i < items.length; i += taille) lots.push(items.slice(i, i + taille));
  return lots;
};
