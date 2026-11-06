// BARÈME DU CLASSEMENT QUOTIDIEN — la copie CommonJS, et la SEULE.
//
// ⚠️ POURQUOI UNE COPIE EXISTE, alors que la doctrine du dépôt dit « tout artefact dont le
// calcul doit rester unique se compose dans l'application, jamais dans un script » : parce
// qu'un script Node CommonJS ne peut pas importer `frontend/src/utils/climbingPoints.ts`. La
// copie est donc inévitable — ce qui se choisit, c'est COMBIEN il y en a. Avant ce fichier
// elle vivait en ligne dans `reconcile-classement-profiles.js` ; elle vit maintenant ici,
// une fois, et tout script qui a besoin du barème quotidien l'exige d'ici.
//
// 🔴 CE FICHIER EST LE DÉFAUT LE PLUS GRAVE DU LOT S'IL DÉRIVE, et il dérive en silence :
// `reconcile-classement-profiles.js` recalcule le score de TOUS les comptes depuis
// `client_boulder_results` et les réécrit. Si cette formule n'était pas celle de
// `calculateDailyPoints`, la prochaine passe mensuelle remettrait toute la base à l'autre
// barème **en croyant la réparer**, sans qu'aucun écran ne s'en plaigne.
//
// ✅ L'accord des deux implémentations est verrouillé par une table de valeurs figées que les
// DEUX consomment : `frontend/test/contrats/baremeQuotidien.test.ts`, dans `npm test`. Si
// l'une des deux dérive, elle rougit.
//
// Le barème (06/11/2026, docs/plans/2026-11-06-CN-plan-bareme-unifie-et-ecran-competition.md
// partie A) : `points = arrondi(base × (0,25 + 0,75 × 0,85^(essais−1)))`, un seul arrondi, à
// la fin. Un bloc réussi ne rapporte jamais zéro, et aucune couleur ne peut en rattraper une
// autre puisque le facteur ne dépend que du nombre d'essais.

const BASE_POINTS = { jaune: 25, vert: 50, bleu: 100, violet: 200, rouge: 400, noir: 600, blanc: 800, rose: 1000 };

const PLANCHER_RATIO = 0.25;
const PLANCHER_TAUX = 0.85;

// ⚠️ `attempts` borné à 1 par le bas, comme `plancherPoints` côté TypeScript : à 0 essai le
// facteur dépasserait 1 et un bloc vaudrait PLUS que son flash.
function calculateDailyPoints(color, attempts) {
  const base = BASE_POINTS[color] || 0;
  const essais = Number.isFinite(attempts) ? Math.max(1, attempts) : 1;
  const facteur = PLANCHER_RATIO + (1 - PLANCHER_RATIO) * Math.pow(PLANCHER_TAUX, essais - 1);
  return Math.round(base * facteur);
}

module.exports = { BASE_POINTS, PLANCHER_RATIO, PLANCHER_TAUX, calculateDailyPoints };
