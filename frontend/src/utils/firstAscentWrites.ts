// ✅ PLAN-premiers-ascensionnistes.md §6 : fonction PURE (aucun import Firestore) qui décide
// et compose l'écriture de `boulders/{id}.firstAscents`, appelée par
// `runReadThenWriteTransaction` (voir firestoreTransaction.ts) — même discipline que
// `classementFlushWrites.ts` : ne reçoit jamais `tx`, ne PEUT pas relire après avoir décidé.
// Cette écriture n'est PAS débouncée (contrairement au flush classement/murs/défis) : elle
// est déclenchée par le clic "Réussi", déjà immédiat, et unique par bloc sur toute sa vie.
import type { DocumentReference, DocumentData } from 'firebase/firestore';
import type { TransactionWrite } from './firestoreTransaction';
import { shouldRecordFirstAscent, type FirstAscentEntry, type ShouldRecordFirstAscentInput } from './firstAscents';

export interface FirstAscentWriteRefs {
  boulderRef: DocumentReference<DocumentData>;
}

export interface FirstAscentReadData {
  boulder?: { firstAscents?: FirstAscentEntry[] };
}

export const buildFirstAscentWrite = (
  input: Omit<ShouldRecordFirstAscentInput, 'existing'>,
  entry: FirstAscentEntry,
  readData: FirstAscentReadData,
  refs: FirstAscentWriteRefs
): TransactionWrite[] => {
  const existing = readData.boulder?.firstAscents || [];
  if (!shouldRecordFirstAscent({ ...input, existing })) return [];
  return [{ ref: refs.boulderRef, data: { firstAscents: [...existing, entry] } }];
};
