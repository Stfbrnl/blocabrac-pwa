// Configuration centrale propre à la salle : nom, murs, barème couleur/cotation,
// types de difficulté. Regroupé ici pour n'exister qu'à un seul endroit (au lieu
// d'être dupliqué dans chaque écran) — première étape vers un futur "kit"
// générique réutilisable par d'autres salles.

export const gymName = 'Blocabrac';

export const walls: string[] = [
  'Caverne des petits', "Réta d'initiation", 'Réta Adultes', 'Grande Face',
  'Dalle', 'Dévers 15°', 'Dévers 30°', 'Dévers 40°', 'Grotte Adultes', 'Güllich'
];

export interface ColorGrade {
  value: string;
  label: string;
  hex: string;
  // Libellé utilisé sur les écrans de compte/profil (avec le niveau grimpeur en plus)
  accountLabel: string;
}

// Ordre = ordre de progression du jaune (débutant) au rose (expert), utilisé
// aussi comme ordre d'affichage partout ailleurs.
export const colorGrades: ColorGrade[] = [
  { value: 'jaune', label: 'Jaune (3A-3C)', hex: '#FFFF00', accountLabel: 'Jaune (3A-3C) - Débutant' },
  { value: 'vert', label: 'Vert (4A-4B+)', hex: '#00FF00', accountLabel: 'Vert (4A-4B+) - Débutant' },
  { value: 'bleu', label: 'Bleu (4C-5A+)', hex: '#0000FF', accountLabel: 'Bleu (4C-5A+) - En formation de grimpeur' },
  { value: 'violet', label: 'Violet (5B-5C+)', hex: '#800080', accountLabel: 'Violet (5B-5C+) - En formation de grimpeur' },
  { value: 'rouge', label: 'Rouge (6A-6B)', hex: '#FF0000', accountLabel: 'Rouge (6A-6B) - Grimpeur confirmé' },
  { value: 'noir', label: 'Noire (6B+-6C+)', hex: '#000000', accountLabel: 'Noire (6B+-6C+) - Grimpeur confirmé' },
  { value: 'blanc', label: 'Blanc (7A-7B)', hex: '#FFFFFF', accountLabel: 'Blanc (7A-7B) - Grimpeur expert' },
  { value: 'rose', label: 'Rose (7B+-8A)', hex: '#FFC0CB', accountLabel: 'Rose (7B+-8A) - Grimpeur mutant' },
];

// Bloc "mystère" : utilisé pour les blocs de "grosse compétition", dont la
// cotation réelle est cachée aux grimpeurs pendant l'événement (voir CLAUDE.md).
// Deux graphies coexistent déjà dans le code historique ('mystere' comme valeur
// de sélection, 'mystère' comme clé de couleur) — conservées telles quelles ici
// pour ne rien changer au comportement actuel.
export const mysteryGrade = { value: 'mystere', label: 'Bloc Mystère' };
export const mysteryColorHexKey = 'mystère';
export const mysteryColorHex = '#808080';

export const difficultyTypes: string[] = ['technique', 'équilibre', 'force', 'engagement'];
export const difficultyLevels: Array<'Plus' | 'Égal' | 'Moins'> = ['Plus', 'Égal', 'Moins'];

// Clé de préfixe pour les entrées localStorage propres à la salle (ex. thème).
export const storageKeyPrefix = 'blocabrac';
