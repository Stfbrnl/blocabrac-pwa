export const basePoints: Record<string, number> = {
  vert: 50, bleu: 100, violet: 200, rouge: 400, noir: 600, blanc: 800, rose: 1000
};

export const deductions: Record<string, number> = {
  vert: 10, bleu: 10, violet: 10, rouge: 20, noir: 20, blanc: 50, rose: 50
};

// Points obtenus pour un bloc réussi, dégressifs selon le nombre d'essais.
export const calculatePoints = (difficulty: string, attempts: number, success: boolean): number => {
  if (!success) return 0;
  const base = basePoints[difficulty] || 0;
  const deduction = (attempts > 1 ? (attempts - 1) * (deductions[difficulty] || 0) : 0);
  return Math.max(0, base - deduction);
};
