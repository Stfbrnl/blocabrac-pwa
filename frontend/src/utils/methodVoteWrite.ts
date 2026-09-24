// ✅ docs/plans/PLAN-anecdote-methodes-missions.md §B.5/§B.6 : fonction PURE (aucun import
// Firestore) qui décide et compose l'écriture double (client_boulder_results.methods +
// boulders.methodCounts/methodVotes), appelée par runReadThenWriteTransaction (voir
// firestoreTransaction.ts) — même discipline que classementFlushWrites.ts/firstAscentWrites.ts :
// ne reçoit jamais `tx`, ne PEUT pas relire après avoir décidé. L'ancien vote est TOUJOURS lu
// FRAÎCHEMENT dans la même transaction (jamais un état local mis en cache) — nécessaire pour
// que firestore.rules puisse valider le delta par un get() sur le même document, qui ne voit
// que l'état d'AVANT la transaction (vérifié sur l'émulateur, voir firestore.rules.test.ts).
import type { DocumentReference, DocumentData } from 'firebase/firestore';
import type { TransactionWrite } from './firestoreTransaction';
import { computeMethodVoteDelta } from './methodVote';

export interface MethodVoteRefs {
  clientResultRef: DocumentReference<DocumentData>;
  boulderRef: DocumentReference<DocumentData>;
}

export interface MethodVoteReadData {
  clientResult?: { methods?: string[] };
  boulder?: { methodCounts?: Record<string, number>; methodVotes?: number };
}

export const buildMethodVoteWrite = (
  newMethods: string[],
  readData: MethodVoteReadData,
  refs: MethodVoteRefs
): TransactionWrite[] => {
  const oldMethods = readData.clientResult?.methods || [];
  const { countDeltas, votesDelta } = computeMethodVoteDelta(oldMethods, newMethods);
  // ✅ Aucun changement réel (reclic sur une case déjà dans l'état voulu) : rien à écrire,
  // même discipline "pas d'écriture si rien n'a changé" que handleValidateSuccess.
  if (Object.keys(countDeltas).length === 0 && votesDelta === 0) return [];

  const oldCounts = readData.boulder?.methodCounts || {};
  // ✅ Uniquement les clés touchées, à leur valeur absolue finale — merge:true (voir
  // firestoreTransaction.ts) préserve les autres clés du vocabulaire telles quelles,
  // inutile de renvoyer la carte entière (contrairement à colorCounts, qui a besoin de
  // relire toute la carte pour calculer bouldersValidated/bestColorRank en même temps).
  const methodCountsPatch: Record<string, number> = {};
  Object.entries(countDeltas).forEach(([method, delta]) => {
    methodCountsPatch[method] = (oldCounts[method] || 0) + delta;
  });

  return [
    { ref: refs.clientResultRef, data: { methods: newMethods } },
    {
      ref: refs.boulderRef,
      data: {
        methodCounts: methodCountsPatch,
        methodVotes: (readData.boulder?.methodVotes || 0) + votesDelta,
      },
    },
  ];
};
