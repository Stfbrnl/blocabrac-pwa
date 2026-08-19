// ✅ PROCESSUS-erreurs-avalees.md §3 (V2.48) : impose par la SIGNATURE l'ordre "toutes les
// lectures avant toute écriture" qu'une transaction Firestore exige — au lieu de compter sur
// la discipline du code appelant, qui a déjà été prise en défaut une fois (voir le correctif
// V2.46 dans ClientDaily.tsx : `tx.get(userRef)` après `tx.set(ref, ...)`, silencieusement
// avalé par le `catch`, probablement resté cassé en prod pendant un jour entier).
//
// Cette fonction fait TOUTES les lectures (dans l'ordre des clés de `reads`) avant d'appeler
// `buildWrites`, qui ne reçoit que les DONNÉES déjà lues — jamais l'objet `tx` lui-même. Il
// est donc matériellement impossible d'appeler `tx.get()` après une écriture : `buildWrites`
// n'a rien pour le faire. Bénéfice secondaire : `buildWrites` est une fonction pure (données
// en entrée, écritures à appliquer en sortie), testable unitairement sans émulateur.
import { runTransaction, type Firestore, type DocumentReference, type DocumentData } from 'firebase/firestore';

export interface TransactionWrite {
  ref: DocumentReference<DocumentData>;
  data: DocumentData;
}

export async function runReadThenWriteTransaction(
  db: Firestore,
  reads: Record<string, DocumentReference<DocumentData>>,
  buildWrites: (data: Record<string, DocumentData | undefined>) => TransactionWrite[]
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const readData: Record<string, DocumentData | undefined> = {};
    // ✅ Toutes les lectures d'abord — cette boucle ne contient aucun appel d'écriture,
    // il ne peut donc pas y en avoir avant la dernière lecture.
    for (const key of Object.keys(reads)) {
      const snap = await tx.get(reads[key]);
      readData[key] = snap.exists() ? snap.data() : undefined;
    }
    // ✅ Puis toutes les écritures, décidées par une fonction qui ne reçoit que des
    // données déjà lues — jamais `tx`, donc jamais l'occasion de relire après avoir écrit.
    const writes = buildWrites(readData);
    // Toujours en fusion (merge) : c'est le seul mode utilisé par tous les appelants
    // actuels (classement_profiles, users.wallCounts, challenges.progress) — un futur
    // besoin d'écraser un document entier justifierait une option dédiée, pas un défaut
    // implicite different.
    writes.forEach(({ ref, data }) => {
      tx.set(ref, data, { merge: true });
    });
  });
}
