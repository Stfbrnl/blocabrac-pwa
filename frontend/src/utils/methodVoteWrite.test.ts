import { describe, expect, it } from 'vitest';
import { buildMethodVoteWrite, type MethodVoteRefs } from './methodVoteWrite';
import type { DocumentReference, DocumentData } from 'firebase/firestore';

const fakeRef = (id: string) => ({ id }) as unknown as DocumentReference<DocumentData>;
const refs: MethodVoteRefs = {
  clientResultRef: fakeRef('client_boulder_results/u1_b1'),
  boulderRef: fakeRef('boulders/b1'),
};

describe('buildMethodVoteWrite', () => {
  it('premier vote sur un bloc jamais compté : écrit les deux documents', () => {
    const writes = buildMethodVoteWrite(['dynamique', 'pince'], {}, refs);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual({ ref: refs.clientResultRef, data: { methods: ['dynamique', 'pince'] } });
    expect(writes[1]).toEqual({
      ref: refs.boulderRef,
      data: { methodCounts: { dynamique: 1, pince: 1 }, methodVotes: 1 },
    });
  });

  it('modification de vote : applique le delta aux compteurs existants, sans toucher methodVotes', () => {
    const writes = buildMethodVoteWrite(
      ['pince'],
      {
        clientResult: { methods: ['dynamique'] },
        boulder: { methodCounts: { dynamique: 5, pince: 2 }, methodVotes: 9 },
      },
      refs
    );
    expect(writes[0].data).toEqual({ methods: ['pince'] });
    expect(writes[1].data).toEqual({ methodCounts: { dynamique: 4, pince: 3 }, methodVotes: 9 });
  });

  it('retrait complet : décrémente les compteurs et methodVotes', () => {
    const writes = buildMethodVoteWrite(
      [],
      {
        clientResult: { methods: ['dynamique', 'pince'] },
        boulder: { methodCounts: { dynamique: 1, pince: 1 }, methodVotes: 4 },
      },
      refs
    );
    expect(writes[0].data).toEqual({ methods: [] });
    expect(writes[1].data).toEqual({ methodCounts: { dynamique: 0, pince: 0 }, methodVotes: 3 });
  });

  it('reclic sans changement réel : n\'écrit rien', () => {
    const writes = buildMethodVoteWrite(
      ['dynamique'],
      { clientResult: { methods: ['dynamique'] }, boulder: { methodCounts: { dynamique: 1 }, methodVotes: 1 } },
      refs
    );
    expect(writes).toHaveLength(0);
  });
});
