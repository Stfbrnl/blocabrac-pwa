// ✅ PLAN-etat-ludique-hors-users.md : seul module du code connaissant l'emplacement de
// l'état ludique par utilisateur (objectifs de la semaine, compteur de murs, compteur/liste
// Roulette) — même discipline que services/imageStorage.ts pour Cloudinary (un futur
// déplacement ne touchera que ce fichier).
//
// Passe C du plan (retrait de `users`) : `users/{uid}` n'est plus écrit ni lu pour ces
// champs — `user_ludic_state/{uid}` est la SEULE source. Les passes A (double écriture) et
// B (backfill, `scripts/backfill-ludic-state.js`) ont déjà eu lieu et ont été déployées
// avant ce retrait (voir le plan §6 : le repli n'est retiré qu'après vérification en
// production, jamais avant).
import { doc, getDoc, setDoc, type PartialWithFieldValue } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { addRouletteCompletion, type WallCounts, type RouletteCompletion } from '../utils/roulette';
import type { WeeklyGoalItem } from '../utils/weeklyGoal';
import { resolveWeeklyMissionsState, applyDeclarativeMission, isWeeklyMissionsGridComplete, type WeeklyMissionsState } from '../utils/weeklyMissions';

export interface LudicState {
  weeklyGoalItems?: WeeklyGoalItem[] | null;
  wallCounts?: WallCounts;
  rouletteChallengesCompleted?: number;
  rouletteRecentChallenges?: RouletteCompletion[];
  // ✅ PLAN-premiers-ascensionnistes.md §3 : consentement dédié à la liste des "premiers
  // ascensionnistes" (distinct de `classementOptIn`, qui couvre le classement général) —
  // défaut false (personne n'apparaît sans l'avoir choisi), réglable depuis "Mes informations".
  firstAscentOptIn?: boolean;
  // ✅ PLAN-anecdote-methodes-missions.md §C.4 : grille hebdomadaire, réinitialisée sans cron
  // (resolveWeeklyMissionsState, dérivée de la semaine ISO courante) — voir §C.5 pour la
  // discipline d'écriture (toujours fondue dans une écriture déjà prévue par ailleurs).
  weeklyMissions?: WeeklyMissionsState;
  weeklyMissionsCompleted?: number;
}

const ludicRef = (uid: string) => doc(db, 'user_ludic_state', uid);

export const getLudicState = async (uid: string): Promise<LudicState> => {
  const snap = await getDoc(ludicRef(uid));
  return snap.exists() ? (snap.data() as LudicState) : {};
};

// Écriture par chemins pointés (merge), sur `user_ludic_state` uniquement.
export const updateLudicState = async (
  uid: string,
  partial: PartialWithFieldValue<LudicState>
): Promise<void> => {
  await setDoc(ludicRef(uid), { ...partial, updated_at: new Date().toISOString() }, { merge: true });
};

// ✅ Cas particulier "J'ai relevé le défi" (V2.55) : valeur explicite calculée depuis l'état
// déjà en mémoire de l'appelant plutôt qu'un `increment()` Firestore — cohérent avec le
// reste du module (aucune lecture ici), `current` doit être l'état déjà résolu par
// `getLudicState`.
//
// ✅ PLAN-anecdote-methodes-missions.md §C.2/§C.5 : M8 ("activer et réussir une roulette")
// est évaluée ICI et fondue dans cette MÊME écriture — "M8 est évaluée dans le gestionnaire
// de la roulette, qui écrit déjà user_ludic_state", jamais une écriture séparée.
// `missionsFige` (niveau/âge figés à l'ouverture de la semaine, résolus par l'appelant à
// partir de son propre état — voir ClientDaily.tsx) sert de repli si la grille stockée
// appartient à une semaine ISO déjà passée (resolveWeeklyMissionsState s'en charge).
export const incrementRouletteCompleted = async (
  uid: string,
  current: LudicState,
  entry: RouletteCompletion,
  missionsFige: { level: string; countsChildWalls: boolean }
): Promise<{
  rouletteChallengesCompleted: number;
  rouletteRecentChallenges: RouletteCompletion[];
  weeklyMissions: WeeklyMissionsState;
  weeklyMissionsCompleted: number;
}> => {
  const rouletteChallengesCompleted = (current.rouletteChallengesCompleted || 0) + 1;
  const rouletteRecentChallenges = addRouletteCompletion(current.rouletteRecentChallenges, entry);
  const baseMissions = resolveWeeklyMissionsState(current.weeklyMissions, new Date(), missionsFige.level, missionsFige.countsChildWalls);
  const wasComplete = isWeeklyMissionsGridComplete(baseMissions);
  const weeklyMissions = applyDeclarativeMission(baseMissions, 'M8');
  const weeklyMissionsCompleted = (current.weeklyMissionsCompleted || 0) + (!wasComplete && isWeeklyMissionsGridComplete(weeklyMissions) ? 1 : 0);
  await updateLudicState(uid, { rouletteChallengesCompleted, rouletteRecentChallenges, weeklyMissions, weeklyMissionsCompleted });
  return { rouletteChallengesCompleted, rouletteRecentChallenges, weeklyMissions, weeklyMissionsCompleted };
};
