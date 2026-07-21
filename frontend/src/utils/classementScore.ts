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
