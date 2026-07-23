const oneDayMs = 24 * 60 * 60 * 1000;

// Un grimpeur régulier vient rarement plus de 2-3 fois par semaine : casser la
// série au premier jour manqué la rendrait quasiment inatteignable. On tolère
// donc jusqu'à 8 jours d'inactivité entre deux séances (ou depuis aujourd'hui) ;
// la série est perdue une fois ce délai atteint (9 jours sans validation).
const streakBreakDays = 9;

// Numéro de jour en heure locale (pas toISOString, qui bascule en UTC et peut
// décaler le jour de la validation près de minuit selon le fuseau de l'utilisateur).
const toDayNumber = (date: Date): number => {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round(midnight.getTime() / oneDayMs);
};

// Nombre de jours distincts de validation dans la série en cours. La série se
// poursuit tant que l'écart entre deux jours de validation consécutifs (ou entre
// le dernier et aujourd'hui) reste inférieur à streakBreakDays ; au-delà, elle
// est considérée comme perdue.
export const computeStreakDays = (validationDates: Date[], now: Date = new Date()): number => {
  if (validationDates.length === 0) return 0;

  const dayNumbers = Array.from(new Set(validationDates.map(toDayNumber))).sort((a, b) => b - a);

  if (toDayNumber(now) - dayNumbers[0] >= streakBreakDays) return 0;

  let streak = 1;
  for (let i = 1; i < dayNumbers.length; i += 1) {
    if (dayNumbers[i - 1] - dayNumbers[i] >= streakBreakDays) break;
    streak += 1;
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
