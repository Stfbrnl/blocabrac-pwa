import { describe, it, expect } from 'vitest';
import {
  planifierCloture, estBlocQuotidienReutilise, estHorsDuVol,
  couleursCanoniques, STATUTS_EN_VOL, type BlocClotureInput,
} from './competitionClosure';

// ⚠️ LE JEU DE DONNÉES EST CONSTRUIT POUR POUVOIR EXPRIMER LES DÉFAUTS, pas pour illustrer le
// cas qui marche. Un jeu à un seul élément par catégorie n'exprime ni multiplicité, ni ordre,
// ni le mélange actif/désactivé — or c'est exactement un bloc désactivé noyé parmi les actifs
// qui a produit le défaut V2.79. Chaque catégorie a donc PLUSIEURS membres, et l'état
// `is_active` est croisé avec le `type` au lieu de suivre.
const bloc = (p: Partial<BlocClotureInput> & { id: string }): BlocClotureInput => ({
  type: 'competition', is_active: true, ...p,
});

const salle: BlocClotureInput[] = [
  // Créés pour l'épreuve, cotation canonique — à basculer en public.
  bloc({ id: 'c1', difficulty: 'rouge' }),
  bloc({ id: 'c2', difficulty: 'blanc', is_active: false }),
  bloc({ id: 'c3', difficulty: 'jaune' }),
  // Quotidiens réutilisés — à détacher, sans jamais toucher à leur couleur.
  bloc({ id: 'r1', type: 'daily' }),
  bloc({ id: 'r2', type: 'daily', is_active: false }),
  // 🔴 Créés pour l'épreuve, cotation HORS des huit couleurs — à refuser.
  bloc({ id: 'x1', difficulty: 'mystere' }),
  bloc({ id: 'x2', difficulty: 'noire' }),
  bloc({ id: 'x3', difficulty: undefined }),
];

describe('planifierCloture : le périmètre de « Terminer la compétition »', () => {
  // ⚠️ La TAILLE d'abord. Sans cette ligne, toute assertion sur le contenu des trois listes
  // resterait verte si un bloc s'était perdu en route — et un bloc perdu par la clôture est
  // précisément le défaut V2.79, qui laissait `competition_active: true` pour toujours.
  it('ne perd ni ne duplique aucun bloc : les trois listes partitionnent l\'entrée', () => {
    const plan = planifierCloture(salle);
    expect(plan.compte.total).toBe(salle.length);
    expect(plan.aDetacher.length + plan.aMigrer.length + plan.refuses.length).toBe(salle.length);
    const traites = [...plan.aDetacher, ...plan.aMigrer.map((m) => m.id), ...plan.refuses.map((r) => r.id)];
    expect(new Set(traites).size).toBe(salle.length);
    expect(new Set(traites)).toEqual(new Set(salle.map((b) => b.id)));
  });

  it('bascule les blocs créés pour l\'épreuve en reprenant leur cotation cachée comme couleur publique', () => {
    const plan = planifierCloture(salle);
    expect(plan.aMigrer).toEqual([
      { id: 'c1', color: 'rouge' },
      { id: 'c2', color: 'blanc' },
      { id: 'c3', color: 'jaune' },
    ]);
  });

  it('détache les blocs quotidiens réutilisés SANS leur attribuer de couleur — la leur est déjà publique', () => {
    const plan = planifierCloture(salle);
    expect(plan.aDetacher).toEqual(['r1', 'r2']);
    // ⚠️ Nomme ce qui doit DIFFÉRER : un bloc réutilisé ne doit apparaître dans AUCUNE des deux
    // autres listes. Sans cette ligne, un bloc quotidien qui serait aussi « migré » (donc dont
    // on réécrirait la couleur, celle écrite sur la prise dans la salle) passerait inaperçu.
    expect(plan.aMigrer.map((m) => m.id)).not.toContain('r1');
    expect(plan.refuses.map((r) => r.id)).not.toContain('r1');
  });

  // 🔴 LE REFUS, EXERCÉ DANS LES DEUX SENS — c'est ce qui le distingue d'un contrôle né vert
  // sur un terrain propre. La production n'a aujourd'hui aucun bloc dans ce cas (mesuré le
  // 07/11/2026) : sans les deux sens, ce test ne prouverait rien.
  it('REFUSE un bloc dont la cotation n\'est pas l\'une des huit couleurs, et accepte celui dont elle l\'est', () => {
    const plan = planifierCloture(salle);
    expect(plan.refuses).toEqual([
      { id: 'x1', difficulty: 'mystere' },
      { id: 'x2', difficulty: 'noire' },
      { id: 'x3', difficulty: undefined },
    ]);
    // Le sens opposé, sur le MÊME champ : une graphie canonique passe.
    expect(planifierCloture([bloc({ id: 'y', difficulty: 'noir' })]).aMigrer).toEqual([{ id: 'y', color: 'noir' }]);
    expect(planifierCloture([bloc({ id: 'y', difficulty: 'noir' })]).refuses).toEqual([]);
  });

  it('`mystere` est refusé : ce n\'est pas une cotation mais l\'absence annoncée de cotation publique', () => {
    // Le basculer écrirait `color: 'mystere'`, hors de `levelOrder` — donc `basePoints[...] || 0`
    // ferait valoir chaque réussite ZÉRO POINT, en silence, sur un bloc public.
    const plan = planifierCloture([bloc({ id: 'm', difficulty: 'mystere' })]);
    expect(plan.aMigrer).toEqual([]);
    expect(plan.compte.refuses).toBe(1);
  });

  it('traite les blocs DÉSACTIVÉS comme les autres, et annonce combien il y en a', () => {
    const plan = planifierCloture(salle);
    // V2.79 : un bloc désactivé pendant qu'il était rattaché reste rattaché. Le sauter lui
    // laisserait son drapeau de compétition pour toujours, hors d'atteinte de toute interface.
    expect(plan.aMigrer.map((m) => m.id)).toContain('c2');
    expect(plan.aDetacher).toContain('r2');
    // ⚠️ Un compte qui annonce son dénominateur : le dialogue doit pouvoir dire « s'y ajoutent
    // N blocs désactivés », sinon il annonce moins que ce que la clôture modifie.
    expect(plan.compte.desactives).toBe(2);
  });

  it('un bloc sans `is_active` est compté comme désactivé — l\'absence n\'est pas « actif »', () => {
    const plan = planifierCloture([{ id: 'z', type: 'daily' }]);
    expect(plan.compte.desactives).toBe(1);
  });

  it('le compte se décompose exactement en réutilisés + créés + refusés', () => {
    const { compte } = planifierCloture(salle);
    expect(compte).toEqual({ total: 8, reutilises: 2, crees: 3, desactives: 2, refuses: 3 });
  });

  it('une compétition sans aucun bloc rattaché donne un plan vide, pas une erreur', () => {
    const plan = planifierCloture([]);
    expect(plan.compte).toEqual({ total: 0, reutilises: 0, crees: 0, desactives: 0, refuses: 0 });
  });
});

describe('couleursCanoniques : dérivées de gymConfig, jamais recopiées', () => {
  it('rend les huit couleurs de l\'échelle', () => {
    // ⚠️ Cette ligne épingle un défaut RÉELLEMENT COMMIS le 07/11/2026 : une liste tapée à la
    // main dans un script de mesure avait oublié `violet`, et 38 blocs de production ont été
    // déclarés fautifs à tort. La liste se DÉRIVE.
    expect(couleursCanoniques).toEqual(['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose']);
  });

  it('ne contient PAS `mystere`', () => {
    expect(couleursCanoniques).not.toContain('mystere');
    expect(couleursCanoniques).not.toContain('mystère');
  });
});

describe('estHorsDuVol : quand une compétition cesse d\'être en cours', () => {
  it('« à venir » et « en cours » sont en vol', () => {
    expect(STATUTS_EN_VOL).toEqual(['à venir', 'en cours']);
    expect(estHorsDuVol('à venir')).toBe(false);
    expect(estHorsDuVol('en cours')).toBe(false);
  });

  it('« terminée » et « annulée » sont hors du vol — les deux, comme dans l\'audit de production', () => {
    expect(estHorsDuVol('terminée')).toBe(true);
    expect(estHorsDuVol('annulée')).toBe(true);
  });

  it('un statut absent ou inconnu est hors du vol — la liste est en POSITIF, exprès', () => {
    // Une liste d'exclusions laisserait passer tout statut futur qu'on n'aurait pas pensé à y
    // ajouter : il serait traité comme « en vol », donc la clôture ne serait jamais proposée.
    expect(estHorsDuVol(undefined)).toBe(true);
    expect(estHorsDuVol('')).toBe(true);
    expect(estHorsDuVol('reportée')).toBe(true);
  });
});

describe('estBlocQuotidienReutilise', () => {
  it('distingue le bloc du jour réutilisé du bloc créé pour l\'épreuve', () => {
    expect(estBlocQuotidienReutilise({ type: 'daily' })).toBe(true);
    expect(estBlocQuotidienReutilise({ type: 'competition' })).toBe(false);
  });
});
