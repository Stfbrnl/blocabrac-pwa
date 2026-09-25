import { describe, expect, it } from 'vitest';
import { badgeDisplayColor, computeBadgeActive, isMissionBadge } from './badgeActivation';
import { brandGreen } from '../config/gymConfig';

describe('computeBadgeActive', () => {
  it('reste actif si le badge n\'est lié à aucune couleur', () => {
    expect(computeBadgeActive({}, {}, {})).toBe(true);
  });

  it('est actif dès qu\'un bloc validé de la couleur existe (count par défaut = 1)', () => {
    const badge = { color: 'rouge' };
    expect(computeBadgeActive(badge, { rouge: 1 }, {})).toBe(true);
    expect(computeBadgeActive(badge, { rouge: 0 }, {})).toBe(false);
  });

  it('respecte un count explicite dans criteria', () => {
    const badge = { criteria: { color: 'bleu', count: 3 } };
    expect(computeBadgeActive(badge, { bleu: 2 }, {})).toBe(false);
    expect(computeBadgeActive(badge, { bleu: 3 }, {})).toBe(true);
    expect(computeBadgeActive(badge, { bleu: 4 }, {})).toBe(true);
  });

  it('gère le cas "master" (count === "all") : il faut avoir validé tous les blocs existants', () => {
    const badge = { criteria: { color: 'noir', count: 'all' } };
    expect(computeBadgeActive(badge, { noir: 4 }, { noir: 5 })).toBe(false);
    expect(computeBadgeActive(badge, { noir: 5 }, { noir: 5 })).toBe(true);
  });

  it('le cas "master" reste inactif si le mur ne compte plus aucun bloc de cette couleur', () => {
    const badge = { criteria: { color: 'noir', count: 'all' } };
    expect(computeBadgeActive(badge, { noir: 0 }, { noir: 0 })).toBe(false);
  });

  it('criteria.color est prioritaire sur badge.color', () => {
    const badge = { color: 'rouge', criteria: { color: 'bleu', count: 2 } };
    expect(computeBadgeActive(badge, { bleu: 2, rouge: 0 }, {})).toBe(true);
  });
});

describe('badge de mission (V2.70.1)', () => {
  const mission = { type: 'mission', name: 'Badge du grimpeur régulier' };
  const levelColors = { rouge: '#FF0000' };

  it('reste toujours actif (aucune couleur de niveau)', () => {
    expect(computeBadgeActive(mission, {}, {})).toBe(true);
  });

  it('s\'affiche au vert de la salle, jamais au gris par défaut', () => {
    expect(isMissionBadge(mission)).toBe(true);
    expect(badgeDisplayColor(mission, levelColors)).toBe(brandGreen);
  });

  it('ne change rien aux autres badges', () => {
    expect(isMissionBadge({ type: 'automatic' })).toBe(false);
    expect(badgeDisplayColor({ type: 'automatic', color: 'rouge' }, levelColors)).toBe('#FF0000');
    expect(badgeDisplayColor({}, levelColors)).toBe('#9E9E9E');
  });
});
