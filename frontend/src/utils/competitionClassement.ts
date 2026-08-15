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

export interface CategoryGroup<P extends ParticipantBase = ParticipantBase> {
  category: string;
  participants: ScoreEntry<P>[];
}

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
): CategoryGroup<P>[];
export function getClassementByCategory<P extends ParticipantBase>(
  results: CompetitionResultInput[],
  participants: P[],
  boulders: BoulderInput[],
  category: 'global' | 'age' | 'gender',
  scoringMode: ScoringMode = 'blocabrac',
  customScoring?: CustomScoringTable
): ScoreEntry<P>[] | CategoryGroup<P>[] {
  const scores = getParticipantScores(results, participants, boulders, scoringMode, customScoring);

  if (category === 'global') {
    return scores;
  } else if (category === 'age') {
    const byAge: Record<string, ScoreEntry<P>[]> = {};
    scores.forEach(score => {
      const ageCategory = getFfmeCategory(getSeasonAge(score.participant.dateOfBirth, score.participant.age));
      if (!byAge[ageCategory]) {
        byAge[ageCategory] = [];
      }
      byAge[ageCategory].push(score);
    });
    return Object.entries(byAge).map(([age, entries]) => ({
      category: age,
      participants: entries
    }));
  } else {
    const byGender: Record<string, ScoreEntry<P>[]> = {};
    scores.forEach(score => {
      const gender = score.participant.gender || 'Inconnu';
      if (!byGender[gender]) {
        byGender[gender] = [];
      }
      byGender[gender].push(score);
    });
    return Object.entries(byGender).map(([gender, entries]) => ({
      category: gender,
      participants: entries
    }));
  }
}
