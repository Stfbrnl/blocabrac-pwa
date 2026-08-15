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

// ✅ Modes de comptage propres aux compétitions (jamais au classement annuel — voir
// competitionClassement.ts, seul appelant de calculateCompetitionPoints). Le mode
// "officiel coupe de France/du monde" (tops/zones, pas une somme de points) est
// délibérément absent : classement par tri multi-critères, pas compatible avec cette
// fonction — chantier séparé si un jour construit.
export type ScoringMode = 'blocabrac' | 'blocs_valides' | 'personnalise';

export interface CustomScoringEntry {
  base: number;
  deduction: number;
}

// Barème "Personnalisable" : une entrée par couleur, propre à une compétition donnée.
export type CustomScoringTable = Record<string, CustomScoringEntry>;

export interface CompetitionScoringBoulder {
  color?: string;
  difficulty: string;
  // Mode "Blocs validés" uniquement : valeur en points fixée bloc par bloc par
  // l'ouvreur/l'admin (la cotation étant cachée en compétition, un barème par couleur
  // ne reflèterait pas la difficulté réelle perçue).
  points_value?: number;
}

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
  const colorKey = boulder.color || boulder.difficulty;

  if (mode === 'blocs_valides') {
    return Math.max(0, boulder.points_value || 0);
  }

  if (mode === 'personnalise') {
    const entry = customScoring?.[colorKey];
    if (!entry) return 0;
    const deduction = attempts > 1 ? (attempts - 1) * (entry.deduction || 0) : 0;
    return Math.max(0, entry.base - deduction);
  }

  return calculatePoints(colorKey, attempts, success);
};
