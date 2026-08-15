import { describe, expect, it } from 'vitest';
import { getParticipantScores, getClassementByCategory, type ParticipantBase } from './competitionClassement';

interface TestParticipant extends ParticipantBase {
  first_name: string;
}

const alice: TestParticipant = { user_id: 'alice', first_name: 'Alice', gender: 'F', age: 12 };
const bob: TestParticipant = { user_id: 'bob', first_name: 'Bob', gender: 'M', age: 30 };
const participants = [alice, bob];

const boulders = [
  { id: 'b1', color: 'bleu', difficulty: 'bleu' },
  { id: 'b2', color: 'rose', difficulty: 'rose' },
];

describe('getParticipantScores', () => {
  it('renvoie un tableau vide sans résultat', () => {
    expect(getParticipantScores([], participants, boulders)).toEqual([]);
  });

  it('ignore les résultats dont le participant ou le bloc est introuvable', () => {
    const results = [
      { user_id: 'inconnu', boulder_id: 'b1', success: true, attempts: 1 },
      { user_id: 'alice', boulder_id: 'bloc-inexistant', success: true, attempts: 1 },
    ];
    expect(getParticipantScores(results, participants, boulders)).toEqual([]);
  });

  it('additionne les points de chaque bloc réussi et compte les blocs validés', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }, // 100 pts
      { user_id: 'alice', boulder_id: 'b2', success: false, attempts: 3 }, // 0 pt, échec
    ];
    const scores = getParticipantScores(results, participants, boulders);
    expect(scores).toEqual([{ participant: alice, score: 100, boulders: 1 }]);
  });

  it('trie du meilleur score au plus faible', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }, // 100 pts
      { user_id: 'bob', boulder_id: 'b2', success: true, attempts: 1 }, // 1000 pts
    ];
    const scores = getParticipantScores(results, participants, boulders);
    expect(scores.map(s => s.participant.user_id)).toEqual(['bob', 'alice']);
  });

  it('utilise la couleur du bloc plutôt que sa cotation cachée quand les deux diffèrent', () => {
    // Cas "grosse compétition" : difficulty = cotation FFME cachée, color = valeur affichée
    // une fois la compétition terminée. Le barème doit suivre color en priorité.
    const hiddenBoulders = [{ id: 'b1', color: undefined, difficulty: 'bleu' }];
    const results = [{ user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }];
    expect(getParticipantScores(results, participants, hiddenBoulders)).toEqual([
      { participant: alice, score: 100, boulders: 1 },
    ]);
  });
});

describe('getClassementByCategory', () => {
  const results = [
    { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }, // 100 pts
    { user_id: 'bob', boulder_id: 'b2', success: true, attempts: 1 }, // 1000 pts
  ];

  it('"global" renvoie la même liste plate que getParticipantScores', () => {
    expect(getClassementByCategory(results, participants, boulders, 'global'))
      .toEqual(getParticipantScores(results, participants, boulders));
  });

  it('"gender" groupe les participants par genre', () => {
    const byGender = getClassementByCategory(results, participants, boulders, 'gender');
    expect(byGender).toHaveLength(2);
    const genders = byGender.map(g => g.category).sort();
    expect(genders).toEqual(['F', 'M']);
  });

  it('"gender" range les participants sans genre sous "Inconnu"', () => {
    const noGender: TestParticipant = { user_id: 'sam', first_name: 'Sam' };
    const sansGenreResults = [{ user_id: 'sam', boulder_id: 'b1', success: true, attempts: 1 }];
    const byGender = getClassementByCategory(sansGenreResults, [noGender], boulders, 'gender');
    expect(byGender).toEqual([{ category: 'Inconnu', participants: expect.any(Array) }]);
  });

  it('"age" groupe les participants par catégorie FFME', () => {
    const byAge = getClassementByCategory(results, participants, boulders, 'age');
    // Alice (12 ans) et Bob (30 ans, "Open") tombent dans des catégories FFME différentes
    expect(byAge.length).toBeGreaterThanOrEqual(2);
    const allParticipants = byAge.flatMap(g => g.participants.map(p => p.participant.user_id));
    expect(allParticipants.sort()).toEqual(['alice', 'bob']);
  });
});
