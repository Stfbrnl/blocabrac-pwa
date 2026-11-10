// Contrat d'UNICITÉ du gabarit de diplôme, vérifié SUR LES SOURCES.
//
// POURQUOI UN TEST QUI LIT DU CODE PLUTÔT QUE QUI L'EXÉCUTE. Le diplôme a **trois** lecteurs
// qui doivent produire le même document : l'écran du moniteur qui le décerne, celui du
// grimpeur qui le télécharge, et le générateur du **diplôme vierge** imprimable
// (`scripts/regen-diplome-vierge.cjs` → `public/docs/diplome-vierge.pdf`).
//
// Jusqu'au 10/11/2026 les deux écrans le composaient **impérativement, chacun de son côté** :
// une centaine de lignes de `document.createElement` identiques ligne pour ligne. Rien ne les
// tenait ensemble — et composées dans des `.tsx`, elles étaient structurellement invisibles,
// la couverture de ce dépôt s'arrêtant au bord des composants.
//
// ⚠️ C'EST LE TROISIÈME LECTEUR QUI REND CE FILET NÉCESSAIRE, pas les deux premiers. Deux
// écrans qui divergent, cela se voit : quelqu'un finit par ouvrir les deux. Un **PDF imprimé**
// qui a cessé de ressembler au diplôme réel ne se voit JAMAIS — on ne le réimprime pas pour
// comparer, et c'est précisément le document qu'on tend à quelqu'un. Même famille que
// l'estampille des topos : un artefact imprimé est définitif, donc sa dérive est définitive.
//
// ⚠️ CE QUE CE FILET NE COUVRE PAS. Il cherche des motifs textuels (la couleur, les
// pourcentages de la zone de texte) : une quatrième composition qui emploierait d'autres
// valeurs lui échapperait, et c'est assumé — il garde le RETOUR EN ARRIÈRE (recopier le
// gabarit), pas l'invention d'un autre diplôme. Chacune de ses clauses a été vue rouge
// séparément.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { relative, resolve, sep } from 'path';

const RACINE = resolve(__dirname, '../..');
const SRC = resolve(RACINE, 'src');
const SCRIPTS = resolve(RACINE, 'scripts');

const fichiersSource = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = resolve(dossier, e.name);
    if (e.isDirectory()) return fichiersSource(chemin);
    if (!/\.(ts|tsx|cjs|mjs)$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
    return [chemin];
  });

const relatif = (f: string) => relative(RACINE, f).split(sep).join('/');

const porteurs = (motif: string): string[] =>
  [...fichiersSource(SRC), ...fichiersSource(SCRIPTS)]
    .filter((f) => readFileSync(f, 'utf8').includes(motif))
    .map(relatif)
    .sort();

describe("contrat d'unicité du gabarit de diplôme", () => {
  it("l'or du diplôme n'est défini qu'à un seul endroit", () => {
    // La couleur est le marqueur le moins contournable d'une recomposition : on peut changer
    // une taille de police sans y penser, pas réécrire un diplôme sans son or.
    expect(porteurs('#D4AF37')).toEqual(['src/utils/diplomaTemplate.ts']);
  });

  it('les quatre pourcentages calibrés sur le fond ne vivent qu’au même endroit', () => {
    // ⚠️ Ces nombres décrivent une IMAGE (sous le logo, à l'intérieur des diagonales dorées).
    // Dupliqués, ils se désynchronisent sans que rien ne le dise : le texte glisse sur les
    // diagonales d'un seul des trois documents.
    expect(porteurs('top:38%')).toEqual(['src/utils/diplomaTemplate.ts']);
    expect(porteurs("top = '38%'")).toEqual([]);
  });

  it('les deux écrans appellent le gabarit partagé', () => {
    for (const ecran of [
      'src/pages/Client/Stats/ClientStats.tsx',
      'src/pages/Moniteur/Stats/StatsList.tsx',
    ]) {
      const source = readFileSync(resolve(RACINE, ecran), 'utf8');
      expect(source, `${ecran} ne passe pas par le gabarit partagé`)
        .toContain('composerContenuDiplome(');
      expect(source, `${ecran} ne passe pas par les styles partagés`)
        .toContain('stylesFondDiplome(');
    }
  });

  it('🔴 les deux écrans passent LA MÊME image de fond', () => {
    // 🔴 LA DIVERGENCE QUI A RÉELLEMENT EXISTÉ, jusqu'au 10/11/2026 : `ClientStats.tsx`
    // passait `logoAssetUrl` et produisait un diplôme SANS ŒUVRE — du doré pâle sur du blanc,
    // presque illisible — pendant que `StatsList.tsx` en décernait un complet.
    //
    // ⚠️ Pourquoi personne ne l'avait vu, et pourquoi seul un filet peut l'attraper : les deux
    // écrans ne sont JAMAIS ouverts côte à côte. Le moniteur décerne, le grimpeur télécharge,
    // et chacun ne voit que le sien — le défaut n'a aucune occasion de se manifester comme un
    // écart. Il fallait rendre les deux documents pour s'en apercevoir.
    const fonds = [
      'src/pages/Client/Stats/ClientStats.tsx',
      'src/pages/Moniteur/Stats/StatsList.tsx',
    ].map((ecran) => {
      const trouve = readFileSync(resolve(RACINE, ecran), 'utf8').match(/stylesFondDiplome\(([^)]*)\)/);
      expect(trouve, `${ecran} n'appelle pas stylesFondDiplome`).not.toBeNull();
      return (trouve as RegExpMatchArray)[1].trim();
    });
    // ⚠️ Affirmer d'abord qu'il n'y a QU'UNE valeur distincte, avant de dire laquelle : le
    // défaut était une divergence, pas une mauvaise valeur en particulier.
    expect(new Set(fonds).size).toBe(1);
    expect(fonds[0]).toBe('diplomaBackground');
  });

  it('le générateur du vierge IMPORTE le gabarit au lieu de le recopier', () => {
    const script = readFileSync(resolve(SCRIPTS, 'regen-diplome-vierge.cjs'), 'utf8');
    expect(script).toContain('diplomaTemplate.ts');
    expect(script).toContain('composerDiplomeHtml');
    // Et il ne porte aucune valeur du gabarit en propre : c'est ce qui le rend incapable de
    // vieillir séparément.
    expect(script).not.toContain('DIPLÔME OFFICIEL');
    expect(script).not.toContain('Félicitations pour votre progression');
  });

  it('le diplôme vierge est au catalogue des documents de la salle', () => {
    // Sinon le PDF existe, est servi, et n'est atteignable que par quelqu'un qui en connaît
    // l'URL — l'état exact dont les deux topos sont sortis le 07/11/2026.
    const catalogue = readFileSync(resolve(SRC, 'utils/documentsSalle.ts'), 'utf8');
    expect(catalogue).toContain("fichier: 'diplome-vierge.pdf'");
  });
});
