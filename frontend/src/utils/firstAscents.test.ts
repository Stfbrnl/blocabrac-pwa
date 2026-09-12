import { describe, expect, it } from 'vitest';
import { shouldRecordFirstAscent, FIRST_ASCENT_LIST_MAX, type ShouldRecordFirstAscentInput } from './firstAscents';

const ELIGIBLE_COLORS = ['noir', 'blanc', 'rose'];

const baseInput: ShouldRecordFirstAscentInput = {
  success: true,
  color: 'noir',
  boulderType: 'daily',
  competitionActive: false,
  existing: [],
  uid: 'u1',
  optIn: true,
  eligibleColors: ELIGIBLE_COLORS,
};

describe('shouldRecordFirstAscent', () => {
  it('accepte le cas nominal (bloc noir, opt-in, liste vide)', () => {
    expect(shouldRecordFirstAscent(baseInput)).toBe(true);
  });

  it('refuse un échec (success: false)', () => {
    expect(shouldRecordFirstAscent({ ...baseInput, success: false })).toBe(false);
  });

  it('refuse sans opt-in', () => {
    expect(shouldRecordFirstAscent({ ...baseInput, optIn: false })).toBe(false);
  });

  it('refuse une couleur non éligible', () => {
    expect(shouldRecordFirstAscent({ ...baseInput, color: 'jaune' })).toBe(false);
  });

  it('refuse sans couleur résolue', () => {
    expect(shouldRecordFirstAscent({ ...baseInput, color: undefined })).toBe(false);
    expect(shouldRecordFirstAscent({ ...baseInput, color: null })).toBe(false);
  });

  it('refuse un bloc de compétition (type "competition")', () => {
    expect(shouldRecordFirstAscent({ ...baseInput, boulderType: 'competition' })).toBe(false);
  });

  it('refuse un bloc quotidien réutilisé activement en compétition', () => {
    expect(shouldRecordFirstAscent({ ...baseInput, competitionActive: true })).toBe(false);
  });

  it('refuse quand la liste est déjà pleine', () => {
    const full = Array.from({ length: FIRST_ASCENT_LIST_MAX }, (_, i) => ({
      uid: `other-${i}`, displayName: 'X', at: '2026-01-01T00:00:00.000Z',
    }));
    expect(shouldRecordFirstAscent({ ...baseInput, existing: full })).toBe(false);
  });

  it('accepte quand la liste compte exactement une place restante', () => {
    const almostFull = Array.from({ length: FIRST_ASCENT_LIST_MAX - 1 }, (_, i) => ({
      uid: `other-${i}`, displayName: 'X', at: '2026-01-01T00:00:00.000Z',
    }));
    expect(shouldRecordFirstAscent({ ...baseInput, existing: almostFull })).toBe(true);
  });

  it('refuse si le grimpeur figure déjà dans la liste', () => {
    const existing = [{ uid: 'u1', displayName: 'Moi', at: '2026-01-01T00:00:00.000Z' }];
    expect(shouldRecordFirstAscent({ ...baseInput, existing })).toBe(false);
  });
});
