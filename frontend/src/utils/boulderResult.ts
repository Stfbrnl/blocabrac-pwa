// ✅ V2.69 (docs/handoffs/RETOUR-bug-missions-et-revalidation.md §2) : module PUR (aucun import
// Firestore) qui décide de l'écriture d'un résultat de bloc quotidien
// (`client_boulder_results/{uid}_{boulderId}`) — testable sans émulateur.
//
// Règle retenue ("B sans fenêtre") : la PREMIÈRE réussite enregistrée est la mesure ; une
// répétition n'est pas une nouvelle mesure. L'interface ne propose donc plus "Réussi"/"Échoué"
// sur un bloc déjà réussi (lecture seule + "Corriger ma saisie", sans limite de temps) — ce
// module ne l'interdit pas lui-même : une correction explicite passe par le même chemin.
//
// Préservation STRUCTURELLE (§2.5) : l'écriture ne porte que les champs que le geste pilote, en
// `merge` — jamais un document reconstruit depuis l'état React (V2.68 : note, commentaire et
// cotation proposée étaient remis à zéro par chaque reclic, faute de pré-remplissage).

export interface StoredBoulderResult {
  success: boolean;
  attempts: number | null; // null : jamais saisi (échec sans nombre d'essais, ou note seule)
  createdAt: string;
  rating: number;
  comment: string;
  proposedDifficulty: string | null;
  methods: string[];
}

export type BoulderResultFields = Partial<Pick<StoredBoulderResult, 'success' | 'attempts' | 'rating' | 'comment' | 'proposedDifficulty'>>;

export const isAlreadySucceeded = (stored: StoredBoulderResult | null | undefined): boolean => !!stored?.success;

// Normalise un document Firestore (champs éventuellement absents sur les anciens documents).
export const storedResultFromDoc = (data: Record<string, unknown>, nowISO: string): StoredBoulderResult => ({
  success: !!data.success,
  attempts: typeof data.attempts === 'number' ? data.attempts : null,
  createdAt: typeof data.createdAt === 'string' ? data.createdAt : nowISO,
  rating: typeof data.rating === 'number' ? data.rating : 0,
  comment: typeof data.comment === 'string' ? data.comment : '',
  proposedDifficulty: typeof data.proposedDifficulty === 'string' ? data.proposedDifficulty : null,
  methods: Array.isArray(data.methods) ? (data.methods as string[]) : [],
});

export interface ResultWritePlan {
  changed: boolean;
  next: StoredBoulderResult;
  // Champs à écrire en `merge` (sans userId/boulderId, ajoutés par l'appelant).
  patch: Record<string, unknown>;
  // État "réussi" avant/après pour le delta de classement (null = pas une réussite) —
  // l'appelant n'applique un delta que si l'un des deux est non nul.
  classementBefore: { attempts: number } | null;
  classementAfter: { attempts: number } | null;
}

export const planResultWrite = (
  previous: StoredBoulderResult | null,
  fields: BoulderResultFields,
  nowISO: string
): ResultWritePlan => {
  const base: StoredBoulderResult = previous ?? {
    success: false, attempts: null, createdAt: nowISO, rating: 0, comment: '', proposedDifficulty: null, methods: [],
  };
  const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as BoulderResultFields;
  const next: StoredBoulderResult = { ...base, ...defined };
  const changed = !previous || (Object.keys(defined) as Array<keyof BoulderResultFields>).some((k) => previous[k] !== next[k]);

  // ✅ Un nouveau document porte toujours `success` (les écrans de stats le lisent tel quel) ;
  // `createdAt` n'est jamais réécrit une fois posé (date de la première saisie).
  const patch: Record<string, unknown> = { ...defined, createdAt: base.createdAt, updatedAt: nowISO };
  if (!previous && patch.success === undefined) patch.success = false;

  const asClassement = (r: StoredBoulderResult | null) => (r && r.success ? { attempts: r.attempts ?? 1 } : null);
  return { changed, next, patch, classementBefore: asClassement(previous), classementAfter: asClassement(next) };
};
