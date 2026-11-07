import { describe, it, expect } from 'vitest';
import {
  listerDocumentsSalle,
  DOCUMENTS_SALLE,
  PREFIXE_DOCS,
  type DocumentSalle,
  type EstampilleDocument,
} from './documentsSalle';
import registre from '../data/documentsStamp.json';

const catalogue = (...docs: DocumentSalle[]) => docs;

describe('listerDocumentsSalle — la jointure avec le registre', () => {
  it('rend l’estampille du registre quand elle y est', () => {
    const resultat = listerDocumentsSalle(
      catalogue({ fichier: 'a.pdf', titre: 'A', aQuoiCaSert: '…' }),
      { 'a.pdf': { version: 'V2.80', genereLe: '7 novembre 2026' } }
    );
    expect(resultat).toHaveLength(1);
    expect(resultat[0].estampille).toEqual({ version: 'V2.80', genereLe: '7 novembre 2026' });
  });

  it('rend null — et JAMAIS une version de repli — quand le registre ignore le document', () => {
    const resultat = listerDocumentsSalle(
      catalogue({ fichier: 'inconnu.pdf', titre: 'X', aQuoiCaSert: '…' }),
      {}
    );
    expect(resultat[0].estampille).toBeNull();
  });

  it('traite une entrée de registre TRONQUÉE comme absente, pas comme à moitié valide', () => {
    // Une demi-estampille (« V2.80 · généré le  ») est plausible et fausse : c'est exactement
    // la forme de défaut que le registre existe pour empêcher.
    const sansDate = { 'a.pdf': { version: 'V2.80' } as unknown as EstampilleDocument };
    const sansVersion = { 'a.pdf': { genereLe: '7 novembre 2026' } as unknown as EstampilleDocument };
    const vide = { 'a.pdf': { version: '', genereLe: '' } };
    for (const estampilles of [sansDate, sansVersion, vide]) {
      const resultat = listerDocumentsSalle(
        catalogue({ fichier: 'a.pdf', titre: 'A', aQuoiCaSert: '…' }),
        estampilles
      );
      expect(resultat[0].estampille).toBeNull();
    }
  });

  it('construit les URL sous /docs/, et urlHtml seulement quand la variante existe', () => {
    const resultat = listerDocumentsSalle(
      catalogue(
        { fichier: 'a.pdf', titre: 'A', aQuoiCaSert: '…' },
        { fichier: 'b.pdf', titre: 'B', aQuoiCaSert: '…', variantHtml: 'b.html' }
      ),
      {}
    );
    expect(resultat[0].url).toBe('/docs/a.pdf');
    expect(resultat[0].urlHtml).toBeNull();
    expect(resultat[1].url).toBe('/docs/b.pdf');
    expect(resultat[1].urlHtml).toBe('/docs/b.html');
  });

  it('préserve l’ordre et la taille du catalogue — aucun document ne se perd dans la jointure', () => {
    // ⚠️ Affirmer la TAILLE avant le contenu : un document qui disparaîtrait entre le
    // catalogue et l'écran ne se verrait autrement nulle part.
    const entree = catalogue(
      { fichier: 'a.pdf', titre: 'A', aQuoiCaSert: '…' },
      { fichier: 'b.pdf', titre: 'B', aQuoiCaSert: '…' },
      { fichier: 'c.pdf', titre: 'C', aQuoiCaSert: '…' }
    );
    const resultat = listerDocumentsSalle(entree, { 'b.pdf': { version: 'V1', genereLe: 'hier' } });
    expect(resultat).toHaveLength(3);
    expect(resultat.map((d) => d.fichier)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
  });
});

describe('le catalogue réel, et le registre réellement généré', () => {
  it('chaque document annonce un titre et à quoi il sert — un lien nu ne se choisit pas', () => {
    expect(DOCUMENTS_SALLE.length).toBeGreaterThan(0);
    for (const doc of DOCUMENTS_SALLE) {
      expect(doc.titre.trim()).not.toBe('');
      expect(doc.aQuoiCaSert.trim().length).toBeGreaterThan(20);
      expect(doc.fichier).toMatch(/\.pdf$/);
    }
  });

  it('aucun doublon de fichier dans le catalogue', () => {
    const fichiers = DOCUMENTS_SALLE.map((d) => d.fichier);
    expect(new Set(fichiers).size).toBe(fichiers.length);
  });

  it('PREFIXE_DOCS est le dossier que navigateFallbackDenylist protège', () => {
    // ⚠️ Si ce préfixe changeait sans que `navigateFallbackDenylist: [/^\/docs\//]` suive
    // (vite.config.ts), chaque lien de cet écran rendrait un ÉCRAN BLANC sur tout appareil
    // ayant activé le service worker — un défaut invisible à curl.
    expect(PREFIXE_DOCS).toBe('/docs/');
  });

  it('🔴 tout document SANS générateur déclare pourquoi, et tout document AVEC générateur est au registre', () => {
    // La propriété qui compte : il ne doit pas exister de document silencieusement privé
    // d'estampille. Ou le registre le connaît (il a un générateur), ou le catalogue dit
    // pourquoi il n'en a pas. Jamais ni l'un ni l'autre.
    const connus = registre as Record<string, EstampilleDocument>;
    for (const doc of DOCUMENTS_SALLE) {
      const auRegistre = Object.prototype.hasOwnProperty.call(connus, doc.fichier);
      expect(
        auRegistre || typeof doc.sansEstampille === 'string',
        `${doc.fichier} n'est pas au registre d'estampilles et n'explique pas pourquoi. `
        + 'Soit son générateur ne l\'enregistre pas (le brancher sur enregistrerEstampille), '
        + 'soit il n\'en a pas (renseigner `sansEstampille`).'
      ).toBe(true);
      // Et le symétrique : un document au registre n'a pas à s'excuser de ne pas en avoir.
      if (auRegistre) expect(doc.sansEstampille).toBeUndefined();
    }
  });

  it('les estampilles réellement générées sont bien formées', () => {
    const connus = registre as Record<string, EstampilleDocument>;
    const cles = Object.keys(connus);
    expect(cles.length).toBeGreaterThan(0);
    for (const cle of cles) {
      // Miroir du format de `formattedAppVersion` : V2.80, ou V2.80.1 pour un correctif.
      expect(connus[cle].version).toMatch(/^V\d+\.\d+(\.\d+)?$/);
      expect(connus[cle].genereLe).toMatch(/^\d{1,2} \p{L}+ \d{4}$/u);
    }
  });
});
