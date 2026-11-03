import { describe, it, expect } from 'vitest';
import { decouperEnLots, MAX_OPS_PAR_LOT } from './firestoreBatchChunks';

const suite = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('decouperEnLots', () => {
  // ⚠️ La propriété qui justifie le module : sous le seuil il ne change RIEN. Un découpage
  // qui rendrait deux lots de 75 pour 150 blocs casserait l'atomicité de la clôture sans
  // qu'aucun autre test ne s'en aperçoive — l'écran continuerait de « marcher ».
  it("rend UN SEUL lot sous le seuil, donc l'atomicité est préservée dans le cas attendu", () => {
    const lots = decouperEnLots(suite(150));
    expect(lots).toHaveLength(1);
    expect(lots[0]).toHaveLength(150);
  });

  it('rend un seul lot exactement AU seuil, et deux juste au-dessus', () => {
    expect(decouperEnLots(suite(MAX_OPS_PAR_LOT))).toHaveLength(1);
    const juste = decouperEnLots(suite(MAX_OPS_PAR_LOT + 1));
    expect(juste).toHaveLength(2);
    // On nomme les TAILLES, pas seulement le nombre de lots : un découpage qui rendrait
    // deux lots déséquilibrés au mauvais endroit passerait l'assertion précédente.
    expect(juste.map(l => l.length)).toEqual([MAX_OPS_PAR_LOT, 1]);
  });

  // ⚠️ `[]` et non `[[]]` : un lot vide envoyé à Firestore est une écriture inutile, et sur
  // un geste « tout-ou-rien » un commit vide qui réussit ressemble à un succès.
  it('rend un tableau VIDE sur une entrée vide, jamais un lot vide', () => {
    expect(decouperEnLots([])).toEqual([]);
    expect(decouperEnLots([])).toHaveLength(0);
  });

  // La propriété de conservation : aucun bloc perdu, aucun écrit deux fois, ordre tenu.
  // C'est elle qui protège le geste de clôture, où un bloc oublié reste `competition_active`
  // pour toujours sans que personne ne le voie.
  it('conserve tous les éléments, une seule fois chacun, dans l\'ordre', () => {
    for (const n of [0, 1, 449, 450, 451, 900, 901, 1337]) {
      const lots = decouperEnLots(suite(n));
      expect(lots.flat()).toEqual(suite(n));
      // Aucun lot ne dépasse le seuil — l'invariant que Firestore impose.
      expect(lots.every(l => l.length <= MAX_OPS_PAR_LOT && l.length > 0)).toBe(true);
    }
  });

  it('respecte une taille fournie, et refuse une taille absurde', () => {
    expect(decouperEnLots(suite(5), 2).map(l => l.length)).toEqual([2, 2, 1]);
    expect(() => decouperEnLots(suite(5), 0)).toThrow(/invalide/);
  });

  // Épingle le chiffre lui-même : la limite Firestore est 500, la marge est délibérée.
  it('garde une marge sous la limite Firestore de 500', () => {
    expect(MAX_OPS_PAR_LOT).toBe(450);
    expect(MAX_OPS_PAR_LOT).toBeLessThan(500);
  });
});
