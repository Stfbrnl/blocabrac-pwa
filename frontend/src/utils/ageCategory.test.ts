import { describe, expect, it } from 'vitest';
import { getSeasonAge, getFfmeCategory, FFME_AGE_BANDS, UNKNOWN_CATEGORY } from './ageCategory';

describe('getSeasonAge', () => {
  const referenceDate = new Date('2026-07-21');

  it('calcule l\'âge atteint dans l\'année depuis une date de naissance', () => {
    expect(getSeasonAge('2010-03-15', undefined, referenceDate)).toBe(16);
  });

  it('ignore le mois/jour de naissance (règle FFME : seule l\'année compte)', () => {
    // Né le 31 décembre ou le 1er janvier de la même année : même résultat.
    expect(getSeasonAge('2010-12-31', undefined, referenceDate)).toBe(16);
    expect(getSeasonAge('2010-01-01', undefined, referenceDate)).toBe(16);
  });

  it('retombe sur l\'âge legacy si aucune date de naissance n\'est fournie', () => {
    expect(getSeasonAge(undefined, 34, referenceDate)).toBe(34);
  });

  it('privilégie la date de naissance sur l\'âge legacy si les deux sont présents', () => {
    expect(getSeasonAge('2010-03-15', 99, referenceDate)).toBe(16);
  });

  it('retourne undefined si ni date de naissance ni âge legacy ne sont fournis', () => {
    expect(getSeasonAge(undefined, undefined, referenceDate)).toBeUndefined();
  });
});

describe('getFfmeCategory', () => {
  it('retourne "Inconnu" si l\'âge est indéfini', () => {
    expect(getFfmeCategory(undefined)).toBe(UNKNOWN_CATEGORY);
  });

  it('couvre les bornes de chaque tranche FFME sans trou ni chevauchement', () => {
    expect(getFfmeCategory(5)).toBe(UNKNOWN_CATEGORY); // en dessous de U8
    expect(getFfmeCategory(6)).toBe('U8 (6-7 ans)');
    expect(getFfmeCategory(7)).toBe('U8 (6-7 ans)');
    expect(getFfmeCategory(8)).toBe('U10 (8-9 ans)');
    expect(getFfmeCategory(9)).toBe('U10 (8-9 ans)');
    expect(getFfmeCategory(10)).toBe('U12 (10-11 ans)');
    expect(getFfmeCategory(11)).toBe('U12 (10-11 ans)');
    expect(getFfmeCategory(12)).toBe('U14 (12-13 ans)');
    expect(getFfmeCategory(13)).toBe('U14 (12-13 ans)');
    expect(getFfmeCategory(14)).toBe('U16 (14-15 ans)');
    expect(getFfmeCategory(15)).toBe('U16 (14-15 ans)');
    expect(getFfmeCategory(16)).toBe('U18 (16-17 ans)');
    expect(getFfmeCategory(17)).toBe('U18 (16-17 ans)');
    expect(getFfmeCategory(18)).toBe('U20 (18-19 ans)');
    expect(getFfmeCategory(19)).toBe('U20 (18-19 ans)');
    expect(getFfmeCategory(20)).toBe('Séniors (20-39 ans)');
    expect(getFfmeCategory(39)).toBe('Séniors (20-39 ans)');
    expect(getFfmeCategory(40)).toBe('Vétérans 1 (40-49 ans)');
    expect(getFfmeCategory(49)).toBe('Vétérans 1 (40-49 ans)');
    expect(getFfmeCategory(50)).toBe('Vétérans 2 (50 ans et +)');
    expect(getFfmeCategory(80)).toBe('Vétérans 2 (50 ans et +)');
  });

  it('n\'a pas de trou entre bandes consécutives', () => {
    for (let i = 0; i < FFME_AGE_BANDS.length - 1; i++) {
      const current = FFME_AGE_BANDS[i];
      const next = FFME_AGE_BANDS[i + 1];
      expect(current.maxAge).toBeDefined();
      expect((current.maxAge as number) + 1).toBe(next.minAge);
    }
  });
});
