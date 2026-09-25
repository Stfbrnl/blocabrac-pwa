// ✅ docs/processus/PROCESSUS-erreurs-avalees.md §3 (V2.48) : logique d'écriture du flush débounced de
// ClientDaily.tsx (classement_profiles + user_ludic_state.wallCounts + challenges.progress),
// extraite en fonction PURE — aucun import Firestore ici, seulement des données et des
// références déjà résolues. C'est cette extraction qui permet à `runReadThenWriteTransaction`
// (voir firestoreTransaction.ts) d'imposer l'ordre lectures/écritures par la signature plutôt
// que par la discipline : cette fonction ne reçoit jamais `tx`, elle ne PEUT pas relire.
// ✅ docs/plans/PLAN-etat-ludique-hors-users.md, passe C : wallCounts vit uniquement dans
// user_ludic_state désormais (plus de double écriture/repli sur "users" — retiré après
// vérification en production de la passe A/B, voir git blame pour la version transitoire).
import type { DocumentReference, DocumentData } from 'firebase/firestore';
import { summaryFromColorCounts, type ColorCounts } from './classementScore';
import type { TransactionWrite } from './firestoreTransaction';
import {
  resolveWeeklyMissionsState, isWeeklyMissionsGridComplete,
  type WeeklyMissionsState, type MissionKey,
} from './weeklyMissions';

export type WallCounts = Record<string, number>;

export interface ClassementFlushPending {
  scoreDelta: number;
  colorDeltas: Map<string, number>;
  seasonScoreDelta: number;
  seasonColorDeltas: Map<string, number>;
  wallDeltas: Map<string, number>;
  challengeDeltas: Map<string, number>;
  blocDesigneScores: Map<string, number>;
  // ✅ PLAN-anecdote-methodes-missions.md §C.5 : missions M1-M7 nouvellement accomplies et
  // murs nouvellement visités cette semaine (pour M2), accumulés comme le reste — union,
  // jamais un remplacement (deux clics rapprochés peuvent chacun compléter une mission
  // différente avant le prochain flush). `missionsFige` est constant pour toute la session
  // (niveau/âge figés une fois à l'ouverture de ClientDaily.tsx) : voir mergeClassementFlushPending.
  missionsNewlyDone: Set<MissionKey>;
  wallsNewlyVisited: Set<string>;
  missionsFige: { level: string; countsChildWalls: boolean } | null;
}

// Aucun delta en attente : rien à flusher, à vérifier par l'appelant avant même de démarrer
// une transaction (voir flushClassementWrite dans ClientDaily.tsx).
export const hasPendingClassementDelta = (pending: ClassementFlushPending): boolean =>
  pending.scoreDelta !== 0 || pending.colorDeltas.size > 0 || pending.wallDeltas.size > 0
  || pending.challengeDeltas.size > 0 || pending.blocDesigneScores.size > 0
  || pending.missionsNewlyDone.size > 0 || pending.wallsNewlyVisited.size > 0;

export interface ClassementFlushRefs {
  classementProfileRef: DocumentReference<DocumentData>;
  // Cible unique de wallCounts/weeklyMissions. Toujours fourni par l'appelant même quand rien
  // ne le concerne dans ce flush (comparé par identité uniquement si utilisé, jamais
  // déréférencé sinon).
  userLudicRef: DocumentReference<DocumentData>;
  challengeRefs: Map<string, DocumentReference<DocumentData>>;
}

// ✅ docs/handoffs/RETOUR-bug-missions-et-revalidation.md §1.5 (V2.68.1) : la liste des
// documents à LIRE dans la transaction est dérivée ici, du même `pending` que celui qui
// décide des écritures — plus jamais une condition écrite à la main dans le composant. C'est
// précisément une telle condition (`if (pending.wallDeltas.size > 0) reads.userLudic = …`,
// héritée d'avant les missions) qui a laissé V2.68 réécrire `weeklyMissions` depuis une
// grille vide dès qu'un flush ne portait QUE des missions (un échec pour M4, une revalidation
// pour M1). Clés : 'classementProfile', 'userLudic', `challenge:${id}` (challengeReadKey).
export const challengeReadKey = (challengeId: string): string => `challenge:${challengeId}`;

export const classementFlushReadKeys = (pending: ClassementFlushPending): Set<string> => {
  const keys = new Set<string>(['classementProfile']);
  if (pending.wallDeltas.size > 0 || pending.missionsNewlyDone.size > 0 || pending.wallsNewlyVisited.size > 0) {
    keys.add('userLudic');
  }
  [...pending.challengeDeltas.keys(), ...pending.blocDesigneScores.keys()].forEach((id) => keys.add(challengeReadKey(id)));
  return keys;
};

export interface ClassementFlushReadData {
  // ✅ §1.6 du même retour : distingue "non lu" (clé absente de `readKeys`) de "document
  // absent" (clé présente, donnée `undefined`) — `undefined` seul ne le permettait pas. Toute
  // écriture vers un document non lu fait LEVER buildClassementFlushWrites : on préfère une
  // écriture perdue bruyamment (la file la retente puis alerte) à une corruption silencieuse.
  readKeys: ReadonlySet<string>;
  classementProfile?:{ score?: number; colorCounts?: ColorCounts; season?: { score?: number; colorCounts?: ColorCounts } };
  userLudic?: { wallCounts?: WallCounts; weeklyMissions?: WeeklyMissionsState; weeklyMissionsCompleted?: number };
  challenges: Map<string, { progress?: Record<string, { value?: number }> } | undefined>;
}

export const buildClassementFlushWrites = (
  uid: string,
  pending: ClassementFlushPending,
  readData: ClassementFlushReadData,
  refs: ClassementFlushRefs
): TransactionWrite[] => {
  const writes: TransactionWrite[] = [];

  const profileData = readData.classementProfile || {};
  const colorCounts: ColorCounts = { ...profileData.colorCounts };
  pending.colorDeltas.forEach((delta, color) => {
    colorCounts[color as keyof ColorCounts] = ((colorCounts[color as keyof ColorCounts] as number) || 0) + delta;
  });
  const { bouldersValidated, bestColorRank } = summaryFromColorCounts(colorCounts);

  const seasonData = profileData.season || {};
  const seasonColorCounts: ColorCounts = { ...seasonData.colorCounts };
  pending.seasonColorDeltas.forEach((delta, color) => {
    seasonColorCounts[color as keyof ColorCounts] = ((seasonColorCounts[color as keyof ColorCounts] as number) || 0) + delta;
  });

  writes.push({
    ref: refs.classementProfileRef,
    data: {
      score: (profileData.score || 0) + pending.scoreDelta,
      bouldersValidated,
      bestColorRank,
      colorCounts,
      season: {
        score: (seasonData.score || 0) + pending.seasonScoreDelta,
        colorCounts: seasonColorCounts,
      },
    },
  });

  // ✅ wallCounts et weeklyMissions vivent sur le MÊME document (user_ludic_state) — une
  // seule écriture combinée quand l'un OU l'autre a bougé, jamais deux `tx.set()` séparés sur
  // la même ref dans la même transaction (§C.5 : "fondu dans l'écriture existante").
  const userLudicPatch: Record<string, unknown> = {};

  if (pending.wallDeltas.size > 0) {
    const wallCounts: WallCounts = { ...readData.userLudic?.wallCounts };
    pending.wallDeltas.forEach((delta, wall) => {
      wallCounts[wall] = (wallCounts[wall] || 0) + delta;
    });
    userLudicPatch.wallCounts = wallCounts;
  }

  if ((pending.missionsNewlyDone.size > 0 || pending.wallsNewlyVisited.size > 0) && pending.missionsFige) {
    const base = resolveWeeklyMissionsState(
      readData.userLudic?.weeklyMissions, new Date(),
      pending.missionsFige.level, pending.missionsFige.countsChildWalls
    );
    const wasComplete = isWeeklyMissionsGridComplete(base);
    const doneSet = new Set<MissionKey>(base.done);
    pending.missionsNewlyDone.forEach((m) => doneSet.add(m));
    const wallsSet = new Set<string>(base.walls);
    pending.wallsNewlyVisited.forEach((w) => wallsSet.add(w));
    const done = Array.from(doneSet);
    const provisional: WeeklyMissionsState = { ...base, done, walls: Array.from(wallsSet), completedAt: base.completedAt };
    const weeklyMissions: WeeklyMissionsState = {
      ...provisional,
      completedAt: isWeeklyMissionsGridComplete(provisional) ? (base.completedAt ?? new Date().toISOString()) : base.completedAt,
    };
    userLudicPatch.weeklyMissions = weeklyMissions;
    if (!wasComplete && isWeeklyMissionsGridComplete(weeklyMissions)) {
      userLudicPatch.weeklyMissionsCompleted = (readData.userLudic?.weeklyMissionsCompleted || 0) + 1;
    }
  }

  if (Object.keys(userLudicPatch).length > 0) {
    writes.push({ ref: refs.userLudicRef, data: { ...userLudicPatch, updated_at: new Date().toISOString() } });
  }

  // ✅ Défis entre potes : "seuil"/"fenetre" appliquent un delta cumulatif ; "bloc_designe"
  // écrit le MEILLEUR score observé (jamais un cumul), donc un max plutôt qu'une addition.
  const challengeIds = new Set<string>([...pending.challengeDeltas.keys(), ...pending.blocDesigneScores.keys()]);
  challengeIds.forEach((challengeId) => {
    const challengeData = readData.challenges.get(challengeId);
    const challengeRef = refs.challengeRefs.get(challengeId);
    // ✅ Défi supprimé/disparu entre le moment où le delta a été accumulé et ce flush : rien
    // à écrire plutôt qu'une erreur — plus rare que fréquent, jamais observé, mais un
    // `challenges/{id}` reste supprimable en théorie (aucun chemin de suppression aujourd'hui,
    // mais rien ne l'interdit non plus côté règles).
    if (!challengeData || !challengeRef) return;
    const currentValue = challengeData.progress?.[uid]?.value || 0;
    let newValue = currentValue;
    if (pending.challengeDeltas.has(challengeId)) newValue = currentValue + (pending.challengeDeltas.get(challengeId) || 0);
    if (pending.blocDesigneScores.has(challengeId)) newValue = Math.max(currentValue, pending.blocDesigneScores.get(challengeId) || 0);
    writes.push({
      ref: challengeRef,
      data: { progress: { [uid]: { value: newValue, updated_at: new Date().toISOString() } } },
    });
  });

  // ✅ Garde §1.6 : chaque document écrit doit avoir été lu dans CETTE transaction.
  const readKeyOf = (ref: DocumentReference<DocumentData>): string | undefined => {
    if (ref === refs.classementProfileRef) return 'classementProfile';
    if (ref === refs.userLudicRef) return 'userLudic';
    for (const [id, challengeRef] of refs.challengeRefs) if (challengeRef === ref) return challengeReadKey(id);
    return undefined;
  };
  writes.forEach(({ ref }) => {
    const key = readKeyOf(ref);
    if (!key || !readData.readKeys.has(key)) {
      throw new Error(`buildClassementFlushWrites : écriture vers "${key ?? 'référence inconnue'}" sans lecture préalable dans la transaction (voir classementFlushReadKeys)`);
    }
  });

  return writes;
};

// ✅ Fusionne deux jeux de deltas en attente — fournie comme `merge(older, newer)` à
// useDebouncedFlushQueue (voir son contrat détaillé) : additive et donc commutative, `older`/
// `newer` n'ont pas besoin d'être distingués ici (c'est précisément pour ça que ce cas n'avait
// pas révélé le bug d'ordre trouvé par ClaudeNav le 19/08 — seul un contrat "dernier gagne",
// non commutatif, y est sensible). Les noms de paramètres suivent quand même la convention
// `older`/`newer` du hook, par cohérence de lecture avec son propre contrat.
export const mergeClassementFlushPending = (
  older: ClassementFlushPending | undefined,
  newer: ClassementFlushPending
): ClassementFlushPending => {
  if (!older) return newer;
  const mergeMaps = (a: Map<string, number>, b: Map<string, number>): Map<string, number> => {
    const merged = new Map(a);
    b.forEach((delta, key) => merged.set(key, (merged.get(key) || 0) + delta));
    return merged;
  };
  return {
    scoreDelta: older.scoreDelta + newer.scoreDelta,
    colorDeltas: mergeMaps(older.colorDeltas, newer.colorDeltas),
    seasonScoreDelta: older.seasonScoreDelta + newer.seasonScoreDelta,
    seasonColorDeltas: mergeMaps(older.seasonColorDeltas, newer.seasonColorDeltas),
    wallDeltas: mergeMaps(older.wallDeltas, newer.wallDeltas),
    challengeDeltas: mergeMaps(older.challengeDeltas, newer.challengeDeltas),
    // ✅ blocDesigneScores n'est pas un delta : un max composé, jamais une addition (même
    // raison que dans buildClassementFlushWrites ci-dessus) — un max est commutatif aussi.
    blocDesigneScores: (() => {
      const merged = new Map(older.blocDesigneScores);
      newer.blocDesigneScores.forEach((score, key) => merged.set(key, Math.max(merged.get(key) || 0, score)));
      return merged;
    })(),
    // ✅ Union simple, commutative comme le reste (§C.5) — pas un delta numérique.
    missionsNewlyDone: new Set([...older.missionsNewlyDone, ...newer.missionsNewlyDone]),
    wallsNewlyVisited: new Set([...older.wallsNewlyVisited, ...newer.wallsNewlyVisited]),
    // ✅ Constant pour toute la session (figé une fois au montage de ClientDaily.tsx) —
    // n'importe laquelle des deux valeurs convient, elles sont censées être identiques.
    missionsFige: older.missionsFige ?? newer.missionsFige,
  };
};

export const emptyClassementFlushPending = (): ClassementFlushPending => ({
  scoreDelta: 0,
  colorDeltas: new Map(),
  seasonScoreDelta: 0,
  seasonColorDeltas: new Map(),
  wallDeltas: new Map(),
  challengeDeltas: new Map(),
  blocDesigneScores: new Map(),
  missionsNewlyDone: new Set(),
  wallsNewlyVisited: new Set(),
  missionsFige: null,
});
