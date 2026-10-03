import { calculateCompetitionPoints, type ScoringMode, type CustomScoringTable } from './climbingPoints';
import { getSeasonAge, getFfmeCategory } from './ageCategory';

export type { ScoringMode, CustomScoringTable };

// ✅ Extrait de AdminCompetitionStats.tsx / Ouvreur/CompetitionBoulders/CompetitionStats.tsx
// (docs/plans/CONCEPTION-ecran-live-competition.md §1) : ce calcul existait en double, et un
// troisième écran (l'affichage live) en aurait fait un troisième exemplaire — trois
// vérités possibles le jour où le barème change, potentiellement en pleine compétition.
// Modèle : classementScore.ts (classement quotidien).

export interface ParticipantBase {
  user_id: string;
  dateOfBirth?: string;
  legacyAge?: number;
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

// ✅ Départage des ex æquo dans les modes à POINTS (règle fixée par l'utilisateur le
// 03/10/2026, après mesure : une compétition sur dix produit au moins une égalité de
// points — 40 tirages sur 399 dans competitionSimulation.test.ts).
//
// À points égaux, on compare les blocs réussis, du plus dur au moins dur :
//   1. le bloc le plus dur réussi — le plus dur devant ;
//   2. à difficulté égale, le nombre d'essais sur ce bloc — le moins d'essais devant ;
//   3. puis le deuxième bloc le plus dur, puis ses essais, et ainsi de suite ;
//   4. si une liste s'épuise avant l'autre, celui qui a un bloc de plus passe devant ;
//   5. si tout est identique, les grimpeurs sont réellement EX ÆQUO et partagent leur rang
//      (voir rankPointEntries).
//
// ⚠️ « Le plus dur » est mesuré par la valeur du bloc réussi AU PREMIER ESSAI dans le barème
// de la compétition, et non par sa couleur. C'est volontaire : en mode "blocs_valides" la
// cotation ne reflète plus la difficulté (elle est cachée pendant l'épreuve, l'ouvreur pose
// un `points_value` à la place), donc une règle fondée sur la couleur y serait fausse. Une
// seule définition qui reste juste dans les trois modes à points.
//
// ⚠️ Ce départage ne s'applique QU'À L'INTÉRIEUR d'un groupe à points égaux, ce qui borne
// son effet : on ne peut pas y voir un grimpeur ayant réussi un seul bloc dur dépasser
// quelqu'un ayant réussi ce même bloc PLUS d'autres, puisque le second aurait strictement
// plus de points et ne serait donc pas à égalité.
export interface TieBreakBoulder {
  /** Valeur du bloc réussi au premier essai, dans le barème de la compétition. */
  hardness: number;
  attempts: number;
}

export interface ScoreEntry<P extends ParticipantBase = ParticipantBase> {
  participant: P;
  score: number;
  boulders: number;
  /** Blocs réussis, triés du plus dur au moins dur (puis du moins d'essais au plus). */
  tieBreak: TieBreakBoulder[];
}

/** Ordre interne de la liste de départage : plus dur d'abord, puis moins d'essais. */
const compareTieBreakBoulders = (a: TieBreakBoulder, b: TieBreakBoulder): number =>
  b.hardness !== a.hardness ? b.hardness - a.hardness : a.attempts - b.attempts;

/**
 * Comparaison lexicographique des deux listes de blocs réussis. Négatif si `a` passe devant.
 * Termine toujours : les listes sont finies.
 */
export const compareTieBreak = (a: TieBreakBoulder[], b: TieBreakBoulder[]): number => {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i];
    const y = b[i];
    // Une liste épuisée : celui qui a encore un bloc passe devant (précision ① du 03/10).
    if (!x) return 1;
    if (!y) return -1;
    const ordre = compareTieBreakBoulders(x, y);
    if (ordre !== 0) return ordre;
  }
  return 0;
};

/** Ordre complet du classement : points décroissants, puis le départage ci-dessus. */
export const compareScoreEntries = <P extends ParticipantBase>(
  a: ScoreEntry<P>,
  b: ScoreEntry<P>
): number => (b.score !== a.score ? b.score - a.score : compareTieBreak(a.tieBreak, b.tieBreak));

/**
 * Rang de compétition standard (1, 1, 3, 4, 4, 6…) pour les modes à POINTS — pendant exact de
 * `rankOfficialEntries`. Deux grimpeurs que le départage ne sépare pas partagent leur rang,
 * et le suivant saute les positions occupées.
 *
 * ⚠️ Avant le 03/10/2026, les écrans numérotaient avec `index + 1`, donc deux grimpeurs
 * strictement à égalité recevaient deux positions différentes — départagées par l'ordre
 * lexicographique des identifiants de documents, c'est-à-dire par des uid Firebase
 * aléatoires. `entries` doit déjà être triée (sortie de getParticipantScores).
 */
export const rankPointEntries = <P extends ParticipantBase>(entries: ScoreEntry<P>[]): number[] => {
  const ranks: number[] = [];
  entries.forEach((entry, index) => {
    if (index === 0 || compareScoreEntries(entries[index - 1], entry) !== 0) {
      ranks.push(index + 1);
    } else {
      ranks.push(ranks[index - 1]);
    }
  });
  return ranks;
};

/**
 * Appaire chaque entrée avec son rang, pour un rendu direct dans un tableau.
 *
 * Existe pour que les six tableaux des trois écrans de classement (global / âge / genre,
 * côté admin et côté ouvreur) ne recalculent pas les rangs chacun à leur façon — c'est
 * exactement le genre d'endroit où deux implémentations divergent en silence.
 */
export const rankedEntries = <P extends ParticipantBase>(
  entries: ScoreEntry<P>[]
): { entry: ScoreEntry<P>; rank: number }[] => {
  const ranks = rankPointEntries(entries);
  return entries.map((entry, index) => ({ entry, rank: ranks[index] }));
};

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
    const ageCategory = getFfmeCategory(getSeasonAge(entry.participant.dateOfBirth, entry.participant.legacyAge));
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
  const scores: Record<string, { score: number; boulders: number; tieBreak: TieBreakBoulder[] }> = {};

  results.forEach(result => {
    const participant = participants.find(p => p.user_id === result.user_id);
    if (!participant) return;

    const boulder = boulders.find(b => b.id === result.boulder_id);
    if (!boulder) return;

    const points = calculateCompetitionPoints(boulder, result.attempts, result.success, scoringMode, customScoring);
    const key = participant.user_id;

    if (!scores[key]) {
      scores[key] = { score: 0, boulders: 0, tieBreak: [] };
    }
    scores[key].score += points;
    if (result.success) {
      scores[key].boulders += 1;
      // ✅ Difficulté = ce que vaut le bloc réussi AU PREMIER ESSAI dans le barème de la
      // compétition (voir le commentaire de TieBreakBoulder). Seuls les blocs RÉUSSIS
      // comptent dans le départage : un échec n'est pas une performance à comparer.
      scores[key].tieBreak.push({
        hardness: calculateCompetitionPoints(boulder, 1, true, scoringMode, customScoring),
        attempts: result.attempts,
      });
    }
  });

  return Object.entries(scores).map(([userId, data]) => {
    const participant = participants.find(p => p.user_id === userId)!;
    return {
      participant,
      score: data.score,
      boulders: data.boulders,
      tieBreak: [...data.tieBreak].sort(compareTieBreakBoulders),
    };
  }).sort(compareScoreEntries);
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
// ⚠️ Ordre issu de ma connaissance générale du format IFSC/coupe du monde, PAS d'une
// lecture du règlement FFME en vigueur — à vérifier avant une compétition officielle
// qui s'appuierait dessus pour départager un classement final (retour de ClaudeNav,
// docs/plans/CONCEPTION-mode-ffme-et-garde-fou-reconciliation.md §B, 16/08/2026).
const compareOfficialTotals = (a: OfficialTotals, b: OfficialTotals): number => {
  if (b.tops !== a.tops) return b.tops - a.tops;
  if (b.zones !== a.zones) return b.zones - a.zones;
  if (a.attemptsToTop !== b.attemptsToTop) return a.attemptsToTop - b.attemptsToTop;
  return a.attemptsToZone - b.attemptsToZone;
};

const officialTotalsEqual = (a: OfficialTotals, b: OfficialTotals): boolean =>
  a.tops === b.tops && a.zones === b.zones && a.attemptsToTop === b.attemptsToTop && a.attemptsToZone === b.attemptsToZone;

// ✅ Retour de ClaudeNav (§B.4) : à l'ouverture d'une épreuve, la quasi-totalité des
// participants sont à 0 top/0 zone — un classement 1..N séquentiel les afficherait
// comme réellement départagés alors qu'ils sont strictement ex æquo. Rang de
// compétition standard (1, 1, 3, 4, 4, 6...) : deux totaux identiques partagent le
// même rang, le suivant saute les positions occupées. `entries` doit déjà être triée
// (sortie de getOfficialParticipantTotals/getOfficialClassementByCategory).
export const rankOfficialEntries = <P extends ParticipantBase>(entries: OfficialScoreEntry<P>[]): number[] => {
  const ranks: number[] = [];
  entries.forEach((entry, index) => {
    if (index === 0 || !officialTotalsEqual(entries[index - 1].totals, entry.totals)) {
      ranks.push(index + 1);
    } else {
      ranks.push(ranks[index - 1]);
    }
  });
  return ranks;
};

/**
 * Pendant officiel de `rankedEntries`, et pour la même raison.
 *
 * Ajouté le 03/10/2026 : le message d'annonce publié aux grimpeurs numérotait encore
 * le mode officiel en `index + 1` alors que les tableaux à l'écran partageaient déjà
 * les rangs (1, 1, 3). L'annonce contredisait donc l'écran exactement là où une
 * égalité parfaite au rang 1 est un cas prévu — c'est elle qui déclenche la
 * super-finale. Tout affichage d'un rang en mode officiel passe par cet assistant
 * ou par `rankOfficialEntries`, jamais par `index + 1`.
 */
export const rankedOfficialEntries = <P extends ParticipantBase>(
  entries: OfficialScoreEntry<P>[]
): { entry: OfficialScoreEntry<P>; rank: number }[] => {
  const ranks = rankOfficialEntries(entries);
  return entries.map((entry, index) => ({ entry, rank: ranks[index] }));
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
