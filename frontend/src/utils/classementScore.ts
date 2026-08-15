import { calculatePoints } from './climbingPoints';
import { levelOrder, type Level } from './competitionEligibility';

export interface ValidatedBoulderResult {
  color: string;
  attempts: number;
}

export interface ScoreSummary {
  score: number;
  bouldersValidated: number;
  bestColorRank: number; // -1 si aucun bloc validé
}

// Résume les blocs quotidiens validés (succès uniquement, déjà filtrés par l'appelant)
// d'un grimpeur en un score total et le rang (position dans levelOrder) de la couleur
// la plus difficile validée. Chaque client recalcule et stocke ce résumé sur sa propre
// fiche "classement_profiles" à chaque validation (ClientDaily.tsx) — un client ne
// pouvant pas lire les résultats des AUTRES clients, le classement (ClientClassement.tsx)
// se contente ensuite de lire ces résumés déjà calculés, sans jamais agréger lui-même
// les données d'un autre utilisateur.
export const summarizeValidatedResults = (results: ValidatedBoulderResult[]): ScoreSummary => {
  let score = 0;
  let bestColorRank = -1;
  results.forEach((result) => {
    score += calculatePoints(result.color, result.attempts, true);
    const rank = levelOrder.indexOf(result.color as Level);
    if (rank > bestColorRank) bestColorRank = rank;
  });
  return { score, bouldersValidated: results.length, bestColorRank };
};

// ✅ Compteur incrémental (CONCEPTION-selecteur-marge-compteur-incremental.md §3) :
// un compteur de blocs validés PAR COULEUR, tenu à jour par petites variations plutôt
// que recalculé depuis l'historique complet à chaque validation. `summarizeValidatedResults`
// ci-dessus reste la référence "recalcul complet depuis zéro" — utilisée par le script de
// réconciliation (scripts/reconcile-classement-profiles.js) pour vérifier que ce compteur
// n'a pas dérivé, jamais par ClientDaily.tsx en usage normal.
export type ColorCounts = Partial<Record<Level, number>>;

// bouldersValidated et bestColorRank se dérivent ENTIÈREMENT de colorCounts (jamais
// stockés/incrémentés indépendamment) : une seule source de vérité, pas deux compteurs
// pouvant diverger l'un de l'autre.
export const summaryFromColorCounts = (colorCounts: ColorCounts): { bouldersValidated: number; bestColorRank: number } => {
  let bouldersValidated = 0;
  let bestColorRank = -1;
  levelOrder.forEach((level, idx) => {
    const count = colorCounts[level] || 0;
    bouldersValidated += count;
    if (count > 0 && idx > bestColorRank) bestColorRank = idx;
  });
  return { bouldersValidated, bestColorRank };
};

// Delta de score pour LA validation d'UN SEUL bloc (ancien état -> nouvel état), à
// appliquer par increment() plutôt que par recalcul global. `null` = "pas réussi"
// (avant la transition ou après, selon le champ). Le score ne se décompose pas par
// couleur (les points dépendent des essais, propres à chaque bloc) — contrairement à
// bestColorRank, qui a besoin de colorCounts, le score n'a besoin que de ce delta.
export const scoreDeltaForValidation = (
  color: string,
  oldAttempts: number | null,
  newAttempts: number | null
): number => {
  const oldPoints = oldAttempts !== null ? calculatePoints(color, oldAttempts, true) : 0;
  const newPoints = newAttempts !== null ? calculatePoints(color, newAttempts, true) : 0;
  return newPoints - oldPoints;
};
