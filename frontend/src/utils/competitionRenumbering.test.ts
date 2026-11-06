import { describe, expect, it } from 'vitest';
import { estRenumerotable, partitionnerRenumerotables } from './competitionRenumbering';

describe('competitionRenumbering — §B.3, le numéro écrit sur la prise', () => {
  // ⚠️ Un jeu d'essai MIXTE, qui est la forme réelle d'une compétition de cette salle (Contest
  // du 5 novembre : des blocs déjà en place plus un mur neuf). Un jeu d'essai tout-compétition
  // ne pourrait exprimer AUCUN des défauts que ce module existe pour fermer.
  const mixte = [
    { id: 'c1', type: 'competition' },
    { id: 'd1', type: 'daily' },
    { id: 'c2', type: 'competition' },
    { id: 'd2', type: 'daily' },
  ];

  it('un bloc créé pour l’épreuve est renumérotable', () => {
    expect(estRenumerotable({ id: 'c1', type: 'competition' })).toBe(true);
  });

  it('🔴 un bloc QUOTIDIEN réutilisé ne l’est JAMAIS', () => {
    expect(estRenumerotable({ id: 'd1', type: 'daily' })).toBe(false);
  });

  it('un type inconnu est PROTÉGÉ par défaut, pas renuméroté en silence', () => {
    // ⚠️ C'est ce qui distingue une liste blanche d'une liste noire, et c'est la seule des
    // deux formes qui survit à l'apparition d'un troisième type.
    expect(estRenumerotable({ id: 'x', type: 'mystere' })).toBe(false);
    expect(estRenumerotable({ id: 'y', type: '' })).toBe(false);
  });

  it('partitionne sans rien perdre : la somme des deux parts est la liste entière', () => {
    const { renumerotables, proteges } = partitionnerRenumerotables(mixte);
    // ⚠️ Affirmer la TAILLE avant le contenu : un bloc tombé entre les deux parts ne serait ni
    // renuméroté ni signalé comme protégé — exactement le genre de disparition silencieuse
    // qu'un compte attrape et qu'une inspection visuelle laisse passer.
    expect(renumerotables).toHaveLength(2);
    expect(proteges).toHaveLength(2);
    expect(renumerotables.length + proteges.length).toBe(mixte.length);
    expect([...renumerotables, ...proteges].map((b) => b.id).sort())
      .toEqual(mixte.map((b) => b.id).sort());
  });

  it('nomme les deux parts, pas seulement celle qui agit', () => {
    const { renumerotables, proteges } = partitionnerRenumerotables(mixte);
    expect(renumerotables.map((b) => b.id)).toEqual(['c1', 'c2']);
    expect(proteges.map((b) => b.id)).toEqual(['d1', 'd2']);
  });

  it('une compétition entièrement bâtie sur des blocs quotidiens ne renumérote RIEN', () => {
    const { renumerotables, proteges } = partitionnerRenumerotables(
      [{ id: 'd1', type: 'daily' }, { id: 'd2', type: 'daily' }],
    );
    expect(renumerotables).toHaveLength(0);
    expect(proteges).toHaveLength(2);
  });
});
