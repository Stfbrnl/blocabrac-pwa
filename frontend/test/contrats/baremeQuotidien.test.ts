// CONTRAT DU BARÈME QUOTIDIEN — une table de valeurs figées, DEUX clients.
//
// docs/plans/2026-11-06-CN-plan-bareme-unifie-et-ecran-competition.md partie A.4.
//
// Le 06/11/2026 le classement quotidien a adopté la courbe à plancher des compétitions, sous
// un critère que l'utilisateur a nommé comme gouvernant : *quand on compte des points avec
// les essais, il doit y avoir une seule façon de le faire, quel que soit le processus
// compétitif.* Une intention ne se garde pas toute seule — ce fichier la transforme en
// quelque chose qui rougit.
//
// Il y a DEUX implémentations du barème quotidien, et il y en aura toujours deux : la
// TypeScript (`frontend/src/utils/climbingPoints.ts`), et une copie CommonJS
// (`scripts/lib/bareme-quotidien.cjs`) parce qu'un script Node ne peut pas importer un module
// TypeScript. La copie est inévitable ; ce qui se choisit, c'est si elle est VÉRIFIÉE.
//
// 🔴 Ce qui arrive si personne ne la vérifie : `reconcile-classement-profiles.js` recalcule
// le score de TOUS les comptes depuis `client_boulder_results` et les réécrit. Une formule
// restée en arrière dans le script remettrait, à sa prochaine passe mensuelle, toute la base
// à l'ancien barème — **en croyant la réparer**. Aucun écran ne s'en plaindrait, aucun
// utilisateur ne saurait quoi signaler.
//
// ⚠️ CE QUE CE FILET NE COUVRE PAS. Un épinglage garde le PASSÉ : il protège la table contre
// une dérive future, il ne dit rien de la justesse du barème aujourd'hui. Cette justesse-là
// est gardée par les propriétés de `src/utils/climbingPoints.test.ts` (plancher, ordre
// strict, monotonie, jamais zéro), chacune cassable séparément.
import { describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { createRequire } from 'module';
import {
  calculateDailyPoints,
  calculateCompetitionPoints,
  calculatePoints,
  basePoints,
} from '../../src/utils/climbingPoints';

const requireCjs = createRequire(import.meta.url);
const scriptBareme = requireCjs(resolve(__dirname, '../../../scripts/lib/bareme-quotidien.cjs')) as {
  BASE_POINTS: Record<string, number>;
  calculateDailyPoints: (color: string, attempts: number) => number;
};

const COULEURS = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];
const ESSAIS_MAX = 60;

// ⚠️ LA TABLE FIGÉE, et c'est elle le livrable de ce fichier : un seul tableau, deux clients.
// Les valeurs ont été générées une fois depuis la formule, puis gelées ici. Elles ne se
// recalculent PAS dans ce fichier — un attendu recalculé par la même formule que le sujet ne
// peut jamais rougir (c'est le cas dégénéré où l'on compare la chose à elle-même).
const TABLE_PLANCHER: Record<string, number[]> = {
  jaune: [25, 22, 20, 18, 16, 15, 13, 12, 11, 11, 10, 9, 9, 9, 8, 8, 8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  vert: [50, 44, 40, 36, 32, 29, 27, 25, 23, 21, 20, 19, 18, 17, 16, 16, 15, 15, 15, 14, 14, 14, 14, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13],
  bleu: [100, 89, 79, 71, 64, 58, 53, 49, 45, 42, 40, 38, 36, 34, 33, 32, 31, 30, 29, 28, 28, 27, 27, 27, 27, 26, 26, 26, 26, 26, 26, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25],
  violet: [200, 178, 158, 142, 128, 117, 107, 98, 91, 85, 80, 75, 71, 68, 65, 63, 61, 59, 58, 57, 56, 55, 54, 54, 53, 53, 52, 52, 52, 51, 51, 51, 51, 51, 51, 51, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
  rouge: [400, 355, 317, 284, 257, 233, 213, 196, 182, 169, 159, 150, 143, 136, 131, 126, 122, 119, 116, 114, 112, 110, 108, 107, 106, 105, 104, 104, 103, 103, 102, 102, 102, 101, 101, 101, 101, 101, 101, 101, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  noir: [600, 533, 475, 426, 385, 350, 320, 294, 273, 254, 239, 225, 214, 204, 196, 189, 183, 178, 174, 171, 167, 165, 163, 161, 159, 158, 157, 156, 155, 154, 153, 153, 152, 152, 152, 152, 151, 151, 151, 151, 151, 151, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150],
  blanc: [800, 710, 633, 568, 513, 466, 426, 392, 363, 339, 318, 300, 285, 273, 262, 252, 245, 238, 232, 227, 223, 220, 217, 214, 212, 210, 209, 207, 206, 205, 205, 204, 203, 203, 202, 202, 202, 201, 201, 201, 201, 201, 201, 201, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200],
  rose: [1000, 888, 792, 711, 642, 583, 533, 490, 454, 424, 398, 376, 357, 341, 327, 316, 306, 297, 290, 284, 279, 275, 271, 268, 265, 263, 261, 259, 258, 257, 256, 255, 254, 254, 253, 253, 252, 252, 252, 251, 251, 251, 251, 251, 251, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250],
};

// ⚠️ LA CLAUSE D'ABSENCE : `calculatePoints` ne bouge pas d'un point. Elle reste la formule
// des mini-compétitions (proclamées le soir même, donc figées) et des compétitions passées en
// mode `blocabrac`. Si cette table-ci doit être modifiée un jour, ce n'est pas un détail de
// refactorisation : **les mini-compétitions ont changé de barème**.
//
// C'est aussi la table qui donne son sens à TABLE_PLANCHER : elle nomme ce qui doit DIFFÉRER.
// Les colonnes de zéros en sont la raison d'être — c'est exactement ce que le plancher
// supprime.
const TABLE_CLASSIQUE: Record<string, number[]> = {
  jaune: [25, 15, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  vert: [50, 40, 30, 20, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bleu: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  violet: [200, 190, 180, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rouge: [400, 380, 360, 340, 320, 300, 280, 260, 240, 220, 200, 180, 160, 140, 120, 100, 80, 60, 40, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  noir: [600, 580, 560, 540, 520, 500, 480, 460, 440, 420, 400, 380, 360, 340, 320, 300, 280, 260, 240, 220, 200, 180, 160, 140, 120, 100, 80, 60, 40, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  blanc: [800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rose: [1000, 950, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

describe('contrat du barème quotidien — la table figée', () => {
  // ⚠️ Affirmer la TAILLE avant le contenu : sinon une table amputée d'une couleur ou d'une
  // colonne passerait verte en ne vérifiant que ce qui reste.
  it('les deux tables couvrent les 8 couleurs sur 60 essais', () => {
    expect(Object.keys(TABLE_PLANCHER)).toEqual(COULEURS);
    expect(Object.keys(TABLE_CLASSIQUE)).toEqual(COULEURS);
    expect(Object.keys(basePoints)).toEqual(COULEURS);
    COULEURS.forEach((couleur) => {
      expect(TABLE_PLANCHER[couleur]).toHaveLength(ESSAIS_MAX);
      expect(TABLE_CLASSIQUE[couleur]).toHaveLength(ESSAIS_MAX);
    });
  });

  it('CLIENT 1 — la fonction TypeScript du classement quotidien rend la table', () => {
    COULEURS.forEach((couleur) => {
      for (let essais = 1; essais <= ESSAIS_MAX; essais += 1) {
        expect(
          calculateDailyPoints(couleur, essais, true),
          `${couleur} à ${essais} essai(s)`,
        ).toBe(TABLE_PLANCHER[couleur][essais - 1]);
      }
    });
  });

  it('CLIENT 2 — la copie CommonJS de scripts/lib rend la MÊME table', () => {
    // 🔴 C'est ce pas qui empêche la réconciliation mensuelle de réécrire toute la base à
    // l'ancien barème en croyant la réparer.
    expect(Object.keys(scriptBareme.BASE_POINTS)).toEqual(COULEURS);
    COULEURS.forEach((couleur) => {
      expect(scriptBareme.BASE_POINTS[couleur]).toBe(basePoints[couleur]);
      for (let essais = 1; essais <= ESSAIS_MAX; essais += 1) {
        expect(
          scriptBareme.calculateDailyPoints(couleur, essais),
          `${couleur} à ${essais} essai(s), copie CommonJS`,
        ).toBe(TABLE_PLANCHER[couleur][essais - 1]);
      }
    });
  });
});

describe("contrat d'uniformité — une seule façon de compter des points avec les essais", () => {
  // ⚠️ C'est le test qui PORTE la décision du 06/11. Il ne compare pas une fonction à
  // elle-même : `calculateDailyPoints` prend une couleur et rend des points, pendant que
  // `calculateCompetitionPoints` traverse la lecture de la couleur du bloc (`color` ou
  // `difficulty`), le choix de la branche de mode et l'application du multiplicateur. C'est
  // l'accord de ces deux CHEMINS qui est affirmé, pas celui d'une formule avec sa copie.
  //
  // Vu rougir avant d'être vert, en faisant pointer la branche `blocabrac_plancher` sur
  // `calculatePoints` : 480 cas rouges.
  it('le quotidien et le mode de compétition à plancher rendent la même chose, 8 couleurs × 60 essais', () => {
    COULEURS.forEach((couleur) => {
      for (let essais = 1; essais <= ESSAIS_MAX; essais += 1) {
        expect(
          calculateDailyPoints(couleur, essais, true),
          `${couleur} à ${essais} essai(s)`,
        ).toBe(calculateCompetitionPoints({ color: couleur }, essais, true, 'blocabrac_plancher'));
      }
    });
  });

  it("s'accorde aussi sur l'échec et sur une couleur inconnue", () => {
    expect(calculateDailyPoints('rose', 1, false)).toBe(0);
    expect(calculateDailyPoints('turquoise', 1, true)).toBe(0);
    expect(calculateDailyPoints('rose', 1, false))
      .toBe(calculateCompetitionPoints({ color: 'rose' }, 1, false, 'blocabrac_plancher'));
    expect(calculateDailyPoints('turquoise', 1, true))
      .toBe(calculateCompetitionPoints({ color: 'turquoise' }, 1, true, 'blocabrac_plancher'));
  });

  it("borne les essais à 1 : le flash reste le maximum, comme côté compétition", () => {
    [0, -5, NaN, Infinity].forEach((essais) => {
      expect(calculateDailyPoints('noir', essais, true)).toBe(600);
    });
  });
});

describe("clause d'absence — `calculatePoints` (mini-compétitions) ne bouge pas", () => {
  it('rend exactement ses valeurs historiques, 8 couleurs × 60 essais', () => {
    COULEURS.forEach((couleur) => {
      for (let essais = 1; essais <= ESSAIS_MAX; essais += 1) {
        expect(
          calculatePoints(couleur, essais, true),
          `${couleur} à ${essais} essai(s)`,
        ).toBe(TABLE_CLASSIQUE[couleur][essais - 1]);
      }
    });
  });

  it('et les deux barèmes DIFFÈRENT bien : identiques au flash, jamais zéro contre zéro ensuite', () => {
    // ⚠️ Sans cette assertion, tout ce fichier serait satisfait par deux barèmes identiques —
    // donc par un changement qui n'aurait pas eu lieu.
    COULEURS.forEach((couleur) => {
      expect(TABLE_PLANCHER[couleur][0]).toBe(TABLE_CLASSIQUE[couleur][0]);
      expect(TABLE_CLASSIQUE[couleur][ESSAIS_MAX - 1]).toBe(0);
      expect(TABLE_PLANCHER[couleur][ESSAIS_MAX - 1]).toBeGreaterThan(0);
    });
  });
});
