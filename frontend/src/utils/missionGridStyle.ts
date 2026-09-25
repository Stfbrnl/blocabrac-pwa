// ✅ V2.70 (docs/handoffs/RETOUR-bug-missions-et-revalidation.md §2.11) : réglages visuels PURS de
// la grille "bingo" des missions — testables sans rendu.
import type { Level } from './competitionEligibility';
import { resolveTargetColor } from './roulette';
import { isAtLevelCeiling, type MissionKey, type WeeklyMissionsState } from './weeklyMissions';

// ✅ "Une inclinaison qui varie d'une tuile à l'autre mais reste stable — dérivée de la clé de
// la mission, jamais tirée au hasard au rendu, sinon la grille bouge à chaque affichage."
// Plage −17°..−9° (réglage de départ −13°) ; opacité 0,50..0,60 (encre "légèrement inégale").
const keyHash = (key: string): number => Array.from(key).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);

export const stampAngle = (key: MissionKey): number => -17 + (keyHash(key) % 9);
export const stampOpacity = (key: MissionKey): number => 0.5 + (keyHash(key + 'o') % 11) / 100;

// ✅ §2.11.3 : M1, M3, M4 dépendent du niveau — leur tuile prend en accent la couleur de niveau
// concernée (figée pour M1, max−1 pour M3, max+1 pour M4). Pas d'accent pour M4 bis (plafond).
export const missionAccentLevel = (key: MissionKey, missions: WeeklyMissionsState): Level | null => {
  const level = missions.level as Level;
  if (key === 'M1') return level;
  if (key === 'M3') return resolveTargetColor(level, 'max-1').color;
  if (key === 'M4') return isAtLevelCeiling(level) ? null : resolveTargetColor(level, 'max+1').color;
  return null;
};

// Couleurs de niveau trop claires pour tenir seules sur un fond clair : contour foncé requis.
export const LIGHT_LEVEL_COLORS: ReadonlySet<string> = new Set(['jaune', 'vert', 'blanc', 'rose']);
