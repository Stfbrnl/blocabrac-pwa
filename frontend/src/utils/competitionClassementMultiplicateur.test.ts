// Ce que le multiplicateur de points fait AU CLASSEMENT
// (docs/plans/2026-11-03-CN-plan-multiplicateur-v2.md §D2, §3 commit 5).
//
// Le plan prévoit « normalement rien à changer : ça coule ». C'est vrai, et c'est précisément
// pour cela que ce fichier existe : un comportement qui tombe juste sans une ligne de code
// n'est garanti par rien, et la prochaine réécriture du départage le changera sans le savoir.
// Ces tests figent la décision, ils ne la découvrent pas.
//
// ⚠️ LA DÉCISION, qui est ANNONÇABLE et doit être annoncée : un bloc doublé compte double
// PARTOUT, départage compris. `getParticipantScores` mesure la dureté d'un bloc par
// `calculateCompetitionPoints(bloc, 1, true, mode)`, donc un violet ×2 (400) se mesure aussi
// dur qu'un rouge (400). C'est le choix déjà accepté pour le mode `blocs_valides` : dans un
// mode à POINTS, la dureté EST la valeur en points. Une seconde voie de calcul de la dureté
// serait une divergence de plus dans un dépôt qui en a déjà payé quatre.
//
// ⚠️ ET SA LIMITE, qui n'est pas la même chose : le classement PAR NIVEAU MAX n'est PAS
// affecté. Il partitionne par `boulderColorKey` (la couleur du bloc), jamais par ses points —
// un violet ×2 reste un violet, et ne fait pas « monter » son grimpeur dans le paquet rouge.
// Les deux moitiés sont testées, parce qu'une seule d'entre elles ne décrirait pas le système.
import { describe, expect, it } from 'vitest';
import {
  getParticipantScores,
  getClassementByCategory,
  resolveClassementLevel,
  type ParticipantBase,
} from './competitionClassement';

interface TestParticipant extends ParticipantBase {
  first_name: string;
}

const anna: TestParticipant = { user_id: 'anna', first_name: 'Anna', gender: 'F', legacyAge: 30, level: 'bleu' };
const boris: TestParticipant = { user_id: 'boris', first_name: 'Boris', gender: 'M', legacyAge: 30, level: 'bleu' };
const participants = [anna, boris];

// Le mur neuf (`v2`) compte double ; le reste de la salle non.
const boulders = [
  { id: 'r1', color: 'rouge' },
  { id: 'v1', color: 'violet' },
  { id: 'v2', color: 'violet', points_multiplier: 2 },
];

describe('Multiplicateur et classement à points', () => {
  it('un bloc doublé pèse double dans le total, en mode blocabrac', () => {
    // Anna réussit le violet doublé au flash : 200 × 2 = 400.
    // Boris réussit le violet normal au flash : 200.
    const scores = getParticipantScores(
      [
        { user_id: 'anna', boulder_id: 'v2', success: true, attempts: 1 },
        { user_id: 'boris', boulder_id: 'v1', success: true, attempts: 1 },
      ],
      participants,
      boulders
    );
    expect(scores.map(s => [s.participant.user_id, s.score])).toEqual([['anna', 400], ['boris', 200]]);
  });

  it('en mode à plancher, le total double exactement ce que l\'écran de validation affiche', () => {
    // 3 essais sur un violet : l'écran affiche 158 (voir competitionPointsMultiplier.test.ts),
    // donc 316 et jamais 317 — l'arrondi a lieu avant le doublement.
    const scores = getParticipantScores(
      [{ user_id: 'anna', boulder_id: 'v2', success: true, attempts: 3 }],
      participants,
      boulders,
      'blocabrac_plancher'
    );
    expect(scores[0].score).toBe(316);
  });

  it('LE MULTIPLICATEUR COULE DANS LE DÉPARTAGE : un violet ×2 se mesure aussi dur qu\'un rouge', () => {
    // À total égal (400 chacun), le départage compare le bloc le plus dur réussi. Anna a un
    // violet ×2 (dureté 400), Boris un rouge au flash (dureté 400) : mêmes points, même
    // dureté, même nombre d'essais → RÉELLEMENT ex æquo, donc l'ordre d'arrivée est préservé
    // et aucun des deux ne passe devant l'autre.
    const scores = getParticipantScores(
      [
        { user_id: 'anna', boulder_id: 'v2', success: true, attempts: 1 },
        { user_id: 'boris', boulder_id: 'r1', success: true, attempts: 1 },
      ],
      participants,
      boulders
    );
    expect(scores.map(s => s.score)).toEqual([400, 400]);
    expect(scores.map(s => s.tieBreak[0].hardness)).toEqual([400, 400]);
    // ⚠️ Nomme ce qui doit DIFFÉRER : sans le multiplicateur, la dureté du violet d'Anna
    // serait 200 et Boris passerait devant. C'est cette ligne qui fait de l'égalité ci-dessus
    // une mesure et non un hasard.
    const sansMultiplicateur = getParticipantScores(
      [
        { user_id: 'anna', boulder_id: 'v1', success: true, attempts: 1 },
        { user_id: 'boris', boulder_id: 'r1', success: true, attempts: 1 },
      ],
      participants,
      boulders
    );
    expect(sansMultiplicateur.map(s => s.participant.user_id)).toEqual(['boris', 'anna']);
    expect(sansMultiplicateur.map(s => s.score)).toEqual([400, 200]);
  });

  it('un bloc doublé peut faire passer devant à nombre de blocs égal', () => {
    const scores = getParticipantScores(
      [
        { user_id: 'anna', boulder_id: 'v2', success: true, attempts: 1 },
        { user_id: 'boris', boulder_id: 'v1', success: true, attempts: 1 },
      ],
      participants,
      boulders
    );
    expect(scores.map(s => s.participant.user_id)).toEqual(['anna', 'boris']);
    expect(scores.map(s => s.boulders)).toEqual([1, 1]);
    // ⚠️ Sans ces deux lignes, ce test est INCAPABLE DE ROUGIR : si le multiplicateur cessait
    // d'être appliqué, Anna et Boris seraient à 200 chacun, réellement ex æquo, et l'ordre
    // d'arrivée rendrait quand même ['anna', 'boris'] — le décor produirait l'effet attendu à
    // la place du code. Vérifié en mutant la multiplication : l'assertion d'ordre restait
    // verte, celles-ci rougissent.
    expect(scores.map(s => s.score)).toEqual([400, 200]);
    expect(scores[0].score).toBeGreaterThan(scores[1].score);
  });
});

describe('Multiplicateur et classement par niveau max : AUCUN effet', () => {
  it('un violet ×2 reste un violet pour le paquet de niveau — la couleur n\'est pas la valeur', () => {
    const resultats = [
      { user_id: 'anna', boulder_id: 'v2', success: true, attempts: 1 },
      { user_id: 'boris', boulder_id: 'v1', success: true, attempts: 1 },
    ];
    const scores = getParticipantScores(resultats, participants, boulders);
    // Les deux ont réussi un VIOLET, l'une doublée, l'autre pas : même meilleure couleur.
    expect(scores.map(s => s.bestColorSucceeded)).toEqual(['violet', 'violet']);
    expect(scores.map(s => resolveClassementLevel(s.participant, s.bestColorSucceeded))).toEqual(['violet', 'violet']);

    const groupes = getClassementByCategory(resultats, participants, boulders, 'level_max');
    expect(groupes).toHaveLength(1);
    expect(groupes[0].category).toBe('Niveau violet');
    expect(groupes[0].participants).toHaveLength(2);
    // ⚠️ Ce qui doit DIFFÉRER : si le niveau max se lisait dans les points, Anna (400, comme
    // un rouge) serait seule dans un paquet « Niveau rouge » et il y aurait DEUX groupes.
    expect(groupes.map(g => g.category)).not.toContain('Niveau rouge');
  });

  it('un rouge réellement réussi, lui, fait bien changer de paquet — le contrôle en sens inverse', () => {
    const resultats = [
      { user_id: 'anna', boulder_id: 'r1', success: true, attempts: 1 },
      { user_id: 'boris', boulder_id: 'v1', success: true, attempts: 1 },
    ];
    const groupes = getClassementByCategory(resultats, participants, boulders, 'level_max');
    expect(groupes.map(g => g.category)).toEqual(['Niveau rouge', 'Niveau violet']);
  });
});
