/**
 * Construction du document `competition_participants` — l'unique endroit où il s'écrit.
 *
 * ─── POURQUOI CE MODULE EXISTE ───────────────────────────────────────────────────────────
 *
 * Trois chemins créent une inscription : l'ajout manuel par l'admin
 * (`AdminCompetitionRegistration.tsx`), « Générer le roster »
 * (`AdminCompetitionManagement.tsx`) et l'auto-inscription du grimpeur
 * (`Client/Competitions/ClientCompetitions.tsx`). Jusqu'au 03/10/2026 ils avaient **trois
 * contrats différents**, et le seul qui soit le chemin *normal* de cette salle — les grimpeurs
 * s'inscrivent eux-mêmes — était le seul incomplet : il n'écrivait ni date de naissance, ni
 * genre, ni niveau, et un nom vide. L'écran live de compétition, qui lit ces champs sur ce
 * document, affichait donc des lignes sans nom et une catégorie « Inconnu ».
 * Voir `docs/handoffs/RETOUR-auto-inscription.md`.
 *
 * ⚠️ C'est la **troisième** fois que ce projet paie « un document, plusieurs écrivains, des
 * contrats divergents » (retour ClaudeNav, `RETOUR-auto-inscription-reponses.md` §1) : après
 * `role`/`roles[]` au printemps, puis `users` et l'état ludique en septembre. Le remède a
 * déjà sa forme dans le dépôt — `applyCompetitionValidationUpdate`, qui a réglé exactement ce
 * genre de divergence pour la validation. D'où ce module : **tout nouveau chemin
 * d'inscription doit passer par `buildCompetitionParticipant`**, et aucun ne doit composer ce
 * document à la main.
 *
 * Le verrouillage (`submitted`/`submitted_at`, écrit en `merge` par `ClientCompetitions` et
 * `CompetitionJudgeEntry`) n'est PAS concerné : ce n'est pas une création, et il ne touche à
 * aucun champ d'identité.
 */

/**
 * Les champs d'un compte `users` que l'inscription dénormalise.
 *
 * ⚠️ `legacyAge`, pas `age` : le champ Firestore s'appelle bien `age`, mais toute interface
 * TypeScript qui le LIT le nomme `legacyAge` — le nom est l'avertissement qu'aucun chemin
 * d'écriture ne l'alimente plus (voir la section « age vs dateOfBirth » de CLAUDE.md). Chaque
 * appelant mappe donc son propre champ local vers `legacyAge`, explicitement.
 */
export interface ParticipantSourceUser {
  uid: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  dateOfBirth?: string | null;
  legacyAge?: number | null;
  gender?: string | null;
  level?: string | null;
  roles?: string[] | null;
  role?: string | null;
}

/**
 * L'ensemble exact des clés écrites à la création, quel que soit le chemin.
 *
 * Exporté pour le test de propriété : c'est lui qui échoue tout seul le jour où quelqu'un
 * ajoute un champ sans l'ajouter partout — ce que trois tests de cas séparés, eux, ne
 * verraient pas (ils resteraient verts chacun sur son chemin).
 */
export const PARTICIPANT_FIELDS = [
  'user_id',
  'competition_id',
  'email',
  'first_name',
  'last_name',
  'age',
  'dateOfBirth',
  'gender',
  'level',
  'registered_at',
  'is_client',
] as const;

export type CompetitionParticipantDoc = {
  [K in (typeof PARTICIPANT_FIELDS)[number]]: unknown;
};

/**
 * Identifiant déterministe de la participation : `${uid}_${competitionId}`.
 *
 * Indispensable à `firestore.rules`, qui vérifie le verrouillage par un `get()` bon marché
 * sur ce chemin plutôt que par une requête — non supportée dans les règles. Suppose la
 * migration `firestore-migration/rekey-competition-participants.js` déjà passée.
 */
export const competitionParticipantId = (uid: string, competitionId: string): string =>
  `${uid}_${competitionId}`;

/**
 * ⚠️ `?? null` sur chaque champ optionnel, jamais `undefined` : **Firestore refuse
 * `undefined` dans un `setDoc`**, et l'échec se manifeste au moment d'inscrire quelqu'un,
 * donc en salle, devant la personne. Un compte ancien peut n'avoir ni date de naissance ni
 * genre, et c'est un état légitime — `null` le dit, `undefined` fait planter l'écriture.
 */
export function buildCompetitionParticipant(
  user: ParticipantSourceUser,
  competitionId: string,
  options: { registeredAt?: string } = {}
): CompetitionParticipantDoc {
  // `client` est garanti sur tout compte (AdminUsers.tsx + hasClientRole() dans les règles),
  // d'où le repli à `true` quand aucun rôle n'est lisible — même choix que les deux chemins
  // d'administration avant ce module. La fusion `roles` + `role` legacy est la règle du
  // projet : ne jamais tester le seul champ scalaire.
  const roles = new Set([...(user.roles || []), ...(user.role ? [user.role] : [])]);
  const isClient = roles.size > 0 ? roles.has('client') : true;

  return {
    user_id: user.uid,
    competition_id: competitionId,
    email: user.email ?? null,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    age: user.legacyAge ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    gender: user.gender ?? null,
    level: user.level ?? null,
    registered_at: options.registeredAt ?? new Date().toISOString(),
    is_client: isClient,
  };
}
