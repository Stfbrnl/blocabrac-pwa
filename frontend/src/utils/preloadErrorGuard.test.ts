import { describe, it, expect } from 'vitest';
import {
  decidePreloadErrorReload,
  noterRechargement,
  consommerNotice,
  CLE_DERNIER_RECHARGEMENT,
  CLE_NOTICE,
  FENETRE_REARMEMENT_MS,
  type StockageSimple,
} from './preloadErrorGuard';

/** Un `sessionStorage` de test. */
const stockageFactice = (initial: Record<string, string> = {}): StockageSimple & { contenu: Record<string, string> } => {
  const contenu = { ...initial };
  return {
    contenu,
    getItem: (c) => (c in contenu ? contenu[c] : null),
    setItem: (c, v) => { contenu[c] = v; },
    removeItem: (c) => { delete contenu[c]; },
  };
};

/** Un stockage qui LÈVE — navigation privée, données de site bloquées. */
const stockageQuiLeve = (): StockageSimple => ({
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('SecurityError'); },
  removeItem: () => { throw new Error('SecurityError'); },
});

describe('decidePreloadErrorReload — la fenêtre de temps, pas un drapeau', () => {
  it('recharge au premier incident', () => {
    const d = decidePreloadErrorReload(stockageFactice(), 1_000_000);
    expect(d.recharger).toBe(true);
    expect(d.raison).toBe('premier');
  });

  it('REFUSE de recharger une seconde fois dans la fenêtre — c’est la boucle', () => {
    const s = stockageFactice();
    noterRechargement(s, 1_000_000);
    // 2 secondes plus tard : c'est le rythme d'une boucle (chargement + import qui échoue).
    const d = decidePreloadErrorReload(s, 1_002_000);
    expect(d.recharger).toBe(false);
    expect(d.raison).toBe('boucle');
  });

  it('🔴 SE RÉARME hors de la fenêtre — c’est exactement ce que l’ancien garde ne faisait pas', () => {
    const s = stockageFactice();
    noterRechargement(s, 1_000_000);
    // Le défaut corrigé le 07/11 : l'ancien garde posait un drapeau définitif, donc un onglet
    // ayant connu l'incident le matin restait sans défense au déploiement du soir.
    const d = decidePreloadErrorReload(s, 1_000_000 + FENETRE_REARMEMENT_MS);
    expect(d.recharger).toBe(true);
    expect(d.raison).toBe('rearme');
  });

  it('la borne est inclusive, et un cheveu avant ne recharge pas', () => {
    const s = stockageFactice();
    noterRechargement(s, 0);
    expect(decidePreloadErrorReload(s, FENETRE_REARMEMENT_MS - 1).recharger).toBe(false);
    expect(decidePreloadErrorReload(s, FENETRE_REARMEMENT_MS).recharger).toBe(true);
  });

  it('migre l’ancien drapeau « 1 » en réarmant, jamais en bloquant', () => {
    // Un onglet ouvert pendant le déploiement de ce correctif porte encore l'ancienne clé ;
    // mais même avec l'ancienne VALEUR sur la nouvelle clé, « 1 » vaut un horodatage de 1970,
    // donc très ancien, donc réarmé. Le sens de la migration est celui qui dépanne.
    const s = stockageFactice({ [CLE_DERNIER_RECHARGEMENT]: '1' });
    expect(decidePreloadErrorReload(s, Date.now()).recharger).toBe(true);
  });

  it('une valeur illisible est traitée comme une absence', () => {
    const s = stockageFactice({ [CLE_DERNIER_RECHARGEMENT]: 'nawak' });
    const d = decidePreloadErrorReload(s, 1_000_000);
    expect(d.recharger).toBe(true);
    expect(d.raison).toBe('premier');
  });

  it('un stockage absent ou qui LÈVE recharge quand même — le moindre mal est de se rétablir', () => {
    expect(decidePreloadErrorReload(null, 1_000_000).recharger).toBe(true);
    expect(decidePreloadErrorReload(stockageQuiLeve(), 1_000_000).recharger).toBe(true);
    // Et `noterRechargement` ne doit pas propager l'exception : le rechargement doit avoir lieu.
    expect(() => noterRechargement(stockageQuiLeve(), 1)).not.toThrow();
    expect(() => consommerNotice(stockageQuiLeve())).not.toThrow();
  });

  it('chaque décision porte un message — un rechargement muet est indiscernable d’un plantage', () => {
    const s = stockageFactice();
    const premier = decidePreloadErrorReload(s, 1_000_000);
    noterRechargement(s, 1_000_000);
    const boucle = decidePreloadErrorReload(s, 1_001_000);
    const rearme = decidePreloadErrorReload(s, 1_000_000 + FENETRE_REARMEMENT_MS + 1);
    for (const d of [premier, boucle, rearme]) {
      expect(d.message).toMatch(/vite:preloadError/);
      expect(d.message.length).toBeGreaterThan(40);
    }
    // Les trois messages diffèrent : un message unique ne dirait pas laquelle des trois
    // situations a été rencontrée, et c'est la seule trace qu'on aura à distance.
    expect(new Set([premier.message, boucle.message, rearme.message]).size).toBe(3);
  });
});

describe('la notice laissée au visiteur', () => {
  it('noterRechargement écrit l’horodatage ET la notice', () => {
    const s = stockageFactice();
    noterRechargement(s, 42);
    expect(s.contenu[CLE_DERNIER_RECHARGEMENT]).toBe('42');
    expect(s.contenu[CLE_NOTICE]).toBe('1');
  });

  it('consommerNotice la rend UNE fois, puis plus jamais', () => {
    const s = stockageFactice();
    noterRechargement(s, 42);
    expect(consommerNotice(s)).toBe(true);
    // ⚠️ La propriété qui compte : sans effacement, la notice réapparaîtrait à chaque
    // navigation pendant toute la session.
    expect(consommerNotice(s)).toBe(false);
    expect(CLE_NOTICE in s.contenu).toBe(false);
  });

  it('aucune notice sans rechargement', () => {
    expect(consommerNotice(stockageFactice())).toBe(false);
    expect(consommerNotice(null)).toBe(false);
  });

  it('⚠️ la notice n’est PAS effacée par un refus de rechargement', () => {
    // Si le garde refuse de boucler, la notice du rechargement précédent doit rester : c'est
    // toujours ce rechargement-là qu'il faut expliquer au visiteur.
    const s = stockageFactice();
    noterRechargement(s, 1_000_000);
    decidePreloadErrorReload(s, 1_001_000);
    expect(s.contenu[CLE_NOTICE]).toBe('1');
  });
});
