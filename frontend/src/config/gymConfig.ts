// Configuration centrale propre à la salle : nom, murs, barème couleur/cotation,
// types de difficulté, tranches d'âge, identité visuelle. Regroupé ici pour
// n'exister qu'à un seul endroit (au lieu d'être dupliqué dans chaque écran) —
// première étape vers un futur "kit" générique réutilisable par d'autres salles.

// Identité visuelle et nom : lus depuis les variables VITE_* (définies dans
// .env), à la fois consommées ici et injectées dans index.html/vite.config.ts
// (via %VITE_XXX% ou loadEnv) — une seule source pour toute la marque.
export const gymName = import.meta.env.VITE_GYM_NAME;
export const appTitle = import.meta.env.VITE_APP_TITLE;
export const appDescription = import.meta.env.VITE_APP_DESCRIPTION;
export const themeColor = import.meta.env.VITE_THEME_COLOR;

// ✅ Identité visuelle du site vitrine (www.blocabrac.fr) : vert principal des
// boutons/liens et sa variante foncée (utilisée en dégradé sur le site), relevés
// dans sa feuille de style. Consommés par ThemeModeContext.tsx pour que le thème
// MUI de l'appli matche le site plutôt que le bleu par défaut de MUI.
export const brandGreen = '#27B142';
export const brandGreenDark = '#177038';

// Chemin public (dossier `public/`) et asset empaqueté (import Vite) du même
// logo, dupliqué aujourd'hui à ces deux emplacements physiques.
export const logoPath = '/images/logo-blocabrac.png';
export { default as logoAssetUrl } from '../assets/logo-blocabrac.png';

// ✅ Ordre circulaire réel de la salle (validé avec l'utilisateur, CONCEPTION-roulette-et-defis.md
// §1.7.A) — remplace l'ancien ordre (simple historique d'ajout des murs). Utilisé pour
// l'affichage (ordre des boutons de sélection de mur) et par la famille "murs" de la Roulette
// (utils/roulette.ts, ex. proposition #21 "cinq murs consécutifs dans l'ordre de la salle").
export const walls: string[] = [
  'Grotte Adultes', 'Caverne des petits', 'Güllich', 'Réta Adultes', "Réta d'initiation",
  'Grande Face', 'Dalle', 'Dévers 15°', 'Dévers 40°', 'Dévers 30°'
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

export interface AgeBand {
  key: string;
  label: string;
  minAge: number;
  maxAge?: number; // undefined = pas de borne supérieure
}

// Libellés de regroupement utilisés par les classements.
export const openCategoryLabel = 'Open';
export const unknownCategoryLabel = 'Inconnu';

// Tranches d'âge officielles FFME, par âge atteint au 31 décembre de la saison
// (peu importe le mois de naissance dans l'année). Système fédéral français —
// une salle d'un autre pays/fédération devra remplacer ce tableau.
export const ageBands: AgeBand[] = [
  { key: 'U8', label: 'U8 (6-7 ans)', minAge: 6, maxAge: 7 },
  { key: 'U10', label: 'U10 (8-9 ans)', minAge: 8, maxAge: 9 },
  { key: 'U12', label: 'U12 (10-11 ans)', minAge: 10, maxAge: 11 },
  { key: 'U14', label: 'U14 (12-13 ans)', minAge: 12, maxAge: 13 },
  { key: 'U16', label: 'U16 (14-15 ans)', minAge: 14, maxAge: 15 },
  { key: 'U18', label: 'U18 (16-17 ans)', minAge: 16, maxAge: 17 },
  { key: 'U20', label: 'U20 (18-19 ans)', minAge: 18, maxAge: 19 },
  { key: 'seniors', label: 'Séniors (20-39 ans)', minAge: 20, maxAge: 39 },
  { key: 'veterans1', label: 'Vétérans 1 (40-49 ans)', minAge: 40, maxAge: 49 },
  { key: 'veterans2', label: 'Vétérans 2 (50 ans et +)', minAge: 50 },
];
