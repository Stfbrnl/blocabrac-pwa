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
import type { WallCounts, RouletteCompletion } from '../utils/roulette';
import type { WeeklyGoalItem } from '../utils/weeklyGoal';
import type { WeeklyMissionsState, MissionKey, BoulderValidationEvent } from '../utils/weeklyMissions';
import { runReadThenWriteTransaction } from '../utils/firestoreTransaction';
import {
  buildRouletteCompletionPatch, buildDeclarativeMissionPatch, buildMissionGesturePatch,
  type LudicMissionsSnapshot, type MissionsFige,
} from '../utils/ludicStateWrites';

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

// ✅ "J'ai relevé le défi" (V2.55) + M8 (PLAN-anecdote-methodes-missions.md §C.2/§C.5, fondue
// dans cette même écriture). V2.68.1 (docs/handoffs/RETOUR-bug-missions-et-revalidation.md
// §1.4) : calculé depuis le document RELU dans une transaction, plus depuis l'état chargé au
// montage — voir utils/ludicStateWrites.ts. Renvoie les valeurs réellement écrites (l'appelant
// met son affichage à jour APRÈS la confirmation, pas d'UI optimiste — retour ClaudeNav 06/09).
// `missionsFige` sert de repli si la grille stockée appartient à une semaine ISO passée.
export const incrementRouletteCompleted = async (
  uid: string,
  entry: RouletteCompletion,
  missionsFige: MissionsFige
): Promise<Required<LudicMissionsSnapshot>> => {
  let written: Required<LudicMissionsSnapshot> | undefined;
  await runReadThenWriteTransaction(db, { ludic: ludicRef(uid) }, (readData) => {
    written = buildRouletteCompletionPatch((readData.ludic || {}) as LudicState, entry, missionsFige, new Date());
    return [{ ref: ludicRef(uid), data: { ...written, updated_at: new Date().toISOString() } }];
  });
  return written!;
};

// ✅ M4 bis (§C.3.b) : même discipline que ci-dessus — relue dans la transaction.
export const recordDeclarativeMission = async (
  uid: string,
  missionKey: MissionKey,
  missionsFige: MissionsFige
): Promise<{ weeklyMissions: WeeklyMissionsState; weeklyMissionsCompleted: number }> => {
  let written: { weeklyMissions: WeeklyMissionsState; weeklyMissionsCompleted: number } | undefined;
  await runReadThenWriteTransaction(db, { ludic: ludicRef(uid) }, (readData) => {
    written = buildDeclarativeMissionPatch((readData.ludic || {}) as LudicState, missionKey, missionsFige, new Date());
    return [{ ref: ludicRef(uid), data: { ...written, updated_at: new Date().toISOString() } }];
  });
  return written!;
};

// ✅ V2.69 : gestes de mission ("J'ai testé ce bloc", "Je l'ai refait") — même discipline que
// ci-dessus (relu dans la transaction), et JAMAIS d'écriture dans client_boulder_results.
export const recordMissionGesture = async (
  uid: string,
  event: BoulderValidationEvent,
  missionsFige: MissionsFige
): Promise<{ weeklyMissions: WeeklyMissionsState; weeklyMissionsCompleted: number }> => {
  let written: { weeklyMissions: WeeklyMissionsState; weeklyMissionsCompleted: number } | undefined;
  await runReadThenWriteTransaction(db, { ludic: ludicRef(uid) }, (readData) => {
    written = buildMissionGesturePatch((readData.ludic || {}) as LudicState, event, missionsFige, new Date());
    return [{ ref: ludicRef(uid), data: { ...written, updated_at: new Date().toISOString() } }];
  });
  return written!;
};
