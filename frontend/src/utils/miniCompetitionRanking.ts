/**
 * Le classement d'une mini-compétition (moniteur), composé dans une fonction pure.
 *
 * ⚠️ POURQUOI IL N'EST PLUS DANS LE `.tsx` — la couverture de tests de ce dépôt s'arrête au
 * bord des composants (pas de harnais React), donc un classement calculé en ligne y est
 * structurellement invisible. C'est exactement ce qui a laissé passer le défaut corrigé ici :
 * le rang était un `index + 1`, donc deux élèves à égalité recevaient deux positions
 * différentes, départagées par l'ordre des documents Firestore — c'est-à-dire par des
 * identifiants aléatoires. Même défaut, et même correction, que sur les écrans de compétition
 * le 03/10/2026 (`rankPointEntries`) ; dans un cours les égalités sont la norme, pas un cas
 * limite : en début de séance tout le monde est à zéro.
 *
 * Le barème est celui de `climbingPoints.ts`, comme partout ailleurs.
 */
import { calculatePoints } from './climbingPoints';

/** La forme minimale d'un résultat lu dans `client_course_results`. */
export interface MiniCompetitionResultInput {
  miniCompetitionId?: string;
  /** Couleur FIGÉE à la validation (voir ClientCourseSession.tsx), jamais relue en direct. */
  boulderColor?: string;
  attempts?: number;
  success?: boolean;
}

/** Un participant et ses résultats, tels que l'écran les a déjà regroupés. */
export interface MiniCompetitionParticipantInput {
  id: string;
  displayName: string;
  results: MiniCompetitionResultInput[];
}

export interface MiniCompetitionRankEntry {
  /** L'uid : c'est lui la clé de rendu, jamais le nom affiché (deux homonymes existent). */
  userId: string;
  participant: string;
  score: number;
  bouldersValidated: number;
  /** Rang de compétition : 1, 1, 3 — deux ex æquo partagent, le suivant saute. */
  rank: number;
}

/**
 * ⚠️ L'ordre d'affichage est rendu DÉTERMINISTE (score décroissant, puis nom) : sans second
 * critère, deux ex æquo s'affichaient dans l'ordre d'arrivée des documents Firestore. Ce
 * second critère ne départage RIEN — il ne touche pas au rang, qui reste partagé — il rend
 * seulement la liste stable d'un affichage à l'autre.
 */
export const buildMiniCompetitionRanking = (
  participants: MiniCompetitionParticipantInput[],
  miniCompetitionId: string
): MiniCompetitionRankEntry[] => {
  const scores = participants
    .map((p) => {
      const resultats = p.results.filter((r) => r.miniCompetitionId === miniCompetitionId);
      return {
        userId: p.id,
        participant: p.displayName,
        score: resultats.reduce(
          (total, r) => total + calculatePoints(r.boulderColor || '', r.attempts || 1, r.success === true),
          0
        ),
        bouldersValidated: resultats.filter((r) => r.success === true).length,
        aDesResultats: resultats.length > 0,
      };
    })
    .filter((e) => e.aDesResultats)
    .sort((a, b) => (b.score - a.score) || a.participant.localeCompare(b.participant, 'fr'));

  // Égalité = même score, le seul critère de tri qui départage réellement. Le rang d'un
  // groupe d'ex æquo est la position de son PREMIER membre, ce qui donne 1, 1, 3 — et non
  // 1, 1, 2, qui ferait disparaître une place.
  const classees: MiniCompetitionRankEntry[] = [];
  scores.forEach((e, index) => {
    const precedent = classees[classees.length - 1];
    classees.push({
      userId: e.userId,
      participant: e.participant,
      score: e.score,
      bouldersValidated: e.bouldersValidated,
      rank: precedent && precedent.score === e.score ? precedent.rank : index + 1,
    });
  });
  return classees;
};

/**
 * Les mini-compétitions à proposer au moniteur.
 *
 * ⚠️ L'écran ne listait que celles dont il est l'AUTEUR (`createdBy`), alors que l'écran qui
 * rattache une mini-compétition à une séance les liste TOUTES, sans filtre. Un moniteur
 * pouvait donc faire jouer la mini-compétition d'un collègue dans sa propre séance, voir les
 * résultats s'enregistrer — et le bloc « Classement » ne jamais apparaître, sans le moindre
 * message. Constaté sur l'écran rendu le 18/10/2026.
 *
 * On y ajoute donc celles qui ont RÉELLEMENT été jouées (au moins un résultat), quel qu'en
 * soit l'auteur, sans pour autant déverser tout le catalogue de la salle : une
 * mini-compétition sans résultat et créée par quelqu'un d'autre n'a rien à faire là.
 */
export const selectableMiniCompetitions = <T extends { id: string; name: string; createdBy?: string }>(
  toutes: T[],
  participants: MiniCompetitionParticipantInput[],
  moniteurUid: string
): T[] => {
  const jouees = new Set(
    participants.flatMap((p) => p.results.map((r) => r.miniCompetitionId).filter(Boolean) as string[])
  );
  return toutes.filter((m) => m.createdBy === moniteurUid || jouees.has(m.id));
};
