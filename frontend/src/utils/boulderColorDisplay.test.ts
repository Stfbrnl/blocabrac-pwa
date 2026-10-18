import { describe, it, expect } from 'vitest';
import { colorGrades } from '../config/gymConfig';
import {
  boulderColorHex,
  textOnBoulderColor,
  boulderColorChipSx,
  UNKNOWN_COLOR_HEX,
} from './boulderColorDisplay';

/**
 * Contraste WCAG entre deux couleurs. Volontairement RÉIMPLÉMENTÉ ici, et pas importé du
 * module testé : le module choisit avec une luminance perçue approchée, le test vérifie avec
 * la formule normative. Si les deux partageaient leur calcul, le test ne vérifierait que sa
 * propre cohérence.
 */
const relativeLuminance = (hex: string): number => {
  const n = hex.replace('#', '');
  const canal = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = canal(parseInt(n.slice(0, 2), 16));
  const g = canal(parseInt(n.slice(2, 4), 16));
  const b = canal(parseInt(n.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

describe('boulderColorHex', () => {
  it('rend la teinte de chaque couleur du catalogue', () => {
    for (const { value, hex } of colorGrades) {
      expect(boulderColorHex(value)).toBe(hex);
    }
  });

  it('ne rend JAMAIS le mot français : c\'était tout le défaut', () => {
    // La régression exacte du 18/10/2026 : `backgroundColor: 'bleu'` est ignoré par le
    // navigateur. Aucune sortie de ce module ne doit pouvoir ressembler à un mot.
    for (const { value } of colorGrades) {
      expect(boulderColorHex(value)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('retombe sur un gris pour une couleur absente, vide ou inconnue', () => {
    expect(boulderColorHex(undefined)).toBe(UNKNOWN_COLOR_HEX);
    expect(boulderColorHex(null)).toBe(UNKNOWN_COLOR_HEX);
    expect(boulderColorHex('')).toBe(UNKNOWN_COLOR_HEX);
    expect(boulderColorHex('turquoise')).toBe(UNKNOWN_COLOR_HEX);
  });

  it('tolère les espaces autour de la valeur stockée', () => {
    expect(boulderColorHex(' rouge ')).toBe('#FF0000');
  });
});

describe('textOnBoulderColor', () => {
  // ⚠️ LA PROPRIÉTÉ QUI PORTE, et la seule qui survive à un changement de palette : sur
  // CHAQUE couleur du catalogue, le texte choisi doit être lisible. Épingler huit valeurs
  // attendues ne vérifierait que la palette d'aujourd'hui.
  it('donne un contraste ≥ 3:1 sur chaque couleur du catalogue', () => {
    for (const { value, hex } of colorGrades) {
      const ratio = contrast(hex, textOnBoulderColor(value));
      expect(ratio, `contraste insuffisant sur « ${value} » (${hex}) : ${ratio.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it('donne aussi un contraste suffisant sur le gris des couleurs inconnues', () => {
    expect(contrast(UNKNOWN_COLOR_HEX, textOnBoulderColor('turquoise'))).toBeGreaterThanOrEqual(3);
  });

  it('écrit en BLANC sur noir, et en noir sur blanc', () => {
    // L'inversion corrigée : `['noir','blanc'].includes(c) ? 'black' : 'white'` écrivait en
    // noir sur #000000. Ce cas-là mérite d'être épinglé nommément, il était invisible.
    expect(textOnBoulderColor('noir')).toBe('#FFFFFF');
    expect(textOnBoulderColor('blanc')).toBe('#000000');
  });

  it('écrit en noir sur les couleurs claires (jaune, vert, rose)', () => {
    expect(textOnBoulderColor('jaune')).toBe('#000000');
    expect(textOnBoulderColor('vert')).toBe('#000000');
    expect(textOnBoulderColor('rose')).toBe('#000000');
  });

  it('écrit en blanc sur les couleurs sombres (bleu, violet, rouge)', () => {
    expect(textOnBoulderColor('bleu')).toBe('#FFFFFF');
    expect(textOnBoulderColor('violet')).toBe('#FFFFFF');
    expect(textOnBoulderColor('rouge')).toBe('#FFFFFF');
  });
});

describe('boulderColorChipSx', () => {
  it('assemble les deux propriétés', () => {
    expect(boulderColorChipSx('rouge')).toEqual({ backgroundColor: '#FF0000', color: '#FFFFFF' });
  });
});
