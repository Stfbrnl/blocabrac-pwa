// ✅ Mode de comptage "Officiel FFME/coupe du monde" (competitionClassement.ts) :
// invariants de saisie extraits en fonction pure — testable sans monter ClientCompetitions.tsx
// — sur retour de ClaudeNav (CONCEPTION-mode-ffme-et-garde-fou-reconciliation.md §B.2,
// 16/08/2026) : "le contrôle doit être en amont, à la saisie, pas en aval au calcul".
// Une saisie incohérente (top sans zone, essais-zone > essais-top) produirait des
// classements inexplicables et incorrigibles a posteriori — personne ne peut deviner
// après coup ce que le grimpeur voulait dire.
export interface CompetitionValidationState {
  success: boolean;
  attempts: number;
  zone: boolean;
  attemptsToZone: number;
}

// Applique une mise à jour partielle en imposant les deux invariants du mode
// "Officiel" (sans effet sur les 3 autres modes, qui n'utilisent ni `zone` ni
// `attemptsToZone`) :
//   1. Un top implique la zone, jamais l'inverse : cocher "Réussi" coche la zone ;
//      décocher la zone décoche un top déjà enregistré (un top sans zone n'a pas de
//      sens et ne doit jamais pouvoir être enregistré).
//   2. Essais à la zone <= essais au top, toujours — y compris si l'essais au top est
//      corrigé À LA BAISSE après coup (la zone est nécessairement franchie avant ou au
//      moment du top).
// Pré-remplit aussi les essais à la zone avec les essais au top au moment où la zone
// passe de non atteinte à atteinte (cas le plus fréquent : le même essai) — sauf si
// l'appelant vient justement de fixer explicitement une valeur différente dans ce
// même appel.
export const applyCompetitionValidationUpdate = <T extends CompetitionValidationState>(
  current: T,
  updates: Partial<T>
): T => {
  const result: T = { ...current, ...updates };

  if (updates.success === true) {
    result.zone = true;
  }
  if (updates.zone === false) {
    result.success = false;
  }

  const zoneJustReached = result.zone && !current.zone;
  if (zoneJustReached && updates.attemptsToZone === undefined) {
    result.attemptsToZone = result.attempts;
  }
  if (result.zone && result.attemptsToZone > result.attempts) {
    result.attemptsToZone = result.attempts;
  }

  return result;
};
