import { describe, expect, it } from 'vitest';
import { buildDeclarativeMissionPatch, buildRouletteCompletionPatch, buildMissionGesturePatch } from './ludicStateWrites';
import { isoWeekKey, mergeWeeklyMissionsForDisplay, type WeeklyMissionsState } from './weeklyMissions';
import type { RouletteCompletion } from './roulette';

const NOW = new Date(2026, 8, 25); // vendredi 25/09/2026, semaine 2026-W39
const WEEK = isoWeekKey(NOW);
const fige = { level: 'rouge', countsChildWalls: false };
const grid = (done: WeeklyMissionsState['done'], walls: string[] = [], isoWeek = WEEK): WeeklyMissionsState => ({
  isoWeek, level: 'rouge', countsChildWalls: false, done, walls, completedAt: null,
});
const entry: RouletteCompletion = {
  proposalId: 'A1', label: 'Un bloc', family: 'A', color: 'rouge', wall: null, number: null, at: NOW.toISOString(),
};

describe('buildDeclarativeMissionPatch (M4 bis)', () => {
  it('ajoute la mission à la grille STOCKÉE, sans rien perdre de ce qu\'elle contient', () => {
    const { weeklyMissions } = buildDeclarativeMissionPatch({ weeklyMissions: grid(['M1', 'M6'], ['Dalle']) }, 'M4', fige, NOW);
    expect(weeklyMissions.done).toEqual(['M1', 'M6', 'M4']);
    expect(weeklyMissions.walls).toEqual(['Dalle']);
  });

  it('ouvre une nouvelle semaine si la grille stockée est d\'une semaine passée', () => {
    const { weeklyMissions } = buildDeclarativeMissionPatch({ weeklyMissions: grid(['M1'], ['Dalle'], '2026-W38') }, 'M4', fige, NOW);
    expect(weeklyMissions.isoWeek).toBe(WEEK);
    expect(weeklyMissions.done).toEqual(['M4']);
    expect(weeklyMissions.walls).toEqual([]);
  });

  it('incrémente weeklyMissionsCompleted uniquement au passage à 8/8', () => {
    const seven = grid(['M1', 'M2', 'M3', 'M5', 'M6', 'M7', 'M8']);
    expect(buildDeclarativeMissionPatch({ weeklyMissions: seven, weeklyMissionsCompleted: 2 }, 'M4', fige, NOW).weeklyMissionsCompleted).toBe(3);
    expect(buildDeclarativeMissionPatch({ weeklyMissions: grid(['M1']), weeklyMissionsCompleted: 2 }, 'M4', fige, NOW).weeklyMissionsCompleted).toBe(2);
  });
});

describe('buildRouletteCompletionPatch ("J\'ai relevé le défi" + M8)', () => {
  it('part du document stocké : compteur, liste des derniers défis et grille', () => {
    const patch = buildRouletteCompletionPatch(
      { rouletteChallengesCompleted: 4, rouletteRecentChallenges: [], weeklyMissions: grid(['M4'], ['Dévers 30°']) },
      entry, fige, NOW
    );
    expect(patch.rouletteChallengesCompleted).toBe(5);
    expect(patch.rouletteRecentChallenges).toHaveLength(1);
    expect(patch.weeklyMissions.done).toEqual(['M4', 'M8']);
    expect(patch.weeklyMissions.walls).toEqual(['Dévers 30°']);
  });

  it('document absent : premier défi, grille neuve', () => {
    const patch = buildRouletteCompletionPatch({}, entry, fige, NOW);
    expect(patch.rouletteChallengesCompleted).toBe(1);
    expect(patch.weeklyMissions.done).toEqual(['M8']);
    expect(patch.weeklyMissionsCompleted).toBe(0);
  });
});

describe('mergeWeeklyMissionsForDisplay', () => {
  it('même semaine : union des cases (la mémoire peut porter un flush pas encore parti)', () => {
    const merged = mergeWeeklyMissionsForDisplay(grid(['M1', 'M6'], ['Dalle']), grid(['M4', 'M8'], ['Dévers 30°']));
    expect(new Set(merged.done)).toEqual(new Set(['M1', 'M6', 'M4', 'M8']));
    expect(new Set(merged.walls)).toEqual(new Set(['Dalle', 'Dévers 30°']));
  });

  it('semaines différentes : la plus récente gagne', () => {
    const fresh = grid(['M8'], [], WEEK);
    expect(mergeWeeklyMissionsForDisplay(grid(['M1'], [], '2026-W38'), fresh)).toBe(fresh);
    const memory = grid(['M1'], [], '2026-W40');
    expect(mergeWeeklyMissionsForDisplay(memory, fresh)).toBe(memory);
  });

  it('rien en mémoire : la grille fraîche', () => {
    const fresh = grid(['M8']);
    expect(mergeWeeklyMissionsForDisplay(undefined, fresh)).toBe(fresh);
  });
});

describe('buildMissionGesturePatch ("J\'ai testé ce bloc" / "Je l\'ai refait")', () => {
  const dalle = { category: 'dalle' as const, kidsOnly: false };
  it('"J\'ai testé ce bloc" sur un max+1 coche M4 et ajoute le mur, sur la grille STOCKÉE', () => {
    const { weeklyMissions } = buildMissionGesturePatch(
      { weeklyMissions: grid(['M6'], ['Réta Adultes']) },
      { color: 'noir', wall: 'Dalle', success: false, attempts: 0, neverTriedBefore: false, wallInfo: dalle },
      fige, NOW
    );
    expect(weeklyMissions.done).toEqual(['M6', 'M4']);
    expect(weeklyMissions.walls).toEqual(['Réta Adultes', 'Dalle']);
  });

  it('"Je l\'ai refait" sur un bloc du niveau max coche M1, jamais M3', () => {
    const { weeklyMissions } = buildMissionGesturePatch(
      {},
      { color: 'rouge', wall: 'Dalle', success: true, attempts: 0, neverTriedBefore: false, wallInfo: dalle },
      fige, NOW
    );
    expect(weeklyMissions.done).toContain('M1');
    expect(weeklyMissions.done).not.toContain('M3');
  });
});
