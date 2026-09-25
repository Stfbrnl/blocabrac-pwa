import { describe, expect, it } from 'vitest';
import { planResultWrite, isAlreadySucceeded, storedResultFromDoc, canEraseFailure, type StoredBoulderResult } from './boulderResult';

const NOW = '2026-09-25T10:00:00.000Z';
const stored = (over: Partial<StoredBoulderResult> = {}): StoredBoulderResult => ({
  success: true, attempts: 8, createdAt: '2026-09-21T18:00:00.000Z', rating: 4, comment: 'Beau bloc',
  proposedDifficulty: null, methods: ['heel_hook'], ...over,
});

describe('planResultWrite', () => {
  it('première réussite : crée le document avec createdAt = maintenant, delta de classement', () => {
    const plan = planResultWrite(null, { success: true, attempts: 3 }, NOW);
    expect(plan.changed).toBe(true);
    expect(plan.patch).toEqual({ success: true, attempts: 3, createdAt: NOW, updatedAt: NOW });
    expect(plan.classementBefore).toBeNull();
    expect(plan.classementAfter).toEqual({ attempts: 3 });
  });

  it('la note seule ne touche ni success ni attempts, et préserve structurellement le reste', () => {
    const plan = planResultWrite(stored(), { rating: 5 }, NOW);
    expect(plan.patch).toEqual({ rating: 5, createdAt: '2026-09-21T18:00:00.000Z', updatedAt: NOW });
    expect(plan.next.attempts).toBe(8);
    expect(plan.next.comment).toBe('Beau bloc');
    expect(plan.classementBefore).toEqual(plan.classementAfter);
  });

  it('une note sur un bloc jamais saisi crée un document success:false (schéma attendu par les stats)', () => {
    expect(planResultWrite(null, { rating: 3 }, NOW).patch.success).toBe(false);
  });

  it('§2.7 : échec lundi puis réussite mercredi = PREMIÈRE réussite, elle compte', () => {
    const plan = planResultWrite(stored({ success: false, attempts: null }), { success: true, attempts: 6 }, NOW);
    expect(plan.classementBefore).toBeNull();
    expect(plan.classementAfter).toEqual({ attempts: 6 });
    expect(plan.patch.createdAt).toBe('2026-09-21T18:00:00.000Z');
  });

  it('correction explicite du nombre d\'essais : delta de classement 8 -> 2', () => {
    const plan = planResultWrite(stored(), { attempts: 2 }, NOW);
    expect(plan.classementBefore).toEqual({ attempts: 8 });
    expect(plan.classementAfter).toEqual({ attempts: 2 });
  });

  it('annulation explicite d\'une réussite : sortie du classement', () => {
    const plan = planResultWrite(stored(), { success: false }, NOW);
    expect(plan.classementAfter).toBeNull();
  });

  it('rien de changé : changed=false (aucune écriture à faire)', () => {
    expect(planResultWrite(stored(), { rating: 4, comment: 'Beau bloc' }, NOW).changed).toBe(false);
  });

  it('un champ undefined n\'est jamais écrit', () => {
    const plan = planResultWrite(stored(), { rating: 5, proposedDifficulty: undefined }, NOW);
    expect('proposedDifficulty' in plan.patch).toBe(false);
  });
});

describe('storedResultFromDoc / isAlreadySucceeded', () => {
  it('normalise un ancien document incomplet', () => {
    const r = storedResultFromDoc({ success: true }, NOW);
    expect(r).toEqual({ success: true, attempts: null, createdAt: NOW, rating: 0, comment: '', proposedDifficulty: null, methods: [] });
    expect(isAlreadySucceeded(r)).toBe(true);
    expect(isAlreadySucceeded(null)).toBe(false);
  });
});

describe('canEraseFailure (V2.70.2)', () => {
  it('un échec sans vote de méthode peut être effacé', () => {
    expect(canEraseFailure(stored({ success: false, attempts: null, methods: [] }))).toBe(true);
  });
  it('une réussite ne s\'efface jamais par ce chemin', () => {
    expect(canEraseFailure(stored({ success: true, methods: [] }))).toBe(false);
  });
  it('rien à effacer sans résultat', () => {
    expect(canEraseFailure(null)).toBe(false);
  });
  it('refusé tant qu\'un vote de méthodes reste compté dans boulders.methodCounts', () => {
    expect(canEraseFailure(stored({ success: false, methods: ['heel_hook'] }))).toBe(false);
  });
});
