// Quels blocs d'une compétition peuvent être RENUMÉROTÉS.
//
// docs/plans/2026-11-06-CN-plan-bareme-unifie-et-ecran-competition.md §B.3.
//
// 🔴 L'INTERDIT : jamais sur un bloc quotidien réutilisé. Son `number` est le numéro ÉCRIT SUR
// LA PRISE, dans la salle. Le renuméroter désynchronise l'application du physique : un grimpeur
// chercherait le bloc 47 devant une étiquette qui dit 3. Et depuis que l'écran du grimpeur
// regroupe par mur (partie B du même plan), ce numéro est devenu *la* façon de retrouver un
// bloc — il compte donc plus qu'avant, pas moins.
//
// Pour une compétition de 30 à 35 blocs **créés pour l'épreuve** (`type: 'competition'`), une
// numérotation globale 1..N reste naturelle et l'ouvreur la contrôle : ces blocs n'ont pas
// d'étiquette antérieure à contredire.
//
// ⚠️ Pourquoi un module pur plutôt qu'un `filter` en ligne dans le geste : « Réorganiser les
// numéros » écrit UNE OPÉRATION PAR BLOC dans un `writeBatch`. Un périmètre d'opération de
// donnée est exactement ce que V2.79 a appris à ne pas laisser dériver d'un affichage — et une
// règle qui vit en ligne dans un `.tsx` est hors de portée des tests de ce dépôt.
export interface RenumberableBoulder {
  id: string;
  type: string;
}

// ⚠️ La liste blanche est sur `type === 'competition'`, et non une liste noire sur `'daily'` :
// un troisième type qui apparaîtrait un jour serait alors protégé par défaut, plutôt que
// renuméroté en silence parce que personne n'a pensé à l'exclure.
export const estRenumerotable = (boulder: RenumberableBoulder): boolean =>
  boulder.type === 'competition';

export const partitionnerRenumerotables = <T extends RenumberableBoulder>(
  boulders: T[],
): { renumerotables: T[]; proteges: T[] } => ({
  renumerotables: boulders.filter(estRenumerotable),
  proteges: boulders.filter((b) => !estRenumerotable(b)),
});
