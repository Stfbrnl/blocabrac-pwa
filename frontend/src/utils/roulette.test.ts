import { describe, expect, it } from 'vitest';
import {
  CATALOG,
  pickLevelTarget,
  resolveTargetColor,
  leastVisitedWall,
  drawProposal,
  drawDeathProposal,
  type DrawBoulder,
} from './roulette';
import { walls } from '../config/gymConfig';

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
    const idxInPool = CATALOG.filter((p) => p.levelTarget === 'max-1').findIndex((p) => p.id === 'A2');
    const poolSize = CATALOG.filter((p) => p.levelTarget === 'max-1').length;
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
    const d18Index = CATALOG.filter((p) => p.levelTarget === 'max-1').findIndex((p) => p.id === 'D18');
    const poolSize = CATALOG.filter((p) => p.levelTarget === 'max-1').length;
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
