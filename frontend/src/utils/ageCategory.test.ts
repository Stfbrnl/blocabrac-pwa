import { describe, expect, it } from 'vitest';
import { getSeasonAge, getCivilAge, getFfmeCategory, formatAgeDisplay, formatAgeHelper, AGE_INCONNU, AGE_HELPER_SANS_DATE, FFME_AGE_BANDS, UNKNOWN_CATEGORY } from './ageCategory';

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

describe('getCivilAge', () => {
  // ⚠️ Ces tests nomment ce qui doit DIFFÉRER de getSeasonAge, pas seulement ce qui doit être
  // égal : un test qui ne vérifierait que « 51 » le jour de l'anniversaire serait satisfait
  // par un getCivilAge qui serait un alias de getSeasonAge.
  it('ne compte pas un anniversaire pas encore passé (le cas qui a motivé la séparation)', () => {
    // Né le 29/11/1975, observé le 10/11/2026 : 50 ans civils, mais 51 ans de saison.
    expect(getCivilAge('1975-11-29', new Date(2026, 10, 10))).toBe(50);
    expect(getSeasonAge('1975-11-29', undefined, new Date(2026, 10, 10))).toBe(51);
  });

  it('compte l\'anniversaire du jour comme atteint', () => {
    expect(getCivilAge('1975-11-29', new Date(2026, 10, 28))).toBe(50);
    expect(getCivilAge('1975-11-29', new Date(2026, 10, 29))).toBe(51);
  });

  it('distingue le 31 décembre du 1er janvier, là où getSeasonAge les confond', () => {
    const refJanvier = new Date(2026, 0, 1);
    expect(getCivilAge('2010-12-31', refJanvier)).toBe(15);
    expect(getCivilAge('2010-01-01', refJanvier)).toBe(16);
    // La fonction de saison, elle, rend 16 pour les deux — c'est sa raison d'être.
    expect(getSeasonAge('2010-12-31', undefined, refJanvier)).toBe(16);
    expect(getSeasonAge('2010-01-01', undefined, refJanvier)).toBe(16);
  });

  it('traite un 29 février sans décaler l\'année dans une année non bissextile', () => {
    expect(getCivilAge('2000-02-29', new Date(2026, 1, 28))).toBe(25);
    expect(getCivilAge('2000-02-29', new Date(2026, 2, 1))).toBe(26);
  });

  it('ne dérive AUCUN âge civil d\'un compte hérité sans date de naissance', () => {
    // Le champ `age` est un nombre figé sans date rattachée : il ne peut pas produire un âge
    // civil, et en rendre un serait affirmer une précision qu'on n'a pas.
    expect(getCivilAge(undefined)).toBeUndefined();
    expect(getCivilAge('')).toBeUndefined();
    // Pendant que getSeasonAge, lui, sait encore répondre pour ce compte.
    expect(getSeasonAge(undefined, 34, new Date(2026, 10, 10))).toBe(34);
  });

  it('rend undefined sur une chaîne illisible ou incomplète', () => {
    expect(getCivilAge('2012')).toBeUndefined();
    expect(getCivilAge('2012-06')).toBeUndefined();
    expect(getCivilAge('abcd-ef-gh')).toBeUndefined();
  });

  it('rend un nombre négatif sur une date future, pour que la saisie fautive se voie', () => {
    expect(getCivilAge('2030-01-01', new Date(2026, 10, 10))).toBe(-4);
  });

  it('vaut toujours l\'âge de saison ou celui-ci moins un, quelle que soit la date', () => {
    // Invariant qui lie les deux fonctions : la différence n'est jamais de plus d'un an, et
    // jamais dans l'autre sens. Balaie les 366 jours d'une année bissextile de référence.
    const reference = new Date(2024, 0, 1);
    for (let i = 0; i < 366; i++) {
      const jour = new Date(reference.getFullYear(), 0, 1 + i);
      const iso = `1975-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`;
      const saison = getSeasonAge(iso, undefined, new Date(2026, 5, 15)) as number;
      const civil = getCivilAge(iso, new Date(2026, 5, 15)) as number;
      expect(saison - civil === 0 || saison - civil === 1).toBe(true);
    }
  });
});

describe('formatAgeDisplay', () => {
  const ref = new Date(2026, 10, 10); // 10 novembre 2026

  it('affiche l\'âge civil et la catégorie, jamais l\'âge de saison', () => {
    // Né le 29/11/1975 : 50 ans civils ce jour-là, 51 ans de saison. Le 51 ne doit
    // apparaître nulle part dans la chaîne — c'est tout l'objet de ce format.
    const texte = formatAgeDisplay('1975-11-29', undefined, ref);
    expect(texte).toBe('50 ans · Vétérans 2');
    expect(texte).not.toContain('51');
  });

  it('utilise le libellé COURT de la catégorie, pas celui qui répète le nombre', () => {
    expect(formatAgeDisplay('2013-06-15', undefined, ref)).toBe('13 ans · U14');
    // Le libellé complet ('U14 (12-13 ans)') ferait doublon avec le « 13 ans » précédent.
    expect(formatAgeDisplay('2013-06-15', undefined, ref)).not.toContain('(12-13 ans)');
  });

  it('bascule de catégorie au 1er janvier, à âge civil INCHANGÉ', () => {
    // Né le 20/12/2012. Dans les deux mesures ci-dessous l'âge civil est le même (13 ans,
    // anniversaire passé) — et pourtant la catégorie change, parce qu'elle ne dépend que de
    // l'année. C'est la démonstration que les deux grandeurs sont indépendantes : aucune
    // des deux ne se déduit de l'autre.
    expect(formatAgeDisplay('2012-12-20', undefined, new Date(2025, 11, 25))).toBe('13 ans · U14');
    expect(formatAgeDisplay('2012-12-20', undefined, new Date(2026, 0, 5))).toBe('13 ans · U16');
  });

  it('dit ce qui manque pour un compte hérité, et marque le nombre comme saisi', () => {
    expect(formatAgeDisplay(undefined, 34, ref)).toBe('Date inconnue · 34 ans (saisi) · Séniors');
  });

  it('rend un libellé explicite quand aucun âge n\'est dérivable', () => {
    expect(formatAgeDisplay(undefined, undefined, ref)).toBe(AGE_INCONNU);
    expect(formatAgeDisplay('', undefined, ref)).toBe(AGE_INCONNU);
  });

  it('affiche « Inconnu » comme catégorie sous la borne basse, sans masquer l\'âge', () => {
    // 4 ans : en dessous de U8, donc aucune catégorie — mais l'âge reste affiché, et c'est
    // ainsi que l'admin voit POURQUOI ce grimpeur sort des classements par catégorie.
    expect(formatAgeDisplay('2022-01-01', undefined, ref)).toBe('4 ans · Inconnu');
  });

  it('n\'invente aucun âge courant à partir du seul champ hérité', () => {
    // Garde-fou de doctrine : si un jour quelqu'un faisait retomber l'âge civil sur
    // `legacyAge`, cette chaîne annoncerait « 34 ans » sans dire que la date manque.
    expect(formatAgeDisplay(undefined, 34, ref)).toContain('Date inconnue');
  });
});

describe('formatAgeHelper', () => {
  const ref = new Date(2026, 10, 10);

  it('annonce l\'âge civil, la catégorie, et la règle qui la produit', () => {
    const texte = formatAgeHelper('1975-11-29', ref);
    expect(texte).toContain('50 ans');
    expect(texte).toContain('catégorie Vétérans 2');
    expect(texte).toContain('année de naissance');
    // Le nombre qui a déclenché le chantier ne doit apparaître nulle part.
    expect(texte).not.toContain('51');
  });

  it('invite à saisir une date plutôt que d\'afficher un nombre, quand elle manque', () => {
    expect(formatAgeHelper(undefined, ref)).toBe(AGE_HELPER_SANS_DATE);
    expect(formatAgeHelper('', ref)).toBe(AGE_HELPER_SANS_DATE);
    expect(formatAgeHelper(undefined, ref)).not.toMatch(/\d+ ans/);
  });
});
