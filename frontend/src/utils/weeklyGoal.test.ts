import { describe, it, expect } from 'vitest';
import {
  computeWeeklyGoalProgress,
  legacyGoalToItems,
  upsertGoalItem,
  type WeeklyGoalItem,
  type WeeklyValidation,
} from './weeklyGoal';

describe('computeWeeklyGoalProgress', () => {
  const colorById = new Map<string, string>([
    ['b1', 'rouge'],
    ['b2', 'rouge'],
    ['b3', 'noir'],
    ['b4', 'jaune'],
  ]);

  it('cumule un objectif "all" sur toutes les validations de la semaine', () => {
    const items: WeeklyGoalItem[] = [{ type: 'all', target: 3 }];
    const validations: WeeklyValidation[] = [
      { boulderId: 'b1', createdAt: new Date() },
      { boulderId: 'b3', createdAt: new Date() },
    ];
    const result = computeWeeklyGoalProgress(items, validations, colorById);
    expect(result[0]).toMatchObject({ current: 2, target: 3, done: false });
  });

  it('ne compte pour un objectif "color" que les blocs de cette couleur actuelle', () => {
    const items: WeeklyGoalItem[] = [{ type: 'color', color: 'rouge', target: 2 }];
    const validations: WeeklyValidation[] = [
      { boulderId: 'b1', createdAt: new Date() },
      { boulderId: 'b2', createdAt: new Date() },
      { boulderId: 'b3', createdAt: new Date() },
    ];
    const result = computeWeeklyGoalProgress(items, validations, colorById);
    expect(result[0]).toMatchObject({ current: 2, target: 2, done: true });
  });

  it('cumule plusieurs objectifs "color" indépendamment (ex. 2 rouges + 3 noirs)', () => {
    const items: WeeklyGoalItem[] = [
      { type: 'color', color: 'rouge', target: 2 },
      { type: 'color', color: 'noir', target: 3 },
    ];
    const validations: WeeklyValidation[] = [
      { boulderId: 'b1', createdAt: new Date() },
      { boulderId: 'b2', createdAt: new Date() },
      { boulderId: 'b3', createdAt: new Date() },
    ];
    const result = computeWeeklyGoalProgress(items, validations, colorById);
    expect(result[0]).toMatchObject({ current: 2, target: 2, done: true });
    expect(result[1]).toMatchObject({ current: 1, target: 3, done: false });
  });

  it('un objectif "boulder" est atteint dès que ce bloc précis apparaît dans les validations', () => {
    const items: WeeklyGoalItem[] = [{ type: 'boulder', boulderId: 'b4', boulderLabel: 'jaune n°6 - Dalle' }];
    const result1 = computeWeeklyGoalProgress(items, [{ boulderId: 'b1', createdAt: new Date() }], colorById);
    expect(result1[0]).toMatchObject({ current: 0, target: 1, done: false });

    const result2 = computeWeeklyGoalProgress(items, [{ boulderId: 'b4', createdAt: new Date() }], colorById);
    expect(result2[0]).toMatchObject({ current: 1, target: 1, done: true });
  });

  it("mélange les trois types d'objectifs dans une même liste", () => {
    const items: WeeklyGoalItem[] = [
      { type: 'color', color: 'rouge', target: 1 },
      { type: 'boulder', boulderId: 'b3', boulderLabel: 'noir n°10 - Réta Adultes' },
      { type: 'all', target: 5 },
    ];
    const validations: WeeklyValidation[] = [
      { boulderId: 'b1', createdAt: new Date() },
      { boulderId: 'b3', createdAt: new Date() },
    ];
    const result = computeWeeklyGoalProgress(items, validations, colorById);
    expect(result[0].done).toBe(true); // 1 rouge sur 1
    expect(result[1].done).toBe(true); // bloc précis fait
    expect(result[2]).toMatchObject({ current: 2, target: 5, done: false });
  });
});

describe('legacyGoalToItems', () => {
  it('convertit un ancien objectif numérique en un objectif "all" équivalent', () => {
    expect(legacyGoalToItems(5)).toEqual([{ type: 'all', target: 5 }]);
  });

  it('retourne une liste vide pour null/undefined/0', () => {
    expect(legacyGoalToItems(null)).toEqual([]);
    expect(legacyGoalToItems(undefined)).toEqual([]);
    expect(legacyGoalToItems(0)).toEqual([]);
  });
});

describe('upsertGoalItem', () => {
  it('ajoute un nouvel objectif quand aucun ne correspond', () => {
    const items: WeeklyGoalItem[] = [{ type: 'color', color: 'rouge', target: 2 }];
    const result = upsertGoalItem(items, { type: 'color', color: 'noir', target: 3 });
    expect(result).toHaveLength(2);
  });

  it('remplace (ne duplique pas) un objectif "color" de même couleur', () => {
    const items: WeeklyGoalItem[] = [{ type: 'color', color: 'rouge', target: 2 }];
    const result = upsertGoalItem(items, { type: 'color', color: 'rouge', target: 5 });
    expect(result).toEqual([{ type: 'color', color: 'rouge', target: 5 }]);
  });

  it('remplace un objectif "boulder" de même id', () => {
    const items: WeeklyGoalItem[] = [{ type: 'boulder', boulderId: 'b1', boulderLabel: 'ancien' }];
    const result = upsertGoalItem(items, { type: 'boulder', boulderId: 'b1', boulderLabel: 'nouveau' });
    expect(result).toEqual([{ type: 'boulder', boulderId: 'b1', boulderLabel: 'nouveau' }]);
  });

  it('remplace l\'objectif "all" existant plutôt que d\'en ajouter un second', () => {
    const items: WeeklyGoalItem[] = [{ type: 'all', target: 5 }];
    const result = upsertGoalItem(items, { type: 'all', target: 8 });
    expect(result).toEqual([{ type: 'all', target: 8 }]);
  });
});
