import { describe, expect, it } from 'vitest';
import {
  buildClassementFlushWrites,
  mergeClassementFlushPending,
  emptyClassementFlushPending,
  hasPendingClassementDelta,
  type ClassementFlushRefs,
} from './classementFlushWrites';
import type { DocumentReference, DocumentData } from 'firebase/firestore';

// Références factices : jamais déréférencées par la fonction testée (comparées par
// identité uniquement), un objet quelconque suffit.
const fakeRef = (id: string) => ({ id }) as unknown as DocumentReference<DocumentData>;

const refs: ClassementFlushRefs = {
  classementProfileRef: fakeRef('classement_profiles/u1'),
  userRef: fakeRef('users/u1'),
  challengeRefs: new Map([
    ['c1', fakeRef('challenges/c1')],
    ['c2', fakeRef('challenges/c2')],
  ]),
};

describe('hasPendingClassementDelta', () => {
  it('renvoie false pour un jeu de deltas vide', () => {
    expect(hasPendingClassementDelta(emptyClassementFlushPending())).toBe(false);
  });
  it('renvoie true dès qu\'un seul champ est non vide', () => {
    expect(hasPendingClassementDelta({ ...emptyClassementFlushPending(), scoreDelta: 25 })).toBe(true);
    expect(hasPendingClassementDelta({ ...emptyClassementFlushPending(), wallDeltas: new Map([['Dalle', 1]]) })).toBe(true);
  });
});

describe('buildClassementFlushWrites', () => {
  it('écrit classement_profiles avec les deltas appliqués à un profil vide', () => {
    const pending = {
      ...emptyClassementFlushPending(),
      scoreDelta: 100,
      colorDeltas: new Map([['rouge', 1]]),
    };
    const writes = buildClassementFlushWrites('u1', pending, { challenges: new Map() }, refs);
    expect(writes).toHaveLength(1);
    expect(writes[0].ref).toBe(refs.classementProfileRef);
    expect(writes[0].data.score).toBe(100);
    expect(writes[0].data.colorCounts).toEqual({ rouge: 1 });
    expect(writes[0].data.bouldersValidated).toBe(1);
  });

  it('cumule les deltas par-dessus un profil existant', () => {
    const pending = { ...emptyClassementFlushPending(), scoreDelta: 50, colorDeltas: new Map([['rouge', 1]]) };
    const readData = { classementProfile: { score: 200, colorCounts: { rouge: 3 } }, challenges: new Map() };
    const writes = buildClassementFlushWrites('u1', pending, readData, refs);
    expect(writes[0].data.score).toBe(250);
    expect(writes[0].data.colorCounts).toEqual({ rouge: 4 });
  });

  it('n\'écrit users.wallCounts que si un delta de mur est en attente', () => {
    const withoutWall = buildClassementFlushWrites('u1', emptyClassementFlushPending(), { challenges: new Map() }, refs);
    expect(withoutWall).toHaveLength(1); // seulement classement_profiles

    const withWall = buildClassementFlushWrites(
      'u1',
      { ...emptyClassementFlushPending(), wallDeltas: new Map([['Dalle', 1]]) },
      { challenges: new Map() },
      refs
    );
    expect(withWall).toHaveLength(2);
    const wallWrite = withWall.find((w) => w.ref === refs.userRef);
    expect(wallWrite?.data.wallCounts).toEqual({ Dalle: 1 });
  });

  it('cumule wallCounts par-dessus un compteur existant', () => {
    const writes = buildClassementFlushWrites(
      'u1',
      { ...emptyClassementFlushPending(), wallDeltas: new Map([['Dalle', 1]]) },
      { user: { wallCounts: { Dalle: 4, Gullich: 2 } }, challenges: new Map() },
      refs
    );
    const wallWrite = writes.find((w) => w.ref === refs.userRef);
    expect(wallWrite?.data.wallCounts).toEqual({ Dalle: 5, Gullich: 2 });
  });

  it('applique un delta cumulatif à un défi "seuil"', () => {
    const writes = buildClassementFlushWrites(
      'u1',
      { ...emptyClassementFlushPending(), challengeDeltas: new Map([['c1', 1]]) },
      { challenges: new Map([['c1', { progress: { u1: { value: 1 } } }]]) },
      refs
    );
    const challengeWrite = writes.find((w) => w.ref === refs.challengeRefs.get('c1'));
    expect(challengeWrite?.data.progress.u1.value).toBe(2);
  });

  it('applique un MAX (jamais une addition) à un défi "bloc_designe"', () => {
    const writes = buildClassementFlushWrites(
      'u1',
      { ...emptyClassementFlushPending(), blocDesigneScores: new Map([['c1', 380]]) },
      { challenges: new Map([['c1', { progress: { u1: { value: 400 } } }]]) },
      refs
    );
    const challengeWrite = writes.find((w) => w.ref === refs.challengeRefs.get('c1'));
    // 380 < 400 déjà enregistré : le meilleur score existant ne doit jamais reculer.
    expect(challengeWrite?.data.progress.u1.value).toBe(400);
  });

  it('ignore un défi dont le document a disparu entre l\'accumulation et le flush', () => {
    const writes = buildClassementFlushWrites(
      'u1',
      { ...emptyClassementFlushPending(), challengeDeltas: new Map([['c1', 1]]) },
      { challenges: new Map([['c1', undefined]]) },
      refs
    );
    expect(writes.some((w) => w.ref === refs.challengeRefs.get('c1'))).toBe(false);
  });
});

describe('mergeClassementFlushPending', () => {
  it('renvoie le second jeu de deltas quand il n\'y a rien à fusionner', () => {
    const incoming = { ...emptyClassementFlushPending(), scoreDelta: 10 };
    expect(mergeClassementFlushPending(undefined, incoming)).toBe(incoming);
  });

  it('additionne les deltas numériques et les Map', () => {
    const prev = { ...emptyClassementFlushPending(), scoreDelta: 10, colorDeltas: new Map([['rouge', 1]]) };
    const incoming = { ...emptyClassementFlushPending(), scoreDelta: 5, colorDeltas: new Map([['rouge', 1], ['vert', 1]]) };
    const merged = mergeClassementFlushPending(prev, incoming);
    expect(merged.scoreDelta).toBe(15);
    expect(merged.colorDeltas).toEqual(new Map([['rouge', 2], ['vert', 1]]));
  });

  it('fusionne blocDesigneScores par MAX, jamais par addition', () => {
    const prev = { ...emptyClassementFlushPending(), blocDesigneScores: new Map([['c1', 380]]) };
    const incoming = { ...emptyClassementFlushPending(), blocDesigneScores: new Map([['c1', 400]]) };
    const merged = mergeClassementFlushPending(prev, incoming);
    expect(merged.blocDesigneScores.get('c1')).toBe(400);
  });
});
