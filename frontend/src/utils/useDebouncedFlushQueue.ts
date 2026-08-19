// ✅ PROCESSUS-erreurs-avalees.md §3 (V2.48) : jusqu'à cette version, le motif "debounce +
// flush sur pagehide + comparaison à la dernière valeur persistée + catch" existait en TROIS
// implémentations distinctes (ClientDaily.tsx, ClientCompetitions.tsx, ClientCourseSession.tsx
// — le document en comptait quatre en pensant les défis séparés de ClientDaily, mais leur
// écriture partageait déjà la même transaction, donc la même implémentation), chacune avec sa
// propre gestion du minuteur et sa propre technique pour éviter une fermeture (closure)
// périmée sur "pagehide" (ref-of-closure ici, useCallback+dépendances là, effet sans
// dépendances ailleurs). Ce hook unique remplace les trois — journalisation, compteur
// d'échecs et remontée à l'appelant sont maintenant à l'intérieur, pas à réécrire à chaque
// nouvel écran.
//
// ✅ Contrat de fusion, CORRIGÉ (retour ClaudeNav, V2.50) : `merge` reçoit désormais
// `(older, newer)`, dans cet ordre STRICT d'ANCIENNETÉ — jamais "ce qui était déjà en file"
// vs "ce qui arrive", qui n'a pas le même sens selon le chemin d'appel. Ce hook appelle
// `merge` depuis DEUX chemins avec une relation de fraîcheur opposée l'un à l'autre :
// - `enqueue()` : ce qui est déjà en file (`pendingRef`) est plus ANCIEN que le payload qui
//   vient d'arriver — la fraîcheur va dans le même sens que l'ordre naturel des paramètres.
// - le réessai après échec (dans `runPersist`) : le payload qui vient d'échouer est plus
//   ANCIEN que ce qui a pu s'accumuler dans `pendingRef` PENDANT le `await` de la tentative
//   ratée — la fraîcheur va dans le sens INVERSE de "ce qui était déjà là".
// Un contrat `merge(prev, incoming)` naïf (comme la V2.48 initiale) mélangeait ces deux sens
// sous un seul nom — correct pour un réessai (`prev ?? incoming` protège la valeur la plus
// récente), silencieusement FAUX pour un empilement de deux `enqueue()` rapprochés (la
// valeur la plus récente y est `incoming`, pas `prev` : "essais 2 puis 3 avant la fin du
// debounce" aurait persisté 2, pas 3 — trouvé par relecture, jamais par les e2e, qui ne
// posent jamais deux valeurs dans la même fenêtre de debounce). En imposant `(older, newer)`
// aux DEUX sites d'appel plutôt qu'en laissant chacun interpréter ses propres arguments, le
// même `merge` retombe juste dans les deux cas sans qu'aucun écran n'ait à raisonner sur le
// contexte :
// - Delta cumulatif (ex. ClientDaily) : `merge` additionne — commutatif, l'ordre n'a jamais
//   eu d'importance ici, c'est justement pourquoi ce cas n'a pas révélé le bug.
// - Remplacement (ex. validation d'un bloc de compétition/cours, "la dernière valeur saisie
//   gagne") : `merge` renvoie simplement `newer`.
// `combineByFreshness` (exportée, testée isolément) porte la seule partie non triviale : que
// faire quand l'un des deux côtés est absent (rien n'était en file, ou rien de plus récent
// n'est arrivé depuis l'échec) — dans ces deux cas il n'y a rien à arbitrer, la valeur
// présente gagne par défaut, `merge` n'est même pas appelée.
import { useCallback, useEffect, useRef } from 'react';

// Combine deux valeurs dont on connaît l'ordre relatif d'ancienneté, en ne déléguant à
// `merge` que le cas où les DEUX existent réellement (le seul qui demande un arbitrage) —
// pure, sans aucune dépendance à React, donc testable sans monter le hook.
export function combineByFreshness<T>(
  older: T | undefined,
  newer: T | undefined,
  merge: (older: T, newer: T) => T
): T | undefined {
  if (older === undefined) return newer;
  if (newer === undefined) return older;
  return merge(older, newer);
}

export interface UseDebouncedFlushQueueOptions<T> {
  debounceMs: number;
  // Voir le contrat détaillé en tête de fichier — `older` est TOUJOURS antérieure à `newer`,
  // quel que soit le chemin d'appel (enqueue empilé ou réessai après échec).
  merge: (older: T, newer: T) => T;
  persist: (key: string, payload: T) => Promise<void>;
  // Au-delà de ce nombre d'échecs CONSÉCUTIFS (remis à zéro par tout succès), l'échec
  // n'est plus traité comme transitoire — voir §2 niveau 2 du même document.
  failureThreshold?: number;
  onDurableFailure?: (failureCount: number) => void;
  onRecovered?: () => void;
  // Contexte pour le message console.error (§2 niveau 1) — reçoit la clé concernée.
  errorContext?: (key: string) => string;
}

export interface DebouncedFlushQueue<T> {
  // Fusionne `payload` dans la file d'attente de `key` et (re)planifie son minuteur.
  enqueue: (key: string, payload: T) => void;
  // Écrit `payload` immédiatement, sans attendre ni fusionner avec une éventuelle entrée
  // déjà en file pour cette clé (l'appelant fournit déjà la valeur complète voulue — c'est
  // le cas du clic "Réussi/Échoué", jamais debouncé, voir les écrans compétition/cours).
  // Renvoie la promesse d'écriture — l'appelant qui a besoin d'attendre la fin réelle
  // (ex. "Enregistrer les résultats" avant de naviguer) peut l'awaiter ; les autres
  // (clic Réussi/Échoué) l'ignorent simplement (fire-and-forget).
  writeNow: (key: string, payload: T) => Promise<void>;
  // Vide immédiatement TOUTE la file (toutes clés confondues) — fermeture de modale et
  // "pagehide" (lié automatiquement par ce hook, plus besoin de le faire à la main).
  flushAll: () => void;
}

export function useDebouncedFlushQueue<T>(options: UseDebouncedFlushQueueOptions<T>): DebouncedFlushQueue<T> {
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingRef = useRef<Record<string, T>>({});
  const failureCountRef = useRef(0);
  const durableFailureRef = useRef(false);

  // ✅ Toujours la dernière version des options (persist/merge ferment souvent sur des
  // props/état React redéfinis à chaque rendu — user, compétition sélectionnée...) : UNE
  // seule technique pour ce problème, au lieu des trois qui coexistaient avant ce chantier.
  const latestOptionsRef = useRef(options);
  useEffect(() => {
    latestOptionsRef.current = options;
  });

  const runPersist = useCallback(async (key: string, payload: T) => {
    try {
      await latestOptionsRef.current.persist(key, payload);
      failureCountRef.current = 0;
      if (durableFailureRef.current) {
        durableFailureRef.current = false;
        latestOptionsRef.current.onRecovered?.();
      }
    } catch (err) {
      const ctx = latestOptionsRef.current.errorContext?.(key) ?? `Erreur lors de l'enregistrement (${key})`;
      console.error(`${ctx}:`, err);
      // ✅ Ne jamais perdre silencieusement ce qui vient d'échouer. `payload` (ce qui a
      // échoué) est ANTÉRIEUR à tout ce qui a pu s'accumuler dans `pendingRef` PENDANT le
      // `await` ci-dessus — donc `payload` est `older`, `pendingRef.current[key]` est `newer`
      // (sens inverse de l'appel dans `enqueue` ci-dessous, voir le contrat en tête de fichier).
      pendingRef.current[key] = combineByFreshness(payload, pendingRef.current[key], latestOptionsRef.current.merge)!;
      failureCountRef.current += 1;
      const threshold = latestOptionsRef.current.failureThreshold ?? 3;
      if (failureCountRef.current >= threshold) {
        console.error(
          `Échecs répétés (${failureCountRef.current}) sur "${key}" — probablement pas transitoire, `
          + 'voir PROCESSUS-erreurs-avalees.md.'
        );
        durableFailureRef.current = true;
        latestOptionsRef.current.onDurableFailure?.(failureCountRef.current);
      }
    }
  }, []);

  const enqueue = useCallback((key: string, payload: T) => {
    // ✅ Ce qui est déjà en file est ANTÉRIEUR (`older`) au payload qui vient d'arriver
    // (`newer`) — sens direct, voir le contrat en tête de fichier.
    pendingRef.current[key] = combineByFreshness(pendingRef.current[key], payload, latestOptionsRef.current.merge)!;
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(() => {
      delete timersRef.current[key];
      const toPersist = pendingRef.current[key];
      delete pendingRef.current[key];
      if (toPersist !== undefined) void runPersist(key, toPersist);
    }, latestOptionsRef.current.debounceMs);
  }, [runPersist]);

  const writeNow = useCallback((key: string, payload: T) => {
    if (timersRef.current[key]) {
      clearTimeout(timersRef.current[key]);
      delete timersRef.current[key];
    }
    delete pendingRef.current[key];
    return runPersist(key, payload);
  }, [runPersist]);

  const flushAll = useCallback(() => {
    Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
    timersRef.current = {};
    const entries = Object.entries(pendingRef.current);
    pendingRef.current = {};
    entries.forEach(([key, payload]) => { void runPersist(key, payload); });
  }, [runPersist]);

  // ✅ Lié une seule fois par montage (le hook lui-même, pas chaque écran) — flushAll est
  // déjà stable via useCallback et lit toujours l'état le plus récent par les refs.
  useEffect(() => {
    window.addEventListener('pagehide', flushAll);
    return () => window.removeEventListener('pagehide', flushAll);
  }, [flushAll]);

  return { enqueue, writeNow, flushAll };
}
