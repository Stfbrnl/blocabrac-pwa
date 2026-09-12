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

export interface LudicState {
  weeklyGoalItems?: WeeklyGoalItem[] | null;
  wallCounts?: WallCounts;
  rouletteChallengesCompleted?: number;
  rouletteRecentChallenges?: RouletteCompletion[];
  // ✅ PLAN-premiers-ascensionnistes.md §3 : consentement dédié à la liste des "premiers
  // ascensionnistes" (distinct de `classementOptIn`, qui couvre le classement général) —
  // défaut false (personne n'apparaît sans l'avoir choisi), réglable depuis "Mes informations".
  firstAscentOptIn?: boolean;
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
export const incrementRouletteCompleted = async (
  uid: string,
  current: LudicState,
  entry: RouletteCompletion
): Promise<{ rouletteChallengesCompleted: number; rouletteRecentChallenges: RouletteCompletion[] }> => {
  const rouletteChallengesCompleted = (current.rouletteChallengesCompleted || 0) + 1;
  const rouletteRecentChallenges = addRouletteCompletion(current.rouletteRecentChallenges, entry);
  await updateLudicState(uid, { rouletteChallengesCompleted, rouletteRecentChallenges });
  return { rouletteChallengesCompleted, rouletteRecentChallenges };
};
