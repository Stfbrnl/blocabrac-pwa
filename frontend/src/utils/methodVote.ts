// ✅ docs/plans/PLAN-anecdote-methodes-missions.md §B — Carnet de méthodes. Module PURE
// (aucun import Firestore), même discipline que roulette.ts/challenges.ts : testable sans
// émulateur. Deux responsabilités : calculer le delta d'un (re)vote (§B.2/§B.6, utilisé côté
// écriture) et résumer l'agrégat pour l'affichage (§B.4, seuil de votes).
import { climbingMethods, METHOD_VOTES_DISPLAY_THRESHOLD } from '../config/gymConfig';

export interface MethodVoteDelta {
  // Uniquement les clés dont le compte change, chacune à -1 ou +1 — jamais 0, jamais
  // d'autre valeur (voir firestore.rules, isValidMethodCountsDelta, qui n'accepte que ça).
  countDeltas: Record<string, number>;
  // -1 (le grimpeur retire son dernier vote), 0 (vote déjà actif, juste modifié) ou +1
  // (premier vote de ce grimpeur sur ce bloc).
  votesDelta: number;
}

// ✅ §B.6 : "modifiable tant que le grimpeur revient sur sa validation : décrémenter
// l'ancienne, incrémenter la nouvelle" — c'est exactement une différence d'ensembles.
export const computeMethodVoteDelta = (oldMethods: string[], newMethods: string[]): MethodVoteDelta => {
  const oldSet = new Set(oldMethods);
  const newSet = new Set(newMethods);
  const countDeltas: Record<string, number> = {};
  oldSet.forEach((m) => { if (!newSet.has(m)) countDeltas[m] = -1; });
  newSet.forEach((m) => { if (!oldSet.has(m)) countDeltas[m] = 1; });
  const wasVoting = oldMethods.length > 0;
  const willBeVoting = newMethods.length > 0;
  const votesDelta = wasVoting === willBeVoting ? 0 : (willBeVoting ? 1 : -1);
  return { countDeltas, votesDelta };
};

export interface MethodVoteSummaryEntry {
  value: string;
  label: string;
  count: number;
  percent: number; // 0-100, arrondi
}

// ✅ §B.4 : renvoie `null` sous le seuil d'affichage — l'appelant n'affiche alors rien
// (choix retenu parmi les deux options laissées ouvertes par le plan). Trié par nombre de
// votes décroissant ; les méthodes jamais votées (count 0) sont omises.
export const summarizeMethodVotes = (
  methodCounts: Record<string, number> | undefined,
  methodVotes: number | undefined
): MethodVoteSummaryEntry[] | null => {
  const votes = methodVotes || 0;
  if (votes < METHOD_VOTES_DISPLAY_THRESHOLD) return null;
  const counts = methodCounts || {};
  return climbingMethods
    .map((m) => ({
      value: m.value,
      label: m.label,
      count: counts[m.value] || 0,
      percent: Math.round(((counts[m.value] || 0) / votes) * 100),
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
};
