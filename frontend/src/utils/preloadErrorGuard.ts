/**
 * La décision du garde `vite:preloadError` : recharger, ou pas.
 *
 * ─── CE QUI ARRIVE, ET POURQUOI CE FICHIER EXISTE (07/11/2026) ──────────────────────────
 *
 * Après un déploiement `--only hosting`, les fichiers de `dist/assets/` portant un hachage de
 * contenu sont REMPLACÉS : les anciens n'existent plus sur le serveur. Sous
 * `registerType: 'prompt'`, un onglet resté ouvert garde son ancien bundle — l'écran courant
 * n'est donc pas touché. ⚠️ **Mais une navigation vers un écran chargé à la demande va chercher
 * un fragment que le déploiement a supprimé** : le `import()` échoue, Vite émet
 * `vite:preloadError`, et sans garde l'écran reste vide. C'est exactement ce que fait une
 * monitrice qui passe d'un écran à l'autre pendant une séance.
 *
 * 🔴 LE DÉFAUT DU GARDE PRÉCÉDENT, mesuré le 07/11/2026 : il posait un drapeau
 * `sessionStorage` qu'il ne retirait JAMAIS. Il rechargeait donc une fois par onglet **et pour
 * toute la vie de l'onglet**. Un onglet ayant connu un `preloadError` à 10 h était sans
 * défense au déploiement de 15 h : le second événement ne déclenchait plus rien, le `import()`
 * échouait pour de bon, et comme le dépôt n'a **ni ErrorBoundary ni route `*`**, cela donnait
 * un **écran blanc sans sortie**. Le drapeau était là pour empêcher une boucle de
 * rechargements ; il empêchait aussi le rétablissement, pour toujours.
 *
 * ⚠️ **La correction est une FENÊTRE DE TEMPS, pas un drapeau.** Les deux situations que le
 * garde doit distinguer ne diffèrent que par leur rythme :
 *   - une **boucle** recharge et rééchoue en quelques secondes → à bloquer ;
 *   - un **nouvel incident** survient des minutes ou des heures plus tard → à traiter.
 * Un drapeau booléen ne peut pas les séparer : il n'a pas la dimension où elles diffèrent.
 *
 * ⚠️ Et ce module est pur et testé exprès : écrite dans `main.tsx`, cette logique serait
 * structurellement invisible (la couverture s'arrête au bord des composants), et c'est
 * précisément le genre de condition qu'on croit évidente en la relisant.
 */

/** Clé du dernier rechargement effectué par ce garde. */
export const CLE_DERNIER_RECHARGEMENT = 'blocabrac.preloadError.dernierRechargement';
/** Clé du mot à dire au visiteur APRÈS le rechargement. */
export const CLE_NOTICE = 'blocabrac.preloadError.notice';

/**
 * ⚠️ 60 secondes, et le raisonnement qui fixe ce nombre : une boucle réelle recharge en
 * **moins de deux secondes** (le temps d'un chargement + d'un `import()` qui échoue), tandis
 * que deux déploiements successifs sont séparés au mieux de plusieurs minutes. N'importe quelle
 * valeur entre ~10 s et ~2 min sépare les deux ; une minute laisse de la marge des deux côtés.
 * **Ce n'est pas un délai d'attente** — on ne fait patienter personne, on décide seulement si
 * un rechargement est le second d'une boucle ou le premier d'un incident.
 */
export const FENETRE_REARMEMENT_MS = 60_000;

/** La part de `Storage` que ce module utilise — pour pouvoir le tester sans navigateur. */
export interface StockageSimple {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  removeItem(cle: string): void;
}

export type RaisonPreloadError = 'premier' | 'rearme' | 'boucle';

export interface DecisionPreloadError {
  recharger: boolean;
  raison: RaisonPreloadError;
  /** Ce qu'on écrit dans la console : un rechargement muet est indiscernable d'un plantage. */
  message: string;
}

/**
 * ⚠️ `sessionStorage` LÈVE en navigation privée et quand les données de site sont bloquées.
 * Tout accès passe donc par ces deux fonctions. **Le repli d'une lecture impossible est
 * `null`, c'est-à-dire « premier incident », donc « recharger »** : entre ne jamais se
 * rétablir et risquer un rechargement de trop, le second est le moindre mal — et la fenêtre
 * de temps ne peut de toute façon pas se mémoriser dans ce cas.
 */
const lire = (stockage: StockageSimple | null, cle: string): string | null => {
  if (!stockage) return null;
  try {
    return stockage.getItem(cle);
  } catch {
    return null;
  }
};

const ecrire = (stockage: StockageSimple | null, cle: string, valeur: string): void => {
  if (!stockage) return;
  try {
    stockage.setItem(cle, valeur);
  } catch {
    // Pas de repli possible, et rien à signaler : c'est un confort qui n'a pas pu être posé.
  }
};

/**
 * Faut-il recharger ? `maintenantMs` est injecté (jamais `Date.now()` lu ici) pour que le
 * test puisse faire avancer l'horloge sans attendre.
 */
export const decidePreloadErrorReload = (
  stockage: StockageSimple | null,
  maintenantMs: number,
  fenetreMs: number = FENETRE_REARMEMENT_MS
): DecisionPreloadError => {
  const brut = lire(stockage, CLE_DERNIER_RECHARGEMENT);
  const dernier = brut === null ? null : Number(brut);
  // Une valeur illisible (stockage corrompu, ancien format booléen « 1 ») est traitée comme
  // une absence. ⚠️ C'est volontaire et c'est le sens de la MIGRATION : le garde précédent
  // écrivait la chaîne '1', que `Number('1')` rend bien lisible mais qui vaudrait un
  // horodatage de 1970 — donc « très ancien », donc « réarmé ». Un onglet ouvert pendant le
  // déploiement de ce correctif est ainsi réarmé plutôt que bloqué, ce qui est l'effet voulu.
  if (dernier === null || !Number.isFinite(dernier)) {
    return {
      recharger: true,
      raison: 'premier',
      message:
        'vite:preloadError — un fragment de l\'application n\'existe plus sur le serveur '
        + '(déploiement en cours ?). Rechargement pour récupérer la version courante.',
    };
  }
  const ecoule = maintenantMs - dernier;
  if (ecoule >= fenetreMs) {
    return {
      recharger: true,
      raison: 'rearme',
      message:
        `vite:preloadError — précédent rechargement il y a ${Math.round(ecoule / 1000)} s, `
        + 'donc hors de la fenêtre anti-boucle : nouvel incident, rechargement.',
    };
  }
  return {
    recharger: false,
    raison: 'boucle',
    message:
      `vite:preloadError — DEUXIÈME échec en ${Math.round(ecoule / 1000)} s : recharger `
      + 'n\'y change rien, on ne boucle pas. L\'écran va afficher une page de récupération.',
  };
};

/**
 * Mémorise qu'un rechargement vient d'être déclenché, et laisse un mot pour l'après.
 *
 * ⚠️ Les deux écritures vont ensemble : le visiteur dont l'écran se recharge tout seul sous
 * les doigts doit pouvoir savoir POURQUOI. Un rechargement muet est indiscernable d'un
 * plantage — et c'est sous cette forme-là que le défaut a été rapporté (« les validations
 * sautaient »), pas sous celle d'un message d'erreur.
 */
export const noterRechargement = (stockage: StockageSimple | null, maintenantMs: number): void => {
  ecrire(stockage, CLE_DERNIER_RECHARGEMENT, String(maintenantMs));
  ecrire(stockage, CLE_NOTICE, '1');
};

/**
 * `window.sessionStorage` quand il est accessible, `null` sinon — en un seul endroit, parce
 * que le simple ACCÈS à la propriété lève en navigation privée et quand les données de site
 * sont bloquées (ce n'est pas la lecture d'une clé qui lève, c'est `window.sessionStorage`
 * lui-même).
 */
export const lireStockageSession = (): StockageSimple | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * Lit le mot laissé par `noterRechargement` ET l'efface, en un seul geste : il ne doit
 * s'afficher qu'une fois, pas à chaque montage du composant qui le lit.
 *
 * ⚠️ APPELÉ UNE SEULE FOIS, AU DÉMARRAGE, HORS DE REACT (voir `main.tsx`). Le lire dans un
 * `useEffect` était possible mais faux de deux façons : il faut un `setState` synchrone dans
 * l'effet (cascade de rendus, refusée par ESLint), et sous `StrictMode` le double montage
 * rendait l'ordre des deux appels significatif. Le moment juste est le chargement du module :
 * le mot a été écrit avant le rechargement, il est donc déjà là.
 */
export const consommerNotice = (stockage: StockageSimple | null): boolean => {
  const present = lire(stockage, CLE_NOTICE) === '1';
  if (present && stockage) {
    try {
      stockage.removeItem(CLE_NOTICE);
    } catch {
      // Si l'effacement échoue, la notice se réaffichera : gênant, jamais grave.
    }
  }
  return present;
};
