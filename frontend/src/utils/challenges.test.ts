import { describe, expect, it } from 'vitest';
import {
  resolveSeuilWinner,
  resolveFenetreWinner,
  resolveBlocDesigneWinner,
  resolveDeclaratifCompletion,
  progressDeltaForValidation,
  progressDeltaForRemoval,
  resolveSeuilTargetColor,
  SEUIL_TARGET_MAX,
  SEUIL_TARGET_MAX_MINUS_1,
  type ChallengeProgress,
} from './challenges';

const LEVELS = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'] as const;

describe('resolveSeuilTargetColor', () => {
  it('renvoie une couleur fixe telle quelle, sans regarder le niveau', () => {
    expect(resolveSeuilTargetColor('rouge', undefined, LEVELS)).toBe('rouge');
    expect(resolveSeuilTargetColor('bleu', 'jaune', LEVELS)).toBe('bleu');
  });

  it('SEUIL_TARGET_MAX -> couleur du niveau courant du grimpeur', () => {
    expect(resolveSeuilTargetColor(SEUIL_TARGET_MAX, 'violet', LEVELS)).toBe('violet');
  });

  it('SEUIL_TARGET_MAX_MINUS_1 -> couleur juste en dessous', () => {
    expect(resolveSeuilTargetColor(SEUIL_TARGET_MAX_MINUS_1, 'violet', LEVELS)).toBe('bleu');
  });

  it('SEUIL_TARGET_MAX_MINUS_1 au niveau le plus bas -> reste au niveau courant', () => {
    expect(resolveSeuilTargetColor(SEUIL_TARGET_MAX_MINUS_1, 'jaune', LEVELS)).toBe('jaune');
  });

  it('cible relative mais niveau inconnu/absent -> null', () => {
    expect(resolveSeuilTargetColor(SEUIL_TARGET_MAX, undefined, LEVELS)).toBeNull();
    expect(resolveSeuilTargetColor(SEUIL_TARGET_MAX, 'mauve', LEVELS)).toBeNull();
  });
});

describe('resolveSeuilWinner', () => {
  it("ne renvoie personne tant que le seuil n'est atteint par personne", () => {
    const progress: ChallengeProgress = {
      a: { value: 2, updated_at: '2026-08-19T10:00:00.000Z' },
      b: { value: 3, updated_at: '2026-08-19T10:05:00.000Z' },
    };
    expect(resolveSeuilWinner(progress, 5)).toEqual({ winnerUids: [], reached: false });
  });

  it('désigne le seul participant ayant atteint le seuil', () => {
    const progress: ChallengeProgress = {
      a: { value: 5, updated_at: '2026-08-19T10:00:00.000Z' },
      b: { value: 3, updated_at: '2026-08-19T10:05:00.000Z' },
    };
    expect(resolveSeuilWinner(progress, 5)).toEqual({ winnerUids: ['a'], reached: true });
  });

  it("départage deux participants ayant atteint le seuil par l'updated_at le plus ancien", () => {
    const progress: ChallengeProgress = {
      a: { value: 5, updated_at: '2026-08-19T10:05:00.000Z' },
      b: { value: 6, updated_at: '2026-08-19T10:00:00.000Z' }, // arrivé à 5 avant, même si plus haut ensuite
    };
    expect(resolveSeuilWinner(progress, 5)).toEqual({ winnerUids: ['b'], reached: true });
  });

  it('renvoie plusieurs uids en cas de timestamp strictement identique', () => {
    const progress: ChallengeProgress = {
      a: { value: 5, updated_at: '2026-08-19T10:00:00.000Z' },
      b: { value: 5, updated_at: '2026-08-19T10:00:00.000Z' },
    };
    expect(resolveSeuilWinner(progress, 5).winnerUids.sort()).toEqual(['a', 'b']);
  });
});

describe('resolveFenetreWinner', () => {
  it('ne désigne personne si aucun participant n\'a de progrès', () => {
    expect(resolveFenetreWinner({})).toEqual({ winnerUids: [], reached: false });
  });

  it("ne désigne personne si tout le monde est à zéro", () => {
    const progress: ChallengeProgress = {
      a: { value: 0, updated_at: '2026-08-19T10:00:00.000Z' },
    };
    expect(resolveFenetreWinner(progress)).toEqual({ winnerUids: [], reached: false });
  });

  it('désigne le meilleur total', () => {
    const progress: ChallengeProgress = {
      a: { value: 12, updated_at: '2026-08-19T10:00:00.000Z' },
      b: { value: 30, updated_at: '2026-08-19T11:00:00.000Z' },
    };
    expect(resolveFenetreWinner(progress)).toEqual({ winnerUids: ['b'], reached: true });
  });

  it('départage une égalité de total par le plus ancien updated_at', () => {
    const progress: ChallengeProgress = {
      a: { value: 30, updated_at: '2026-08-19T12:00:00.000Z' },
      b: { value: 30, updated_at: '2026-08-19T09:00:00.000Z' },
    };
    expect(resolveFenetreWinner(progress)).toEqual({ winnerUids: ['b'], reached: true });
  });
});

describe('resolveBlocDesigneWinner', () => {
  it('se comporte comme resolveFenetreWinner (meilleur score sur le bloc)', () => {
    const progress: ChallengeProgress = {
      a: { value: 380, updated_at: '2026-08-19T10:00:00.000Z' },
      b: { value: 400, updated_at: '2026-08-19T11:00:00.000Z' },
    };
    expect(resolveBlocDesigneWinner(progress)).toEqual({ winnerUids: ['b'], reached: true });
  });
});

describe('resolveDeclaratifCompletion', () => {
  it("renvoie tous les participants ayant validé, sans notion de vainqueur unique", () => {
    const progress: ChallengeProgress = {
      a: { value: 1, updated_at: '2026-08-19T10:00:00.000Z' },
      b: { value: 0, updated_at: '2026-08-19T10:00:00.000Z' },
      c: { value: 1, updated_at: '2026-08-19T10:05:00.000Z', confirmed_by: 'a' },
    };
    expect(resolveDeclaratifCompletion(progress).sort()).toEqual(['a', 'c']);
  });

  it('renvoie un tableau vide si personne n\'a encore validé', () => {
    expect(resolveDeclaratifCompletion({})).toEqual([]);
  });
});

describe('progressDeltaForValidation', () => {
  it("renvoie 0 si l'état de comptage ne change pas (toujours compté ou toujours pas)", () => {
    expect(progressDeltaForValidation(true, true)).toBe(0);
    expect(progressDeltaForValidation(false, false)).toBe(0);
  });

  it('renvoie +points quand une validation commence à compter pour le défi', () => {
    expect(progressDeltaForValidation(false, true)).toBe(1);
    expect(progressDeltaForValidation(false, true, 400)).toBe(400);
  });

  it('renvoie -points quand une validation qui comptait ne compte plus (édition/couleur changée)', () => {
    expect(progressDeltaForValidation(true, false)).toBe(-1);
    expect(progressDeltaForValidation(true, false, 400)).toBe(-400);
  });
});

describe('progressDeltaForRemoval', () => {
  it("fait décroître le compteur du montant qui avait été compté (retrait d'une validation)", () => {
    expect(progressDeltaForRemoval(1)).toBe(-1);
    expect(progressDeltaForRemoval(400)).toBe(-400);
  });
});
