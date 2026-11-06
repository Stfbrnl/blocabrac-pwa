import { describe, expect, it } from 'vitest';
import {
  groupBouldersByWall,
  peutTrierParCouleur,
  compareWalls,
  type GroupableBoulder,
} from './competitionBoulderGroups';

const b = (id: string, wall: string, number: number, color?: string): GroupableBoulder => ({
  id, wall, number, color,
});

const AUCUN = new Set<string>();

describe('groupBouldersByWall — le regroupement', () => {
  // ⚠️ Un jeu d'essai à plusieurs murs, plusieurs blocs par mur, et des numéros qui se
  // RÉPÈTENT d'un mur à l'autre. C'est la question à poser à chaque jeu d'essai : quels
  // défauts est-il physiquement incapable d'exprimer ? Un seul mur n'exprimerait ni
  // l'entrelacement (le défaut d'origine), ni l'ordre des sections, ni la collision de
  // numéros entre murs.
  const salle = [
    b('d1', 'Dalle', 2),
    b('g1', 'Güllich', 1),
    b('d2', 'Dalle', 1),
    b('v1', 'Dévers 40°', 3),
    b('g2', 'Güllich', 2),
    b('v2', 'Dévers 40°', 1),
  ];

  it('rend une section par mur, et AUCUN bloc ne se perd entre les sections', () => {
    const sections = groupBouldersByWall(salle, { validatedIds: AUCUN });
    // ⚠️ Affirmer la TAILLE avant le contenu : sans ces deux lignes, un bloc avalé par le
    // regroupement passerait inaperçu — on ne vérifierait que ce qui reste.
    expect(sections).toHaveLength(3);
    expect(sections.reduce((n, s) => n + s.total, 0)).toBe(salle.length);
    expect(sections.flatMap((s) => s.boulders.map((x) => x.id)).sort())
      .toEqual(salle.map((x) => x.id).sort());
  });

  it("ordonne les sections selon le CIRCUIT PHYSIQUE de la salle, pas l'alphabet", () => {
    // Dans gymConfig.walls : Güllich (2), Dalle (6), Dévers 40° (8). L'alphabet donnerait
    // Dalle, Dévers 40°, Güllich — c'est précisément l'ordre que ce test interdit.
    const sections = groupBouldersByWall(salle, { validatedIds: AUCUN });
    expect(sections.map((s) => s.wall)).toEqual(['Güllich', 'Dalle', 'Dévers 40°']);
  });

  it('trie chaque section par numéro, et ne mélange plus les murs entre eux', () => {
    const sections = groupBouldersByWall(salle, { validatedIds: AUCUN });
    expect(sections.map((s) => s.boulders.map((x) => x.number))).toEqual([[1, 2], [1, 2], [1, 3]]);
  });

  it('range un mur inconnu de la configuration APRÈS les autres, sans jamais le perdre', () => {
    const sections = groupBouldersByWall(
      [...salle, b('x1', 'Mur démonté en 2024', 1)],
      { validatedIds: AUCUN },
    );
    expect(sections).toHaveLength(4);
    expect(sections[3].wall).toBe('Mur démonté en 2024');
    expect(sections.reduce((n, s) => n + s.total, 0)).toBe(7);
  });

  it('range un bloc sans mur sous un nom explicite plutôt que de le faire disparaître', () => {
    const sections = groupBouldersByWall([b('n1', '', 4)], { validatedIds: AUCUN });
    expect(sections).toHaveLength(1);
    expect(sections[0].wall).toBe('Mur non renseigné');
    expect(sections[0].boulders).toHaveLength(1);
  });

  it("garde un ordre STABLE quand deux blocs du même mur portent le même numéro", () => {
    const doublons = [b('zz', 'Dalle', 5), b('aa', 'Dalle', 5)];
    expect(groupBouldersByWall(doublons, { validatedIds: AUCUN })[0].boulders.map((x) => x.id))
      .toEqual(['aa', 'zz']);
    // Et l'ordre d'entrée inverse donne le même résultat : c'est la stabilité qui est
    // affirmée, pas un ordre d'arrivée.
    expect(groupBouldersByWall([...doublons].reverse(), { validatedIds: AUCUN })[0].boulders.map((x) => x.id))
      .toEqual(['aa', 'zz']);
  });

  it('compte « validés / total » par mur, sur les validés VIVANTS', () => {
    const sections = groupBouldersByWall(salle, { validatedIds: new Set(['g1', 'd1', 'd2']) });
    expect(sections.map((s) => [s.wall, s.validated, s.total]))
      .toEqual([['Güllich', 1, 2], ['Dalle', 2, 2], ['Dévers 40°', 0, 2]]);
  });
});

describe('le filtre « masquer les blocs déjà validés »', () => {
  const salle = [b('d1', 'Dalle', 1), b('d2', 'Dalle', 2), b('g1', 'Güllich', 1)];

  it('masque les blocs de l’instantané, et seulement eux', () => {
    const sections = groupBouldersByWall(salle, {
      validatedIds: new Set(['d1']),
      hiddenIds: new Set(['d1']),
    });
    expect(sections[1].boulders.map((x) => x.id)).toEqual(['d2']);
    expect(sections[1].hidden).toBe(1);
  });

  it('ne change JAMAIS le dénominateur : masquer change ce qui est montré, pas ce qui existe', () => {
    // ⚠️ La propriété que le plan demande d'affirmer : « masquer les validés ne change jamais
    // ce qui est écrit, seulement ce qui est montré ». Ici, l'observable du module : `total` et
    // `validated` sont identiques avec et sans filtre. C'est la grandeur dont on n'attend
    // AUCUN mouvement, et sans cette ligne le filtre pourrait rogner le dénominateur en
    // silence — un grimpeur lirait « 0 / 1 » sur un mur qui compte 2 blocs.
    const sans = groupBouldersByWall(salle, { validatedIds: new Set(['d1']) });
    const avec = groupBouldersByWall(salle, {
      validatedIds: new Set(['d1']),
      hiddenIds: new Set(['d1']),
    });
    expect(avec.map((s) => [s.wall, s.validated, s.total]))
      .toEqual(sans.map((s) => [s.wall, s.validated, s.total]));
  });

  it("🔴 UN BLOC VALIDÉ APRÈS L'INSTANTANÉ RESTE VISIBLE — il ne s'efface pas sous le doigt", () => {
    // C'est la raison d'être des deux ensembles séparés. `d2` vient d'être validé, mais il
    // n'était pas dans l'instantané pris au basculement du filtre : il reste à l'écran, et sa
    // ligne ne s'efface qu'au prochain basculement. Si `hiddenIds` et `validatedIds` étaient
    // un seul paramètre, cette assertion serait impossible à écrire.
    const sections = groupBouldersByWall(salle, {
      validatedIds: new Set(['d1', 'd2']),
      hiddenIds: new Set(['d1']),
    });
    expect(sections[1].boulders.map((x) => x.id)).toEqual(['d2']);
    expect(sections[1].validated).toBe(2);
  });
});

describe('peutTrierParCouleur — tout ou rien, dérivé de la donnée', () => {
  const publics = [b('a', 'Dalle', 1, 'bleu'), b('c', 'Dalle', 2, 'rouge')];

  it('OFFERT quand tous les blocs portent une couleur publique cotable', () => {
    expect(peutTrierParCouleur(publics)).toBe(true);
  });

  it("🔴 REFUSÉ dès qu'UN SEUL bloc n'a pas de couleur publique", () => {
    // ⚠️ Les DEUX assertions, pas seulement la première : c'est ici que se joue la fuite. Un
    // bloc à cotation cachée placé dans une liste triée par couleur verrait sa position
    // révéler sa cotation — le tri deviendrait exactement ce que la cotation cachée existe
    // pour empêcher.
    expect(peutTrierParCouleur([...publics, b('m', 'Dalle', 3)])).toBe(false);
    expect(peutTrierParCouleur([...publics, b('m', 'Dalle', 3, '')])).toBe(false);
  });

  it('REFUSÉ pour une couleur hors barème (cotation non canonique, cas réel en prod)', () => {
    // Sept blocs de prod portent une `difficulty` comme "noire" ou "Rouge" : hors de
    // `levelOrder`, donc intriables. `every` sur une simple présence les aurait acceptés.
    expect(peutTrierParCouleur([...publics, b('n', 'Dalle', 4, 'noire')])).toBe(false);
    expect(peutTrierParCouleur([...publics, b('r', 'Dalle', 5, 'Rouge')])).toBe(false);
  });

  it('REFUSÉ sur une liste vide : [].every(...) rendrait true, ce qui serait faux ici', () => {
    expect(peutTrierParCouleur([])).toBe(false);
  });

  it('le tri par couleur demandé est IGNORÉ quand la donnée ne l’autorise pas', () => {
    // ⚠️ La demande ne suffit pas : c'est le module qui tranche, pas l'appelant. Sans cette
    // garde, un composant qui oublierait d'appeler `peutTrierParCouleur` avant de passer
    // `sortByColor: true` ouvrirait la fuite tout seul.
    const mixte = [b('z', 'Dalle', 1), b('a', 'Dalle', 2, 'rose'), b('m', 'Dalle', 3, 'jaune')];
    const sections = groupBouldersByWall(mixte, { validatedIds: AUCUN, sortByColor: true });
    expect(sections[0].boulders.map((x) => x.id)).toEqual(['z', 'a', 'm']); // par NUMÉRO
  });

  it('trie du plus tendre au plus dur quand la donnée l’autorise', () => {
    const tous = [b('r', 'Dalle', 1, 'rose'), b('j', 'Dalle', 2, 'jaune'), b('b', 'Dalle', 3, 'bleu')];
    const sections = groupBouldersByWall(tous, { validatedIds: AUCUN, sortByColor: true });
    expect(sections[0].boulders.map((x) => x.color)).toEqual(['jaune', 'bleu', 'rose']);
  });
});

describe('compareWalls', () => {
  it('suit gymConfig.walls, et met les murs inconnus après, entre eux par alphabet', () => {
    expect(compareWalls('Güllich', 'Dalle')).toBeLessThan(0);
    expect(compareWalls('Inconnu A', 'Dalle')).toBeGreaterThan(0);
    expect(compareWalls('Inconnu A', 'Inconnu B')).toBeLessThan(0);
    expect(compareWalls('Dalle', 'Dalle')).toBe(0);
  });
});
