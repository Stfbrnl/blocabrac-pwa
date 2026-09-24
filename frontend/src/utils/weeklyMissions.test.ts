import { describe, expect, it } from 'vitest';
import {
  isoWeekKey, resolveWeeklyMissionsState, applyValidationToWeeklyMissions,
  applyDeclarativeMission, isWeeklyMissionsGridComplete, isAtLevelCeiling, describeMission,
  MISSION_KEYS, WEEKLY_MISSIONS_WALLS_TARGET, type WeeklyMissionsState,
} from './weeklyMissions';
import type { WallCategoryInfo } from '../config/gymConfig';

describe('isoWeekKey', () => {
  // Valeurs de référence connues et vérifiables indépendamment (calendriers ISO 8601 publiés).
  it('2021-01-04 (lundi) est en 2021-W01', () => {
    expect(isoWeekKey(new Date(2021, 0, 4))).toBe('2021-W01');
  });
  it('2023-01-01 (dimanche) est en 2022-W52 (chevauchement d\'année)', () => {
    expect(isoWeekKey(new Date(2023, 0, 1))).toBe('2022-W52');
  });
  it('2024-12-31 (mardi) est en 2025-W01 (la semaine ISO commence avant le 1er janvier civil)', () => {
    expect(isoWeekKey(new Date(2024, 11, 31))).toBe('2025-W01');
  });
  it('2020-12-31 (jeudi) est en 2020-W53 (année à 53 semaines ISO)', () => {
    expect(isoWeekKey(new Date(2020, 11, 31))).toBe('2020-W53');
  });
});

describe('resolveWeeklyMissionsState', () => {
  const now = new Date(2026, 8, 24); // jeudi 24/09/2026

  it('aucun état stocké : ouvre une semaine vide avec le niveau/l\'âge courants', () => {
    const state = resolveWeeklyMissionsState(undefined, now, 'rouge', false);
    expect(state.isoWeek).toBe(isoWeekKey(now));
    expect(state.level).toBe('rouge');
    expect(state.countsChildWalls).toBe(false);
    expect(state.done).toEqual([]);
    expect(state.walls).toEqual([]);
    expect(state.completedAt).toBeNull();
  });

  it('même semaine ISO : renvoie l\'état stocké TEL QUEL, sans refiger', () => {
    const stored: WeeklyMissionsState = {
      isoWeek: isoWeekKey(now), level: 'violet', countsChildWalls: true,
      done: ['M1'], walls: ['Dalle'], completedAt: null,
    };
    const state = resolveWeeklyMissionsState(stored, now, 'rouge', false);
    expect(state).toBe(stored);
  });

  it('⚠️ anniversaire franchissant les 10 ans en cours de semaine : countsChildWalls reste figé', () => {
    const monday = new Date(2026, 8, 21);
    const opened = resolveWeeklyMissionsState(undefined, monday, 'bleu', true); // < 10 ans au lundi
    const later = resolveWeeklyMissionsState(opened, now, 'bleu', false); // >= 10 ans au jeudi, même semaine ISO
    expect(later.countsChildWalls).toBe(true); // reste figé jusqu'au lundi suivant
  });

  it('semaine ISO différente : repart à zéro et refige niveau/âge', () => {
    const stored: WeeklyMissionsState = {
      isoWeek: '2026-W01', level: 'violet', countsChildWalls: true,
      done: ['M1', 'M2'], walls: ['Dalle', 'Güllich'], completedAt: null,
    };
    const state = resolveWeeklyMissionsState(stored, now, 'rouge', false);
    expect(state.isoWeek).toBe(isoWeekKey(now));
    expect(state.level).toBe('rouge');
    expect(state.countsChildWalls).toBe(false);
    expect(state.done).toEqual([]);
    expect(state.walls).toEqual([]);
  });
});

const devers: WallCategoryInfo = { category: 'devers', kidsOnly: false };
const reta: WallCategoryInfo = { category: 'reta', kidsOnly: false };
const dalle: WallCategoryInfo = { category: 'dalle', kidsOnly: false };
const kidsReta: WallCategoryInfo = { category: 'reta', kidsOnly: true };

const baseState = (overrides: Partial<WeeklyMissionsState> = {}): WeeklyMissionsState => ({
  isoWeek: '2026-W39', level: 'rouge', countsChildWalls: false,
  done: [], walls: [], completedAt: null,
  ...overrides,
});

describe('applyValidationToWeeklyMissions', () => {
  it('M1 : validation réussie sur un bloc de la couleur du niveau figé', () => {
    const next = applyValidationToWeeklyMissions(baseState(), { color: 'rouge', wall: 'Dalle', success: true, attempts: 3, wallInfo: dalle });
    expect(next.done).toContain('M1');
  });

  it('M1 : une couleur différente ne valide pas M1', () => {
    const next = applyValidationToWeeklyMissions(baseState(), { color: 'violet', wall: 'Dalle', success: true, attempts: 1, wallInfo: dalle });
    expect(next.done).not.toContain('M1');
  });

  it('⚠️ recoupement voulu (§C.2) : flasher un bloc du niveau max valide M1 ET M3', () => {
    const next = applyValidationToWeeklyMissions(baseState(), { color: 'rouge', wall: 'Dalle', success: true, attempts: 1, wallInfo: dalle });
    expect(next.done).toContain('M1');
    expect(next.done).toContain('M3');
  });

  it('M3 : plancher — au niveau le plus bas (jaune), max-1 se rabat sur le niveau courant', () => {
    const next = applyValidationToWeeklyMissions(baseState({ level: 'jaune' }), { color: 'jaune', wall: 'Dalle', success: true, attempts: 1, wallInfo: dalle });
    expect(next.done).toContain('M3');
  });

  it('M3 : une couleur en dessous de max-1 ne valide pas M3', () => {
    // niveau figé rouge -> seuil M3 = violet (max-1). jaune est trop bas.
    const next = applyValidationToWeeklyMissions(baseState(), { color: 'jaune', wall: 'Dalle', success: true, attempts: 1, wallInfo: dalle });
    expect(next.done).not.toContain('M3');
  });

  it('M3 : plus d\'un essai ne valide pas M3 (ce n\'est pas un flash)', () => {
    const next = applyValidationToWeeklyMissions(baseState(), { color: 'rouge', wall: 'Dalle', success: true, attempts: 2, wallInfo: dalle });
    expect(next.done).not.toContain('M3');
  });

  it('M4 : réussi OU échoué sur un bloc exactement au niveau max+1', () => {
    const echec = applyValidationToWeeklyMissions(baseState(), { color: 'noir', wall: 'Dalle', success: false, attempts: 5, wallInfo: dalle });
    expect(echec.done).toContain('M4');
    const reussi = applyValidationToWeeklyMissions(baseState(), { color: 'noir', wall: 'Dalle', success: true, attempts: 1, wallInfo: dalle });
    expect(reussi.done).toContain('M4');
  });

  it('⚠️ grimpeur au plafond (rose) : M4 est structurellement impossible, jamais validé', () => {
    expect(isAtLevelCeiling('rose')).toBe(true);
    const next = applyValidationToWeeklyMissions(baseState({ level: 'rose' }), { color: 'rose', wall: 'Dalle', success: false, attempts: 1, wallInfo: dalle });
    expect(next.done).not.toContain('M4');
  });

  it('M5/M6/M7 : catégorie du mur, sur une validation réussie', () => {
    const m5 = applyValidationToWeeklyMissions(baseState(), { color: 'rouge', wall: 'Grotte Adultes', success: true, attempts: 1, wallInfo: devers });
    expect(m5.done).toContain('M5');
    const m6 = applyValidationToWeeklyMissions(baseState(), { color: 'rouge', wall: 'Réta Adultes', success: true, attempts: 1, wallInfo: reta });
    expect(m6.done).toContain('M6');
    const m7 = applyValidationToWeeklyMissions(baseState(), { color: 'rouge', wall: 'Dalle', success: true, attempts: 1, wallInfo: dalle });
    expect(m7.done).toContain('M7');
  });

  it('M5/M6/M7 : un échec ne valide rien de tout ça', () => {
    const next = applyValidationToWeeklyMissions(baseState(), { color: 'rouge', wall: 'Grotte Adultes', success: false, attempts: 1, wallInfo: devers });
    expect(next.done).not.toContain('M5');
  });

  it('M2 : atteint 4 murs comptabilisables distincts cette semaine', () => {
    let state = baseState({ walls: ['Dalle', 'Güllich', 'Grotte Adultes'] });
    state = applyValidationToWeeklyMissions(state, { color: 'jaune', wall: 'Grande Face', success: false, attempts: 1, wallInfo: { category: 'autre', kidsOnly: false } });
    expect(state.walls).toHaveLength(4);
    expect(state.done).toContain('M2');
  });

  it('M2 : un mur déjà compté ce mur ne fait pas doublon', () => {
    const state = applyValidationToWeeklyMissions(
      baseState({ walls: ['Dalle', 'Güllich', 'Grotte Adultes'] }),
      { color: 'jaune', wall: 'Dalle', success: false, attempts: 1, wallInfo: dalle }
    );
    expect(state.walls).toHaveLength(3);
    expect(state.done).not.toContain('M2');
  });

  it('M2 : un résultat (succès OU échec) compte, pas seulement un succès', () => {
    const state = applyValidationToWeeklyMissions(baseState(), { color: 'jaune', wall: 'Dalle', success: false, attempts: 4, wallInfo: dalle });
    expect(state.walls).toContain('Dalle');
  });

  it('⚠️ grimpeur >= 10 ans : un mur kidsOnly ne compte NI pour M2 NI pour M6', () => {
    const adulte = baseState({ countsChildWalls: false, walls: ['Dalle', 'Güllich', 'Grotte Adultes'] });
    const next = applyValidationToWeeklyMissions(adulte, { color: 'rouge', wall: "Réta d'initiation", success: true, attempts: 1, wallInfo: kidsReta });
    expect(next.walls).toHaveLength(3); // pas ajouté
    expect(next.done).not.toContain('M2');
    expect(next.done).not.toContain('M6');
  });

  it('⚠️ grimpeur < 10 ans : le même résultat sur ce mur compte pour M2 ET M6', () => {
    const enfant = baseState({ countsChildWalls: true, walls: ['Dalle', 'Güllich', 'Grotte Adultes'] });
    const next = applyValidationToWeeklyMissions(enfant, { color: 'rouge', wall: "Réta d'initiation", success: true, attempts: 1, wallInfo: kidsReta });
    expect(next.walls).toHaveLength(4);
    expect(next.done).toContain('M2');
    expect(next.done).toContain('M6');
  });

  it('ne mute jamais l\'état reçu en entrée', () => {
    const state = baseState({ done: ['M8'] });
    const snapshot = JSON.stringify(state);
    applyValidationToWeeklyMissions(state, { color: 'rouge', wall: 'Dalle', success: true, attempts: 1, wallInfo: dalle });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('renvoie completedAt dès que les 8 missions sont réunies, jamais avant', () => {
    const almost = baseState({ done: ['M1', 'M2', 'M3', 'M5', 'M6', 'M7', 'M8'] });
    const still = applyValidationToWeeklyMissions(almost, { color: 'jaune', wall: 'Grande Face', success: false, attempts: 1, wallInfo: { category: 'autre', kidsOnly: false } });
    expect(still.completedAt).toBeNull();
    const complete = applyValidationToWeeklyMissions(almost, { color: 'noir', wall: 'Dalle', success: false, attempts: 1, wallInfo: dalle }); // M4
    expect(complete.done.sort()).toEqual([...MISSION_KEYS].sort());
    expect(complete.completedAt).not.toBeNull();
  });
});

describe('applyDeclarativeMission', () => {
  it('ajoute la mission si absente', () => {
    const next = applyDeclarativeMission(baseState(), 'M8');
    expect(next.done).toContain('M8');
  });

  it('idempotent : ne duplique rien si déjà présente', () => {
    const state = baseState({ done: ['M8'] });
    const next = applyDeclarativeMission(state, 'M8');
    expect(next).toBe(state); // même référence : rien n'a changé
  });

  it('déclenche completedAt quand elle complète la grille', () => {
    const almost = baseState({ done: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'] });
    const next = applyDeclarativeMission(almost, 'M8');
    expect(isWeeklyMissionsGridComplete(next)).toBe(true);
    expect(next.completedAt).not.toBeNull();
  });
});

describe('WEEKLY_MISSIONS_WALLS_TARGET', () => {
  it('vaut 4 (§C.2)', () => {
    expect(WEEKLY_MISSIONS_WALLS_TARGET).toBe(4);
  });
});

describe('describeMission', () => {
  it('M1/M3/M4 rappellent le niveau figé, pas le niveau courant', () => {
    const state = baseState({ level: 'rouge' });
    expect(describeMission('M1', state)).toContain('rouge');
    expect(describeMission('M3', state)).toContain('violet'); // max-1 de rouge
    expect(describeMission('M4', state)).toContain('noir'); // max+1 de rouge
  });
});
