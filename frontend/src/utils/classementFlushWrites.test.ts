import { describe, expect, it } from 'vitest';
import {
  buildClassementFlushWrites,
  mergeClassementFlushPending,
  emptyClassementFlushPending,
  hasPendingClassementDelta,
  classementFlushReadKeys,
  challengeReadKey,
  type ClassementFlushRefs,
  type ClassementFlushPending,
  type ClassementFlushReadData,
} from './classementFlushWrites';
import type { DocumentReference, DocumentData } from 'firebase/firestore';
import type { WeeklyMissionsState, MissionKey } from './weeklyMissions';

// Références factices : jamais déréférencées par la fonction testée (comparées par
// identité uniquement), un objet quelconque suffit.
const fakeRef = (id: string) => ({ id }) as unknown as DocumentReference<DocumentData>;

const refs: ClassementFlushRefs = {
  classementProfileRef: fakeRef('classement_profiles/u1'),
  userLudicRef: fakeRef('user_ludic_state/u1'),
  challengeRefs: new Map([
    ['c1', fakeRef('challenges/c1')],
    ['c2', fakeRef('challenges/c2')],
  ]),
};

// Appelle la fonction testée avec les lectures qu'aurait faites ClientDaily.tsx pour ce
// `pending` (classementFlushReadKeys) — même chemin qu'en production.
const build = (pending: ClassementFlushPending, readData: Omit<ClassementFlushReadData, 'readKeys'>) =>
  buildClassementFlushWrites('u1', pending, { ...readData, readKeys: classementFlushReadKeys(pending) }, refs);

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
    const writes = build(pending, { challenges: new Map() });
    expect(writes).toHaveLength(1);
    expect(writes[0].ref).toBe(refs.classementProfileRef);
    expect(writes[0].data.score).toBe(100);
    expect(writes[0].data.colorCounts).toEqual({ rouge: 1 });
    expect(writes[0].data.bouldersValidated).toBe(1);
  });

  it('cumule les deltas par-dessus un profil existant', () => {
    const pending = { ...emptyClassementFlushPending(), scoreDelta: 50, colorDeltas: new Map([['rouge', 1]]) };
    const readData = { classementProfile: { score: 200, colorCounts: { rouge: 3 } }, challenges: new Map() };
    const writes = build(pending, readData);
    expect(writes[0].data.score).toBe(250);
    expect(writes[0].data.colorCounts).toEqual({ rouge: 4 });
  });

  it('n\'écrit user_ludic_state.wallCounts que si un delta de mur est en attente', () => {
    const withoutWall = build(emptyClassementFlushPending(), { challenges: new Map() });
    expect(withoutWall).toHaveLength(1); // seulement classement_profiles

    const withWall = build({ ...emptyClassementFlushPending(), wallDeltas: new Map([['Dalle', 1]]) },
      { challenges: new Map() });
    expect(withWall).toHaveLength(2);
    const ludicWrite = withWall.find((w) => w.ref === refs.userLudicRef);
    expect(ludicWrite?.data.wallCounts).toEqual({ Dalle: 1 });
  });

  it('cumule wallCounts par-dessus un compteur existant dans user_ludic_state', () => {
    const writes = build({ ...emptyClassementFlushPending(), wallDeltas: new Map([['Dalle', 1]]) },
      { userLudic: { wallCounts: { Dalle: 4, Gullich: 2 } }, challenges: new Map() });
    const ludicWrite = writes.find((w) => w.ref === refs.userLudicRef);
    expect(ludicWrite?.data.wallCounts).toEqual({ Dalle: 5, Gullich: 2 });
  });

  it('applique un delta cumulatif à un défi "seuil"', () => {
    const writes = build({ ...emptyClassementFlushPending(), challengeDeltas: new Map([['c1', 1]]) },
      { challenges: new Map([['c1', { progress: { u1: { value: 1 } } }]]) });
    const challengeWrite = writes.find((w) => w.ref === refs.challengeRefs.get('c1'));
    expect(challengeWrite?.data.progress.u1.value).toBe(2);
  });

  it('applique un MAX (jamais une addition) à un défi "bloc_designe"', () => {
    const writes = build({ ...emptyClassementFlushPending(), blocDesigneScores: new Map([['c1', 380]]) },
      { challenges: new Map([['c1', { progress: { u1: { value: 400 } } }]]) });
    const challengeWrite = writes.find((w) => w.ref === refs.challengeRefs.get('c1'));
    // 380 < 400 déjà enregistré : le meilleur score existant ne doit jamais reculer.
    expect(challengeWrite?.data.progress.u1.value).toBe(400);
  });

  it('ignore un défi dont le document a disparu entre l\'accumulation et le flush', () => {
    const writes = build({ ...emptyClassementFlushPending(), challengeDeltas: new Map([['c1', 1]]) },
      { challenges: new Map([['c1', undefined]]) });
    expect(writes.some((w) => w.ref === refs.challengeRefs.get('c1'))).toBe(false);
  });

  // ✅ PLAN-anecdote-methodes-missions.md §C.5
  it('écrit weeklyMissions combiné avec wallCounts dans UNE seule écriture user_ludic_state', () => {
    const writes = build({
        ...emptyClassementFlushPending(),
        wallDeltas: new Map([['Dalle', 1]]),
        missionsNewlyDone: new Set<MissionKey>(['M1']),
        wallsNewlyVisited: new Set(['Dalle']),
        missionsFige: { level: 'rouge', countsChildWalls: false },
      },
      { userLudic: { weeklyMissions: { isoWeek: '2026-W39', level: 'rouge', countsChildWalls: false, done: [], walls: [], completedAt: null } }, challenges: new Map() });
    const ludicWrites = writes.filter((w) => w.ref === refs.userLudicRef);
    expect(ludicWrites).toHaveLength(1);
    expect(ludicWrites[0].data.wallCounts).toEqual({ Dalle: 1 });
    expect(ludicWrites[0].data.weeklyMissions.done).toEqual(['M1']);
    expect(ludicWrites[0].data.weeklyMissions.walls).toEqual(['Dalle']);
  });

  it('ouvre une nouvelle semaine (repli figé) quand la grille stockée est d\'une semaine passée', () => {
    const writes = build({ ...emptyClassementFlushPending(), missionsNewlyDone: new Set<MissionKey>(['M8']), missionsFige: { level: 'noir', countsChildWalls: false } },
      { userLudic: { weeklyMissions: { isoWeek: '2020-W01', level: 'jaune', countsChildWalls: true, done: ['M1', 'M2'], walls: ['Dalle'], completedAt: null } }, challenges: new Map() });
    const ludicWrite = writes.find((w) => w.ref === refs.userLudicRef);
    expect(ludicWrite?.data.weeklyMissions.level).toBe('noir');
    expect(ludicWrite?.data.weeklyMissions.countsChildWalls).toBe(false);
    expect(ludicWrite?.data.weeklyMissions.done).toEqual(['M8']);
    expect(ludicWrite?.data.weeklyMissions.walls).toEqual([]);
  });

  it('incrémente weeklyMissionsCompleted seulement au moment où la grille passe à 8/8', () => {
    const almost: WeeklyMissionsState = { isoWeek: '2026-W39', level: 'rouge', countsChildWalls: false, done: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'], walls: [], completedAt: null };
    const writes = build({ ...emptyClassementFlushPending(), missionsNewlyDone: new Set<MissionKey>(['M8']), missionsFige: { level: 'rouge', countsChildWalls: false } },
      { userLudic: { weeklyMissions: almost, weeklyMissionsCompleted: 2 }, challenges: new Map() });
    const ludicWrite = writes.find((w) => w.ref === refs.userLudicRef);
    expect(ludicWrite?.data.weeklyMissionsCompleted).toBe(3);
    expect(ludicWrite?.data.weeklyMissions.completedAt).not.toBeNull();
  });

  it('ne touche pas weeklyMissionsCompleted quand la grille n\'est pas encore complète', () => {
    const writes = build({ ...emptyClassementFlushPending(), missionsNewlyDone: new Set<MissionKey>(['M1']), missionsFige: { level: 'rouge', countsChildWalls: false } },
      { userLudic: { weeklyMissions: { isoWeek: '2026-W39', level: 'rouge', countsChildWalls: false, done: [], walls: [], completedAt: null }, weeklyMissionsCompleted: 2 }, challenges: new Map() });
    const ludicWrite = writes.find((w) => w.ref === refs.userLudicRef);
    expect(ludicWrite?.data.weeklyMissionsCompleted).toBeUndefined();
  });

  it('n\'écrit rien sur weeklyMissions sans missionsFige (rien à ouvrir)', () => {
    const writes = build({ ...emptyClassementFlushPending(), missionsNewlyDone: new Set<MissionKey>(['M1']), missionsFige: null },
      { challenges: new Map() });
    expect(writes.some((w) => w.ref === refs.userLudicRef)).toBe(false);
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

  it('unionne missionsNewlyDone/wallsNewlyVisited et conserve missionsFige', () => {
    const prev = { ...emptyClassementFlushPending(), missionsNewlyDone: new Set<MissionKey>(['M1']), wallsNewlyVisited: new Set(['Dalle']), missionsFige: { level: 'rouge', countsChildWalls: false } };
    const incoming = { ...emptyClassementFlushPending(), missionsNewlyDone: new Set<MissionKey>(['M3']), wallsNewlyVisited: new Set(['Güllich']) };
    const merged = mergeClassementFlushPending(prev, incoming);
    expect(merged.missionsNewlyDone).toEqual(new Set(['M1', 'M3']));
    expect(merged.wallsNewlyVisited).toEqual(new Set(['Dalle', 'Güllich']));
    expect(merged.missionsFige).toEqual({ level: 'rouge', countsChildWalls: false });
  });
});

// ✅ docs/handoffs/RETOUR-bug-missions-et-revalidation.md §1.5 : testé comme une PROPRIÉTÉ,
// pas par cas — produit cartésien de la présence/absence de chaque champ de `pending`. Le
// jour où un champ est ajouté à la transaction partagée sans que classementFlushReadKeys
// suive, ce test échoue tout seul (la garde §1.6 lève dans buildClassementFlushWrites).
describe('invariant lectures/écritures du flush', () => {
  const fields: Array<(p: ClassementFlushPending) => void> = [
    (p) => { p.scoreDelta = 25; },
    (p) => { p.colorDeltas = new Map([['rouge', 1]]); },
    (p) => { p.seasonScoreDelta = 25; },
    (p) => { p.seasonColorDeltas = new Map([['rouge', 1]]); },
    (p) => { p.wallDeltas = new Map([['Dalle', 1]]); },
    (p) => { p.challengeDeltas = new Map([['c1', 1]]); },
    (p) => { p.blocDesigneScores = new Map([['c2', 300]]); },
    (p) => { p.missionsNewlyDone = new Set<MissionKey>(['M4']); },
    (p) => { p.wallsNewlyVisited = new Set(['Dévers 30°']); },
    (p) => { p.missionsFige = { level: 'rouge', countsChildWalls: false }; },
  ];
  const stored: WeeklyMissionsState = { isoWeek: '2026-W39', level: 'rouge', countsChildWalls: false, done: ['M6', 'M3'], walls: ['Réta Adultes'], completedAt: null };

  it('toute référence écrite appartient à classementFlushReadKeys(pending), pour les 1024 combinaisons', () => {
    for (let mask = 0; mask < 1 << fields.length; mask += 1) {
      const pending = emptyClassementFlushPending();
      fields.forEach((apply, i) => { if (mask & (1 << i)) apply(pending); });
      const readKeys = classementFlushReadKeys(pending);
      // Documents présents pour tout ce qui est lu (le cas "absent" ne change pas l'ensemble
      // des refs écrites, sauf pour un défi disparu — couvert par son propre test ci-dessus).
      const writes = buildClassementFlushWrites('u1', pending, {
        readKeys,
        classementProfile: {},
        userLudic: readKeys.has('userLudic') ? { weeklyMissions: stored } : undefined,
        challenges: new Map([
          ['c1', readKeys.has(challengeReadKey('c1')) ? { progress: {} } : undefined],
          ['c2', readKeys.has(challengeReadKey('c2')) ? { progress: {} } : undefined],
        ]),
      }, refs);
      const keyOf = (ref: unknown) => ref === refs.classementProfileRef ? 'classementProfile'
        : ref === refs.userLudicRef ? 'userLudic'
        : ref === refs.challengeRefs.get('c1') ? challengeReadKey('c1') : challengeReadKey('c2');
      writes.forEach((w) => expect(readKeys.has(keyOf(w.ref)), `mask ${mask}`).toBe(true));
    }
  });

  // Reproduit la configuration exacte du bug V2.68 : un échec sur un max+1 (M4, nouveau mur)
  // sans aucun delta de classement — user_ludic_state DOIT être lu, et la grille stockée gardée.
  it('un flush ne portant que des missions relit user_ludic_state et conserve la grille stockée', () => {
    const pending = {
      ...emptyClassementFlushPending(),
      missionsNewlyDone: new Set<MissionKey>(['M4']),
      wallsNewlyVisited: new Set(['Dévers 30°']),
      missionsFige: { level: 'rouge', countsChildWalls: false },
    };
    expect(classementFlushReadKeys(pending).has('userLudic')).toBe(true);
    const writes = build(pending, { userLudic: { weeklyMissions: stored }, challenges: new Map() });
    const ludicWrite = writes.find((w) => w.ref === refs.userLudicRef);
    expect(ludicWrite?.data.weeklyMissions.done).toEqual(['M6', 'M3', 'M4']);
    expect(ludicWrite?.data.weeklyMissions.walls).toEqual(['Réta Adultes', 'Dévers 30°']);
  });

  it('lève (au lieu de corrompre) si user_ludic_state doit être écrit sans avoir été lu', () => {
    const pending = {
      ...emptyClassementFlushPending(),
      missionsNewlyDone: new Set<MissionKey>(['M1']),
      missionsFige: { level: 'rouge', countsChildWalls: false },
    };
    expect(() => buildClassementFlushWrites('u1', pending, {
      readKeys: new Set(['classementProfile']), // la condition de lecture de V2.68
      challenges: new Map(),
    }, refs)).toThrow(/sans lecture préalable/);
  });
});
