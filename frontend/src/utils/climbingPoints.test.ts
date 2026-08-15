import { describe, expect, it } from 'vitest';
import { calculatePoints, calculateCompetitionPoints, type CustomScoringTable } from './climbingPoints';

describe('calculatePoints', () => {
  it('rapporte 0 point en cas d\'échec, quelle que soit la difficulté', () => {
    expect(calculatePoints('rose', 1, false)).toBe(0);
  });

  it('rapporte les points de base au premier essai réussi', () => {
    expect(calculatePoints('jaune', 1, true)).toBe(25);
    expect(calculatePoints('bleu', 1, true)).toBe(100);
    expect(calculatePoints('rose', 1, true)).toBe(1000);
  });

  it('déduit des points par essai supplémentaire', () => {
    // bleu: base 100, déduction 10/essai -> 3 essais = 2 essais en trop
    expect(calculatePoints('bleu', 3, true)).toBe(80);
  });

  it('ne descend jamais sous 0 même avec beaucoup d\'essais', () => {
    expect(calculatePoints('vert', 50, true)).toBe(0);
  });

  it('renvoie 0 pour une difficulté inconnue', () => {
    expect(calculatePoints('inconnue', 1, true)).toBe(0);
  });
});

describe('calculateCompetitionPoints', () => {
  it('mode "blocabrac" (par défaut) se comporte exactement comme calculatePoints', () => {
    expect(calculateCompetitionPoints({ difficulty: 'bleu' }, 3, true)).toBe(calculatePoints('bleu', 3, true));
    expect(calculateCompetitionPoints({ difficulty: 'bleu' }, 3, false, 'blocabrac')).toBe(0);
  });

  it('mode "blocs_valides" ignore le nombre d\'essais et utilise points_value', () => {
    expect(calculateCompetitionPoints({ difficulty: 'rouge', points_value: 340 }, 1, true, 'blocs_valides')).toBe(340);
    expect(calculateCompetitionPoints({ difficulty: 'rouge', points_value: 340 }, 7, true, 'blocs_valides')).toBe(340);
  });

  it('mode "blocs_valides" rapporte 0 si points_value est absent, et 0 en cas d\'échec', () => {
    expect(calculateCompetitionPoints({ difficulty: 'rouge' }, 1, true, 'blocs_valides')).toBe(0);
    expect(calculateCompetitionPoints({ difficulty: 'rouge', points_value: 340 }, 1, false, 'blocs_valides')).toBe(0);
  });

  it('mode "personnalise" applique le barème fourni, avec sa propre dégression', () => {
    const customScoring: CustomScoringTable = {
      rouge: { base: 500, deduction: 100 }
    };
    expect(calculateCompetitionPoints({ difficulty: 'rouge' }, 1, true, 'personnalise', customScoring)).toBe(500);
    expect(calculateCompetitionPoints({ difficulty: 'rouge' }, 3, true, 'personnalise', customScoring)).toBe(300);
  });

  it('mode "personnalise" rapporte 0 pour une couleur absente du barème personnalisé', () => {
    expect(calculateCompetitionPoints({ difficulty: 'rose' }, 1, true, 'personnalise', { rouge: { base: 500, deduction: 100 } })).toBe(0);
  });

  it('mode "personnalise" ne descend jamais sous 0', () => {
    const customScoring: CustomScoringTable = { rouge: { base: 50, deduction: 100 } };
    expect(calculateCompetitionPoints({ difficulty: 'rouge' }, 5, true, 'personnalise', customScoring)).toBe(0);
  });

  it('mode "officiel" renvoie toujours 0 : pas une somme de points, voir getOfficialParticipantTotals', () => {
    expect(calculateCompetitionPoints({ difficulty: 'rose' }, 1, true, 'officiel')).toBe(0);
  });
});
