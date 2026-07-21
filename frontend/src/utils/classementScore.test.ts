import { describe, expect, it } from 'vitest';
import { summarizeValidatedResults } from './classementScore';

describe('summarizeValidatedResults', () => {
  it('renvoie un score et un rang -1 sans aucun résultat', () => {
    expect(summarizeValidatedResults([])).toEqual({ score: 0, bouldersValidated: 0, bestColorRank: -1 });
  });

  it('additionne les points de chaque bloc validé', () => {
    const summary = summarizeValidatedResults([
      { color: 'vert', attempts: 1 },
      { color: 'bleu', attempts: 1 },
    ]);
    expect(summary.score).toBe(50 + 100);
    expect(summary.bouldersValidated).toBe(2);
  });

  it('retient le rang de la couleur la plus difficile, pas la dernière validée', () => {
    const summary = summarizeValidatedResults([
      { color: 'rose', attempts: 1 },
      { color: 'jaune', attempts: 1 },
    ]);
    // rose (index 7) est plus difficile que jaune (index 0), peu importe l'ordre d'entrée
    expect(summary.bestColorRank).toBe(7);
  });

  it('applique la déduction liée au nombre d\'essais', () => {
    const summary = summarizeValidatedResults([{ color: 'bleu', attempts: 3 }]);
    expect(summary.score).toBe(80); // 100 - 2*10, cohérent avec climbingPoints.test.ts
  });
});
