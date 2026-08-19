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
// Contrat de fusion : l'appelant fournit `merge(prev, incoming)`, appelée à la fois pour
// accumuler deux `enqueue()` rapprochés ET pour ré-accumuler un payload resté en échec avec
// un `enqueue()` survenu entre-temps (même chemin, une seule règle à tenir cohérente) :
// - Delta cumulatif (ex. ClientDaily) : `merge` additionne — l'ordre n'importe pas.
// - Remplacement (ex. validation d'un bloc de compétition, "la dernière valeur saisie
//   gagne") : `merge` doit renvoyer `prev` s'il existe (un enqueue plus récent a déjà eu
//   lieu depuis l'échec qu'on retente, il ne faut jamais le faire régresser vers une valeur
//   plus ancienne) et sinon `incoming`.
import { useCallback, useEffect, useRef } from 'react';

export interface UseDebouncedFlushQueueOptions<T> {
  debounceMs: number;
  merge: (prev: T | undefined, incoming: T) => T;
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
      // ✅ Ne jamais perdre silencieusement ce qui vient d'échouer — voir le contrat de
      // `merge` en tête de fichier pour la sémantique exacte de ce ré-accumul.
      pendingRef.current[key] = latestOptionsRef.current.merge(pendingRef.current[key], payload);
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
    pendingRef.current[key] = latestOptionsRef.current.merge(pendingRef.current[key], payload);
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
