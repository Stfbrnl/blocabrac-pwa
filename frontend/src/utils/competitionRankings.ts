/**
 * Le palmarès officiel gelé d'une compétition — sa composition, dans une fonction pure.
 *
 * ═══ POURQUOI UN GEL, ET PAS UN CALCUL À LA LECTURE ════════════════════════════════════
 *
 * > **Un palmarès est un fait daté, pas une requête.**
 *
 * Recalculer les classements à chaque affichage est plus simple, ne crée aucun document, et
 * reste toujours cohérent avec la donnée. C'est exactement pour cela qu'il faut l'écarter :
 * **la donnée bouge derrière.** `client_boulder_results` ne stocke pas la couleur d'un bloc, et
 * recoter un bloc déjà validé réécrit rétroactivement l'histoire de tous ceux qui l'ont
 * validé — le gérant l'a fait le 02/10/2026 (un bleu passé violet, 7 grimpeurs, +100 points
 * chacun), et il le refera. Un palmarès recalculé changerait donc de podium un mois après
 * l'épreuve, sans que personne n'ait touché à la compétition.
 *
 * Un score qui bouge abîme la confiance ; un podium qui bouge la détruit.
 *
 * Deux bénéfices accessoires mais réels : la page tombe de N participations lues à **un seul
 * document** (quota Spark), et elle reste lisible indéfiniment sans dépendre de l'état courant
 * de `boulders`.
 *
 * ═══ CE QUI EST GELÉ, ET CE QUI NE L'EST PAS ═══════════════════════════════════════════
 *
 * Le document porte **ce que son lecteur consomme**, et rien de plus : un nom déjà tronqué
 * (voir `participantDisplayName.ts`), un rang, un score. Jamais de date de naissance — la
 * catégorie d'âge EST le libellé du groupe, le lecteur n'a besoin de rien d'autre. C'est la
 * leçon de `classement_profiles`, qui avait recopié `dateOfBirth` « puisqu'il était là » et
 * exposé les dates de naissance de mineurs à tout compte authentifié (17/08/2026).
 *
 * ⚠️ Et ici la règle est plus stricte qu'ailleurs, parce que **le document est immuable** : ce
 * qu'on y écrit par excès n'est pas corrigeable par une mise à jour, seulement par une
 * suppression avec la clé de service.
 *
 * ═══ UN SEUL CALCUL POUR LES DEUX SOURCES (§2.4) ═══════════════════════════════════════
 *
 * Le même affichage a deux origines : calculé à la lecture (« classement provisoire », tant que
 * le palmarès n'est pas publié) et gelé (« palmarès officiel »). C'est précisément la situation
 * qui fabrique une divergence — le projet en a payé quatre, dont une le 03/10/2026 où le
 * message publié numérotait 1, 2, 3 là où l'écran affichait déjà 1, 1, 3.
 *
 * D'où : ce module n'a **aucun calcul de classement**. Il appelle `getClassementByCategory` et
 * `rankedEntries`, exactement comme les écrans, et ne fait que mettre en forme. Le test
 * d'identité (`competitionRankings.test.ts`) vérifie la propriété qui survit à un changement de
 * format : **les rangs du palmarès gelé sont égaux à ceux de l'écran**, classement par
 * classement — pas que le document « a l'air bon ».
 *
 * ⚠️ La réconciliation AVANT le gel (§1.3 du plan) **ne s'applique pas ici, et ce n'est pas un
 * oubli** : elle protégeait contre le gel d'une dérive de `classement_profiles.bestColorRank`,
 * un compteur entretenu. Ce palmarès n'en lit aucun. Tout ce qu'il contient se recalcule depuis
 * `competition_results`, `boulders` et `competition_participants` — des faits stockés, pas des
 * compteurs. Le niveau vient de `level_at_start` figé au coup d'envoi, jamais de `bestColorRank`
 * (voir competitionClassement.ts, et c'était déjà la raison de ce choix).
 */
import {
  getClassementByCategory,
  rankedEntries,
  type ParticipantBase,
  type CompetitionResultInput,
  type BoulderInput,
  type ScoreEntry,
  type CategoryGroup,
} from './competitionClassement';
import { type ScoringMode, type CustomScoringTable } from './climbingPoints';
import { shortParticipantName } from './participantDisplayName';

/** Version du format du document gelé, pour qu'un lecteur futur sache ce qu'il lit. */
export const FROZEN_RANKINGS_VERSION = 1;

export interface RankingParticipant extends ParticipantBase {
  first_name?: string | null;
  last_name?: string | null;
  /**
   * Sépare les deux familles de classements (§2.1). Une participation ancienne peut ne pas
   * porter le champ : on la traite alors comme cliente, comme le fait
   * `buildCompetitionParticipant` quand aucun rôle n'est lisible (tout compte porte `client`
   * par convention). `audit-prod-catalog.js` contrôle par ailleurs sa cohérence avec les rôles.
   */
  is_client?: boolean;
}

export interface FrozenEntry {
  user_id: string;
  /** Déjà tronqué (prénom + initiale) : voir l'en-tête de ce fichier. */
  display_name: string;
  rank: number;
  score: number;
  boulders: number;
  total_attempts: number;
}

export interface FrozenGroup {
  category: string;
  entries: FrozenEntry[];
}

export interface FrozenRankings {
  version: number;
  competition_id: string;
  competition_name: string;
  competition_date: string;
  scoring_mode: ScoringMode;
  published_at: string;
  /** Tous les participants, sans partition. */
  general_open: FrozenEntry[];
  /** Les quatre classements des clients (§2.1). */
  client_open: FrozenEntry[];
  client_gender: FrozenGroup[];
  client_age: FrozenGroup[];
  client_level_max: FrozenGroup[];
}

/**
 * ⚠️ LE MODE « OFFICIEL » N'EST PAS GELABLE EN L'ÉTAT, et il vaut mieux le refuser que publier
 * un document faux.
 *
 * `calculateCompetitionPoints` renvoie **0** pour ce mode, volontairement (voir
 * climbingPoints.ts : « plutôt que de laisser cette fonction faire semblant ») — un classement
 * officiel n'est pas une somme de points mais un tri sur tops/zones/essais, calculé par
 * `getOfficialParticipantTotals`, d'une forme différente (`OfficialScoreEntry`, pas de champ
 * `score`). Geler via `buildFrozenRankings` produirait donc un palmarès à zéro partout, avec
 * des rangs arbitraires — et il serait IMMUABLE.
 *
 * Ce mode ne sert qu'à la « Finale de l'année », dont l'annonce aux grimpeurs est elle-même
 * suspendue jusqu'à confirmation de sa faisabilité (décision du 25/09/2026). Le jour où la
 * Finale est confirmée, c'est ici qu'il faudra ajouter la forme officielle du gel — pas
 * l'inventer dans l'écran d'administration.
 */
export const isScoringModeGelable = (mode?: ScoringMode): boolean =>
  (mode ?? 'blocabrac') !== 'officiel';

export interface BuildFrozenRankingsInput {
  competition: {
    id: string;
    name: string;
    date: string;
    scoring_mode?: ScoringMode;
    custom_scoring?: CustomScoringTable;
  };
  participants: RankingParticipant[];
  results: CompetitionResultInput[];
  boulders: BoulderInput[];
  publishedAt: string;
}

/**
 * Une participation est cliente sauf si le champ dit explicitement le contraire.
 *
 * ⚠️ `=== false` et non `!== true` : un champ absent (participation ancienne) doit compter
 * comme cliente, pas être exclue des quatre classements qui la concernent.
 */
const estClient = (p: RankingParticipant): boolean => p.is_client !== false;

const figeEntree = (entry: ScoreEntry<RankingParticipant>, rank: number): FrozenEntry => ({
  user_id: entry.participant.user_id,
  display_name: shortParticipantName(entry.participant),
  rank,
  score: entry.score,
  boulders: entry.boulders,
  total_attempts: entry.totalAttempts,
});

/** Les rangs viennent de `rankedEntries`, jamais de l'index — sinon deux ex æquo seraient
 *  numérotés différemment dans le document et à l'écran. C'est le défaut du 03/10/2026. */
const figeListe = (entries: ScoreEntry<RankingParticipant>[]): FrozenEntry[] =>
  rankedEntries(entries).map(({ entry, rank }) => figeEntree(entry, rank));

const figeGroupes = (groupes: CategoryGroup<ScoreEntry<RankingParticipant>>[]): FrozenGroup[] =>
  groupes.map((g) => ({ category: g.category, entries: figeListe(g.participants) }));

export const buildFrozenRankings = (input: BuildFrozenRankingsInput): FrozenRankings => {
  const { competition, participants, results, boulders, publishedAt } = input;
  const mode = competition.scoring_mode ?? 'blocabrac';
  const custom = competition.custom_scoring;

  // ⚠️ CLIENTS UNIQUEMENT pour les quatre derniers classements, et pour le niveau max c'est
  // STRUCTUREL (§1.5) : le niveau est une notion de l'application, pilotée par les badges
  // depuis V2.54, et un visiteur extérieur n'en a pas. Ce n'est pas une restriction choisie,
  // c'est la seule population où la clé est définie.
  const clients = participants.filter(estClient);

  return {
    version: FROZEN_RANKINGS_VERSION,
    competition_id: competition.id,
    competition_name: competition.name,
    competition_date: competition.date,
    scoring_mode: mode,
    published_at: publishedAt,
    general_open: figeListe(
      getClassementByCategory(results, participants, boulders, 'global', mode, custom)
    ),
    client_open: figeListe(
      getClassementByCategory(results, clients, boulders, 'global', mode, custom)
    ),
    client_gender: figeGroupes(
      getClassementByCategory(results, clients, boulders, 'gender', mode, custom)
    ),
    client_age: figeGroupes(
      getClassementByCategory(results, clients, boulders, 'age', mode, custom)
    ),
    client_level_max: figeGroupes(
      getClassementByCategory(results, clients, boulders, 'level_max', mode, custom)
    ),
  };
};
