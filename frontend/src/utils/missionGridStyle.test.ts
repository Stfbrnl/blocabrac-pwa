import { describe, expect, it } from 'vitest';
import { stampAngle, stampOpacity, missionAccentLevel } from './missionGridStyle';
import { MISSION_KEYS, type WeeklyMissionsState } from './weeklyMissions';

const grid = (level: string): WeeklyMissionsState => ({
  isoWeek: '2026-W39', level, countsChildWalls: false, done: [], walls: [], completedAt: null,
});

describe('stampAngle / stampOpacity', () => {
  it('stables (même clé -> même valeur) et bornés', () => {
    MISSION_KEYS.forEach((k) => {
      expect(stampAngle(k)).toBe(stampAngle(k));
      expect(stampAngle(k)).toBeGreaterThanOrEqual(-17);
      expect(stampAngle(k)).toBeLessThanOrEqual(-9);
      expect(stampOpacity(k)).toBeGreaterThanOrEqual(0.5);
      expect(stampOpacity(k)).toBeLessThanOrEqual(0.6);
    });
  });

  it('varient d\'une tuile à l\'autre', () => {
    expect(new Set(MISSION_KEYS.map(stampAngle)).size).toBeGreaterThan(1);
  });
});

describe('missionAccentLevel', () => {
  it('M1 = niveau figé, M3 = max−1, M4 = max+1', () => {
    expect(missionAccentLevel('M1', grid('rouge'))).toBe('rouge');
    expect(missionAccentLevel('M3', grid('rouge'))).toBe('violet');
    expect(missionAccentLevel('M4', grid('rouge'))).toBe('noir');
  });

  it('plancher : M3 au niveau jaune reste jaune ; plafond : pas d\'accent M4 (M4 bis)', () => {
    expect(missionAccentLevel('M3', grid('jaune'))).toBe('jaune');
    expect(missionAccentLevel('M4', grid('rose'))).toBeNull();
  });

  it('aucun accent pour les missions indépendantes du niveau', () => {
    expect(missionAccentLevel('M5', grid('rouge'))).toBeNull();
    expect(missionAccentLevel('M8', grid('rouge'))).toBeNull();
  });
});
