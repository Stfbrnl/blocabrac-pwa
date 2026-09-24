import { describe, expect, it } from 'vitest';
import { computeMethodVoteDelta, summarizeMethodVotes } from './methodVote';

describe('computeMethodVoteDelta', () => {
  it('premier vote : chaque méthode choisie passe à +1, les votes à +1', () => {
    const delta = computeMethodVoteDelta([], ['dynamique', 'pince']);
    expect(delta.countDeltas).toEqual({ dynamique: 1, pince: 1 });
    expect(delta.votesDelta).toBe(1);
  });

  it('vote inchangé : aucun delta, aucun changement de votes', () => {
    const delta = computeMethodVoteDelta(['dynamique', 'pince'], ['dynamique', 'pince']);
    expect(delta.countDeltas).toEqual({});
    expect(delta.votesDelta).toBe(0);
  });

  it('modification de vote : décrémente l\'ancienne, incrémente la nouvelle, votes inchangés (§B.6)', () => {
    const delta = computeMethodVoteDelta(['dynamique'], ['pince']);
    expect(delta.countDeltas).toEqual({ dynamique: -1, pince: 1 });
    expect(delta.votesDelta).toBe(0);
  });

  it('ajout d\'une méthode à une sélection existante : votes inchangés', () => {
    const delta = computeMethodVoteDelta(['dynamique'], ['dynamique', 'pince']);
    expect(delta.countDeltas).toEqual({ pince: 1 });
    expect(delta.votesDelta).toBe(0);
  });

  it('retrait complet (toutes les méthodes désélectionnées) : votes à -1', () => {
    const delta = computeMethodVoteDelta(['dynamique', 'pince'], []);
    expect(delta.countDeltas).toEqual({ dynamique: -1, pince: -1 });
    expect(delta.votesDelta).toBe(-1);
  });

  it('retrait partiel (une méthode sur deux) : votes inchangés', () => {
    const delta = computeMethodVoteDelta(['dynamique', 'pince'], ['pince']);
    expect(delta.countDeltas).toEqual({ dynamique: -1 });
    expect(delta.votesDelta).toBe(0);
  });
});

describe('summarizeMethodVotes', () => {
  it('renvoie null sous le seuil d\'affichage (§B.4)', () => {
    expect(summarizeMethodVotes({ dynamique: 2 }, 2)).toBeNull();
  });

  it('renvoie null quand methodVotes est absent', () => {
    expect(summarizeMethodVotes({}, undefined)).toBeNull();
  });

  it('trie par nombre de votes décroissant et omet les méthodes jamais votées', () => {
    const summary = summarizeMethodVotes(
      { dynamique: 1, crochet_talon: 8, pince: 0 },
      10
    );
    expect(summary).toEqual([
      { value: 'crochet_talon', label: 'Crochet de talon', count: 8, percent: 80 },
      { value: 'dynamique', label: 'Dynamique', count: 1, percent: 10 },
    ]);
  });
});
