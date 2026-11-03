// Multiplicateur de points par bloc (docs/plans/2026-11-03-CN-plan-multiplicateur-v2.md §4).
//
// ⚠️ CE QUE CE FICHIER PROUVE EN PREMIER, ET QUI COMPTE PLUS QUE LA FONCTIONNALITÉ : un bloc
// SANS multiplicateur rend exactement ce qu'il rendait avant — cinq modes, huit couleurs,
// essais 1 à 20, soit 800 valeurs. C'est l'invariant qui autorise à livrer ce chantier à deux
// jours d'un contest : `calculateCompetitionPoints` est appelée par les quatre écrans de
// classement et par la publication du palmarès gelé, et la moindre dérive dessus déplacerait
// des rangs sans rien afficher d'anormal.
//
// ⚠️ D'OÙ VIENT LA TABLE : elle a été PRODUITE PAR LE CODE D'AVANT (`git show HEAD:...` du
// commit précédant l'ajout du multiplicateur), puis figée ici en littéraux. Elle n'est donc
// pas recalculée par la fonction qu'elle juge — « la même lecture faite deux fois ne peut pas
// dire qui a tort ». Une seule origine possible : si une valeur bouge, c'est le code qui a
// bougé, pas la référence.
//
// ⚠️ Recoupement indépendant : la ligne `blocabrac_plancher:noir` commence par 600, 533 — et
// 533 est précisément la valeur que `climbingPoints.test.ts` épingle depuis la table publiée
// aux grimpeurs (600 × 0,8875 = 532,5, le seul demi exact du barème, arrondi vers le HAUT par
// `Math.round`). Deux tables écrites séparément se croisent sur le cas le plus fragile.
//
// Le mode `blocs_valides` ignore la couleur par construction (il lit `points_value`, fixé ici
// à 137) et le mode `officiel` rend 0 partout : leurs lignes sont donc constantes. Elles sont
// gardées quand même — c'est la preuve que le multiplicateur s'applique UNIFORMÉMENT aux cinq
// modes, sans branche par mode à tenir à jour le jour où un sixième arrive.
import { describe, it, expect } from 'vitest';
import {
  calculateCompetitionPoints, basePoints, plancherPoints,
  type ScoringMode, type CustomScoringTable,
} from './climbingPoints';

const COULEURS = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'rose', 'blanc'] as const;
const MODES: ScoringMode[] = ['blocabrac', 'blocabrac_plancher', 'blocs_valides', 'personnalise', 'officiel'];
const ESSAIS_MAX = 20;
const POINTS_VALUE = 137;

// Barème `personnalise` du jeu d'essai — reproduit à l'identique celui qui a servi à générer
// la table : base 70 + 13 × rang de la couleur, déduction 3 + rang.
const CUSTOM: CustomScoringTable = Object.fromEntries(
  Object.keys(basePoints).map((couleur, i) => [couleur, { base: 70 + i * 13, deduction: 3 + i }])
);

// Référence figée, produite par le code d'AVANT le multiplicateur. Clé : `mode:couleur`,
// valeur : les points au 1ᵉʳ, 2ᵉ, … 20ᵉ essai sur une réussite.
const REFERENCE: Record<string, number[]> = {
  'blocabrac:jaune': [25, 15, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'blocabrac:vert': [50, 40, 30, 20, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'blocabrac:bleu': [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'blocabrac:violet': [200, 190, 180, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10],
  'blocabrac:rouge': [400, 380, 360, 340, 320, 300, 280, 260, 240, 220, 200, 180, 160, 140, 120, 100, 80, 60, 40, 20],
  'blocabrac:noir': [600, 580, 560, 540, 520, 500, 480, 460, 440, 420, 400, 380, 360, 340, 320, 300, 280, 260, 240, 220],
  'blocabrac:blanc': [800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100, 50, 0, 0, 0, 0],
  'blocabrac:rose': [1000, 950, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100, 50],
  'blocabrac_plancher:jaune': [25, 22, 20, 18, 16, 15, 13, 12, 11, 11, 10, 9, 9, 9, 8, 8, 8, 7, 7, 7],
  'blocabrac_plancher:vert': [50, 44, 40, 36, 32, 29, 27, 25, 23, 21, 20, 19, 18, 17, 16, 16, 15, 15, 15, 14],
  'blocabrac_plancher:bleu': [100, 89, 79, 71, 64, 58, 53, 49, 45, 42, 40, 38, 36, 34, 33, 32, 31, 30, 29, 28],
  'blocabrac_plancher:violet': [200, 178, 158, 142, 128, 117, 107, 98, 91, 85, 80, 75, 71, 68, 65, 63, 61, 59, 58, 57],
  'blocabrac_plancher:rouge': [400, 355, 317, 284, 257, 233, 213, 196, 182, 169, 159, 150, 143, 136, 131, 126, 122, 119, 116, 114],
  'blocabrac_plancher:noir': [600, 533, 475, 426, 385, 350, 320, 294, 273, 254, 239, 225, 214, 204, 196, 189, 183, 178, 174, 171],
  'blocabrac_plancher:blanc': [800, 710, 633, 568, 513, 466, 426, 392, 363, 339, 318, 300, 285, 273, 262, 252, 245, 238, 232, 227],
  'blocabrac_plancher:rose': [1000, 888, 792, 711, 642, 583, 533, 490, 454, 424, 398, 376, 357, 341, 327, 316, 306, 297, 290, 284],
  'blocs_valides:jaune': [137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137],
  'blocs_valides:vert': [137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137],
  'blocs_valides:bleu': [137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137],
  'blocs_valides:violet': [137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137],
  'blocs_valides:rouge': [137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137],
  'blocs_valides:noir': [137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137],
  'blocs_valides:blanc': [137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137],
  'blocs_valides:rose': [137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137, 137],
  'personnalise:jaune': [70, 67, 64, 61, 58, 55, 52, 49, 46, 43, 40, 37, 34, 31, 28, 25, 22, 19, 16, 13],
  'personnalise:vert': [83, 79, 75, 71, 67, 63, 59, 55, 51, 47, 43, 39, 35, 31, 27, 23, 19, 15, 11, 7],
  'personnalise:bleu': [96, 91, 86, 81, 76, 71, 66, 61, 56, 51, 46, 41, 36, 31, 26, 21, 16, 11, 6, 1],
  'personnalise:violet': [109, 103, 97, 91, 85, 79, 73, 67, 61, 55, 49, 43, 37, 31, 25, 19, 13, 7, 1, 0],
  'personnalise:rouge': [122, 115, 108, 101, 94, 87, 80, 73, 66, 59, 52, 45, 38, 31, 24, 17, 10, 3, 0, 0],
  'personnalise:noir': [135, 127, 119, 111, 103, 95, 87, 79, 71, 63, 55, 47, 39, 31, 23, 15, 7, 0, 0, 0],
  'personnalise:blanc': [148, 139, 130, 121, 112, 103, 94, 85, 76, 67, 58, 49, 40, 31, 22, 13, 4, 0, 0, 0],
  'personnalise:rose': [161, 151, 141, 131, 121, 111, 101, 91, 81, 71, 61, 51, 41, 31, 21, 11, 1, 0, 0, 0],
  'officiel:jaune': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'officiel:vert': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'officiel:bleu': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'officiel:violet': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'officiel:rouge': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'officiel:noir': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'officiel:blanc': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'officiel:rose': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

const bloc = (couleur: string, multiplicateur?: number) => ({
  color: couleur,
  points_value: POINTS_VALUE,
  ...(multiplicateur === undefined ? {} : { points_multiplier: multiplicateur }),
});

describe('Multiplicateur de points : la table de référence est complète', () => {
  // ⚠️ Affirmer la TAILLE avant le contenu : une table amputée passerait verte en ne
  // vérifiant que ce qui reste, et c'est exactement ce qu'un copier-coller abîme.
  it('couvre les 5 modes × 8 couleurs, 20 essais chacun — 800 valeurs', () => {
    expect(Object.keys(REFERENCE)).toHaveLength(MODES.length * COULEURS.length);
    expect(MODES.length * COULEURS.length).toBe(40);
    for (const mode of MODES) {
      for (const couleur of COULEURS) {
        const ligne = REFERENCE[`${mode}:${couleur}`];
        expect(ligne, `${mode}:${couleur} manque dans la table`).toBeDefined();
        expect(ligne).toHaveLength(ESSAIS_MAX);
      }
    }
  });
});

describe("Multiplicateur de points : SANS multiplicateur, rien n'a bougé", () => {
  it('rend exactement la valeur de référence, pour les 800 combinaisons', () => {
    for (const mode of MODES) {
      for (const couleur of COULEURS) {
        const attendu = REFERENCE[`${mode}:${couleur}`];
        for (let essais = 1; essais <= ESSAIS_MAX; essais++) {
          expect(
            calculateCompetitionPoints(bloc(couleur), essais, true, mode, CUSTOM),
            `${mode}/${couleur}/${essais} essai(s)`
          ).toBe(attendu[essais - 1]);
        }
      }
    }
  });

  it('un multiplicateur de 1 est indiscernable de son absence, et null aussi', () => {
    for (const mode of MODES) {
      for (const couleur of COULEURS) {
        for (let essais = 1; essais <= ESSAIS_MAX; essais++) {
          const reference = REFERENCE[`${mode}:${couleur}`][essais - 1];
          expect(calculateCompetitionPoints(bloc(couleur, 1), essais, true, mode, CUSTOM)).toBe(reference);
          // `null` est une valeur que les règles acceptent (comme l'absence) : elle doit
          // valoir ×1 et non produire un NaN ou un 0.
          const avecNull = { ...bloc(couleur), points_multiplier: null as unknown as number };
          expect(calculateCompetitionPoints(avecNull, essais, true, mode, CUSTOM)).toBe(reference);
        }
      }
    }
  });
});

describe('Multiplicateur de points : AVEC ×2, exactement le double', () => {
  it('double la valeur de référence, pour les 800 combinaisons, les cinq modes compris', () => {
    for (const mode of MODES) {
      for (const couleur of COULEURS) {
        const attendu = REFERENCE[`${mode}:${couleur}`];
        for (let essais = 1; essais <= ESSAIS_MAX; essais++) {
          expect(
            calculateCompetitionPoints(bloc(couleur, 2), essais, true, mode, CUSTOM),
            `${mode}/${couleur}/${essais} essai(s)`
          ).toBe(attendu[essais - 1] * 2);
        }
      }
    }
  });

  it('nomme ce qui doit DIFFÉRER : au moins une valeur change réellement', () => {
    // Sans cette ligne, le test ci-dessus passerait tout aussi vert si la référence était
    // nulle partout (0 × 2 = 0) — ce qui est le cas de `officiel` et d'une partie de
    // `blocabrac`. Il faut donc exhiber un doublement non trivial.
    const simple = calculateCompetitionPoints(bloc('rouge'), 1, true, 'blocabrac_plancher');
    const double = calculateCompetitionPoints(bloc('rouge', 2), 1, true, 'blocabrac_plancher');
    expect(simple).toBe(400);
    expect(double).toBe(800);
    expect(double).not.toBe(simple);
  });

  it('un échec reste à 0, quel que soit le multiplicateur — le multiple de 0 est 0', () => {
    for (const mode of MODES) {
      for (const couleur of COULEURS) {
        expect(calculateCompetitionPoints(bloc(couleur, 2), 1, false, mode, CUSTOM)).toBe(0);
        expect(calculateCompetitionPoints(bloc(couleur, 2), 7, false, mode, CUSTOM)).toBe(0);
      }
    }
  });
});

describe("Multiplicateur de points : l'ordre des opérations (§D3)", () => {
  // ⚠️ LE CAS QUI A DÉCIDÉ DE L'ORDRE. En mode à plancher, le multiplicateur appliqué AVANT
  // l'arrondi donnerait 317 pour un violet à 3 essais, alors que l'écran de validation affiche
  // 158 : le grimpeur lirait 158 et se verrait créditer 317, un écart de 1 point inexplicable
  // au micro. Appliqué APRÈS, il donne 316 — exactement le double de ce qui est affiché, une
  // propriété que le grimpeur vérifie de tête.
  //
  // ⚠️ LES CHIFFRES DU PLAN ÉTAIENT FAUX ICI, ET C'EST CE TEST QUI L'A DIT : son §D3 annonçait
  // « violet, 3 essais → 144, donc 288 contre 289 ». La valeur réelle est 158 (200 × 0,791875
  // = 158,375), donc 316 contre 317. Écrits dans ce test AVANT de l'exécuter, les chiffres
  // fournis se sont manifestés comme faux au lieu d'être recopiés depuis le code — même forme
  // d'erreur que la cellule du barème à plancher du 28/10. La CONCLUSION du plan, elle, tient
  // entièrement : seul l'ordre « arrondir puis doubler » rend le double de ce qui est affiché.
  //
  // ⚠️ Et l'ampleur était sous-estimée : les deux ordres divergent sur 86 des 160 combinaisons
  // couleur × essais (mesuré), pas sur un cas isolé. Ce n'était pas un détail d'arrondi.
  it('violet à 3 essais, mode à plancher : 316 (le double de 158), jamais 317', () => {
    const affiche = calculateCompetitionPoints(bloc('violet'), 3, true, 'blocabrac_plancher');
    expect(affiche).toBe(158);
    expect(calculateCompetitionPoints(bloc('violet', 2), 3, true, 'blocabrac_plancher')).toBe(316);
    // Ce que l'autre ordre aurait donné, écrit en clair pour que la différence soit lisible
    // sans refaire le calcul de tête — et pour que ce test rougisse si l'ordre s'inverse.
    expect(plancherPoints(basePoints.violet * 2, 3)).toBe(317);
    expect(calculateCompetitionPoints(bloc('violet', 2), 3, true, 'blocabrac_plancher')).not.toBe(317);
  });

  it('un seul arrondi subsiste : le doublé est toujours un entier PAIR en mode à plancher', () => {
    // Corollaire vérifiable de « arrondir puis doubler » : le résultat est pair partout. Avec
    // l'ordre inverse, 86 des 160 combinaisons seraient décalées de 1, dont des impairs (317
    // ci-dessus en est un). Cette propriété couvre donc toute la grille, pas un cas nommé.
    for (const couleur of COULEURS) {
      for (let essais = 1; essais <= ESSAIS_MAX; essais++) {
        const points = calculateCompetitionPoints(bloc(couleur, 2), essais, true, 'blocabrac_plancher');
        expect(points % 2, `${couleur}/${essais} essai(s) → ${points}`).toBe(0);
      }
    }
  });
});
