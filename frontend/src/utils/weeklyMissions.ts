// ✅ docs/plans/PLAN-anecdote-methodes-missions.md §C — Missions hebdomadaires. Module PUR
// (aucun import Firestore), même discipline que roulette.ts/challenges.ts/methodVote.ts :
// testable sans émulateur. Réutilise `resolveTargetColor`/`levelOrder` de la Roulette pour
// le clamp plancher/plafond (§C.3.b du plan : "ne pas en écrire une seconde").
import type { Level } from './competitionEligibility';
import { levelOrder } from './competitionEligibility';
import { resolveTargetColor } from './roulette';
import type { WallCategoryInfo } from '../config/gymConfig';

export const MISSION_KEYS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'] as const;
export type MissionKey = typeof MISSION_KEYS[number];

export const WEEKLY_MISSIONS_WALLS_TARGET = 4;

export interface WeeklyMissionsState {
  isoWeek: string; // "YYYY-Www"
  level: string; // niveau figé à l'ouverture de la semaine (§C.3.c)
  countsChildWalls: boolean; // figé aussi (§C.7)
  done: MissionKey[];
  walls: string[]; // murs comptabilisables visités cette semaine (pour M2)
  completedAt: string | null;
}

// ✅ Algorithme ISO 8601 standard (semaine du jeudi) : l'année ISO est celle du jeudi de la
// semaine courante, la semaine 1 est celle qui contient le 4 janvier. Calculé en UTC pour ne
// jamais dépendre du fuseau horaire de l'appareil au moment du calcul.
export const isoWeekKey = (date: Date): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lundi=0 .. dimanche=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jeudi de cette semaine
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);
  const diffDays = Math.round((d.getTime() - week1Monday.getTime()) / 86400000);
  const weekNum = Math.floor(diffDays / 7) + 1;
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
};

const emptyState = (isoWeek: string, level: string, countsChildWalls: boolean): WeeklyMissionsState => ({
  isoWeek,
  level,
  countsChildWalls,
  done: [],
  walls: [],
  completedAt: null,
});

// ✅ §C.4 : "dérivée de la semaine ISO courante ... aucune tâche planifiée, aucun backend."
// Si la semaine stockée diffère de la semaine courante (ou n'existe pas encore), la grille
// repart à zéro et le niveau/l'âge sont refigés sur les valeurs COURANTES fournies par
// l'appelant (jamais recalculés plus tard dans la même semaine ISO).
export const resolveWeeklyMissionsState = (
  stored: WeeklyMissionsState | undefined | null,
  now: Date,
  currentLevel: string,
  currentCountsChildWalls: boolean
): WeeklyMissionsState => {
  const nowWeek = isoWeekKey(now);
  if (stored && stored.isoWeek === nowWeek) return stored;
  return emptyState(nowWeek, currentLevel, currentCountsChildWalls);
};

const withCompletion = (state: WeeklyMissionsState, done: MissionKey[]): WeeklyMissionsState => ({
  ...state,
  done,
  completedAt: done.length >= MISSION_KEYS.length ? (state.completedAt ?? new Date().toISOString()) : state.completedAt,
});

// ✅ §C.3.b : un grimpeur au niveau max (rose) n'a pas de max+1 — M4 lui est structurellement
// impossible et doit être remplacé par M4 bis (déclaratif, voir applyDeclarativeMission).
export const isAtLevelCeiling = (level: string): boolean =>
  resolveTargetColor(level as Level, 'max+1').appliedTarget !== 'max+1';

export interface BoulderValidationEvent {
  color: string | null | undefined;
  wall: string | null | undefined;
  success: boolean;
  attempts: number;
  wallInfo: WallCategoryInfo | undefined;
}

// ✅ Le cœur du chantier : une validation (clic Réussi/Échoué) peut satisfaire plusieurs
// missions à la fois (M1+M3 en cas de flash au niveau max, recoupement voulu §C.2). Ne mute
// jamais l'état reçu — renvoie toujours un nouvel objet, y compris quand rien ne change
// (permet à l'appelant de comparer `done`/`walls` par référence... non, par CONTENU : voir
// le commentaire d'appel dans ClientDaily.tsx, qui compare les tableaux élément par élément).
export const applyValidationToWeeklyMissions = (
  state: WeeklyMissionsState,
  event: BoulderValidationEvent
): WeeklyMissionsState => {
  const doneSet = new Set<MissionKey>(state.done);
  const wallsSet = new Set<string>(state.walls);

  // ✅ §C.7 : un mur "kidsOnly" ne compte QUE si ce grimpeur est comptabilisé comme enfant
  // cette semaine — jamais pour M2, jamais pour M5/M6/M7, quel que soit son âge réel du jour
  // (l'âge est lui-même figé dans `state.countsChildWalls`, voir resolveWeeklyMissionsState).
  const wallCounts = !!event.wall && !!event.wallInfo && (state.countsChildWalls || !event.wallInfo.kidsOnly);

  // M2 : "un résultat a été saisi" — succès OU échec, peu importe (§C.2).
  if (wallCounts && event.wall) wallsSet.add(event.wall);

  if (event.success) {
    // M1 : validation réussie sur un bloc de la couleur du niveau figé.
    if (event.color === state.level) doneSet.add('M1');

    // M3 : flash (1 essai) sur une couleur >= max-1 (clamp plancher via resolveTargetColor,
    // même logique que la Roulette — §C.3.b).
    if (event.attempts === 1 && event.color) {
      const colorIdx = levelOrder.indexOf(event.color as Level);
      const thresholdColor = resolveTargetColor(state.level as Level, 'max-1').color;
      const thresholdIdx = levelOrder.indexOf(thresholdColor);
      if (colorIdx >= 0 && colorIdx >= thresholdIdx) doneSet.add('M3');
    }

    // M5/M6/M7 : catégorie du mur, seulement si comptabilisable pour ce grimpeur.
    if (wallCounts && event.wallInfo) {
      if (event.wallInfo.category === 'devers') doneSet.add('M5');
      if (event.wallInfo.category === 'reta') doneSet.add('M6');
      if (event.wallInfo.category === 'dalle') doneSet.add('M7');
    }
  }

  // M4 : "tester" (réussi OU échoué) un bloc EXACTEMENT au niveau max+1 — jamais si le
  // grimpeur est déjà au plafond (M4 bis prend le relais, déclaratif, hors de cette fonction).
  if (event.color && !isAtLevelCeiling(state.level)) {
    const plusOne = resolveTargetColor(state.level as Level, 'max+1');
    if (event.color === plusOne.color) doneSet.add('M4');
  }

  if (wallsSet.size >= WEEKLY_MISSIONS_WALLS_TARGET) doneSet.add('M2');

  return withCompletion({ ...state, walls: Array.from(wallsSet) }, Array.from(doneSet));
};

// ✅ M4 bis (déclarative, réutilise le motif "J'ai relevé le défi" de la Roulette — §C.3.b) et
// M8 (roulette relevée, §C.2) partagent cette même fonction : une simple case cochée, jamais
// vérifiée, jamais retirable.
export const applyDeclarativeMission = (state: WeeklyMissionsState, missionKey: MissionKey): WeeklyMissionsState => {
  if (state.done.includes(missionKey)) return state;
  return withCompletion(state, [...state.done, missionKey]);
};

// ✅ V2.68.1 : réconcilie la grille AFFICHÉE (mémoire, qui peut porter des missions cochées
// dont le flush débouncé n'est pas encore parti) avec une grille fraîchement relue/écrite
// (retour d'une écriture transactionnelle M8/M4 bis). Même semaine : union — l'une et l'autre
// ne font que gagner des cases, jamais en perdre. Semaines différentes : la plus récente gagne
// (clé "YYYY-Www" comparable lexicographiquement).
export const mergeWeeklyMissionsForDisplay = (
  memory: WeeklyMissionsState | undefined,
  fresh: WeeklyMissionsState
): WeeklyMissionsState => {
  if (!memory || memory.isoWeek < fresh.isoWeek) return fresh;
  if (memory.isoWeek > fresh.isoWeek) return memory;
  const done = Array.from(new Set<MissionKey>([...fresh.done, ...memory.done]));
  const walls = Array.from(new Set<string>([...fresh.walls, ...memory.walls]));
  return { ...fresh, done, walls, completedAt: fresh.completedAt ?? memory.completedAt };
};

export const isWeeklyMissionsGridComplete = (state: WeeklyMissionsState): boolean =>
  state.done.length >= MISSION_KEYS.length;

// ✅ §C.8 : "le niveau figé doit être visible" — chaque libellé rappelle le niveau figé de la
// semaine plutôt qu'un texte générique, pour qu'un grimpeur qui progresse en cours de semaine
// comprenne pourquoi ses cases ne bougent pas tant qu'il n'a pas franchi le lundi suivant.
export const describeMission = (key: MissionKey, state: WeeklyMissionsState): string => {
  switch (key) {
    case 'M1':
      return `Un bloc de ton niveau max (${state.level})`;
    case 'M2':
      return `Grimper sur ${WEEKLY_MISSIONS_WALLS_TARGET} murs différents`;
    case 'M3':
      return `Flasher un bloc niveau ${resolveTargetColor(state.level as Level, 'max-1').color} ou plus`;
    case 'M4':
      return `Tester un bloc niveau ${resolveTargetColor(state.level as Level, 'max+1').color}`;
    case 'M5':
      return 'Un bloc en dévers ou toit';
    case 'M6':
      return 'Un bloc en rétablissement';
    case 'M7':
      return 'Un bloc en dalle';
    case 'M8':
      return 'Activer et réussir un défi Roulette';
    default:
      return key;
  }
};

// ✅ §C.3.b, décision retenue : M4 bis se substitue à M4 pour un grimpeur au plafond — même
// grille à 8 cases pour tout le monde, réutilise le motif déclaratif de la Roulette.
export const MISSION_M4_BIS_LABEL =
  "Réussir un bloc de ton niveau max en t'interdisant une prise de main ou de pied.";
