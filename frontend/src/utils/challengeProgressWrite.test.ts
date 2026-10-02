import { describe, expect, it } from 'vitest';
import {
  buildChallengeProgressWrites,
  challengeProgressReadKey,
  challengeProgressReadKeys,
  hasPendingChallengeProgress,
  type ChallengeProgressPending,
} from './challengeProgressWrite';
import type { DocumentReference, DocumentData } from 'firebase/firestore';

const fakeRef = (id: string) => ({ id }) as unknown as DocumentReference<DocumentData>;
const MAINTENANT = new Date(2026, 9, 2);

const refs = new Map([
  ['c1', fakeRef('challenges/c1')],
  ['c2', fakeRef('challenges/c2')],
]);

const empty = (): ChallengeProgressPending => ({ challengeDeltas: new Map(), blocDesigneScores: new Map() });

const build = (
  pending: ChallengeProgressPending,
  challenges: Map<string, { progress?: Record<string, { value?: number }> } | undefined>
) => buildChallengeProgressWrites(
  'u1', pending, { readKeys: challengeProgressReadKeys(pending), challenges }, refs, MAINTENANT
);

describe('hasPendingChallengeProgress', () => {
  it('faux sans aucun delta de défi', () => {
    expect(hasPendingChallengeProgress(empty())).toBe(false);
  });
  it('vrai dès un delta cumulatif ou un score de bloc désigné', () => {
    expect(hasPendingChallengeProgress({ ...empty(), challengeDeltas: new Map([['c1', 1]]) })).toBe(true);
    expect(hasPendingChallengeProgress({ ...empty(), blocDesigneScores: new Map([['c2', 300]]) })).toBe(true);
  });
});

// Cas repris tels quels de classementFlushWrites.test.ts le 02/10/2026, quand la progression
// des défis a été sortie de la transaction du classement
// (docs/URGENT-flush-bloque-par-challenges.md §3). Le comportement ne change pas, seul le
// propriétaire de l'écriture change.
describe('buildChallengeProgressWrites', () => {
  it('applique un delta cumulatif à un défi "seuil"', () => {
    const writes = build({ ...empty(), challengeDeltas: new Map([['c1', 1]]) },
      new Map([['c1', { progress: { u1: { value: 1 } } }]]));
    expect(writes.find((w) => w.ref === refs.get('c1'))?.data.progress.u1.value).toBe(2);
  });

  it('applique un MAX (jamais une addition) à un défi "bloc_designe"', () => {
    const writes = build({ ...empty(), blocDesigneScores: new Map([['c1', 380]]) },
      new Map([['c1', { progress: { u1: { value: 400 } } }]]));
    // 380 < 400 déjà enregistré : le meilleur score existant ne doit jamais reculer.
    expect(writes.find((w) => w.ref === refs.get('c1'))?.data.progress.u1.value).toBe(400);
  });

  it('part de zéro quand le grimpeur n\'a pas encore de progression sur ce défi', () => {
    const writes = build({ ...empty(), challengeDeltas: new Map([['c1', 3]]) },
      new Map([['c1', { progress: {} }]]));
    expect(writes.find((w) => w.ref === refs.get('c1'))?.data.progress.u1.value).toBe(3);
  });

  it('n\'écrit que sa PROPRE clé dans progress (jamais celle d\'un autre participant)', () => {
    const writes = build({ ...empty(), challengeDeltas: new Map([['c1', 1]]) },
      new Map([['c1', { progress: { u1: { value: 1 }, u2: { value: 9 } } }]]));
    expect(Object.keys(writes[0].data.progress)).toEqual(['u1']);
  });

  // ⚠️ Le cas qui a motivé tout le découpage : avant le 02/10/2026 ce chemin était
  // INATTEIGNABLE en production, car la règle `allow read` plantait sur `resource.data` d'un
  // document absent et renvoyait `permission-denied` — ce qui tuait la transaction entière,
  // classement compris, au lieu d'arriver ici.
  it('ignore un défi dont le document a disparu entre l\'accumulation et le flush', () => {
    const writes = build({ ...empty(), challengeDeltas: new Map([['c1', 1]]) },
      new Map([['c1', undefined]]));
    expect(writes).toHaveLength(0);
  });

  it('écrit les autres défis même si l\'un d\'eux a disparu', () => {
    const writes = build({ ...empty(), challengeDeltas: new Map([['c1', 1], ['c2', 2]]) },
      new Map([['c1', undefined], ['c2', { progress: { u1: { value: 5 } } }]]));
    expect(writes).toHaveLength(1);
    expect(writes[0].ref).toBe(refs.get('c2'));
    expect(writes[0].data.progress.u1.value).toBe(7);
  });

  it('lève (au lieu d\'écrire à l\'aveugle) si un défi doit être écrit sans avoir été lu', () => {
    expect(() => buildChallengeProgressWrites('u1',
      { ...empty(), challengeDeltas: new Map([['c1', 1]]) },
      { readKeys: new Set<string>(), challenges: new Map([['c1', { progress: {} }]]) },
      refs, MAINTENANT
    )).toThrow(/sans lecture préalable/);
  });

  it('dérive ses clés de lecture des deux sources de deltas', () => {
    const keys = challengeProgressReadKeys({
      challengeDeltas: new Map([['c1', 1]]),
      blocDesigneScores: new Map([['c2', 300]]),
    });
    expect(keys).toEqual(new Set([challengeProgressReadKey('c1'), challengeProgressReadKey('c2')]));
  });
});
