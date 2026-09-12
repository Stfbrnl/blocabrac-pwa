import { describe, expect, it } from 'vitest';
import { buildFirstAscentWrite, type FirstAscentWriteRefs } from './firstAscentWrites';
import type { DocumentReference, DocumentData } from 'firebase/firestore';

const fakeRef = (id: string) => ({ id }) as unknown as DocumentReference<DocumentData>;
const refs: FirstAscentWriteRefs = { boulderRef: fakeRef('boulders/b1') };

const baseInput = {
  success: true,
  color: 'noir',
  boulderType: 'daily',
  competitionActive: false,
  uid: 'u1',
  optIn: true,
  eligibleColors: ['noir', 'blanc', 'rose'],
};

const entry = { uid: 'u1', displayName: 'Moi', at: '2026-01-01T00:00:00.000Z' };

describe('buildFirstAscentWrite', () => {
  it('ajoute l\'entrée à une liste vide', () => {
    const writes = buildFirstAscentWrite(baseInput, entry, { boulder: { firstAscents: [] } }, refs);
    expect(writes).toHaveLength(1);
    expect(writes[0].ref).toBe(refs.boulderRef);
    expect(writes[0].data.firstAscents).toEqual([entry]);
  });

  it('conserve le préfixe existant et ajoute à la fin', () => {
    const existing = [{ uid: 'a', displayName: 'A', at: '2026-01-01T00:00:00.000Z' }];
    const writes = buildFirstAscentWrite(baseInput, entry, { boulder: { firstAscents: existing } }, refs);
    expect(writes[0].data.firstAscents).toEqual([...existing, entry]);
  });

  it('n\'écrit rien si la décision refuse (liste pleine)', () => {
    const full = Array.from({ length: 5 }, (_, i) => ({ uid: `x${i}`, displayName: 'X', at: '2026-01-01T00:00:00.000Z' }));
    const writes = buildFirstAscentWrite(baseInput, entry, { boulder: { firstAscents: full } }, refs);
    expect(writes).toHaveLength(0);
  });

  it('n\'écrit rien si le document du bloc n\'a pas encore de firstAscents (undefined)', () => {
    const writes = buildFirstAscentWrite(baseInput, entry, {}, refs);
    expect(writes).toHaveLength(1);
    expect(writes[0].data.firstAscents).toEqual([entry]);
  });

  it('n\'écrit rien si le grimpeur figure déjà dans la liste (relecture fraîche l\'a détecté)', () => {
    const writes = buildFirstAscentWrite(baseInput, entry, { boulder: { firstAscents: [entry] } }, refs);
    expect(writes).toHaveLength(0);
  });
});
