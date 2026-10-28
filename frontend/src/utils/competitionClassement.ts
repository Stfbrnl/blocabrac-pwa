import { calculateCompetitionPoints, boulderColorKey, type ScoringMode, type CustomScoringTable } from './climbingPoints';
import { getSeasonAge, getFfmeCategory } from './ageCategory';
import { levelOrder, type Level } from './competitionEligibility';

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
  // ─── Niveau, pour le classement par niveau max (§1 du plan du 5 novembre) ───────────
  //
  // Les deux champs viennent du document de participation, jamais de `users` lu à la
  // lecture : un palmarès gelé ne doit dépendre que de faits datés (§2.2).
  //
  // `level`            : niveau copié au moment de l'INSCRIPTION (buildCompetitionParticipant).
  // `level_at_start`   : niveau copié au passage de la compétition en « en cours », donc « le
  //                      niveau au début de l'épreuve » au sens propre. Absent pour un inscrit
  //                      tardif (inscrit alors que l'épreuve avait déjà commencé) : son niveau
  //                      d'inscription EST son niveau de départ, d'où le repli de
  //                      `resolveClassementLevel`.
  level?: string;
  level_at_start?: string;
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
  // Voir `CompetitionScoringBoulder` (climbingPoints.ts) : les deux sont optionnels, et les
  // deux sortes de blocs sont disjointes en production. Une compétition hybride met les deux
  // en jeu dans la même épreuve.
  color?: string;
  difficulty?: string;
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
// seule définition qui reste juste dans les quatre modes à points. (Dans le mode à plancher,
// un bloc réussi au premier essai vaut exactement sa base — le facteur y est 1 — donc la
// dureté s'y lit comme dans "blocabrac" : rien à inventer.)
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
  /**
   * Somme des essais sur TOUS les blocs saisis, réussis ET échoués — critère de départage
   * ultime (voir `compareScoreEntries`). Un bloc jamais saisi ne compte pas : l'application
   * n'oblige personne à déclarer un échec, et c'est la limite assumée de ce critère.
   */
  totalAttempts: number;
  /**
   * Plus haute couleur réussie pendant l'épreuve (clé du barème, donc `color` ou, pour un bloc
   * de compétition, sa cotation cachée `difficulty` — voir `boulderColorKey`). `undefined` si
   * aucun bloc réussi, ou si la couleur n'est pas un niveau connu. Sert uniquement au
   * classement par niveau max.
   */
  bestColorSucceeded?: Level;
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

/**
 * Ordre complet du classement : points décroissants, le départage ci-dessus, puis — en dernier
 * recours — le moins d'essais au total, échecs compris.
 *
 * ⚠️ CE DERNIER CRITÈRE CHANGE UN RÉSULTAT VISIBLE, et c'est son objet (décision de
 * l'utilisateur, 15/10/2026, §1.6 du plan du 5 novembre). Il ne s'applique QU'À un ex æquo
 * réel — mêmes points, même liste de blocs réussis avec les mêmes essais — donc il ne touche
 * aucun classement que l'ancien départage séparait déjà. Mais là où il s'applique, deux
 * grimpeurs qui partageaient un rang ne le partagent plus. Au moment de son introduction
 * aucune compétition réelle n'avait eu lieu (10 résultats sur 3 tests), donc aucun palmarès
 * publié n'a bougé — c'est ce qui rendait la fenêtre gratuite.
 *
 * ⚠️ Comme un ex æquo réel a, par construction, le même nombre d'essais sur les blocs RÉUSSIS,
 * ce critère compare en pratique les essais sur les blocs ÉCHOUÉS. D'où sa limite, connue et
 * acceptée : rien n'oblige un grimpeur à déclarer un échec, et celui qui ne les déclare pas
 * est avantagé. Elle se traite par l'annonce de début d'épreuve (« déclarez vos échecs »), pas
 * par du code — l'application ne peut pas constater un essai qu'on ne lui dit pas.
 *
 * Si ce critère ne sépare pas non plus, les grimpeurs restent réellement ex æquo et partagent
 * leur rang (voir `rankPointEntries`).
 */
export const compareScoreEntries = <P extends ParticipantBase>(
  a: ScoreEntry<P>,
  b: ScoreEntry<P>
): number => {
  if (b.score !== a.score) return b.score - a.score;
  const parBlocs = compareTieBreak(a.tieBreak, b.tieBreak);
  if (parBlocs !== 0) return parBlocs;
  // ⚠️ AUCUN BLOC RÉUSSI DES DEUX CÔTÉS : ils restent ex æquo, et le critère des essais NE
  // S'APPLIQUE PAS. Trouvé le 15/10/2026 par e2e-live-display-flow.mjs, dont un pas existant
  // a rougi : en début d'épreuve, où tout le monde est à 0 point, compter les essais des
  // ÉCHECS classait les grimpeurs — et dans le pire sens possible, celui qui n'avait rien
  // tenté passant devant celui qui avait essayé et échoué. Sur l'écran projeté dans la salle,
  // devant les intéressés.
  //
  // Le critère existe pour séparer deux grimpeurs dont les PERFORMANCES sont identiques. Sans
  // performance, il n'y a rien à séparer. (Le cas « un seul des deux a réussi quelque chose »
  // ne descend jamais jusqu'ici : `compareTieBreak` fait déjà passer devant celui qui a un
  // bloc de plus.)
  if (a.tieBreak.length === 0 && b.tieBreak.length === 0) return 0;
  return a.totalAttempts - b.totalAttempts;
};

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

// ============================================================================================
// Classement par NIVEAU MAX (§1 du plan du 5 novembre)
// ============================================================================================
//
// Règle du gérant, écrite comme un MAXIMUM :
//
//     niveau_de_classement = max(niveau au début de l'épreuve, plus haute couleur réussie)
//
// Écrite ainsi elle est monotone : un résultat de compétition ne peut que faire MONTER de
// paquet, et l'ordre dans lequel on applique les choses n'a plus d'importance. Toute autre
// écriture (« remplacer par », « mettre à jour si ») laisserait une ambiguïté sur le cas où le
// niveau baisserait. C'est la monotonie de V2.56 — on ne perd pas ce qui est acquis.
//
// C'est aussi la règle SPORTIVE, pas une contrainte technique : sans elle, un grimpeur aurait
// intérêt à sous-déclarer son niveau pour gagner le paquet facile. Réussir un noir range parmi
// les noirs.
//
// ⚠️ LE NIVEAU NE SE LIT PAS SUR `classement_profiles.bestColorRank` (§1.3). C'est un compteur
// entretenu, donc sujet à dérive — et un paquet faux serait GELÉ avec le palmarès, donc faux
// pour toujours. Il ne contient d'ailleurs pas les résultats de compétition : ceux-ci vivent
// dans `competition_results` et n'alimentent jamais `client_boulder_results` (vérifié le
// 15/10/2026). Le niveau de départ vient donc du document de participation, et la couleur de
// l'épreuve se recalcule depuis les résultats.
//
// ⚠️ CLIENTS UNIQUEMENT, et c'est structurel (§1.5) : le niveau est une notion de
// l'application, pilotée par les badges depuis V2.54. Un visiteur extérieur n'en a pas. Ce
// n'est donc pas une restriction qu'on choisit, c'est la seule population où la clé est
// définie. Le filtre `is_client` est appliqué par l'appelant qui assemble les cinq
// classements ; ne pas « corriger » cette omission ici dans six mois.
//
// ⚠️ ET LE DÉPARTAGE EST AFFAIBLI DANS CE CLASSEMENT (§1.6) : voir le test dédié. Un paquet
// peut réunir des grimpeurs dont la plus haute couleur réussie est identique — la grandeur qui
// fonde le premier critère de départage y est alors constante, et c'est le critère suivant (les
// essais) qui tranche. Ce n'est vrai que de ce classement-ci : open, genre et âge sont tous
// orthogonaux à la couleur.

/** Libellé du paquet des participants dont aucun niveau n'est déterminable. */
export const LEVEL_MAX_UNKNOWN_CATEGORY = 'Niveau non déterminé';

/**
 * Le niveau qui range un participant dans son paquet.
 *
 * Repli du niveau de départ : `level_at_start` (figé au passage en « en cours ») puis `level`
 * (figé à l'inscription). Un inscrit tardif n'a pas de `level_at_start`, et son niveau
 * d'inscription EST son niveau de départ — le repli n'est pas une approximation dans ce cas,
 * c'est la bonne valeur.
 *
 * `null` quand ni le niveau de départ ni la couleur réussie ne sont connus : le participant est
 * alors affiché dans un paquet « non déterminé » plutôt que masqué (§1.4 — un grimpeur qui ne
 * se trouve dans aucun classement produit une question à l'accueil).
 */
export const resolveClassementLevel = (
  participant: ParticipantBase,
  bestColorSucceeded?: Level
): Level | null => {
  const depart = participant.level_at_start ?? participant.level;
  const indexDepart = depart ? levelOrder.indexOf(depart as Level) : -1;
  const indexEpreuve = bestColorSucceeded ? levelOrder.indexOf(bestColorSucceeded) : -1;
  const meilleur = Math.max(indexDepart, indexEpreuve);
  return meilleur >= 0 ? levelOrder[meilleur] : null;
};

/** `null` → le paquet « non déterminé », sinon « Niveau rouge ». */
export const levelMaxCategoryLabel = (level: Level | null): string =>
  level ? `Niveau ${level}` : LEVEL_MAX_UNKNOWN_CATEGORY;

// ⚠️ Les groupes sont ordonnés par NIVEAU DÉCROISSANT (rose d'abord), le paquet « non
// déterminé » en dernier — contrairement aux partitions âge/genre, dont l'ordre suit la
// première apparition dans le classement open. Différence volontaire : une suite de niveaux a
// un ordre naturel, et le lecteur l'attend.
//
// L'effectif n'est PAS dans le libellé : l'affichage le compose lui-même
// (`${category} — ${participants.length} participant(s)`), de la même façon pour les quatre
// partitions. §1.4 : aucun paquet non vide n'est masqué, même à un seul grimpeur — c'est
// l'effectif affiché qui le qualifie, sans qu'on ait à couronner personne.
const groupByLevelMax = <P extends ParticipantBase>(
  entries: ScoreEntry<P>[]
): CategoryGroup<ScoreEntry<P>>[] => {
  const parNiveau = new Map<string, ScoreEntry<P>[]>();
  entries.forEach(entry => {
    const label = levelMaxCategoryLabel(resolveClassementLevel(entry.participant, entry.bestColorSucceeded));
    if (!parNiveau.has(label)) parNiveau.set(label, []);
    parNiveau.get(label)!.push(entry);
  });

  const rang = (label: string): number =>
    label === LEVEL_MAX_UNKNOWN_CATEGORY ? -1 : levelOrder.indexOf(label.replace('Niveau ', '') as Level);

  return [...parNiveau.entries()]
    .sort(([a], [b]) => rang(b) - rang(a))
    .map(([category, participants]) => ({ category, participants }));
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
  const scores: Record<string, {
    score: number;
    boulders: number;
    tieBreak: TieBreakBoulder[];
    totalAttempts: number;
    bestColorIndex: number;
  }> = {};

  results.forEach(result => {
    const participant = participants.find(p => p.user_id === result.user_id);
    if (!participant) return;

    const boulder = boulders.find(b => b.id === result.boulder_id);
    if (!boulder) return;

    const points = calculateCompetitionPoints(boulder, result.attempts, result.success, scoringMode, customScoring);
    const key = participant.user_id;

    if (!scores[key]) {
      scores[key] = { score: 0, boulders: 0, tieBreak: [], totalAttempts: 0, bestColorIndex: -1 };
    }
    scores[key].score += points;
    // Essais de TOUS les blocs saisis, réussis comme échoués (critère de départage ultime).
    // Un `attempts` absent ou non numérique compte pour 0 plutôt que de propager un NaN dans
    // le comparateur, où il rendrait l'ordre de tri indéfini sans rien signaler.
    if (Number.isFinite(result.attempts)) scores[key].totalAttempts += result.attempts;
    if (result.success) {
      scores[key].boulders += 1;
      // ✅ Difficulté = ce que vaut le bloc réussi AU PREMIER ESSAI dans le barème de la
      // compétition (voir le commentaire de TieBreakBoulder). Seuls les blocs RÉUSSIS
      // comptent dans le départage : un échec n'est pas une performance à comparer.
      scores[key].tieBreak.push({
        hardness: calculateCompetitionPoints(boulder, 1, true, scoringMode, customScoring),
        attempts: result.attempts,
      });
      // Plus haute couleur réussie — même lecture de « la couleur de ce bloc » que le barème
      // (boulderColorKey), jamais une seconde. Une couleur hors `levelOrder` est ignorée
      // plutôt que rangée au hasard.
      const indexCouleur = levelOrder.indexOf(boulderColorKey(boulder) as Level);
      if (indexCouleur > scores[key].bestColorIndex) scores[key].bestColorIndex = indexCouleur;
    }
  });

  return Object.entries(scores).map(([userId, data]) => {
    const participant = participants.find(p => p.user_id === userId)!;
    return {
      participant,
      score: data.score,
      boulders: data.boulders,
      tieBreak: [...data.tieBreak].sort(compareTieBreakBoulders),
      totalAttempts: data.totalAttempts,
      bestColorSucceeded: data.bestColorIndex >= 0 ? levelOrder[data.bestColorIndex] : undefined,
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
  category: 'age' | 'gender' | 'level_max',
  scoringMode?: ScoringMode,
  customScoring?: CustomScoringTable
): CategoryGroup<ScoreEntry<P>>[];
export function getClassementByCategory<P extends ParticipantBase>(
  results: CompetitionResultInput[],
  participants: P[],
  boulders: BoulderInput[],
  category: 'global' | 'age' | 'gender' | 'level_max',
  scoringMode: ScoringMode = 'blocabrac',
  customScoring?: CustomScoringTable
): ScoreEntry<P>[] | CategoryGroup<ScoreEntry<P>>[] {
  const scores = getParticipantScores(results, participants, boulders, scoringMode, customScoring);

  if (category === 'global') return scores;
  if (category === 'age') return groupByAge(scores);
  // ⚠️ `level_max` n'existe QUE sur ce chemin à points, jamais sur
  // `getOfficialClassementByCategory` : le mode « Officiel » est celui de la Finale (dix
  // grimpeurs, une catégorie open scindée par genre), et il n'a pas de `ScoreEntry` donc pas de
  // plus haute couleur réussie. Ne pas l'y ajouter « par symétrie ».
  if (category === 'level_max') return groupByLevelMax(scores);
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
