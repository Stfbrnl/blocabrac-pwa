import { describe, expect, it } from 'vitest';
import { combineByFreshness } from './useDebouncedFlushQueue';

// ✅ Régression du bug trouvé par ClaudeNav (retour du 19/08/2026, PROCESSUS-erreurs-avalees.md
// §3) : un contrat `merge(prev, incoming)` naïf faisait gagner la valeur la plus ANCIENNE dans
// le cas "deux enqueue() rapprochés" (essais réglés à 2 puis 3 avant la fin du debounce
// aurait persisté 2). `combineByFreshness` est la pièce qui empêche cette classe de bug de
// revenir : `merge` ne voit jamais que des arguments correctement ordonnés (older, newer).
const additive = (older: number, newer: number) => older + newer;
const replace = (_older: string, newer: string) => newer;

describe('combineByFreshness', () => {
  it("renvoie newer quand older est absent (rien n'était en file)", () => {
    expect(combineByFreshness(undefined, 3, additive)).toBe(3);
  });

  it('renvoie older quand newer est absent (réessai sans rien de plus récent en file)', () => {
    expect(combineByFreshness(2, undefined, additive)).toBe(2);
  });

  it("délègue à merge quand les deux existent — cas additif (delta cumulatif, ex. ClientDaily)", () => {
    expect(combineByFreshness(2, 3, additive)).toBe(5);
  });

  it(
    'délègue à merge quand les deux existent — cas remplacement : LA PLUS RÉCENTE gagne '
    + '(scénario exact du retour ClaudeNav : essais 2 puis 3 avant la fin du debounce -> 3, pas 2)',
    () => {
      expect(combineByFreshness('2 essais', '3 essais', replace)).toBe('3 essais');
    }
  );

  it('cas remplacement, sens retry : la valeur échouée (older) ne doit jamais écraser une plus récente déjà en file (newer)', () => {
    // older = valeur qui vient d'échouer ; newer = ce qui a été enqueued pendant le vol.
    expect(combineByFreshness('valeur échouée (ancienne)', 'valeur ressaisie entre-temps (récente)', replace))
      .toBe('valeur ressaisie entre-temps (récente)');
  });

  it('les deux absents : rien à combiner, renvoie undefined', () => {
    expect(combineByFreshness<number>(undefined, undefined, additive)).toBeUndefined();
  });
});
