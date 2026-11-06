import { describe, it, expect } from 'vitest';
import { resolveLevelSync, LOWEST_BADGE_LEVEL } from './levelSync';
import { levelOrder } from './competitionEligibility';

// Chaque groupe ci-dessous a été vu ROUGE séparément avant d'être vert — en particulier le
// groupe « LE PLANCHER », qui est tout l'objet du correctif : en remettant le repli à
// `'bleu'` dans `levelSync.ts`, lui seul rougit, et les autres restent verts. C'est la
// condition pour qu'il mesure le plancher et pas le reste de la fonction.

describe('resolveLevelSync — verrou d\'admin', () => {
  it('n\'écrit JAMAIS rien quand levelOverride est posé', () => {
    // Le cas de production du 06/11 : 68 comptes verrouillés le soir du contest.
    expect(resolveLevelSync({
      currentLevel: 'blanc', baseLevel: null, activeBadgeColors: [], levelOverride: true,
    })).toBeNull();
    // Même avec un badge actif qui justifierait une élévation.
    expect(resolveLevelSync({
      currentLevel: 'bleu', baseLevel: 'bleu', activeBadgeColors: ['rose'], levelOverride: true,
    })).toBeNull();
  });
});

describe('resolveLevelSync — élévation par un badge actif', () => {
  it('élève le niveau vers la couleur du plus haut badge actif', () => {
    expect(resolveLevelSync({
      currentLevel: 'bleu', baseLevel: null, activeBadgeColors: ['violet', 'rouge', 'noir'],
    })).toEqual({ level: 'noir', baseLevel: 'bleu' });
  });

  it('mémorise baseLevel UNE SEULE FOIS, et seulement depuis un niveau sans badge', () => {
    // Depuis un niveau "facile" (< violet) et sans baseLevel : on le met de côté.
    expect(resolveLevelSync({
      currentLevel: 'vert', baseLevel: null, activeBadgeColors: ['rouge'],
    })).toEqual({ level: 'rouge', baseLevel: 'vert' });

    // Depuis un niveau DÉJÀ piloté par un badge (≥ violet) : ne PAS le sauvegarder, ce
    // serait enregistrer une mesure comme si c'était une déclaration.
    expect(resolveLevelSync({
      currentLevel: 'rouge', baseLevel: null, activeBadgeColors: ['blanc'],
    })).toEqual({ level: 'blanc' });

    // baseLevel déjà posé : on n'y retouche jamais.
    expect(resolveLevelSync({
      currentLevel: 'bleu', baseLevel: 'jaune', activeBadgeColors: ['noir'],
    })).toEqual({ level: 'noir' });
  });

  it('n\'écrit rien quand le niveau est déjà celui du plus haut badge actif', () => {
    expect(resolveLevelSync({
      currentLevel: 'noir', baseLevel: 'bleu', activeBadgeColors: ['violet', 'noir'],
    })).toBeNull();
  });

  it('ignore les couleurs de badge hors barème', () => {
    expect(resolveLevelSync({
      currentLevel: 'bleu', baseLevel: 'bleu', activeBadgeColors: ['#27B142', '', 'turquoise'],
    })).toBeNull();
  });
});

describe('resolveLevelSync — LE PLANCHER (le correctif)', () => {
  // 🔴 Le défaut : l'ancien code écrivait `'bleu'`, une valeur INVENTÉE, sur tout compte
  // dont le niveau était ≥ violet sans baseLevel lisible.
  it('n\'écrit RIEN quand aucun badge n\'est actif et que baseLevel est absent', () => {
    expect(resolveLevelSync({
      currentLevel: 'blanc', baseLevel: null, activeBadgeColors: [],
    })).toBeNull();
    expect(resolveLevelSync({
      currentLevel: 'blanc', baseLevel: undefined, activeBadgeColors: [],
    })).toBeNull();
  });

  it('n\'écrit RIEN quand baseLevel est présent mais illisible', () => {
    // Une chaîne qui n'est pas une couleur du barème est une ABSENCE, pas une valeur —
    // elle ne doit pas non plus déclencher le repli inventé.
    expect(resolveLevelSync({
      currentLevel: 'noir', baseLevel: 'turquoise', activeBadgeColors: [],
    })).toBeNull();
    expect(resolveLevelSync({
      currentLevel: 'noir', baseLevel: '', activeBadgeColors: [],
    })).toBeNull();
  });

  // ⚠️ Les 9 comptes RÉELLEMENT mesurés en production le 06/11/2026 : rose ×1, blanc ×4,
  // noir ×2, rouge ×2, tous sans baseLevel. Affirmés comme une PROPRIÉTÉ sur toutes les
  // couleurs ≥ violet, et non sur les quatre observées : un cinquième niveau concerné
  // apparaîtrait sans que ce test ait à bouger.
  it('propriété : AUCUN niveau ≥ violet ne bouge sans baseLevel ni badge actif', () => {
    const concernes = levelOrder.slice(levelOrder.indexOf(LOWEST_BADGE_LEVEL));
    expect(concernes).toEqual(['violet', 'rouge', 'noir', 'blanc', 'rose']);
    concernes.forEach((lvl) => {
      expect(resolveLevelSync({ currentLevel: lvl, baseLevel: null, activeBadgeColors: [] }))
        .toBeNull();
    });
  });
});

describe('resolveLevelSync — redescente légitime vers baseLevel', () => {
  it('redescend vers baseLevel quand il est connu et plus bas', () => {
    expect(resolveLevelSync({
      currentLevel: 'blanc', baseLevel: 'bleu', activeBadgeColors: [],
    })).toEqual({ level: 'bleu' });
    expect(resolveLevelSync({
      currentLevel: 'rose', baseLevel: 'violet', activeBadgeColors: [],
    })).toEqual({ level: 'violet' });
  });

  it('ne remonte JAMAIS : un baseLevel plus haut que le niveau courant n\'écrit rien', () => {
    expect(resolveLevelSync({
      currentLevel: 'violet', baseLevel: 'rose', activeBadgeColors: [],
    })).toBeNull();
    // Égal : rien à écrire non plus.
    expect(resolveLevelSync({
      currentLevel: 'noir', baseLevel: 'noir', activeBadgeColors: [],
    })).toBeNull();
  });

  it('ne touche pas un niveau déjà sous le plancher des badges', () => {
    // Sous violet, le niveau ne peut venir que d'une déclaration : rien à redescendre,
    // avec ou sans baseLevel.
    ['jaune', 'vert', 'bleu'].forEach((lvl) => {
      expect(resolveLevelSync({ currentLevel: lvl, baseLevel: null, activeBadgeColors: [] }))
        .toBeNull();
      expect(resolveLevelSync({ currentLevel: lvl, baseLevel: 'jaune', activeBadgeColors: [] }))
        .toBeNull();
    });
  });

  it('ne touche rien quand le niveau courant est absent ou illisible', () => {
    expect(resolveLevelSync({ currentLevel: null, baseLevel: 'bleu', activeBadgeColors: [] }))
      .toBeNull();
    expect(resolveLevelSync({ currentLevel: 'turquoise', baseLevel: 'bleu', activeBadgeColors: [] }))
      .toBeNull();
  });
});
