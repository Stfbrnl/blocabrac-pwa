import { describe, expect, it } from 'vitest';
import { calculatePoints } from './climbingPoints';

describe('calculatePoints', () => {
  it('rapporte 0 point en cas d\'échec, quelle que soit la difficulté', () => {
    expect(calculatePoints('rose', 1, false)).toBe(0);
  });

  it('rapporte les points de base au premier essai réussi', () => {
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
