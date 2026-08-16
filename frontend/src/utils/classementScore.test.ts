import { describe, expect, it } from 'vitest';
import {
  summarizeValidatedResults,
  summaryFromColorCounts,
  scoreDeltaForValidation,
  isWithinSeasonWindow,
  type ColorCounts,
  type ValidatedBoulderResult,
} from './classementScore';

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

describe('summaryFromColorCounts', () => {
  it('renvoie 0 bloc et un rang -1 avec des compteurs vides', () => {
    expect(summaryFromColorCounts({})).toEqual({ bouldersValidated: 0, bestColorRank: -1 });
  });

  it('additionne tous les compteurs pour bouldersValidated', () => {
    expect(summaryFromColorCounts({ jaune: 3, bleu: 2, rose: 1 })).toEqual({
      bouldersValidated: 6,
      bestColorRank: 7, // rose
    });
  });

  it('ignore une couleur retombée à 0 pour le rang le plus difficile', () => {
    // Cas du retrait d'une validation (§3 de CONCEPTION-selecteur-marge-compteur-incremental.md) :
    // le rang doit redescendre à la couleur suivante encore non-nulle, pas rester bloqué.
    expect(summaryFromColorCounts({ vert: 2, rose: 0 })).toEqual({
      bouldersValidated: 2,
      bestColorRank: 1, // vert, pas rose (compteur retombé à 0)
    });
  });
});

describe('scoreDeltaForValidation', () => {
  it('delta positif pour une toute première validation', () => {
    expect(scoreDeltaForValidation('bleu', null, 1)).toBe(100);
  });

  it('delta négatif pour un retrait de validation', () => {
    expect(scoreDeltaForValidation('bleu', 1, null)).toBe(-100);
  });

  it('delta nul si rien ne change (reclic identique)', () => {
    expect(scoreDeltaForValidation('bleu', 3, 3)).toBe(0);
  });

  it('delta reflète un changement du nombre d\'essais sur le même bloc', () => {
    // 1er essai (100) -> 3e essai (80) : delta -20
    expect(scoreDeltaForValidation('bleu', 1, 3)).toBe(-20);
  });
});

describe('isWithinSeasonWindow', () => {
  it('vrai pour une date strictement à l\'intérieur de la fenêtre', () => {
    expect(isWithinSeasonWindow('2026-11-20T10:00:00.000Z', '2026-09-15', '2027-05-31')).toBe(true);
  });

  it('vrai sur les deux bornes incluses', () => {
    expect(isWithinSeasonWindow('2026-09-15T00:00:00.000Z', '2026-09-15', '2027-05-31')).toBe(true);
    expect(isWithinSeasonWindow('2027-05-31T23:59:59.999Z', '2026-09-15', '2027-05-31')).toBe(true);
  });

  it('faux juste avant le début ou juste après la fin', () => {
    expect(isWithinSeasonWindow('2026-09-14T23:59:59.999Z', '2026-09-15', '2027-05-31')).toBe(false);
    expect(isWithinSeasonWindow('2027-06-01T00:00:00.000Z', '2026-09-15', '2027-05-31')).toBe(false);
  });

  it('faux pendant l\'été, entre deux saisons', () => {
    expect(isWithinSeasonWindow('2027-07-14T10:00:00.000Z', '2026-09-15', '2027-05-31')).toBe(false);
  });
});

describe('cohérence incrémental vs recalcul complet', () => {
  // ✅ Test de non-régression central du chantier "compteur incrémental" : rejoue une
  // séquence d'événements (ajout, modification d'essais, retrait, ajout d'une autre
  // couleur...) à la fois via le chemin incrémental (summaryFromColorCounts +
  // scoreDeltaForValidation, comme ClientDaily.tsx) et via le recalcul complet
  // (summarizeValidatedResults, comme le script de réconciliation) — les deux doivent
  // toujours converger vers le même résultat final.
  interface Event {
    boulderId: string;
    color: string;
    attempts: number | null; // null = retrait (échec ou suppression)
  }

  const replay = (events: Event[]) => {
    // Chemin incrémental
    const state = new Map<string, { color: string; attempts: number }>();
    const colorCounts: ColorCounts = {};
    let score = 0;
    events.forEach(({ boulderId, color, attempts }) => {
      const previous = state.get(boulderId) || null;
      score += scoreDeltaForValidation(color, previous?.attempts ?? null, attempts);
      const delta = (attempts !== null ? 1 : 0) - (previous ? 1 : 0);
      if (delta !== 0) {
        const key = color as keyof ColorCounts;
        colorCounts[key] = ((colorCounts[key] as number) || 0) + delta;
      }
      if (attempts !== null) state.set(boulderId, { color, attempts });
      else state.delete(boulderId);
    });
    const { bouldersValidated, bestColorRank } = summaryFromColorCounts(colorCounts);

    // Recalcul complet, à partir du même état final
    const finalResults: ValidatedBoulderResult[] = Array.from(state.values());
    const full = summarizeValidatedResults(finalResults);

    return { incremental: { score, bouldersValidated, bestColorRank }, full };
  };

  it('converge après une séquence simple (ajout, retrait)', () => {
    const { incremental, full } = replay([
      { boulderId: 'b1', color: 'bleu', attempts: 1 },
      { boulderId: 'b2', color: 'rose', attempts: 2 },
      { boulderId: 'b2', color: 'rose', attempts: null }, // retrait
    ]);
    expect(incremental).toEqual(full);
    expect(incremental).toEqual({ score: 100, bouldersValidated: 1, bestColorRank: 2 }); // bleu
  });

  it('converge quand le dernier bloc de la couleur la plus difficile est retiré', () => {
    const { incremental, full } = replay([
      { boulderId: 'b1', color: 'vert', attempts: 1 },
      { boulderId: 'b2', color: 'rose', attempts: 1 },
      { boulderId: 'b2', color: 'rose', attempts: null }, // le rang doit redescendre à "vert"
    ]);
    expect(incremental).toEqual(full);
    expect(incremental.bestColorRank).toBe(1); // vert
  });

  it('converge sur une modification du nombre d\'essais (bouton "Enregistrer")', () => {
    const { incremental, full } = replay([
      { boulderId: 'b1', color: 'rouge', attempts: 1 },
      { boulderId: 'b1', color: 'rouge', attempts: 4 }, // corrigé après coup
    ]);
    expect(incremental).toEqual(full);
    expect(incremental.score).toBe(400 - 3 * 20); // dégression rouge
  });

  it('converge sur une séquence longue et désordonnée, plusieurs blocs et couleurs', () => {
    const { incremental, full } = replay([
      { boulderId: 'b1', color: 'jaune', attempts: 1 },
      { boulderId: 'b2', color: 'vert', attempts: 2 },
      { boulderId: 'b3', color: 'bleu', attempts: 1 },
      { boulderId: 'b1', color: 'jaune', attempts: null }, // échec finalement
      { boulderId: 'b4', color: 'rose', attempts: 3 },
      { boulderId: 'b3', color: 'bleu', attempts: 2 }, // essais corrigés
      { boulderId: 'b4', color: 'rose', attempts: null }, // retiré
      { boulderId: 'b5', color: 'rouge', attempts: 1 },
    ]);
    expect(incremental).toEqual(full);
  });
});
