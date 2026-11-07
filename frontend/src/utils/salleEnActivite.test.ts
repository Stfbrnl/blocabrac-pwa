import { describe, it, expect } from 'vitest';
import { evaluerActiviteSalle, FENETRE_ACTIVITE_MINUTES, type SeanceVoyant } from './salleEnActivite';

const MAINTENANT = new Date(2026, 10, 7, 18, 0, 0); // 7 novembre 2026, 18 h, heure locale
const AUJOURDHUI = '2026-11-07';
const HIER = '2026-11-06';

const seance = (p: Partial<SeanceVoyant> = {}): SeanceVoyant => ({
  id: 's1',
  date: AUJOURDHUI,
  name: 'Groupe jeunes',
  ...p,
});

const ilYaMinutes = (n: number) => MAINTENANT.getTime() - n * 60_000;

describe('evaluerActiviteSalle — le voyant, libellé par sa conséquence', () => {
  it('une séance ACTIVÉE donne le niveau « seance », et la consigne nomme les règles', () => {
    const v = evaluerActiviteSalle([seance({ activatedAt: '2026-11-07T17:30:00Z' })], null, MAINTENANT);
    expect(v.niveau).toBe('seance');
    expect(v.seancesActives).toHaveLength(1);
    expect(v.titre).toBe('1 séance en cours');
    // ⚠️ La propriété qui fait la valeur du voyant : il dit QUOI FAIRE, pas seulement un état.
    expect(v.consigne).toMatch(/règles Firestore/);
    expect(v.consigne).toMatch(/ne pas modifier les données/i);
  });

  it('le pluriel suit le nombre — et la TAILLE est affirmée avant le contenu', () => {
    const v = evaluerActiviteSalle(
      [
        seance({ id: 'a', activatedAt: 'x' }),
        seance({ id: 'b', activatedAt: 'y' }),
        seance({ id: 'c' }), // programmée, pas active
      ],
      null,
      MAINTENANT
    );
    expect(v.seancesActives).toHaveLength(2);
    expect(v.seancesActives.map((s) => s.id)).toEqual(['a', 'b']);
    expect(v.titre).toBe('2 séances en cours');
  });

  it('une séance PROGRAMMÉE n’allume pas le voyant — rien n’a commencé', () => {
    const v = evaluerActiviteSalle([seance()], null, MAINTENANT);
    expect(v.niveau).toBe('calme');
    expect(v.seancesActives).toHaveLength(0);
  });

  it('une séance ARCHIVÉE manuellement n’allume pas le voyant', () => {
    const v = evaluerActiviteSalle(
      [seance({ activatedAt: 'x', archivedAt: 'y' })],
      null,
      MAINTENANT
    );
    expect(v.seancesActives).toHaveLength(0);
  });

  it('🔴 une séance D’HIER restée activée n’allume pas le voyant — le statut est DÉRIVÉ', () => {
    // getSessionStatus archive automatiquement à minuit du lendemain. Un voyant qui lirait
    // `activatedAt` tout seul afficherait « séance en cours » tous les jours suivants, et
    // interdirait à jamais de déployer les règles. C'est pourquoi le statut n'est pas relu
    // d'un champ mais dérivé par le même point unique que le reste de l'application.
    const v = evaluerActiviteSalle([seance({ date: HIER, activatedAt: 'x' })], null, MAINTENANT);
    expect(v.seancesActives).toHaveLength(0);
    expect(v.niveau).toBe('calme');
  });

  it('sans séance mais avec une validation récente : niveau « activite »', () => {
    const v = evaluerActiviteSalle([], ilYaMinutes(5), MAINTENANT);
    expect(v.niveau).toBe('activite');
    expect(v.minutesDerniereValidation).toBe(5);
    expect(v.titre).toMatch(/il y a 5 min/);
    expect(v.consigne).toMatch(/règles Firestore/);
  });

  it('la fenêtre d’activité est inclusive à sa borne', () => {
    expect(evaluerActiviteSalle([], ilYaMinutes(FENETRE_ACTIVITE_MINUTES), MAINTENANT).niveau)
      .toBe('activite');
    expect(evaluerActiviteSalle([], ilYaMinutes(FENETRE_ACTIVITE_MINUTES + 1), MAINTENANT).niveau)
      .toBe('calme');
  });

  it('une séance active l’emporte sur une validation ancienne', () => {
    const v = evaluerActiviteSalle(
      [seance({ activatedAt: 'x' })],
      ilYaMinutes(500),
      MAINTENANT
    );
    expect(v.niveau).toBe('seance');
  });

  it('aucune validation du tout : « calme », sans prétendre à un délai', () => {
    const v = evaluerActiviteSalle([], null, MAINTENANT);
    expect(v.niveau).toBe('calme');
    expect(v.minutesDerniereValidation).toBeNull();
    expect(v.titre).toBe('Aucune activité détectée');
    expect(v.consigne).toMatch(/c'est le moment/i);
  });

  it('une validation dans le futur (horloge décalée) est bornée à 0, jamais négative', () => {
    const v = evaluerActiviteSalle([], MAINTENANT.getTime() + 120_000, MAINTENANT);
    expect(v.minutesDerniereValidation).toBe(0);
    expect(v.niveau).toBe('activite');
  });

  it('🔴 les TROIS niveaux annoncent leur PORTÉE, et « calme » ne prétend pas que personne n’est là', () => {
    // ⚠️ Annoncer son dénominateur : ce voyant ne voit que les séances du jour et la dernière
    // validation. Un grimpeur qui consulte sans rien valider est invisible. Laisser croire à
    // une couverture qu'on n'a pas est pire que n'avoir aucun voyant, puisque c'est sur cette
    // foi qu'on déploierait les règles.
    const cas = [
      evaluerActiviteSalle([seance({ activatedAt: 'x' })], null, MAINTENANT),
      evaluerActiviteSalle([], ilYaMinutes(2), MAINTENANT),
      evaluerActiviteSalle([], null, MAINTENANT),
    ];
    expect(cas.map((v) => v.niveau)).toEqual(['seance', 'activite', 'calme']);
    for (const v of cas) {
      expect(v.portee).toMatch(/invisible/);
      expect(v.portee).toMatch(/ne prouve pas/);
    }
  });

  it('les trois niveaux ont des titres et des consignes distincts', () => {
    const titres = [
      evaluerActiviteSalle([seance({ activatedAt: 'x' })], null, MAINTENANT).titre,
      evaluerActiviteSalle([], ilYaMinutes(2), MAINTENANT).titre,
      evaluerActiviteSalle([], null, MAINTENANT).titre,
    ];
    const consignes = [
      evaluerActiviteSalle([seance({ activatedAt: 'x' })], null, MAINTENANT).consigne,
      evaluerActiviteSalle([], ilYaMinutes(2), MAINTENANT).consigne,
      evaluerActiviteSalle([], null, MAINTENANT).consigne,
    ];
    expect(new Set(titres).size).toBe(3);
    expect(new Set(consignes).size).toBe(3);
  });
});
