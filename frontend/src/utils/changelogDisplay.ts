// ✅ V2.71.2 (docs/handoffs/RETOUR-v271.md §3) : quelles entrées du changelog montrer dans
// « Quoi de neuf ». Avant : seulement changelog[0] — chaque annonce chassait la précédente
// (l'annonce de saison 2.71 avait fait disparaître les changements de saisie de 2.69/2.70,
// et chaque entrée devait recopier les points de la précédente). Désormais : toutes les
// entrées plus récentes que la dernière version vue par ce grimpeur, plafonnées.
import type { ChangelogEntry } from '../data/changelog';

export const CHANGELOG_MAX_ENTRIES = 3;

// "2.70" < "2.71" < "2.71.1" — comparaison numérique segment par segment (pas lexicographique :
// "2.9" < "2.10").
export const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

// `seenVersion` : dernière version validée par « Compris » sur cet appareil (null si jamais).
// Jamais vu (nouvel appareil, premier lancement) → la seule dernière entrée : pas d'historique
// imposé à un nouveau venu. Entrées supposées triées de la plus récente à la plus ancienne.
export const changelogEntriesToShow = (
  entries: ChangelogEntry[],
  seenVersion: string | null,
  max: number = CHANGELOG_MAX_ENTRIES
): ChangelogEntry[] => {
  if (entries.length === 0) return [];
  if (!seenVersion) return [entries[0]];
  return entries.filter((e) => compareVersions(e.version, seenVersion) > 0).slice(0, max);
};
