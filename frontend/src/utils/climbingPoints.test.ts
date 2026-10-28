import { describe, expect, it } from 'vitest';
import { calculatePoints, calculateCompetitionPoints, basePoints, PLANCHER_RATIO, type CustomScoringTable } from './climbingPoints';

describe('calculatePoints', () => {
  it('rapporte 0 point en cas d\'échec, quelle que soit la difficulté', () => {
    expect(calculatePoints('rose', 1, false)).toBe(0);
  });

  it('rapporte les points de base au premier essai réussi', () => {
    expect(calculatePoints('jaune', 1, true)).toBe(25);
    expect(calculatePoints('bleu', 1, true)).toBe(100);
    expect(calculatePoints('rose', 1, true)).toBe(1000);
  });

  it('déduit des points par essai supplémentaire', () => {
    // bleu: base 100, déduction 10/essai -> 3 essais = 2 essais en trop
    expect(calculatePoints('bleu', 3, true)).toBe(80);
  });

  it('ne descend jamais sous 0 même avec beaucoup d\'essais', () => {
    expect(calculatePoints('vert', 50, true)).toBe(0);
  });

  it('renvoie 0 pour une difficulté inconnue', () => {
    expect(calculatePoints('inconnue', 1, true)).toBe(0);
  });
});

describe('calculateCompetitionPoints', () => {
  it('mode "blocabrac" (par défaut) se comporte exactement comme calculatePoints', () => {
    expect(calculateCompetitionPoints({ difficulty: 'bleu' }, 3, true)).toBe(calculatePoints('bleu', 3, true));
    expect(calculateCompetitionPoints({ difficulty: 'bleu' }, 3, false, 'blocabrac')).toBe(0);
  });

  it('mode "blocs_valides" ignore le nombre d\'essais et utilise points_value', () => {
    expect(calculateCompetitionPoints({ difficulty: 'rouge', points_value: 340 }, 1, true, 'blocs_valides')).toBe(340);
    expect(calculateCompetitionPoints({ difficulty: 'rouge', points_value: 340 }, 7, true, 'blocs_valides')).toBe(340);
  });

  it('mode "blocs_valides" rapporte 0 si points_value est absent, et 0 en cas d\'échec', () => {
    expect(calculateCompetitionPoints({ difficulty: 'rouge' }, 1, true, 'blocs_valides')).toBe(0);
    expect(calculateCompetitionPoints({ difficulty: 'rouge', points_value: 340 }, 1, false, 'blocs_valides')).toBe(0);
  });

  it('mode "personnalise" applique le barème fourni, avec sa propre dégression', () => {
    const customScoring: CustomScoringTable = {
      rouge: { base: 500, deduction: 100 }
    };
    expect(calculateCompetitionPoints({ difficulty: 'rouge' }, 1, true, 'personnalise', customScoring)).toBe(500);
    expect(calculateCompetitionPoints({ difficulty: 'rouge' }, 3, true, 'personnalise', customScoring)).toBe(300);
  });

  it('mode "personnalise" rapporte 0 pour une couleur absente du barème personnalisé', () => {
    expect(calculateCompetitionPoints({ difficulty: 'rose' }, 1, true, 'personnalise', { rouge: { base: 500, deduction: 100 } })).toBe(0);
  });

  it('mode "personnalise" ne descend jamais sous 0', () => {
    const customScoring: CustomScoringTable = { rouge: { base: 50, deduction: 100 } };
    expect(calculateCompetitionPoints({ difficulty: 'rouge' }, 5, true, 'personnalise', customScoring)).toBe(0);
  });

  it('mode "officiel" renvoie toujours 0 : pas une somme de points, voir getOfficialParticipantTotals', () => {
    expect(calculateCompetitionPoints({ difficulty: 'rose' }, 1, true, 'officiel')).toBe(0);
  });
});

// ============================================================================
// Mode "blocabrac_plancher" — décroissance qui s'aplatit (plan du 28/10/2026)
//
// ⚠️ AUCUN test ci-dessus n'a été touché, et c'est le garde-fou le moins cher de ce lot :
// s'il avait fallu en modifier un, c'est que le mode `blocabrac` aurait bougé — donc que
// `calculatePoints`, partagé avec le classement quotidien, aurait bougé avec lui.
// ============================================================================
describe('calculateCompetitionPoints — mode "blocabrac_plancher"', () => {
  const couleurs = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];
  const points = (couleur: string, essais: number): number =>
    calculateCompetitionPoints({ color: couleur }, essais, true, 'blocabrac_plancher');

  it('rapporte exactement la base au premier essai, pour chaque couleur', () => {
    couleurs.forEach(couleur => {
      expect(points(couleur, 1)).toBe(basePoints[couleur]);
    });
  });

  it('ne rapporte JAMAIS zéro sur une réussite, quel que soit le nombre d\'essais', () => {
    // ⚠️ La propriété qui motive tout le mode. Bornée à 500 essais : au-delà le facteur a
    // atteint son plancher à la précision du flottant, il n'y a plus rien de nouveau à voir.
    for (let essais = 1; essais <= 500; essais += 1) {
      couleurs.forEach(couleur => {
        expect(points(couleur, essais)).toBeGreaterThan(0);
      });
    }
  });

  it('nomme ce qui doit DIFFÉRER de "blocabrac" : là où l\'ancien barème rend 0, celui-ci ne rend pas 0', () => {
    // ⚠️ Sans cette assertion, tout le bloc serait satisfait par un mode qui se contenterait
    // de recopier `blocabrac` sur les petits nombres d'essais.
    couleurs.forEach(couleur => {
      expect(calculateCompetitionPoints({ color: couleur }, 60, true, 'blocabrac')).toBe(0);
      expect(points(couleur, 60)).toBeGreaterThan(0);
    });
    // Les trois cas cités au grimpeur qui a soulevé la question : 0 → un quart de la base.
    expect(points('noir', 50)).toBe(150);
    expect(points('blanc', 50)).toBe(200);
    expect(points('rose', 50)).toBe(250);
  });

  it('atteint le plancher d\'un quart de la base, et ne descend pas en dessous', () => {
    couleurs.forEach(couleur => {
      const plancher = basePoints[couleur] * PLANCHER_RATIO;
      for (let essais = 1; essais <= 500; essais += 1) {
        // Le plancher est une borne de la valeur AVANT arrondi : l'arrondi peut rendre un
        // demi-point de moins (jaune : 6,25 → 6).
        expect(points(couleur, essais)).toBeGreaterThanOrEqual(Math.floor(plancher));
      }
      // Et il est effectivement atteint, sinon la borne ci-dessus serait vraie pour rien.
      expect(points(couleur, 500)).toBe(Math.round(plancher));
    });
  });

  it('garde l\'ordre des couleurs STRICT à tous les nombres d\'essais', () => {
    // ⚠️ C'est ici que se joue la disparition de l'anomalie du blanc : le facteur ne dépend
    // que du nombre d'essais, jamais de la couleur, donc aucune couleur ne peut en rattraper
    // une autre. Le barème quotidien, lui, garde l'anomalie (déduction 50 sur base 800 →
    // zéro au 17e essai, moins tolérant qu'un noir) — voir §7 du plan.
    for (let essais = 1; essais <= 500; essais += 1) {
      for (let i = 1; i < couleurs.length; i += 1) {
        expect(points(couleurs[i], essais)).toBeGreaterThan(points(couleurs[i - 1], essais));
      }
    }
  });

  it('décroît sans jamais remonter, et ne dépasse jamais la base', () => {
    couleurs.forEach(couleur => {
      for (let essais = 2; essais <= 500; essais += 1) {
        expect(points(couleur, essais)).toBeLessThanOrEqual(points(couleur, essais - 1));
      }
      expect(points(couleur, 1)).toBe(basePoints[couleur]);
    });
  });

  it('borne les essais à 1 : 0, négatif ou non numérique ne peut pas dépasser le flash', () => {
    // ⚠️ Sans cette borne, 0,85^(0−1) vaut 1,18 et un bloc vaudrait PLUS que son flash.
    // L'invariant « le flash est le maximum » tient dans la fonction, pas chez l'appelant.
    [0, -5, NaN, Infinity].forEach(essais => {
      expect(points('noir', essais)).toBe(600);
    });
  });

  it('un bloc dur arraché ne dépasse pas un bloc plus facile flashé', () => {
    expect(points('noir', 50)).toBeLessThan(points('violet', 1));
    expect(points('rose', 50)).toBeLessThan(points('rouge', 1));
  });

  it('la perte est forte au début et négligeable à la fin', () => {
    const base = basePoints.noir;
    const perte = (essais: number) => (points('noir', essais - 1) - points('noir', essais)) / base;
    expect(perte(2)).toBeGreaterThan(0.10);
    expect(perte(20)).toBeLessThan(0.01);
  });

  it('rapporte 0 en cas d\'échec, et 0 pour une couleur inconnue', () => {
    expect(calculateCompetitionPoints({ color: 'noir' }, 1, false, 'blocabrac_plancher')).toBe(0);
    expect(points('turquoise', 1)).toBe(0);
  });

  // ⚠️ ÉPINGLAGE DE LA TABLE PUBLIÉE AUX GRIMPEURS (§3 et §5 du plan).
  //
  // C'est le seul artefact de ce lot qui SORT de l'application : l'affiche d'accueil annonce
  // des chiffres, et un chiffre affiché qui ne serait pas celui que le code calcule serait
  // pire que l'ancien barème. Les valeurs ci-dessous sont donc la SOURCE de l'affiche, et
  // l'affiche se recopie d'ici — jamais l'inverse.
  //
  // ⚠️ Ce que cet épinglage NE PEUT PAS attraper, par construction : il garde la table contre
  // une dérive future, il ne dit RIEN de la justesse du barème lui-même aujourd'hui — un
  // épinglage garde le passé, pas le présent. La justesse est gardée par les propriétés
  // ci-dessus (plancher, ordre strict, monotonie, pas de zéro), chacune cassable séparément.
  it('épingle la table publiée aux grimpeurs', () => {
    const essais = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50];
    const table: Record<string, number[]> = {
      jaune: [25, 22, 20, 18, 16, 13, 11, 8, 7, 6, 6],
      vert: [50, 44, 40, 36, 32, 27, 21, 16, 14, 13, 13],
      bleu: [100, 89, 79, 71, 64, 53, 42, 33, 28, 26, 25],
      violet: [200, 178, 158, 142, 128, 107, 85, 65, 57, 51, 50],
      rouge: [400, 355, 317, 284, 257, 213, 169, 131, 114, 103, 100],
      // ⚠️ 533 et non 532 : 600 × 0,8875 = 532,5, et « l'entier le plus proche » se tranche
      // ici vers le haut (Math.round). Le plan du 28/10 écrivait 532 dans sa table — la seule
      // cellule des 88 où il arrondissait l'autre moitié. C'est 533 qui part sur l'affiche.
      noir: [600, 533, 475, 426, 385, 320, 254, 196, 171, 154, 150],
      blanc: [800, 710, 633, 568, 513, 426, 339, 262, 227, 205, 200],
      rose: [1000, 888, 792, 711, 642, 533, 424, 327, 284, 257, 250],
    };
    // ⚠️ Affirmer la TAILLE avant le contenu : sinon une table amputée d'une couleur ou d'une
    // colonne passerait verte en ne vérifiant que ce qui reste.
    expect(Object.keys(table)).toEqual(couleurs);
    Object.values(table).forEach(ligne => expect(ligne).toHaveLength(essais.length));

    couleurs.forEach(couleur => {
      essais.forEach((nb, i) => {
        expect(points(couleur, nb), `${couleur} a ${nb} essai(s)`).toBe(table[couleur][i]);
      });
    });
  });
});
