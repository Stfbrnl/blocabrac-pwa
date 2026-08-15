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
// competitionClassement.ts, seul appelant de calculateCompetitionPoints). "officiel"
// (coupe de France/du monde, tops/zones) N'EST PAS calculé ici : ce n'est pas une
// somme de points mais un classement par tri multi-critères — voir
// getOfficialParticipantTotals dans competitionClassement.ts, jamais
// calculateCompetitionPoints pour ce mode (qui renvoie 0, volontairement inutilisable
// telle quelle plutôt que silencieusement fausse).
export type ScoringMode = 'blocabrac' | 'blocs_valides' | 'personnalise' | 'officiel';

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
  // ✅ Voir la note sur ScoringMode ci-dessus : ce mode ne produit pas de points,
  // renvoyer 0 plutôt que de laisser cette fonction faire semblant.
  if (mode === 'officiel') return 0;
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
