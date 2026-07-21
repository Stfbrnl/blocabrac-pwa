export type Level = 'jaune' | 'vert' | 'bleu' | 'violet' | 'rouge' | 'noir' | 'blanc' | 'rose';

// Ordre des niveaux, du plus faible au plus élevé.
export const levelOrder: Level[] = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];

interface RegistrableUser {
  level?: Level;
}

interface LevelRestrictedCompetition {
  minLevel?: Level;
  maxLevel?: Level;
}

// ✅ Vérifie si le niveau de l'utilisateur est dans la plage autorisée par la compétition.
export const canUserRegister = (user: RegistrableUser, competition: LevelRestrictedCompetition): boolean => {
  if (!user.level) return true; // ✅ Si pas de niveau défini, autoriser
  if (!competition.minLevel && !competition.maxLevel) return true; // ✅ Pas de restriction

  const userLevelIndex = levelOrder.indexOf(user.level);
  const minLevelIndex = competition.minLevel ? levelOrder.indexOf(competition.minLevel) : -1;
  const maxLevelIndex = competition.maxLevel ? levelOrder.indexOf(competition.maxLevel) : levelOrder.length;

  return (
    (minLevelIndex === -1 || userLevelIndex >= minLevelIndex) &&
    (maxLevelIndex === levelOrder.length || userLevelIndex <= maxLevelIndex)
  );
};
