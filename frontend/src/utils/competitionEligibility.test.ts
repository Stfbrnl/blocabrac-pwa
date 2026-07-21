import { describe, expect, it } from 'vitest';
import { canUserRegister } from './competitionEligibility';

describe('canUserRegister', () => {
  it('autorise un utilisateur sans niveau défini', () => {
    expect(canUserRegister({ level: undefined }, { minLevel: 'rouge' })).toBe(true);
  });

  it('autorise tout niveau quand la compétition n\'a aucune restriction', () => {
    expect(canUserRegister({ level: 'jaune' }, {})).toBe(true);
  });

  it('refuse un niveau strictement inférieur au minimum requis', () => {
    expect(canUserRegister({ level: 'vert' }, { minLevel: 'rouge' })).toBe(false);
  });

  it('accepte un niveau égal au minimum requis', () => {
    expect(canUserRegister({ level: 'rouge' }, { minLevel: 'rouge' })).toBe(true);
  });

  it('accepte un niveau supérieur au minimum quand il n\'y a pas de maximum', () => {
    expect(canUserRegister({ level: 'rose' }, { minLevel: 'rouge' })).toBe(true);
  });

  it('refuse un niveau strictement supérieur au maximum requis', () => {
    expect(canUserRegister({ level: 'rose' }, { maxLevel: 'violet' })).toBe(false);
  });

  it('accepte un niveau égal au maximum requis', () => {
    expect(canUserRegister({ level: 'violet' }, { maxLevel: 'violet' })).toBe(true);
  });

  it('accepte un niveau à l\'intérieur d\'une plage min/max', () => {
    expect(canUserRegister({ level: 'rouge' }, { minLevel: 'bleu', maxLevel: 'blanc' })).toBe(true);
  });

  it('refuse un niveau en dehors d\'une plage min/max', () => {
    expect(canUserRegister({ level: 'jaune' }, { minLevel: 'bleu', maxLevel: 'blanc' })).toBe(false);
  });
});
