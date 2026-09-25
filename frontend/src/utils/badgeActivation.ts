import { brandGreen } from '../config/gymConfig';

export interface BadgeActivationCriteria {
  type?: string;
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

// ✅ V2.70.1 : le badge de mission (`type: 'mission'`, « Badge du grimpeur régulier ») n'a
// volontairement AUCUNE couleur de niveau — en poser une (même un hex) le ferait passer en
// veille via computeBadgeActive ci-dessus, qui chercherait des blocs de cette "couleur".
// Son identité visuelle (vert de la salle + tampon à la place de la médaille, comme sur la
// grille de missions) est donc décidée ici, d'après son type, jamais d'après `color`.
export const isMissionBadge = (badge: { type?: string }): boolean => badge.type === 'mission';

export const badgeDisplayColor = (
  badge: { type?: string; color?: string },
  levelColors: Record<string, string>
): string => {
  if (isMissionBadge(badge)) return brandGreen;
  if (badge.color && levelColors[badge.color]) return levelColors[badge.color];
  return badge.color || '#9E9E9E';
};
