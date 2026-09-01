// ✅ Défis entre potes (CONCEPTION-roulette-et-defis.md, Partie 2) : logique pure de
// progression et de détermination du vainqueur pour les 4 structures de défi.
//
// Module pur, comme roulette.ts : AUCUN import Firestore ici. Le document `challenges/{id}`
// (participants, progress, status...) est lu/écrit par l'appelant (ClientFriends.tsx pour la
// création/consultation, ClientDaily.tsx pour la mise à jour incrémentale de `progress`) — ce
// module ne fait que calculer, jamais persister.

export type ChallengeStructure = 'seuil' | 'fenetre' | 'bloc_designe' | 'declaratif';

// ✅ Défi "seuil" (amélioration V2.53) : au lieu d'une couleur fixe, la cible peut être
// relative au niveau de CHAQUE participant, pour qu'un défi entre grimpeurs de niveaux
// différents reste équitable. Ces jetons sont stockés tels quels dans `target_color` et
// résolus par participant, au moment d'appliquer le delta, via `resolveSeuilTargetColor`.
export const SEUIL_TARGET_MAX = '__niveau_max__';
export const SEUIL_TARGET_MAX_MINUS_1 = '__niveau_max_moins_1__';

// Résout la couleur effectivement comptée pour un participant donné :
// - une couleur "normale" est renvoyée telle quelle ;
// - `SEUIL_TARGET_MAX` -> la couleur du niveau courant du grimpeur ;
// - `SEUIL_TARGET_MAX_MINUS_1` -> la couleur juste en dessous (plancher : reste au niveau
//   courant si le grimpeur est déjà au plus bas).
// Renvoie `null` si la cible est relative mais que le niveau du grimpeur est inconnu.
// `levelOrderAsc` est fourni par l'appelant (utils/competitionEligibility.ts `levelOrder`) —
// ce module pur ne connaît pas l'ordre des couleurs.
export const resolveSeuilTargetColor = (
  target: string,
  userLevel: string | undefined,
  levelOrderAsc: readonly string[],
): string | null => {
  if (target !== SEUIL_TARGET_MAX && target !== SEUIL_TARGET_MAX_MINUS_1) return target;
  if (!userLevel) return null;
  const i = levelOrderAsc.indexOf(userLevel);
  if (i < 0) return null;
  if (target === SEUIL_TARGET_MAX) return userLevel;
  return i > 0 ? levelOrderAsc[i - 1] : userLevel;
};

export interface ChallengeProgressEntry {
  value: number;
  updated_at: string; // ISO — sert au départage d'égalité (le plus ancien gagne)
  confirmed_by?: string; // structure "declaratif" uniquement, facultatif
}

export type ChallengeProgress = Record<string, ChallengeProgressEntry>;

export interface ChallengeWinnerResult {
  // Plusieurs uids seulement si aucun `updated_at` ne permet de départager (égalité totale,
  // ex. deux entrées à la même valeur sans qu'aucune n'ait jamais été départagée) — cas
  // normalement rare car `updated_at` est de toute façon horodaté à la milliseconde.
  winnerUids: string[];
  reached: boolean; // false = personne n'a encore atteint le seuil/la fin de fenêtre
}

// Structure "seuil" : le premier participant dont la valeur atteint target_count gagne.
// Parmi ceux qui l'ont atteint, celui avec le `updated_at` le plus ancien (arrivé en premier)
// l'emporte — décision utilisateur du 19/08/2026, plutôt que déclarer un ex æquo.
export const resolveSeuilWinner = (progress: ChallengeProgress, targetCount: number): ChallengeWinnerResult => {
  const qualified = Object.entries(progress).filter(([, entry]) => entry.value >= targetCount);
  if (qualified.length === 0) return { winnerUids: [], reached: false };
  const earliest = qualified.reduce((min, [, entry]) => (entry.updated_at < min ? entry.updated_at : min), qualified[0][1].updated_at);
  return { winnerUids: qualified.filter(([, entry]) => entry.updated_at === earliest).map(([uid]) => uid), reached: true };
};

// Structure "fenêtre" : à l'échéance (ends_at dépassée), le meilleur total gagne. Même
// départage par `updated_at` en cas d'égalité de valeur. `reached` vaut toujours true dès
// qu'au moins un participant a une entrée — la fenêtre elle-même est fermée par l'appelant
// (comparaison de `ends_at` à `Date.now()`), pas par cette fonction, qui reste pure et ne
// regarde jamais l'horloge.
export const resolveFenetreWinner = (progress: ChallengeProgress): ChallengeWinnerResult => {
  const entries = Object.entries(progress);
  if (entries.length === 0) return { winnerUids: [], reached: false };
  const maxValue = Math.max(...entries.map(([, entry]) => entry.value));
  if (maxValue <= 0) return { winnerUids: [], reached: false };
  const top = entries.filter(([, entry]) => entry.value === maxValue);
  const earliest = top.reduce((min, [, entry]) => (entry.updated_at < min ? entry.updated_at : min), top[0][1].updated_at);
  return { winnerUids: top.filter(([, entry]) => entry.updated_at === earliest).map(([uid]) => uid), reached: true };
};

// Structure "bloc désigné" : même bloc pour tous, meilleur score gagne (score déjà calculé
// par l'appelant via calculatePoints — cette fonction n'a pas besoin de connaître la couleur).
// Identique dans sa forme à "fenêtre" (comparer un score par participant), mais on garde deux
// fonctions distinctes : la sémantique diffère (un seul essai définitif vs total cumulé), et un
// futur ajustement de l'une (ex. gérer une nouvelle tentative) ne doit pas modifier l'autre en
// silence.
export const resolveBlocDesigneWinner = (progress: ChallengeProgress): ChallengeWinnerResult => resolveFenetreWinner(progress);

// Structure "déclaratif" : pas de valeur numérique à comparer, chaque participant est "fait"
// ou non (value 0 ou 1 par convention côté appelant). Pas de vainqueur unique — tous ceux qui
// ont validé sont considérés comme ayant réussi le défi, à la manière d'un défi collectif.
export const resolveDeclaratifCompletion = (progress: ChallengeProgress): string[] =>
  Object.entries(progress).filter(([, entry]) => entry.value >= 1).map(([uid]) => uid);

// Delta à appliquer sur `progress[uid].value` pour UNE validation (ancien état -> nouvel état),
// même principe que `scoreDeltaForValidation` dans classementScore.ts : l'appelant lit sa propre
// entrée dans une transaction, calcule ce delta, l'applique — jamais de relecture des autres
// participants. `matches` doit être fourni par l'appelant (le bloc validé correspond-il aux
// critères du défi : couleur cible pour "seuil", bloc_id pour "bloc désigné", etc.) — ce module
// ne connaît ni les blocs ni les couleurs, seulement des nombres.
export const progressDeltaForValidation = (
  wasCounted: boolean,
  isCounted: boolean,
  pointsIfCounted = 1
): number => {
  if (wasCounted === isCounted) return 0;
  return isCounted ? pointsIfCounted : -pointsIfCounted;
};

// ✅ Retrait d'une validation (§2.5) : le compteur doit décroître symétriquement à
// l'incrément. Même fonction que ci-dessus utilisée avec (wasCounted: true, isCounted: false) —
// nommée séparément pour la lisibilité des appels et des tests, qui doivent couvrir ce chemin
// explicitement (chemin le moins parcouru, donc le plus susceptible d'un oubli).
export const progressDeltaForRemoval = (pointsWereCounted: number): number => -pointsWereCounted;
