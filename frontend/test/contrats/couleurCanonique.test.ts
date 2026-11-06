// Contrat de `scripts/lib/couleur-canonique.cjs` — la normalisation est EXPLICITE ou refuse.
//
// Testé ici plutôt que dans `scripts/` parce que ce dépôt n'a qu'un harnais, et qu'un module de
// réparation de données mérite un test autant qu'un module de l'application : il écrit en
// production, sur des champs qui décident de points.
import { describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const lib = requireCjs(resolve(__dirname, '../../../scripts/lib/couleur-canonique.cjs')) as {
  COULEURS_CANONIQUES: string[];
  ALIAS_FEMININS: Record<string, string>;
  normaliserCouleur: (v: unknown) => string | null;
  estCanonique: (v: unknown) => boolean;
};

const { COULEURS_CANONIQUES, ALIAS_FEMININS, normaliserCouleur, estCanonique } = lib;

describe('normaliserCouleur', () => {
  it('dérive ses couleurs du barème, et il y en a bien huit', () => {
    // ⚠️ Affirmer la TAILLE : une liste recopiée à côté du barème finirait par différer, et ce
    // pas rougirait le jour où l'une des deux bouge seule.
    expect(COULEURS_CANONIQUES).toEqual(['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose']);
  });

  it('laisse passer une couleur déjà canonique', () => {
    COULEURS_CANONIQUES.forEach((c) => expect(normaliserCouleur(c)).toBe(c));
  });

  it('🔴 corrige les DEUX valeurs réellement présentes en production', () => {
    // Les deux seules, mesurées le 06/11/2026 sur les 7 blocs orphelins.
    expect(normaliserCouleur('noire')).toBe('noir');
    expect(normaliserCouleur('Rouge')).toBe('rouge');
  });

  it('traite la casse et les espaces parasites', () => {
    expect(normaliserCouleur('ROSE')).toBe('rose');
    expect(normaliserCouleur('  Violet ')).toBe('violet');
    expect(normaliserCouleur('NoirE')).toBe('noir');
  });

  it('traite les cinq féminins, et SEULEMENT ceux qui existent', () => {
    // ⚠️ `jaune`, `rouge` et `rose` sont invariables : les inscrire laisserait croire que cette
    // table traite la casse, ce qui est le travail du `toLowerCase`. Une table ne décrit qu'une
    // sorte de variation — d'où la taille affirmée.
    expect(Object.keys(ALIAS_FEMININS)).toEqual(['verte', 'bleue', 'violette', 'noire', 'blanche']);
    Object.entries(ALIAS_FEMININS).forEach(([feminin, canonique]) => {
      expect(normaliserCouleur(feminin)).toBe(canonique);
      expect(COULEURS_CANONIQUES).toContain(canonique);
    });
  });

  it('🔴 REFUSE tout ce qui n’est pas reconnu avec certitude, au lieu de deviner', () => {
    // ⚠️ La propriété qui porte le module. Sur une donnée qui décide de points, une
    // normalisation FAUSSE est pire qu'un refus : le refus se voit et s'instruit, la
    // normalisation fausse part en base et s'oublie.
    ['turquoise', 'noirs', 'noi', 'rouge foncé', 'rouge/noir', 'nOiRes', '7a+', 'null'].forEach((v) => {
      expect(normaliserCouleur(v), `« ${v} » ne doit PAS être normalisé`).toBeNull();
    });
  });

  it('refuse une valeur vide, absente ou d’un autre type', () => {
    [undefined, null, '', '   ', 0, 42, {}, [], true].forEach((v) => {
      expect(normaliserCouleur(v)).toBeNull();
    });
  });
});

describe('estCanonique — distinct de « normalisable »', () => {
  it('vrai seulement pour une valeur DÉJÀ canonique', () => {
    // ⚠️ Les deux fonctions répondent à deux questions différentes, et l'appelant a besoin des
    // deux : `estCanonique` dit s'il y a quelque chose à écrire, `normaliserCouleur` dit s'il
    // PEUT écrire. Les confondre ferait réécrire les cinq blocs déjà corrects.
    expect(estCanonique('noir')).toBe(true);
    expect(estCanonique('noire')).toBe(false);
    expect(estCanonique('Rouge')).toBe(false);
    expect(estCanonique(undefined)).toBe(false);
    expect(normaliserCouleur('noire')).toBe('noir'); // normalisable, mais pas canonique
  });
});
