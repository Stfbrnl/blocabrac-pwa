/**
 * La pastille de couleur d'un bloc : son fond, et une couleur de texte LISIBLE dessus.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE — un mot français n'est pas une couleur CSS.
 *
 * `Moniteur/Stats/StatsList.tsx` passait la valeur stockée telle quelle à
 * `backgroundColor` : « bleu », « rouge », « noir », « jaune », « vert », « blanc » ne sont pas
 * des couleurs CSS, le navigateur ignorait la déclaration et la pastille retombait sur le gris
 * par défaut de MUI — avec du texte BLANC dessus, donc illisible (mesuré le 18/10/2026 :
 * fond `rgba(0,0,0,0.08)`, texte `rgb(255,255,255)`). Seuls « violet » et « rose » s'affichaient,
 * par coïncidence : ce sont aussi des noms de couleurs CSS.
 *
 * ⚠️ Et le choix noir/blanc du texte était INVERSÉ sur un fond noir : les écrans qui faisaient
 * `['noir','blanc'].includes(couleur) ? 'black' : 'white'` écrivaient en noir sur `#000000`.
 *
 * `colorGrades` (config/gymConfig.ts) est la seule source des teintes — le fork « Grimpe ! »
 * aura les siennes, et rien ici ne doit être écrit en dur. Quatre écrans recopiaient déjà leur
 * propre table `levelColors` ; ce module est celui vers lequel les faire converger.
 */
import { colorGrades } from '../config/gymConfig';

/** Fond d'une couleur inconnue, absente, ou d'un bloc dont la couleur n'a pas été enregistrée. */
export const UNKNOWN_COLOR_HEX = '#CCCCCC';

const hexByValue: Record<string, string> = Object.fromEntries(
  colorGrades.map(({ value, hex }) => [value, hex])
);

/** La teinte réelle d'une couleur de bloc, toujours un hexadécimal valide. */
export const boulderColorHex = (color?: string | null): string =>
  hexByValue[(color ?? '').trim()] ?? UNKNOWN_COLOR_HEX;

/**
 * Luminance perçue (0 = noir, 1 = blanc), formule classique pondérée par la sensibilité de
 * l'œil. Suffisante pour trancher entre deux couleurs de texte ; ce n'est pas un calcul de
 * contraste WCAG, qui vit dans le test et sert à VÉRIFIER ce choix.
 */
const perceivedLuminance = (hex: string): number => {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/**
 * Noir ou blanc, selon ce qui se lit sur cette couleur. Le seuil est vérifié par un test qui
 * exige un contraste ≥ 3:1 (niveau AA de WCAG pour un composant d'interface) sur CHAQUE entrée
 * de `colorGrades` — c'est la propriété qui survivra à un changement de palette, là où épingler
 * huit valeurs attendues ne survivrait pas.
 */
export const textOnBoulderColor = (color?: string | null): string =>
  perceivedLuminance(boulderColorHex(color)) > 0.5 ? '#000000' : '#FFFFFF';

/** Les deux propriétés ensemble, pour un `sx` de pastille. */
export const boulderColorChipSx = (color?: string | null): { backgroundColor: string; color: string } => ({
  backgroundColor: boulderColorHex(color),
  color: textOnBoulderColor(color),
});
