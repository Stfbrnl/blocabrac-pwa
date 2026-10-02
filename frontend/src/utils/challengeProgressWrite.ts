// ✅ docs/URGENT-flush-bloque-par-challenges.md §3 (02/10/2026) : la progression d'un défi
// entre potes est un BONUS ; le score du grimpeur ne l'est pas. Les deux n'ont aucune raison
// de vivre ou de mourir dans la même transaction.
//
// Avant ce découpage, `buildClassementFlushWrites` écrivait aussi `challenges.progress`, donc
// la transaction partagée LISAIT `challenges/{id}`. Un seul `tx.get()` refusé sur un défi
// supprimé (cas réel : `ClientDaily.tsx` charge ses défis actifs en cache-first, un défi
// effacé par son créateur sur un autre appareil survit dans le cache IndexedDB local) faisait
// avorter la transaction ENTIÈRE — score, wallCounts et missions perdus avec lui, en silence.
//
// C'est le même raisonnement qu'en V2.69, où les gestes de mission ont été sortis de cette
// même transaction : ce qui peut échouer sans conséquence ne doit pas partager le sort de ce
// qui ne le peut pas.
//
// Module PUR : aucun import Firestore (seulement des types), donc testable sans émulateur,
// et incapable par construction de relire après avoir écrit (il ne reçoit jamais `tx` — voir
// firestoreTransaction.ts).
import type { DocumentReference, DocumentData } from 'firebase/firestore';
import type { TransactionWrite } from './firestoreTransaction';

// Les deux seuls champs du flush qui concernent les défis. `ClassementFlushPending` les porte
// toujours (c'est lui que la file débouncée accumule et fusionne) ; c'est l'APPELANT qui
// dispatche ensuite vers les deux écrivains.
export interface ChallengeProgressPending {
  // Cumulatif : structures "seuil" et "fenetre" (somme des deltas depuis le dernier flush).
  challengeDeltas: Map<string, number>;
  // Maximum observé, jamais un cumul : structure "bloc_designe" compare un unique meilleur
  // essai sur un bloc désigné. Rejouer la même valeur est donc sans effet (idempotent).
  blocDesigneScores: Map<string, number>;
}

export const challengeProgressReadKey = (challengeId: string): string => `challenge:${challengeId}`;

export const challengeProgressIds = (pending: ChallengeProgressPending): Set<string> =>
  new Set<string>([...pending.challengeDeltas.keys(), ...pending.blocDesigneScores.keys()]);

export const hasPendingChallengeProgress = (pending: ChallengeProgressPending): boolean =>
  pending.challengeDeltas.size > 0 || pending.blocDesigneScores.size > 0;

export const challengeProgressReadKeys = (pending: ChallengeProgressPending): Set<string> =>
  new Set(Array.from(challengeProgressIds(pending), challengeProgressReadKey));

export interface ChallengeProgressReadData {
  // Même convention que ClassementFlushReadData : une clé absente signifie "pas lu", une clé
  // présente valant `undefined` signifie "document absent côté serveur".
  readKeys: ReadonlySet<string>;
  challenges: Map<string, { progress?: Record<string, { value?: number }> } | undefined>;
}

export const buildChallengeProgressWrites = (
  uid: string,
  pending: ChallengeProgressPending,
  readData: ChallengeProgressReadData,
  refs: Map<string, DocumentReference<DocumentData>>,
  now: Date = new Date()
): TransactionWrite[] => {
  const writes: TransactionWrite[] = [];

  challengeProgressIds(pending).forEach((challengeId) => {
    const key = challengeProgressReadKey(challengeId);
    if (!readData.readKeys.has(key)) {
      // Même discipline que buildClassementFlushWrites : on préfère une écriture perdue
      // bruyamment à une écriture construite depuis un document jamais lu.
      throw new Error(`buildChallengeProgressWrites : écriture vers ${key} sans lecture préalable`);
    }
    const challengeData = readData.challenges.get(challengeId);
    const challengeRef = refs.get(challengeId);
    // ✅ Défi supprimé entre le chargement au montage et ce flush : rien à écrire. Depuis le
    // correctif de `allow read` (02/10/2026), la lecture d'un document absent aboutit
    // normalement et ce cas redevient atteignable — il ne l'était PAS avant, la règle
    // plantant sur `resource.data` et renvoyant `permission-denied`.
    if (!challengeData || !challengeRef) return;

    const currentValue = challengeData.progress?.[uid]?.value || 0;
    let newValue = currentValue;
    if (pending.challengeDeltas.has(challengeId)) newValue = currentValue + (pending.challengeDeltas.get(challengeId) || 0);
    if (pending.blocDesigneScores.has(challengeId)) newValue = Math.max(currentValue, pending.blocDesigneScores.get(challengeId) || 0);
    writes.push({
      ref: challengeRef,
      data: { progress: { [uid]: { value: newValue, updated_at: now.toISOString() } } },
    });
  });

  return writes;
};
