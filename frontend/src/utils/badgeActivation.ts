export interface BadgeActivationCriteria {
  color?: string;
  criteria?: {
    color?: string;
    // "all" signifie : il faut posséder la totalité des blocs de cette couleur
    // actuellement en salle (cas du badge "master"). Sinon, un nombre fixe.
    count?: string | number;
  };
}

// Un badge reste actif tant que le client a encore, dans ses stats, au moins
// "count" bloc(s) validé(s) de la couleur du badge qui existent toujours en salle.
// Dès qu'un mur change et que ces blocs disparaissent, le badge repasse en grisé,
// et redevient coloré automatiquement dès qu'un bloc de cette couleur est de nouveau validé.
export const computeBadgeActive = (
  badge: BadgeActivationCriteria,
  validatedByColor: Record<string, number>,
  totalByColor: Record<string, number>
): boolean => {
  const color = badge.criteria?.color || badge.color;
  if (!color) return true; // badge non lié à une couleur -> toujours actif

  const validated = validatedByColor[color] || 0;
  const rawCount = badge.criteria?.count;

  // Cas "master" : count === "all" -> il faut posséder tous les blocs de cette
  // couleur actuellement en salle
  if (String(rawCount).toLowerCase() === 'all') {
    const total = totalByColor[color] || 0;
    return total > 0 && validated >= total;
  }

  const required = parseInt(String(rawCount ?? '1'), 10) || 1;
  return validated >= required;
};
