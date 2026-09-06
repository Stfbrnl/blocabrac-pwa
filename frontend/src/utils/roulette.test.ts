import { describe, expect, it } from 'vitest';
import {
  CATALOG,
  pickLevelTarget,
  resolveTargetColor,
  leastVisitedWall,
  drawProposal,
  drawDeathProposal,
  traverseeConstraintForLevel,
  formatTraverseeLabel,
  addRouletteCompletion,
  resolveDrawLabel,
  ROULETTE_RECENT_COMPLETIONS_MAX,
  type DrawBoulder,
  type DrawResult,
  type RouletteCompletion,
} from './roulette';
import { walls } from '../config/gymConfig';
import { levelOrder } from './competitionEligibility';

// Pool max-1 réellement éligible pour un niveau donné (mirroir de `levelAllows` interne).
const max1Pool = (level: string) => CATALOG.filter((p) => p.levelTarget === 'max-1'
  && (!p.minLevel || levelOrder.indexOf(level as never) >= levelOrder.indexOf(p.minLevel))
  && (!p.maxLevel || levelOrder.indexOf(level as never) <= levelOrder.indexOf(p.maxLevel)));

// RNG déterministe : renvoie toujours la même valeur, sauf séquence explicite fournie.
const constantRng = (value: number) => () => value;
const sequenceRng = (values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe('pickLevelTarget', () => {
  it('renvoie max-1 juste sous 0.70', () => {
    expect(pickLevelTarget(constantRng(0))).toBe('max-1');
    expect(pickLevelTarget(constantRng(0.69))).toBe('max-1');
  });
  it('renvoie max entre 0.70 et 0.90', () => {
    expect(pickLevelTarget(constantRng(0.70))).toBe('max');
    expect(pickLevelTarget(constantRng(0.89))).toBe('max');
  });
  it('renvoie max+1 à partir de 0.90', () => {
    expect(pickLevelTarget(constantRng(0.90))).toBe('max+1');
    expect(pickLevelTarget(constantRng(0.99))).toBe('max+1');
  });
});

describe('resolveTargetColor', () => {
  it('rabat max-1 sur le niveau courant quand le grimpeur est au plancher', () => {
    expect(resolveTargetColor('jaune', 'max-1')).toEqual({ color: 'jaune', appliedTarget: 'max-1' });
  });
  it('rabat max+1 sur max quand le grimpeur est au plafond', () => {
    expect(resolveTargetColor('rose', 'max+1')).toEqual({ color: 'rose', appliedTarget: 'max' });
  });
  it('traite un niveau absent comme le plancher', () => {
    expect(resolveTargetColor(undefined, 'max')).toEqual({ color: 'jaune', appliedTarget: 'max' });
    expect(resolveTargetColor(undefined, 'max-1')).toEqual({ color: 'jaune', appliedTarget: 'max-1' });
  });
  it('résout max-1/max/max+1 normalement en milieu de progression', () => {
    expect(resolveTargetColor('bleu', 'max-1')).toEqual({ color: 'vert', appliedTarget: 'max-1' });
    expect(resolveTargetColor('bleu', 'max')).toEqual({ color: 'bleu', appliedTarget: 'max' });
    expect(resolveTargetColor('bleu', 'max+1')).toEqual({ color: 'violet', appliedTarget: 'max+1' });
  });
});

describe('leastVisitedWall', () => {
  it('choisit le mur au compte le plus bas', () => {
    const counts = Object.fromEntries(walls.map((w) => [w, 5]));
    counts[walls[3]] = 1;
    expect(leastVisitedWall(counts)).toBe(walls[3]);
  });
  it('départage une égalité par le premier mur dans l\'ordre circulaire', () => {
    expect(leastVisitedWall({})).toBe(walls[0]);
  });
});

const boulder = (id: string, color: string, wall: string): DrawBoulder => ({ id, color, wall, number: id });

describe('drawProposal', () => {
  const boulders: DrawBoulder[] = [
    boulder('b-vert-1', 'vert', walls[0]),
    boulder('b-vert-2', 'vert', walls[1]),
    boulder('b-bleu-1', 'bleu', walls[0]),
    boulder('b-jaune-1', 'jaune', walls[0]),
  ];

  it('exclut les blocs déjà validés pour la famille A', () => {
    const proposalA = CATALOG.find((p) => p.id === 'A2')!;
    // rng: 1er appel -> tier max-1 (0), 2e appel -> sélectionne A2 dans le pool max-1.
    const idxInPool = max1Pool('bleu').findIndex((p) => p.id === 'A2');
    const poolSize = max1Pool('bleu').length;
    const rng = sequenceRng([0, idxInPool / poolSize + 0.001 / poolSize, 0]);
    const result = drawProposal({
      boulders,
      userLevel: 'bleu', // max-1 => vert
      validatedBoulderIds: new Set(['b-vert-1']),
      wallCounts: {},
      recentProposalIds: [],
      rng,
    });
    expect(result.proposal.id).toBe(proposalA.id);
    expect(result.resolvedBoulder?.id).not.toBe('b-vert-1');
  });

  it("n'exclut pas les blocs déjà validés pour les familles B/C/E", () => {
    const onlyValidated = [boulder('b-vert-only', 'vert', walls[0])];
    const result = drawProposal({
      boulders: onlyValidated,
      userLevel: 'bleu',
      validatedBoulderIds: new Set(['b-vert-only']),
      wallCounts: {},
      recentProposalIds: CATALOG.filter((p) => p.levelTarget === 'max-1' && p.family !== 'B').map((p) => p.id),
      rng: sequenceRng([0, 0]),
    });
    expect(result.proposal.family).toBe('B');
    expect(result.resolvedBoulder?.id).toBe('b-vert-only');
  });

  it('exclut la famille F si tous les blocs à la couleur cible sont déjà validés', () => {
    const onlyValidated = [boulder('b-vert-only', 'vert', walls[0])];
    const recentAllButF = CATALOG.filter((p) => p.levelTarget === 'max-1' && p.family !== 'F').map((p) => p.id);
    const result = drawProposal({
      boulders: onlyValidated,
      userLevel: 'bleu',
      validatedBoulderIds: new Set(['b-vert-only']),
      wallCounts: {},
      recentProposalIds: recentAllButF,
      rng: sequenceRng([0, 0]),
    });
    expect(result.proposal.family).toBe('F');
    // Aucun bloc éligible pour F (le seul bloc vert est déjà validé) -> élargissement.
    expect(result.widened).toBe(true);
  });

  it('exclut la famille E quand le grimpeur est au plafond', () => {
    for (let i = 0; i < 50; i++) {
      const result = drawProposal({
        boulders,
        userLevel: 'rose', // plafond : max+1 indisponible
        validatedBoulderIds: new Set(),
        wallCounts: {},
        recentProposalIds: [],
        rng: sequenceRng([0.95, i / 50]), // force le tier max+1 à chaque tirage
      });
      expect(result.proposal.family).not.toBe('E');
      expect(result.levelExcludedE).toBe(true);
    }
  });

  it('élargit progressivement quand aucun bloc ne correspond à la couleur cible', () => {
    const onlyBlue = [boulder('b-bleu-only', 'bleu', walls[0])];
    const result = drawProposal({
      boulders: onlyBlue,
      userLevel: 'rouge', // max-1 => violet, absent de la liste
      validatedBoulderIds: new Set(),
      wallCounts: {},
      recentProposalIds: [],
      rng: sequenceRng([0, 0]),
    });
    expect(result.widened).toBe(true);
    expect(result.resolvedBoulder).toBeDefined();
  });

  it('replie sur n\'importe quel bloc actif si le secteur est entièrement démonté/validé', () => {
    const onlyValidated = [boulder('only', 'vert', walls[0])];
    const result = drawProposal({
      boulders: onlyValidated,
      userLevel: 'bleu',
      validatedBoulderIds: new Set(['only']),
      wallCounts: {},
      recentProposalIds: CATALOG.filter((p) => p.levelTarget === 'max-1' && p.family !== 'A').map((p) => p.id),
      rng: sequenceRng([0, 0]),
    });
    expect(result.proposal.family).toBe('A');
    expect(result.resolvedBoulder?.id).toBe('only');
    expect(result.widened).toBe(true);
  });

  it('anti-lassitude : le seul id non récent est systématiquement tiré', () => {
    const poolMax1 = CATALOG.filter((p) => p.levelTarget === 'max-1');
    const survivor = poolMax1[3];
    const recent = poolMax1.filter((p) => p.id !== survivor.id).map((p) => p.id);
    for (let i = 0; i < 10; i++) {
      const result = drawProposal({
        boulders,
        userLevel: 'bleu',
        validatedBoulderIds: new Set(),
        wallCounts: {},
        recentProposalIds: recent,
        rng: sequenceRng([0, i / 10]),
      });
      expect(result.proposal.id).toBe(survivor.id);
    }
  });

  it('résout {mur} pour la famille D via le mur le moins visité', () => {
    const d18Index = max1Pool('bleu').findIndex((p) => p.id === 'D18');
    const poolSize = max1Pool('bleu').length;
    const wallCounts = Object.fromEntries(walls.map((w) => [w, 9]));
    wallCounts[walls[2]] = 0;
    const result = drawProposal({
      boulders,
      userLevel: 'bleu',
      validatedBoulderIds: new Set(),
      wallCounts,
      recentProposalIds: [],
      rng: sequenceRng([0, d18Index / poolSize]),
    });
    expect(result.proposal.id).toBe('D18');
    expect(result.resolvedWall).toBe(walls[2]);
  });
});

describe('traversées à difficulté progressive (V2.55)', () => {
  it('barème par niveau donné par l\'utilisateur le 06/09/2026', () => {
    expect(traverseeConstraintForLevel('jaune')).toEqual({ wallCount: 1, consecutive: false, forbiddenHoldColors: [] });
    expect(traverseeConstraintForLevel('vert')).toEqual({ wallCount: 1, consecutive: false, forbiddenHoldColors: [] });
    expect(traverseeConstraintForLevel('bleu')).toEqual({ wallCount: 1, consecutive: false, forbiddenHoldColors: [] });
    expect(traverseeConstraintForLevel('violet')).toEqual({ wallCount: 2, consecutive: true, forbiddenHoldColors: [] });
    expect(traverseeConstraintForLevel('rouge')).toEqual({ wallCount: 3, consecutive: false, forbiddenHoldColors: [] });
    expect(traverseeConstraintForLevel('noir')).toEqual({ wallCount: 3, consecutive: true, forbiddenHoldColors: ['jaune'] });
    expect(traverseeConstraintForLevel('blanc')).toEqual({ wallCount: 4, consecutive: true, forbiddenHoldColors: ['jaune'] });
    expect(traverseeConstraintForLevel('rose')).toEqual({ wallCount: 4, consecutive: true, forbiddenHoldColors: ['jaune', 'vert'] });
  });

  it('niveau inconnu traité comme le plancher (un mur)', () => {
    expect(traverseeConstraintForLevel(undefined)).toEqual({ wallCount: 1, consecutive: false, forbiddenHoldColors: [] });
  });

  it('compose un texte lisible', () => {
    expect(formatTraverseeLabel(traverseeConstraintForLevel('bleu')))
      .toBe('Traversée : un mur, sans poser le pied au sol.');
    expect(formatTraverseeLabel(traverseeConstraintForLevel('violet')))
      .toBe('Traversée : deux murs consécutifs, sans poser le pied au sol.');
    expect(formatTraverseeLabel(traverseeConstraintForLevel('noir')))
      .toBe('Traversée : trois murs consécutifs, sans poser le pied au sol, sans utiliser de prise de blocs jaunes.');
    expect(formatTraverseeLabel(traverseeConstraintForLevel('rose')))
      .toBe('Traversée : quatre murs consécutifs, sans poser le pied au sol, sans utiliser de prise de blocs jaunes ni verts.');
  });

  it('drawProposal résout {traversée} pour G32 selon le niveau du grimpeur', () => {
    const g32Pool = CATALOG.filter((p) => p.levelTarget === 'max-1');
    const g32Index = g32Pool.findIndex((p) => p.id === 'G32');
    const result = drawProposal({
      boulders: [boulder('b1', 'vert', walls[0])],
      userLevel: 'rose',
      validatedBoulderIds: new Set(),
      wallCounts: {},
      recentProposalIds: [],
      rng: sequenceRng([0, g32Index / g32Pool.length]),
    });
    expect(result.proposal.id).toBe('G32');
    expect(result.resolvedTraversee).toBe(
      'Traversée : quatre murs consécutifs, sans poser le pied au sol, sans utiliser de prise de blocs jaunes ni verts.',
    );
  });
});

describe('propositions dédiées à un niveau / décalées (V2.55, exercices al-escalade.fr)', () => {
  const boulders: DrawBoulder[] = [
    boulder('b-jaune', 'jaune', walls[0]),
    boulder('b-vert', 'vert', walls[0]),
    boulder('b-bleu', 'bleu', walls[0]),
    boulder('b-rouge', 'rouge', walls[0]),
    boulder('b-noir', 'noir', walls[0]),
    boulder('b-blanc', 'blanc', walls[0]),
  ];

  it('exclut B45/B46 (minLevel blanc) pour un grimpeur bleu', () => {
    expect(max1Pool('bleu').some((p) => p.id === 'B45' || p.id === 'B46')).toBe(false);
    expect(max1Pool('blanc').some((p) => p.id === 'B45')).toBe(true);
  });

  it('B37 (levelOffset -1) cible deux crans sous le niveau', () => {
    const pool = max1Pool('rouge');
    const idx = pool.findIndex((p) => p.id === 'B37');
    const result = drawProposal({
      boulders,
      userLevel: 'rouge', // max-1 => violet, puis offset -1 => bleu
      validatedBoulderIds: new Set(),
      wallCounts: {},
      recentProposalIds: [],
      rng: sequenceRng([0, idx / pool.length + 0.001 / pool.length]),
    });
    expect(result.proposal.id).toBe('B37');
    expect(result.resolvedColor).toBe('bleu');
    expect(result.resolvedBoulder?.id).toBe('b-bleu');
  });

  it('B45 (Yaniro) porte une explication de la technique', () => {
    const yaniro = CATALOG.find((p) => p.id === 'B45')!;
    expect(yaniro.details).toMatch(/figure 4/i);
  });
});

describe('suivi des défis relevés (V2.55, version hybride)', () => {
  const completion = (id: string): RouletteCompletion => ({
    proposalId: id, label: id, family: 'B', color: 'rouge', wall: null, number: null, at: id,
  });

  it('empile en tête et plafonne à 10', () => {
    let list: RouletteCompletion[] | undefined;
    for (let i = 0; i < 14; i++) list = addRouletteCompletion(list, completion(`c${i}`));
    expect(list).toHaveLength(ROULETTE_RECENT_COMPLETIONS_MAX);
    expect(list![0].proposalId).toBe('c13');
    expect(list![9].proposalId).toBe('c4');
  });

  it('gère une liste absente', () => {
    expect(addRouletteCompletion(undefined, completion('c0'))).toEqual([completion('c0')]);
  });

  it('resolveDrawLabel substitue {couleur} et {traversée}', () => {
    const base: DrawResult = {
      proposal: CATALOG.find((p) => p.id === 'B8')!,
      resolvedColor: 'rouge', widened: false, levelExcludedE: false,
    };
    expect(resolveDrawLabel({ ...base, proposal: CATALOG.find((p) => p.id === 'B37')! }))
      .toContain('Un bloc rouge sans aucune prise de pied');
    const trav = drawProposal({
      boulders: [boulder('b1', 'vert', walls[0])],
      userLevel: 'rose', validatedBoulderIds: new Set(), wallCounts: {}, recentProposalIds: [],
      rng: sequenceRng([0, max1Pool('rose').findIndex((p) => p.id === 'G32') / max1Pool('rose').length + 1e-6]),
    });
    expect(trav.proposal.id).toBe('G32');
    expect(resolveDrawLabel(trav)).toMatch(/^Traversée : quatre murs consécutifs/);
  });
});

describe('drawDeathProposal', () => {
  it("renvoie null si le grimpeur est déjà au plafond (pas de repli)", () => {
    const result = drawDeathProposal({
      boulders: [boulder('b1', 'rose', walls[0])],
      userLevel: 'rose',
      validatedBoulderIds: new Set(),
      wallCounts: {},
    });
    expect(result).toBeNull();
  });

  it("renvoie null si aucun bloc n'existe au niveau max+1", () => {
    const result = drawDeathProposal({
      boulders: [boulder('b1', 'bleu', walls[0])],
      userLevel: 'bleu', // max+1 => violet, absent
      validatedBoulderIds: new Set(),
      wallCounts: {},
    });
    expect(result).toBeNull();
  });

  it('tire un bloc au niveau max+1 quand disponible', () => {
    const result = drawDeathProposal({
      boulders: [boulder('b1', 'violet', walls[0])],
      userLevel: 'bleu',
      validatedBoulderIds: new Set(),
      wallCounts: {},
    });
    expect(result?.resolvedBoulder?.id).toBe('b1');
    expect(result?.proposal.extreme).toBe(true);
  });
});
