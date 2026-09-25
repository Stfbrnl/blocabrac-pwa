// ✅ docs/handoffs/RETOUR-bug-missions-et-revalidation.md §1.4/§4 (V2.68.1) : patchs PURS (aucun
// import Firestore) des deux écritures déclaratives sur `user_ludic_state` — "J'ai relevé le
// défi" (compteur Roulette + M8) et M4 bis. Avant V2.68.1 elles recomposaient `weeklyMissions`
// et `rouletteRecentChallenges` depuis l'état React chargé au montage : une perte de mise à jour
// dès qu'un autre écrivain (le flush débouncé des missions M1-M7, un second onglet) avait écrit
// entre-temps. Elles sont désormais calculées depuis le document relu DANS la transaction
// (services/ludicState.ts, via runReadThenWriteTransaction) — même discipline que
// classementFlushWrites.ts : "aucune écriture ne reconstruit un document à partir de l'état
// mémoire".
//
// Pourquoi pas `arrayUnion` (§1.4 du retour) : la réinitialisation hebdomadaire exige de toute
// façon de lire `isoWeek` (un `arrayUnion` sur la grille d'une semaine passée y mêlerait ses
// anciennes cases), et `weeklyMissionsCompleted`/`completedAt` dépendent du contenu réel de
// `done`. La lecture étant nécessaire, la transaction couvre la même classe de bug, et au-delà
// (compteur Roulette, liste des 10 derniers défis).
import { addRouletteCompletion, type RouletteCompletion } from './roulette';
import {
  resolveWeeklyMissionsState, applyDeclarativeMission, applyValidationToWeeklyMissions, isWeeklyMissionsGridComplete,
  type WeeklyMissionsState, type MissionKey, type BoulderValidationEvent,
} from './weeklyMissions';

export interface LudicMissionsSnapshot {
  rouletteChallengesCompleted?: number;
  rouletteRecentChallenges?: RouletteCompletion[];
  weeklyMissions?: WeeklyMissionsState;
  weeklyMissionsCompleted?: number;
}

export interface MissionsFige {
  level: string;
  countsChildWalls: boolean;
}

export const buildDeclarativeMissionPatch = (
  stored: LudicMissionsSnapshot,
  missionKey: MissionKey,
  missionsFige: MissionsFige,
  now: Date
): { weeklyMissions: WeeklyMissionsState; weeklyMissionsCompleted: number } => {
  const base = resolveWeeklyMissionsState(stored.weeklyMissions, now, missionsFige.level, missionsFige.countsChildWalls);
  const wasComplete = isWeeklyMissionsGridComplete(base);
  const weeklyMissions = applyDeclarativeMission(base, missionKey);
  const weeklyMissionsCompleted = (stored.weeklyMissionsCompleted || 0)
    + (!wasComplete && isWeeklyMissionsGridComplete(weeklyMissions) ? 1 : 0);
  return { weeklyMissions, weeklyMissionsCompleted };
};

// ✅ V2.69 (RETOUR-bug-missions-et-revalidation.md §2.8/§2.10) : gestes "J'ai testé ce bloc" /
// "Je l'ai refait" — font avancer la grille, n'écrivent JAMAIS de résultat de bloc. Écrivain
// dédié, hors de la transaction débouncée du classement (le couplage à l'origine du bug V2.68).
export const buildMissionGesturePatch = (
  stored: LudicMissionsSnapshot,
  event: BoulderValidationEvent,
  missionsFige: MissionsFige,
  now: Date
): { weeklyMissions: WeeklyMissionsState; weeklyMissionsCompleted: number } => {
  const base = resolveWeeklyMissionsState(stored.weeklyMissions, now, missionsFige.level, missionsFige.countsChildWalls);
  const wasComplete = isWeeklyMissionsGridComplete(base);
  const weeklyMissions = applyValidationToWeeklyMissions(base, event);
  const weeklyMissionsCompleted = (stored.weeklyMissionsCompleted || 0)
    + (!wasComplete && isWeeklyMissionsGridComplete(weeklyMissions) ? 1 : 0);
  return { weeklyMissions, weeklyMissionsCompleted };
};

export const buildRouletteCompletionPatch = (
  stored: LudicMissionsSnapshot,
  entry: RouletteCompletion,
  missionsFige: MissionsFige,
  now: Date
): Required<LudicMissionsSnapshot> => ({
  rouletteChallengesCompleted: (stored.rouletteChallengesCompleted || 0) + 1,
  rouletteRecentChallenges: addRouletteCompletion(stored.rouletteRecentChallenges, entry),
  // ✅ M8, fondue dans cette même écriture (PLAN-anecdote-methodes-missions.md §C.2/§C.5).
  ...buildDeclarativeMissionPatch(stored, 'M8', missionsFige, now),
});
