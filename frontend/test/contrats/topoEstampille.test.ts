import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';

// ⚠️ CONTRAT SUR LES SOURCES, pas sur un comportement — même famille que
// `registeredCount.test.ts` et `pointsMultiplier.test.ts`. Ce qu'il garde est une ABSENCE :
// qu'aucune estampille ne soit RÉÉCRITE EN DUR dans un topo. Aucun test d'exécution ne peut
// l'attraper, parce qu'un topo au numéro de version faux se génère parfaitement et s'imprime
// sans rien signaler — c'est précisément ce qui est arrivé le 03/11/2026, où les deux topos
// annonçaient V2.71.2 et V2.55 alors que la production tournait en V2.77.
//
// Le défaut est pire qu'une coquille : c'est la ligne dont un lecteur se sert pour décider s'il
// peut faire confiance au reste du document. Et il est DÉFINITIF, puisque le document est
// imprimé.

const RACINE = resolve(__dirname, '../..');
const requireCjs = createRequire(import.meta.url);
const stamp = requireCjs(resolve(RACINE, 'scripts/topo-stamp.cjs')) as {
  formatVersion: (b: string) => string;
  formatDateFr: (d: Date) => string;
  injecterEstampille: (html: string, v: { version: string; dateTexte: string }) => string;
};

const TOPOS = [
  'topo-blocabrac-source.html',
  'topo-roulettes-defis-source.html',
] as const;

const lire = (nom: string) => readFileSync(resolve(RACINE, '..', nom), 'utf8');
const compter = (s: string, motif: string) => s.split(motif).length - 1;

describe('Contrat : l\'estampille des topos est dérivée, jamais écrite à la main', () => {
  // ⚠️ La TAILLE avant le contenu : « exactement une fois » et non « présent ». Deux jetons
  // dupliqués se rempliraient tous les deux, et l'un des deux serait au mauvais endroit.
  it.each(TOPOS)('%s porte les deux jetons, exactement une fois chacun', (nom) => {
    const html = lire(nom);
    expect(compter(html, '{{APP_VERSION}}')).toBe(1);
    expect(compter(html, '{{GENERATED_ON}}')).toBe(1);
  });

  // Le cœur du contrat : plus aucun numéro de version littéral dans la phrase d'estampille.
  it.each(TOPOS)('%s ne réécrit AUCUN numéro de version en dur', (nom) => {
    const html = lire(nom);
    expect(html).not.toMatch(/génération\s*:\s*V\d/i);
    // Et aucune date de génération littérale dans le pied.
    expect(html).not.toMatch(/Généré le\s+\d{1,2}\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i);
  });

  // ⚠️ Deuxième clause d'ABSENCE, et la plus facile à perdre : on peut remettre les jetons et
  // SUPPRIMER l'injection. Le topo sortirait alors avec « {{APP_VERSION}} » imprimé dessus.
  // On vérifie donc que les deux générateurs ET le filet des pieds passent par le module.
  it.each([
    'scripts/regen-topo.cjs',
    'scripts/regen-topo-roulettes.cjs',
    'scripts/assert-topo-footers.cjs',
  ])('%s dérive bien l\'estampille via topo-stamp.cjs', (script) => {
    const src = readFileSync(resolve(RACINE, script), 'utf8');
    expect(src).toContain("require('./topo-stamp.cjs')");
    expect(src).toContain('preparerSourceEstampillee');
  });

  // Miroir de `formattedAppVersion` (src/config/appVersion.ts). Si ce comportement change
  // d'un côté sans l'autre, la couverture du topo et la Navbar afficheraient deux numéros
  // différents pour la même version.
  it('formate la version comme la Navbar', () => {
    expect(stamp.formatVersion('2.77')).toBe('V2.77');
    expect(stamp.formatVersion('2.25.0')).toBe('V2.25');
    expect(stamp.formatVersion('2.14.3')).toBe('V2.14.3');
  });

  it('refuse une version illisible plutôt que de produire « Vundefined »', () => {
    expect(() => stamp.formatVersion('')).toThrow(/illisible/);
    expect(() => stamp.formatVersion(undefined as unknown as string)).toThrow(/illisible/);
  });

  it('écrit la date en français long', () => {
    expect(stamp.formatDateFr(new Date(2026, 10, 3))).toBe('3 novembre 2026');
  });

  // ⚠️ Pas de repli : un jeton manquant doit LEVER. Sans cela l'absence d'estampille passerait
  // inaperçue jusqu'au papier, où elle n'est plus réparable.
  it('lève si un jeton manque, au lieu de laisser passer un document sans estampille', () => {
    const sansJeton = '<p>aucune estampille ici</p>';
    expect(() => stamp.injecterEstampille(sansJeton, { version: 'V2.77', dateTexte: '3 novembre 2026' }))
      .toThrow(/apparaît 0 fois/);
    const double = '{{APP_VERSION}} et encore {{APP_VERSION}} — {{GENERATED_ON}}';
    expect(() => stamp.injecterEstampille(double, { version: 'V2.77', dateTexte: '3 novembre 2026' }))
      .toThrow(/apparaît 2 fois/);
  });
});
