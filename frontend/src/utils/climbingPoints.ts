export const basePoints: Record<string, number> = {
  jaune: 25, vert: 50, bleu: 100, violet: 200, rouge: 400, noir: 600, blanc: 800, rose: 1000
};

export const deductions: Record<string, number> = {
  jaune: 10, vert: 10, bleu: 10, violet: 10, rouge: 20, noir: 20, blanc: 50, rose: 50
};

// Points obtenus pour un bloc réussi, dégressifs selon le nombre d'essais.
// ✅ Reste le barème par défaut (classement quotidien, mini-compétitions, et le mode
// "Blocabrac" des grosses compétitions) — signature inchangée pour ne rien casser.
export const calculatePoints = (difficulty: string, attempts: number, success: boolean): number => {
  if (!success) return 0;
  const base = basePoints[difficulty] || 0;
  const deduction = (attempts > 1 ? (attempts - 1) * (deductions[difficulty] || 0) : 0);
  return Math.max(0, base - deduction);
};

// ✅ Mode "Blocabrac avec plancher" (compétitions UNIQUEMENT — plan du 28/10/2026).
//
// points = base × ( PLANCHER + (1 − PLANCHER) × TAUX^(essais − 1) ), arrondi UNE SEULE fois
// à la fin. Une décroissance qui s'aplatit : forte sur les premiers essais (−11 % de la base
// au 2ᵉ), négligeable ensuite (−0,6 % au 20ᵉ), et qui ne descend jamais sous le quart de la
// base — un bloc réussi rapporte TOUJOURS des points.
//
// ⚠️ Ce mode existe parce que `calculatePoints` NE DOIT PAS BOUGER : ce barème-là est partagé
// avec le classement quotidien, que `reconcile-classement-profiles.js` recalcule entièrement
// depuis l'historique. Le modifier ne recoterait pas un bloc : il réécrirait d'un coup les
// points de tous les grimpeurs sur tous les blocs jamais validés. Une compétition se joue et
// se clôt, donc ses règles peuvent changer entre deux éditions ; le classement général est
// cumulatif et recalculé, donc son barème ne peut changer proprement à aucune date.
//
// ⚠️ Deux chiffres FIXES, écrits ici en clair et volontairement NON paramétrables par
// compétition : le mode `personnalise` existe déjà pour qui veut régler lui-même.
//
// ⚠️ La clé technique décrit la RÈGLE (« avec plancher »), jamais son rang d'apparition :
// pas de `blocabrac_v2`, qui serait illisible dès qu'un v3 existerait.
export const PLANCHER_RATIO = 0.25;
export const PLANCHER_TAUX = 0.85;

// Barème à plancher pour une base donnée. `attempts` est borné à 1 par le bas : à 0 essai le
// facteur dépasserait 1, donc un bloc vaudrait PLUS que son flash — l'invariant « le flash
// est le maximum » tient ici, pas chez l'appelant.
export const plancherPoints = (base: number, attempts: number): number => {
  const essais = Number.isFinite(attempts) ? Math.max(1, attempts) : 1;
  const facteur = PLANCHER_RATIO + (1 - PLANCHER_RATIO) * Math.pow(PLANCHER_TAUX, essais - 1);
  return Math.round(base * facteur);
};

// ✅ Modes de comptage propres aux compétitions (jamais au classement annuel — voir
// competitionClassement.ts, seul appelant de calculateCompetitionPoints). "officiel"
// (coupe de France/du monde, tops/zones) N'EST PAS calculé ici : ce n'est pas une
// somme de points mais un classement par tri multi-critères — voir
// getOfficialParticipantTotals dans competitionClassement.ts, jamais
// calculateCompetitionPoints pour ce mode (qui renvoie 0, volontairement inutilisable
// telle quelle plutôt que silencieusement fausse).
export type ScoringMode = 'blocabrac' | 'blocabrac_plancher' | 'blocs_valides' | 'personnalise' | 'officiel';

export interface CustomScoringEntry {
  base: number;
  deduction: number;
}

// Barème "Personnalisable" : une entrée par couleur, propre à une compétition donnée.
export type CustomScoringTable = Record<string, CustomScoringEntry>;

export interface CompetitionScoringBoulder {
  // ⚠️ LES DEUX SONT OPTIONNELS, et les deux sortes de blocs sont DISJOINTES en production
  // (mesuré le 15/10/2026 sur les 180 blocs) : un bloc du jour porte `color` et **pas**
  // `difficulty` (173 cas), un bloc créé pour une compétition porte `difficulty` et **pas**
  // `color` (7 cas). Zéro bloc porte les deux.
  //
  // `difficulty` était déclaré obligatoire, ce qui était faux pour 173 blocs sur 180 — un
  // mensonge de typage sans conséquence à l'exécution (`boulderColorKey` se replie), mais qui
  // empêchait d'écrire un jeu d'essai à la forme réelle d'un bloc du jour. C'est exactement
  // le cas qu'une compétition HYBRIDE fait tourner (Contest du 5 novembre : des blocs déjà en
  // place plus un mur neuf), donc la forme qu'il faut pouvoir tester.
  color?: string;
  difficulty?: string;
  // Mode "Blocs validés" uniquement : valeur en points fixée bloc par bloc par
  // l'ouvreur/l'admin (la cotation étant cachée en compétition, un barème par couleur
  // ne reflèterait pas la difficulté réelle perçue).
  points_value?: number;
}

// ✅ La couleur qui sert de clé au barème : `color` pour un bloc du jour, `difficulty` pour un
// bloc créé pour la compétition (il n'a pas de `color` — sa cotation cachée EST ce champ, voir
// CompetitionBoulderForm.tsx).
//
// Exporté parce que le classement par niveau max (competitionClassement.ts) doit lire la MÊME
// couleur que le barème : deux lectures séparées de « la couleur de ce bloc » finiraient par
// diverger, et elles décideraient alors d'un paquet d'un côté et d'un score de l'autre, sur le
// même bloc. Un seul endroit répond à la question.
export const boulderColorKey = (boulder: CompetitionScoringBoulder): string | undefined =>
  boulder.color || boulder.difficulty;

// Calcule les points d'un bloc de compétition selon le mode choisi pour cette
// compétition. `calculatePoints` reste le seul calcul utilisé par le classement
// quotidien et les mini-compétitions — cette fonction ne s'y substitue jamais.
export const calculateCompetitionPoints = (
  boulder: CompetitionScoringBoulder,
  attempts: number,
  success: boolean,
  mode: ScoringMode = 'blocabrac',
  customScoring?: CustomScoringTable
): number => {
  if (!success) return 0;
  // ✅ Voir la note sur ScoringMode ci-dessus : ce mode ne produit pas de points,
  // renvoyer 0 plutôt que de laisser cette fonction faire semblant.
  if (mode === 'officiel') return 0;
  const colorKey = boulderColorKey(boulder);

  if (mode === 'blocs_valides') {
    return Math.max(0, boulder.points_value || 0);
  }

  // ⚠️ Ni couleur ni cotation : le bloc n'est pas cotable, et il vaut 0. Explicite plutôt
  // qu'implicite — avant le 15/10/2026, `difficulty` était typé obligatoire et ce chemin
  // n'existait pas aux yeux du compilateur, alors qu'à l'exécution `basePoints[undefined]`
  // renvoyait déjà `undefined || 0`. Le comportement ne change pas ; il est désormais dit.
  // (Le mode "blocs_valides" est traité au-dessus : il ne dépend pas de la couleur.)
  if (!colorKey) return 0;

  // ✅ Aucune déduction par couleur : le facteur est le MÊME pour toutes les couleurs, donc
  // l'ordre des couleurs tient à tous les nombres d'essais et l'anomalie du blanc (déduction
  // 50 sur base 800, donc zéro au 17ᵉ essai, moins tolérant qu'un noir) disparaît par
  // construction — il n'y a plus de paramètre propre à chaque couleur.
  if (mode === 'blocabrac_plancher') {
    return plancherPoints(basePoints[colorKey] || 0, attempts);
  }

  if (mode === 'personnalise') {
    const entry = customScoring?.[colorKey];
    if (!entry) return 0;
    const deduction = attempts > 1 ? (attempts - 1) * (entry.deduction || 0) : 0;
    return Math.max(0, entry.base - deduction);
  }

  return calculatePoints(colorKey, attempts, success);
};
