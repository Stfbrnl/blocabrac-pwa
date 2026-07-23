const oneDayMs = 24 * 60 * 60 * 1000;

// Clé de jour en heure locale (pas toISOString, qui bascule en UTC et peut décaler
// le jour de la validation près de minuit selon le fuseau de l'utilisateur).
const toDayKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// Nombre de jours consécutifs avec au moins une validation, en remontant depuis
// aujourd'hui. Si aucune validation aujourd'hui, la série n'est pas cassée pour
// autant : on part d'hier (comme un "streak" classique), elle est simplement cassée
// si un jour entier a été manqué.
export const computeStreakDays = (validationDates: Date[], now: Date = new Date()): number => {
  if (validationDates.length === 0) return 0;

  const days = new Set(validationDates.map(toDayKey));
  let streak = 0;
  const cursor = new Date(now);

  if (!days.has(toDayKey(cursor))) {
    cursor.setTime(cursor.getTime() - oneDayMs);
  }

  while (days.has(toDayKey(cursor))) {
    streak += 1;
    cursor.setTime(cursor.getTime() - oneDayMs);
  }

  return streak;
};

// Lundi 00:00 de la semaine de "now" (heure locale).
export const getStartOfWeek = (now: Date = new Date()): Date => {
  const day = now.getDay(); // 0 = dimanche
  const diffToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToMonday);
  return start;
};
