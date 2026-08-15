import { calculateCompetitionPoints, type ScoringMode, type CustomScoringTable } from './climbingPoints';
import { getSeasonAge, getFfmeCategory } from './ageCategory';

export type { ScoringMode, CustomScoringTable };

// ✅ Extrait de AdminCompetitionStats.tsx / Ouvreur/CompetitionBoulders/CompetitionStats.tsx
// (CONCEPTION-ecran-live-competition.md §1) : ce calcul existait en double, et un
// troisième écran (l'affichage live) en aurait fait un troisième exemplaire — trois
// vérités possibles le jour où le barème change, potentiellement en pleine compétition.
// Modèle : classementScore.ts (classement quotidien).

export interface ParticipantBase {
  user_id: string;
  dateOfBirth?: string;
  age?: number;
  gender?: string;
}

export interface CompetitionResultInput {
  user_id: string;
  boulder_id: string;
  success: boolean;
  attempts: number;
  // ✅ Mode "Officiel FFME/coupe du monde" uniquement (voir plus bas) : zone atteinte
  // et essais avant la zone, indépendants du top. `zone` peut être vrai même si
  // `success` est faux (zone atteinte sans top).
  zone?: boolean;
  attempts_to_zone?: number;
}

export interface BoulderInput {
  id: string;
  color?: string;
  difficulty: string;
  // Mode "Blocs validés" uniquement — voir climbingPoints.ts.
  points_value?: number;
}

export interface ScoreEntry<P extends ParticipantBase = ParticipantBase> {
  participant: P;
  score: number;
  boulders: number;
}

// ✅ Regroupement âge/genre générique, indépendant de la forme de l'entrée classée
// (ScoreEntry pour les modes à points, OfficialScoreEntry pour le mode officiel) —
// un seul endroit où la logique de catégorie FFME/genre peut avoir un bug, pas deux
// implémentations à tenir synchronisées.
export interface CategoryGroup<T> {
  category: string;
  participants: T[];
}

const groupByAge = <P extends ParticipantBase, T extends { participant: P }>(entries: T[]): CategoryGroup<T>[] => {
  const byAge: Record<string, T[]> = {};
  entries.forEach(entry => {
    const ageCategory = getFfmeCategory(getSeasonAge(entry.participant.dateOfBirth, entry.participant.age));
    if (!byAge[ageCategory]) byAge[ageCategory] = [];
    byAge[ageCategory].push(entry);
  });
  return Object.entries(byAge).map(([age, participants]) => ({ category: age, participants }));
};

const groupByGender = <P extends ParticipantBase, T extends { participant: P }>(entries: T[]): CategoryGroup<T>[] => {
  const byGender: Record<string, T[]> = {};
  entries.forEach(entry => {
    const gender = entry.participant.gender || 'Inconnu';
    if (!byGender[gender]) byGender[gender] = [];
    byGender[gender].push(entry);
  });
  return Object.entries(byGender).map(([gender, participants]) => ({ category: gender, participants }));
};

// Calcule le score de chaque participant à partir des résultats bruts, trié du meilleur
// score au plus faible. `P` reste générique : l'appelant garde le type participant complet
// (nom, email, niveau...) qu'il a lui-même chargé, sans cast.
export const getParticipantScores = <P extends ParticipantBase>(
  results: CompetitionResultInput[],
  participants: P[],
  boulders: BoulderInput[],
  // ✅ Chantier "comptes de points" : par défaut le barème actuel (mode "Blocabrac"),
  // pour ne rien changer aux appelants existants qui n'ont pas encore de sélecteur de
  // mode câblé.
  scoringMode: ScoringMode = 'blocabrac',
  customScoring?: CustomScoringTable
): ScoreEntry<P>[] => {
  const scores: Record<string, { score: number; boulders: number }> = {};

  results.forEach(result => {
    const participant = participants.find(p => p.user_id === result.user_id);
    if (!participant) return;

    const boulder = boulders.find(b => b.id === result.boulder_id);
    if (!boulder) return;

    const points = calculateCompetitionPoints(boulder, result.attempts, result.success, scoringMode, customScoring);
    const key = participant.user_id;

    if (!scores[key]) {
      scores[key] = { score: 0, boulders: 0 };
    }
    scores[key].score += points;
    scores[key].boulders += result.success ? 1 : 0;
  });

  return Object.entries(scores).map(([userId, data]) => {
    const participant = participants.find(p => p.user_id === userId)!;
    return {
      participant,
      score: data.score,
      boulders: data.boulders
    };
  }).sort((a, b) => b.score - a.score);
};

// ✅ Signatures surchargées : le type de retour dépend de la valeur littérale passée
// ("global" -> liste plate, "age"/"gender" -> groupes), pour éviter un cast à chaque appel.
export function getClassementByCategory<P extends ParticipantBase>(
  results: CompetitionResultInput[],
  participants: P[],
  boulders: BoulderInput[],
  category: 'global',
  scoringMode?: ScoringMode,
  customScoring?: CustomScoringTable
): ScoreEntry<P>[];
export function getClassementByCategory<P extends ParticipantBase>(
  results: CompetitionResultInput[],
  participants: P[],
  boulders: BoulderInput[],
  category: 'age' | 'gender',
  scoringMode?: ScoringMode,
  customScoring?: CustomScoringTable
): CategoryGroup<ScoreEntry<P>>[];
export function getClassementByCategory<P extends ParticipantBase>(
  results: CompetitionResultInput[],
  participants: P[],
  boulders: BoulderInput[],
  category: 'global' | 'age' | 'gender',
  scoringMode: ScoringMode = 'blocabrac',
  customScoring?: CustomScoringTable
): ScoreEntry<P>[] | CategoryGroup<ScoreEntry<P>>[] {
  const scores = getParticipantScores(results, participants, boulders, scoringMode, customScoring);

  if (category === 'global') return scores;
  if (category === 'age') return groupByAge(scores);
  return groupByGender(scores);
}

// ============================================================================
// Mode "Officiel FFME/coupe du monde" — classement, pas somme de points (voir
// CLAUDE.md "Competition scoring modes"). Version simplifiée retenue avec
// l'utilisateur (2026-08-16) : tri multi-critères sur les TOTAUX CUMULÉS de toute
// la compétition (tops, zones, essais-top, essais-zone) — pas le "classement de
// classements" par bloc de l'IFSC/Coupe du monde (recalcul continu bien plus
// coûteux, écarté explicitement pour l'écran live). Fonction séparée de
// getParticipantScores : pas de "score" unique ici, un ScoreEntry ne conviendrait
// pas.
// ============================================================================

export interface OfficialTotals {
  tops: number;
  zones: number;
  attemptsToTop: number;
  attemptsToZone: number;
}

export interface OfficialScoreEntry<P extends ParticipantBase = ParticipantBase> {
  participant: P;
  totals: OfficialTotals;
}

// Ordre de départage officiel : le plus de tops, puis le plus de zones, puis le
// moins d'essais pour les tops, puis le moins d'essais pour les zones.
const compareOfficialTotals = (a: OfficialTotals, b: OfficialTotals): number => {
  if (b.tops !== a.tops) return b.tops - a.tops;
  if (b.zones !== a.zones) return b.zones - a.zones;
  if (a.attemptsToTop !== b.attemptsToTop) return a.attemptsToTop - b.attemptsToTop;
  return a.attemptsToZone - b.attemptsToZone;
};

export const getOfficialParticipantTotals = <P extends ParticipantBase>(
  results: CompetitionResultInput[],
  participants: P[]
): OfficialScoreEntry<P>[] => {
  const totals: Record<string, OfficialTotals> = {};

  results.forEach(result => {
    const participant = participants.find(p => p.user_id === result.user_id);
    if (!participant) return;
    const key = participant.user_id;
    if (!totals[key]) totals[key] = { tops: 0, zones: 0, attemptsToTop: 0, attemptsToZone: 0 };

    // ✅ Un top implique la zone (elle est franchie en chemin) : compté même si
    // `zone` n'a pas été explicitement coché côté client — voir ClientCompetitions.tsx,
    // qui force `zone: true` dès que "Réussi" est cliqué, mais cette redondance
    // protège aussi un résultat écrit avant ce chantier (zone absent).
    if (result.success) {
      totals[key].tops += 1;
      totals[key].attemptsToTop += result.attempts;
    }
    if (result.zone || result.success) {
      totals[key].zones += 1;
      // ✅ Essais à la zone <= essais au top par construction (la zone est
      // franchie avant ou au moment du top) — replié sur `attempts` si
      // `attempts_to_zone` est absent (résultat migré/mode changé après coup).
      totals[key].attemptsToZone += result.attempts_to_zone ?? result.attempts;
    }
  });

  return Object.entries(totals).map(([userId, t]) => ({
    participant: participants.find(p => p.user_id === userId)!,
    totals: t
  })).sort((a, b) => compareOfficialTotals(a.totals, b.totals));
};

export function getOfficialClassementByCategory<P extends ParticipantBase>(
  results: CompetitionResultInput[],
  participants: P[],
  category: 'global'
): OfficialScoreEntry<P>[];
export function getOfficialClassementByCategory<P extends ParticipantBase>(
  results: CompetitionResultInput[],
  participants: P[],
  category: 'age' | 'gender'
): CategoryGroup<OfficialScoreEntry<P>>[];
export function getOfficialClassementByCategory<P extends ParticipantBase>(
  results: CompetitionResultInput[],
  participants: P[],
  category: 'global' | 'age' | 'gender'
): OfficialScoreEntry<P>[] | CategoryGroup<OfficialScoreEntry<P>>[] {
  const totals = getOfficialParticipantTotals(results, participants);
  if (category === 'global') return totals;
  if (category === 'age') return groupByAge(totals);
  return groupByGender(totals);
}
