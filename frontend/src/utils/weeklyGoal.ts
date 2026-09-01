// ✅ Objectifs de la semaine (ClientScreen.tsx) — module pur, sans import Firestore
// (même discipline que roulette.ts/challenges.ts) : construit et évalue une liste
// cumulable d'objectifs hebdomadaires, à la place de l'ancien objectif unique
// "N blocs tous niveaux confondus" (champ users.weeklyGoalTarget).
//
// Trois types d'objectif, combinables librement dans une même liste :
//  - "color"   : N blocs d'une couleur donnée (ex. "2 rouges", "3 noirs")
//  - "boulder" : un bloc précis (identifié par son id, ex. "bloc n°6 - Dalle")
//  - "all"     : N blocs tous niveaux confondus (équivalent de l'ancien système,
//                conservé comme un type d'objectif parmi d'autres, pas supprimé)
//
// Un objectif est évalué sur les validations de LA SEMAINE EN COURS, exactement
// comme l'ancien système : une validation compte pour la semaine où son premier
// succès a eu lieu (client_boulder_results.createdAt, immuable après la première
// écriture — voir CLAUDE.md section "client_boulder_results.createdAt immutability").
// Revalider un bloc déjà réussi avant cette semaine ne le fait donc pas "rentrer"
// dans un objectif de cette semaine, y compris pour un objectif "boulder" — c'est
// la même sémantique que pour "color"/"all", assumée pour rester cohérente plutôt
// que de traiter les objectifs "bloc précis" différemment des autres.

export type WeeklyGoalItem =
  | { type: 'color'; color: string; target: number }
  | { type: 'boulder'; boulderId: string; boulderLabel: string }
  | { type: 'all'; target: number };

export interface WeeklyGoalProgress {
  item: WeeklyGoalItem;
  current: number;
  target: number;
  done: boolean;
}

// Cap volontairement bas : la liste est affichée en entier sur l'écran d'accueil
// mobile (voir ClientScreen.tsx), pas de pagination prévue.
export const MAX_WEEKLY_GOAL_ITEMS = 8;

export interface WeeklyValidation {
  boulderId: string;
  createdAt: Date;
}

// `colorById` : couleur ACTUELLE de chaque bloc actif (jointure au moment de la
// lecture, jamais stockée sur le résultat — même pattern que colorById dans
// ClientDaily.tsx pour classement_profiles). Un objectif "color" ne recompte donc
// que les blocs dont la couleur en vigueur aujourd'hui correspond, pas la couleur
// qu'ils avaient au moment de la validation.
export function computeWeeklyGoalProgress(
  items: WeeklyGoalItem[],
  validationsThisWeek: WeeklyValidation[],
  colorById: Map<string, string>
): WeeklyGoalProgress[] {
  return items.map((item) => {
    if (item.type === 'all') {
      const current = validationsThisWeek.length;
      return { item, current, target: item.target, done: current >= item.target };
    }
    if (item.type === 'color') {
      const current = validationsThisWeek.filter((v) => colorById.get(v.boulderId) === item.color).length;
      return { item, current, target: item.target, done: current >= item.target };
    }
    const done = validationsThisWeek.some((v) => v.boulderId === item.boulderId);
    return { item, current: done ? 1 : 0, target: 1, done };
  });
}

// Repli de lecture pour les comptes ayant enregistré un objectif avant cette
// évolution (champ users.weeklyGoalTarget, un simple nombre) : converti à la
// volée en une liste d'un seul objectif "all" équivalent. Jamais réécrit tel
// quel — dès que l'utilisateur modifie et enregistre depuis le nouvel écran,
// weeklyGoalTarget est effacé (deleteField) et weeklyGoalItems prend le relais,
// même principe que legacyAge/image_base64 (voir CLAUDE.md) : un seul sens de
// lecture, plus aucun écrivain du champ historique.
export function legacyGoalToItems(target: number | null | undefined): WeeklyGoalItem[] {
  if (!target || target <= 0) return [];
  return [{ type: 'all', target }];
}

// Ajoute un objectif à la liste, ou remplace l'objectif existant de même nature
// (même couleur, ou même bloc, ou l'objectif "all") plutôt que de le dupliquer —
// évite l'ambiguïté de deux objectifs "rouge" distincts dans la même semaine.
export function upsertGoalItem(items: WeeklyGoalItem[], newItem: WeeklyGoalItem): WeeklyGoalItem[] {
  const sameKey = (it: WeeklyGoalItem): boolean => {
    if (it.type !== newItem.type) return false;
    if (it.type === 'color' && newItem.type === 'color') return it.color === newItem.color;
    if (it.type === 'boulder' && newItem.type === 'boulder') return it.boulderId === newItem.boulderId;
    return it.type === 'all' && newItem.type === 'all';
  };
  const idx = items.findIndex(sameKey);
  if (idx === -1) return [...items, newItem];
  const copy = [...items];
  copy[idx] = newItem;
  return copy;
}
