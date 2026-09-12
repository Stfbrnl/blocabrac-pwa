// ✅ PLAN-premiers-ascensionnistes.md : liste des cinq premiers grimpeurs à avoir validé un
// bloc d'une couleur difficile, stockée directement sur le document du bloc
// (`boulders/{id}.firstAscents`) — voir §1 du plan pour pourquoi cet emplacement est ce qui
// rend la fonctionnalité gratuite (zéro lecture supplémentaire, au plus 5 écritures par bloc
// sur toute sa vie). Module PURE (aucun import Firestore), même discipline que
// `roulette.ts`/`challenges.ts` : testable sans émulateur.
export interface FirstAscentEntry {
  uid: string;
  displayName: string;
  at: string; // ISO
}

export const FIRST_ASCENT_LIST_MAX = 5;

export interface ShouldRecordFirstAscentInput {
  success: boolean;
  color: string | null | undefined;
  boulderType: string | null | undefined;
  competitionActive: boolean | null | undefined;
  existing: FirstAscentEntry[] | undefined;
  uid: string;
  optIn: boolean;
  eligibleColors: readonly string[];
}

// ✅ Les six conditions du §6 du plan, réunies ici pour être vérifiables et testables en un
// seul appel — toutes calculables sans lecture Firestore côté appelant SAUF `existing`, qui
// doit venir d'une lecture FRAÎCHE du bloc au moment de l'écriture (jamais de l'état en
// mémoire, potentiellement périmé si un autre grimpeur vient de prendre une place) — voir
// `firstAscentWrites.ts` pour la transaction qui fournit cette lecture fraîche.
export const shouldRecordFirstAscent = (input: ShouldRecordFirstAscentInput): boolean => {
  if (!input.success) return false;
  if (!input.optIn) return false;
  if (!input.color || !input.eligibleColors.includes(input.color)) return false;
  // ✅ §5 du plan : un bloc de compétition à cotation cachée ne doit jamais exposer une
  // liste de premiers ascensionnistes — filtre sur les DEUX champs du cycle de vie (un bloc
  // quotidien réutilisé en compétition garde type:'daily' + gagne competition_active).
  if (input.boulderType !== 'daily') return false;
  if (input.competitionActive) return false;
  const existing = input.existing || [];
  if (existing.length >= FIRST_ASCENT_LIST_MAX) return false;
  if (existing.some((entry) => entry.uid === input.uid)) return false;
  return true;
};
