import { describe, it, expect } from 'vitest';
import {
  evaluerActiviteSalle,
  normaliserDateSeance,
  type SeanceVoyant,
} from './salleEnActivite';

/**
 * ⚠️ CE FICHIER EXISTE PARCE QUE LE VOYANT A ÉTÉ LIVRÉ CASSÉ LE 07/11/2026, et corrigé le
 * même jour après une mesure de production.
 *
 * Il interrogeait `where('date', '==', '2026-11-07')` — une égalité de **chaîne** — alors que
 * les trois documents `courses` de production portent tous un **Timestamp**. Il ne trouvait
 * donc jamais rien et affichait « aucune activité détectée » quoi qu'il arrive : **une erreur
 * dans le sens rassurant**, c'est-à-dire la pire possible pour un instrument dont le rôle est
 * de dire quand on peut déployer les règles Firestore sans risque.
 *
 * 🔴 **LA CAUSE DE L'ERREUR, et c'est elle qui vaut d'être retenue** : j'ai lu le type
 * `SessionLike.date: string` (et `CLAUDE.md`, qui l'énonçait comme la forme du champ) au lieu
 * de **mesurer la production**. Un type d'interface décrit ce qu'une fonction **consomme**,
 * pas ce qu'une collection **stocke** — ici la chaîne est une forme *dérivée*, produite par
 * chaque écran avant l'appel (`CoursesList.tsx`'s `convertFirestoreDate` + `toDateStr`,
 * `CourseDetail.tsx`, `ClientCourseSession.tsx`).
 *
 * 🔴 **ET LE FILET D'ORIGINE ÉTAIT ENTIÈREMENT VERT**, parce que son jeu de données n'utilisait
 * que des dates en chaîne — une forme qui **n'existe pas en production**. C'est la question de
 * méthode du dépôt, appliquée à la lettre : *quels défauts ce jeu de données est-il
 * physiquement incapable d'exprimer ?* Celui-là, et il était déjà là.
 */

const MAINTENANT = new Date(2026, 10, 7, 18, 0, 0);

const timestamp = (iso: string) => ({ toDate: () => new Date(iso) });

describe('normaliserDateSeance — toutes les formes que le champ peut prendre', () => {
  it('un Timestamp Firestore (LA forme de production) rend le jour', () => {
    // Formes exactes des trois documents de prod, mesurées le 07/11/2026.
    expect(normaliserDateSeance(timestamp('2026-06-20T00:00:00.000Z'))).toBe('2026-06-20');
    expect(normaliserDateSeance(timestamp('2026-10-13T13:20:07.362Z'))).toBe('2026-10-13');
    expect(normaliserDateSeance(timestamp('2026-06-19T00:00:00.000Z'))).toBe('2026-06-19');
  });

  it('un Timestamp sérialisé, porteur de secondes, rend le jour', () => {
    expect(normaliserDateSeance({ seconds: Date.UTC(2026, 10, 7) / 1000 })).toBe('2026-11-07');
  });

  it('un objet Date rend le jour', () => {
    expect(normaliserDateSeance(new Date('2026-11-07T22:30:00.000Z'))).toBe('2026-11-07');
  });

  it('une chaîne au format court est rendue telle quelle', () => {
    expect(normaliserDateSeance('2026-11-07')).toBe('2026-11-07');
  });

  it('une chaîne ISO complète rend le jour', () => {
    expect(normaliserDateSeance('2026-11-07T18:00:00.000Z')).toBe('2026-11-07');
  });

  it('⚠️ la conversion suit celle des AUTRES ÉCRANS : le jour UTC, jamais le jour local', () => {
    // CoursesList, CourseDetail et ClientCourseSession font tous toISOString().split sur T.
    // Un voyant qui déciderait du jour autrement serait en désaccord avec l'écran du moniteur
    // sur la date d'une MÊME séance. Une seconde convention de date est une divergence, pas
    // une amélioration — et celle-ci se verrait un soir, sur deux écrans côte à côte.
    expect(normaliserDateSeance(timestamp('2026-11-07T23:59:59.000Z'))).toBe('2026-11-07');
    expect(normaliserDateSeance(timestamp('2026-11-08T00:00:01.000Z'))).toBe('2026-11-08');
  });

  it('rend null — et ne LÈVE pas — sur toute valeur illisible', () => {
    // ⚠️ getSessionStatus découpe la chaîne sur le tiret : une valeur non-chaîne le ferait
    // LEVER, donc planter le tableau de bord d'administration entier. Rendre null est le
    // seul comportement sûr, et c'est pourquoi la normalisation vit avant l'appel.
    expect(normaliserDateSeance(null)).toBeNull();
    expect(normaliserDateSeance(undefined)).toBeNull();
    expect(normaliserDateSeance(42)).toBeNull();
    expect(normaliserDateSeance('pas une date')).toBeNull();
    expect(normaliserDateSeance({})).toBeNull();
    expect(normaliserDateSeance(new Date('invalide'))).toBeNull();
    expect(normaliserDateSeance(timestamp('invalide'))).toBeNull();
  });
});

describe('evaluerActiviteSalle devant la forme de production', () => {
  it('🔴 voit une séance ACTIVE dont la date est un Timestamp', () => {
    // LE test qui aurait attrapé le défaut livré.
    const v = evaluerActiviteSalle(
      [{ id: 's1', name: 'Groupe jeunes', date: timestamp(MAINTENANT.toISOString()), activatedAt: 'x' }],
      null,
      MAINTENANT
    );
    expect(v.niveau).toBe('seance');
    expect(v.seancesActives).toHaveLength(1);
    expect(v.seancesIllisibles).toHaveLength(0);
  });

  it('une séance à la date ILLISIBLE est comptée et annoncée, jamais écartée en silence', () => {
    const v = evaluerActiviteSalle(
      [
        { id: 'ok', date: timestamp(MAINTENANT.toISOString()), activatedAt: 'x' },
        { id: 'nawak', date: 42, activatedAt: 'x' },
      ] as SeanceVoyant[],
      null,
      MAINTENANT
    );
    expect(v.seancesExaminees).toBe(2);
    expect(v.seancesActives).toHaveLength(1);
    expect(v.seancesIllisibles.map((x) => x.id)).toEqual(['nawak']);
    // ⚠️ Et la portée le DIT : une séance qu'on ne sait pas dater est précisément celle qui
    // pourrait être active sans qu'on le voie.
    expect(v.portee).toMatch(/illisible/);
  });

  it('ne LÈVE pas sur une collection entièrement illisible', () => {
    expect(() => evaluerActiviteSalle(
      [{ id: 'a', date: null }, { id: 'b', date: {} }] as SeanceVoyant[],
      null,
      MAINTENANT
    )).not.toThrow();
  });

  it('la portée annonce le DÉNOMINATEUR réellement examiné, pas une intention', () => {
    // Le premier voyant annonçait « mesuré sur les séances du jour » alors que sa requête
    // n'en trouvait aucune : une portée qui décrivait l'intention et non la mesure.
    const v = evaluerActiviteSalle(
      [
        { id: 'a', date: timestamp('2026-06-20T00:00:00.000Z') },
        { id: 'b', date: timestamp('2026-10-13T13:20:07.362Z') },
        { id: 'c', date: timestamp('2026-06-19T00:00:00.000Z') },
      ],
      null,
      MAINTENANT
    );
    expect(v.seancesExaminees).toBe(3);
    expect(v.portee).toMatch(/3 séance\(s\) examinée\(s\)/);
    // Les trois documents réels de production : aucun n'est actif (aucun activatedAt).
    expect(v.seancesActives).toHaveLength(0);
    expect(v.niveau).toBe('calme');
  });
});
