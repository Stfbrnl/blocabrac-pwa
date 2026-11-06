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
import { readdirSync, readFileSync } from 'fs';
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

// ============================================================================
// CONTRAT DU SÉLECTEUR DE MODE — commit A3 du plan.
//
// « Sinon l'ancienne courbe revient par une liste déroulante, un soir où personne n'y
// pensera. » Ce retrait vit entièrement dans un `.tsx`, donc hors de portée de la couverture
// de tests de ce dépôt (pas de harnais React) : ce qui y est écrit est STRUCTURELLEMENT
// invisible. D'où un contrat lu sur la SOURCE, même forme que pointsMultiplier.test.ts.
//
// ⚠️ Et il porte DEUX clauses opposées, dont une ABSENCE : le mode doit être non
// sélectionnable, **et** rester décrit dans le tableau. Supprimer l'option afficherait faux
// les compétitions passées qui l'utilisent — c'est le défaut symétrique, et aucun test
// d'exécution ne l'attrape puisqu'il ne se voit qu'à la consultation d'un classement ancien.
//
// ⚠️ CE QUE CE FILET NE COUVRE PAS : il lit un fichier désigné par son chemin et des noms
// désignés en clair. Un renommage ou un déplacement lui échappent.
// ============================================================================
describe('contrat du sélecteur de mode — `blocabrac` lisible mais plus sélectionnable', () => {
  const source = readFileSync(resolve(__dirname, '../../src/pages/AdminCompetitionManagement.tsx'), 'utf8');

  it("le mode d'une compétition NEUVE est le barème à plancher", () => {
    expect(source).toMatch(/const MODE_PAR_DEFAUT: ScoringMode = 'blocabrac_plancher';/);
  });

  it('`blocabrac` est marqué `historique`', () => {
    // La fenêtre de l'option `blocabrac`, du début de son `value` à la fin de son objet.
    const option = source.slice(source.indexOf("value: 'blocabrac',"));
    const fin = option.indexOf('},');
    expect(fin).toBeGreaterThan(0);
    expect(option.slice(0, fin)).toMatch(/historique: true/);
  });

  it('la liste déroulante filtre les modes `historique`, sauf celui déjà choisi', () => {
    expect(source).toMatch(/\.filter\(option => !option\.historique \|\| option\.value === \(form\.scoring_mode \?\? MODE_PAR_DEFAUT\)\)/);
  });

  it("CLAUSE D'ABSENCE : l'option `blocabrac` n'a PAS été supprimée du tableau", () => {
    // ⚠️ Sans elle, les compétitions passées en mode `blocabrac` perdraient leur libellé et
    // leur description — un écran qui affiche un mode vide pour une épreuve déjà jouée.
    expect(source).toContain("value: 'blocabrac',");
    const option = source.slice(source.indexOf("value: 'blocabrac',"));
    expect(option.slice(0, option.indexOf('},'))).toMatch(/label: '[^']+'/);
  });

  it("les replis de LECTURE gardent `blocabrac` : une épreuve passée ne se recote pas", () => {
    // ⚠️ La grandeur dont on n'attend AUCUN mouvement. Un `doc.data().scoring_mode ||
    // 'blocabrac'` passé à `|| 'blocabrac_plancher'` recoterait rétroactivement toutes les
    // compétitions antérieures au champ — des épreuves déjà proclamées.
    // ⚠️ Les lignes de commentaire sont retirées d'abord : la note qui EXPLIQUE ces replis
    // en cite un mot pour mot, et sans ce filtrage le compte annoncé compterait la
    // documentation avec le code — un nombre juste qui ne mesure pas ce qu'il dit.
    const code = source
      .split('\n')
      .filter((ligne) => !/^\s*(\/\/|\*|\/\*)/.test(ligne))
      .join('\n');
    expect((code.match(/scoring_mode \|\| 'blocabrac'/g) ?? []).length).toBe(3);
    expect((code.match(/scoring_mode \?\? 'blocabrac'/g) ?? []).length).toBe(4);
    expect(code).not.toMatch(/scoring_mode (\|\||\?\?) 'blocabrac_plancher'/);
  });
});

// ============================================================================
// LA TABLE RECOPIÉE DANS LE TOPO PAPIER.
//
// ⚠️ L'affiche d'accueil, elle, est GÉNÉRÉE depuis le code (`scripts/regen-affiche-bareme.cjs`
// importe `climbingPoints.ts`), donc elle ne peut pas mentir. Le topo n'a pas cette machinerie :
// sa page « Barème de points » porte des nombres RECOPIÉS À LA MAIN. C'est précisément la
// famille de défaut que ce dépôt connaît le mieux — une transcription littérale ne bouge pas
// quand la donnée bouge, et elle est IMPRIMÉE, donc définitive.
//
// À défaut d'une génération, la recopie est ici VÉRIFIÉE contre la même table figée que le
// code. Un chiffre qui dériverait d'un côté rougit.
//
// ⚠️ CE QUE CE FILET NE COUVRE PAS : il lit la SOURCE du topo, pas le PDF régénéré. Il ne dit
// donc rien d'un oubli de `npm run topo` — ça, c'est l'estampille de version qui l'attrape
// (topoEstampille.test.ts). Et il ne vérifie que les six colonnes présentes : il ne verrait pas
// une colonne entière supprimée, raison pour laquelle la taille est affirmée d'abord.
// ============================================================================
describe('la table du topo papier est la même que celle du code', () => {
  const ESSAIS_DU_TOPO = [1, 2, 3, 5, 10];
  const topo = readFileSync(resolve(__dirname, '../../../topo-blocabrac-source.html'), 'utf8');

  it('les 8 lignes de la table du topo rendent les valeurs du code, plancher compris', () => {
    const lignes = [...topo.matchAll(/<span class="swatch"[^>]*><\/span>(\w+)<\/td>((?:<td>\d+<\/td>)+)/g)];
    // ⚠️ Affirmer la TAILLE avant le contenu : une ligne ou une colonne disparue passerait
    // verte en ne vérifiant que ce qui reste. Et la table des modes de la page suivante ne
    // porte pas de `swatch`, donc 8 est bien le compte attendu.
    expect(lignes).toHaveLength(8);

    lignes.forEach(([, nomCouleur, cellules]) => {
      // « Noire » dans le topo, `noir` dans le code : le féminin est celui de l'affichage.
      const couleur = nomCouleur.toLowerCase() === 'noire' ? 'noir' : nomCouleur.toLowerCase();
      expect(COULEURS).toContain(couleur);
      const valeurs = [...cellules.matchAll(/<td>(\d+)<\/td>/g)].map((m) => Number(m[1]));
      expect(valeurs, `ligne ${nomCouleur}`).toHaveLength(ESSAIS_DU_TOPO.length + 1);
      ESSAIS_DU_TOPO.forEach((essais, i) => {
        expect(valeurs[i], `${couleur} à ${essais} essai(s) dans le topo`)
          .toBe(TABLE_PLANCHER[couleur][essais - 1]);
      });
      // La dernière colonne, « Jamais moins de » : le plancher, qui est tout l'intérêt.
      expect(valeurs[ESSAIS_DU_TOPO.length], `plancher de ${couleur} dans le topo`)
        .toBe(Math.round(basePoints[couleur] * 0.25));
    });
  });

  it("CLAUSE D'ABSENCE : le topo ne parle plus de « déduction par essai » au quotidien", () => {
    // ⚠️ L'ancienne page portait une colonne « Déduction / essai suppl. » et un encadré
    // affirmant « C'est voulu et ça ne change pas ». Les deux sont devenus faux le 06/11 — et
    // un document imprimé qui se contredit est ce qui décide un lecteur à ne plus faire
    // confiance au reste.
    expect(topo).not.toContain('Déduction / essai suppl.');
    expect(topo).not.toContain("C'est voulu et ça ne change pas");
  });
});

// ============================================================================
// L'UNICITÉ D'APPELANT DE `calculatePoints` — resserré le 06/11/2026 au soir.
//
// Le plan (§A.1 point 2) la gardait pour DEUX choses : les mini-compétitions et le mode
// `blocabrac` des compétitions passées. La mesure en production a renversé la première :
// **1 mini-compétition créée, 0 document portant un `miniCompetitionId`** — aucune n'a jamais
// produit de résultat, donc la doctrine « proclamé = figé » ne protégeait rien.
//
// 🔴 ET CE QUI A RENDU LE MOMENT DÉCISIF : les points d'une mini-compétition **ne sont pas
// stockés**, ils sont recalculés à chaque affichage par `buildMiniCompetitionRanking` depuis
// `boulderColor` + `attempts`. Le gel d'une mini-compétition porte donc sur la **couleur**
// (immunité contre une recotation), pas sur les **points**. Aligner le barème plus tard aurait
// réécrit un classement réellement proclamé devant des élèves. C'était le seul moment où
// c'était gratuit, et il ne se représentera pas.
//
// Ce qui reste donc à `calculatePoints` : **un seul appelant**, la branche du mode `blocabrac`,
// pour que les compétitions passées s'affichent juste. ⚠️ **Un appelant de plus serait une
// troisième courbe** — exactement ce que le critère d'uniformité écarte. C'est ce que ce pas
// garde, et c'est une clause d'ABSENCE : aucun test d'exécution ne la voit.
// ============================================================================
describe("contrat d'unicité — `calculatePoints` n'a plus qu'un appelant", () => {
  const SRC = resolve(__dirname, '../../src');

  // Tous les fichiers de source, tests exclus : ce sont les tests qui l'appellent légitimement
  // pour l'épingler, et les compter ici rendrait le contrat insensible au vrai sujet.
  const fichiersSource = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
      const chemin = resolve(dossier, e.name);
      if (e.isDirectory()) return fichiersSource(chemin);
      if (!/\.(ts|tsx)$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
      return [chemin];
    });

  it('un seul site d’appel, et il est dans climbingPoints.ts', () => {
    const appels = fichiersSource(SRC)
      .map((f) => ({ f, n: (readFileSync(f, 'utf8').match(/(?<![A-Za-z])calculatePoints\(/g) ?? []).length }))
      .filter((x) => x.n > 0);
    // ⚠️ Affirmer la TAILLE avant le contenu : un second fichier appelant, ou un second appel
    // dans le même fichier, doit rougir — pas seulement un appel déplacé.
    expect(appels).toHaveLength(1);
    // Le nom de fichier ne contient pas de séparateur, donc cette assertion est insensible
    // au séparateur de chemin de la plateforme — pas de normalisation à faire.
    expect(appels[0].f).toMatch(/climbingPoints\.ts$/);
    expect(appels[0].f).toContain('utils');
    expect(appels[0].n).toBe(1);
  });

  it("et cet appel est bien la branche du mode `blocabrac`, pas autre chose", () => {
    const src = readFileSync(resolve(SRC, 'utils/climbingPoints.ts'), 'utf8');
    // La dernière instruction de `pointsAvantMultiplicateur` : le repli de mode, atteint
    // quand aucune branche spécifique n'a répondu — donc `blocabrac`.
    // ⚠️ `\r?\n` et non `\n` : les sources de ce dépôt sont en CRLF, et un motif ancré sur un
    // saut de ligne nu échoue sans rien dire du sujet qu'il prétend garder.
    expect(src).toMatch(/\r?\n {2}return calculatePoints\(colorKey, attempts, success\);\r?\n\};/);
  });

  it("CLAUSE D'ABSENCE : les mini-compétitions comptent avec le barème unifié", () => {
    // ⚠️ Les deux sites qui ont basculé le 06/11 au soir. Nommés explicitement parce que
    // l'écran du moniteur et celui de l'élève ont déjà divergé une fois sur la même validation
    // (80 points contre 900, 18/10/2026) : c'est le précédent qui justifie de garder les deux
    // ensemble plutôt qu'un seul.
    const ranking = readFileSync(resolve(SRC, 'utils/miniCompetitionRanking.ts'), 'utf8');
    const ecran = readFileSync(resolve(SRC, 'pages/Client/Courses/ClientCourseSession.tsx'), 'utf8');
    expect(ranking).toMatch(/total \+ calculateDailyPoints\(r\.boulderColor/);
    expect(ecran).toMatch(/calculateDailyPoints\(couleurAffichee/);
  });
});
