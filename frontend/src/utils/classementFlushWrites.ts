// ✅ PROCESSUS-erreurs-avalees.md §3 (V2.48) : logique d'écriture du flush débounced de
// ClientDaily.tsx (classement_profiles + users.wallCounts + challenges.progress), extraite
// en fonction PURE — aucun import Firestore ici, seulement des données et des références déjà
// résolues. C'est cette extraction qui permet à `runReadThenWriteTransaction` (voir
// firestoreTransaction.ts) d'imposer l'ordre lectures/écritures par la signature plutôt que
// par la discipline : cette fonction ne reçoit jamais `tx`, elle ne PEUT pas relire.
import type { DocumentReference, DocumentData } from 'firebase/firestore';
import { summaryFromColorCounts, type ColorCounts } from './classementScore';
import type { TransactionWrite } from './firestoreTransaction';

export type WallCounts = Record<string, number>;

export interface ClassementFlushPending {
  scoreDelta: number;
  colorDeltas: Map<string, number>;
  seasonScoreDelta: number;
  seasonColorDeltas: Map<string, number>;
  wallDeltas: Map<string, number>;
  challengeDeltas: Map<string, number>;
  blocDesigneScores: Map<string, number>;
}

// Aucun delta en attente : rien à flusher, à vérifier par l'appelant avant même de démarrer
// une transaction (voir flushClassementWrite dans ClientDaily.tsx).
export const hasPendingClassementDelta = (pending: ClassementFlushPending): boolean =>
  pending.scoreDelta !== 0 || pending.colorDeltas.size > 0 || pending.wallDeltas.size > 0
  || pending.challengeDeltas.size > 0 || pending.blocDesigneScores.size > 0;

export interface ClassementFlushRefs {
  classementProfileRef: DocumentReference<DocumentData>;
  userRef: DocumentReference<DocumentData>;
  challengeRefs: Map<string, DocumentReference<DocumentData>>;
}

export interface ClassementFlushReadData {
  classementProfile?: { score?: number; colorCounts?: ColorCounts; season?: { score?: number; colorCounts?: ColorCounts } };
  user?: { wallCounts?: WallCounts };
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

  if (pending.wallDeltas.size > 0) {
    const wallCounts: WallCounts = { ...readData.user?.wallCounts };
    pending.wallDeltas.forEach((delta, wall) => {
      wallCounts[wall] = (wallCounts[wall] || 0) + delta;
    });
    writes.push({ ref: refs.userRef, data: { wallCounts } });
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
});
