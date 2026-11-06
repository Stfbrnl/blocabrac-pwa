import { levelOrder, type Level } from './competitionEligibility';

// ✅ V2.78 — LE PLANCHER DU NIVEAU (docs/handoffs/2026-10-18-CN-plan-niveaux-contest.md,
// mesuré par scripts/audit-niveaux-perimes.js).
//
// Ce module ne décide QUE d'une chose : faut-il réécrire `users.level`, et vers quoi ?
// Il était en ligne dans `ClientStats.tsx`, donc structurellement hors de portée des tests
// (la couverture du dépôt s'arrête au bord des `.tsx` : pas de harnais React). C'est
// exactement le genre d'endroit où ce projet a déjà vu naître ses défauts, et celui-ci
// réécrit un champ qui pilote la Roulette, les défis `seuil` et la grille de missions.
//
// 🔴 LE DÉFAUT QU'IL CORRIGE : quand plus aucun badge de couleur n'est actif et que
// `baseLevel` est ABSENT, l'ancien code écrivait `'bleu'`. Or `'bleu'` n'est pas une
// donnée : c'est une valeur INVENTÉE, l'hypothèse par défaut la plus probable. Elle était
// posée sur des comptes dont le niveau réel était rose, blanc, noir ou rouge.
// `baseLevel` n'existe que depuis V2.54.1 ; tout compte plus ancien n'en a jamais eu.
//
// ⚠️ MESURE DU 06/11/2026, en production, APRÈS la passe de verrouillage du contest :
// 9 comptes portent un niveau ≥ violet SANS `baseLevel` (rose ×1, blanc ×4, noir ×2,
// rouge ×2). Les 68 comptes verrouillés le soir du contest ne sont protégés que par
// `levelOverride` : au déverrouillage, et SANS ce plancher, ces 9 comptes tombaient à
// `'bleu'` — c'est-à-dire que le déverrouillage aurait détruit le travail de déclaration
// fait à la main, nom par nom, pendant la soirée. D'où l'ordre, qui ne se change pas :
// **corriger et déployer d'abord, déverrouiller ensuite.**
//
// LE PRINCIPE : une absence n'est pas une valeur. Sans `baseLevel`, on ne sait pas ce que
// le grimpeur a déclaré — alors on n'écrit RIEN et le niveau reste à sa dernière valeur
// connue. Ne rien écrire est toujours préférable à écrire une valeur fabriquée, parce
// qu'une absence se répare (le grimpeur enregistre son profil, ce qui vaut re-déclaration
// et pose `baseLevel`) tandis qu'une valeur fabriquée est indiscernable d'une vraie.
//
// ⚠️ La redescente elle-même reste le comportement VOULU et n'est pas ce qu'on corrige :
// le badge est la proclamation (son caractère éphémère EST sa valeur), le niveau est la
// mesure. Ce qui est corrigé est la seule branche où la redescente n'avait aucune cible
// légitime vers laquelle redescendre.

// Le niveau le plus bas pour lequel le catalogue `badges` contient un badge de couleur.
// En dessous (jaune/vert/bleu), aucun badge n'existe : ce mécanisme n'élève donc jamais
// en dessous de violet, et un niveau inférieur ne peut venir que d'une déclaration.
export const LOWEST_BADGE_LEVEL: Level = 'violet';

export interface LevelSyncInput {
  // `users.level` courant — le niveau CONSTATÉ.
  currentLevel?: string | null;
  // `users.baseLevel` — le niveau DÉCLARÉ, mis de côté avant la première élévation par un
  // badge. Absent sur tout compte antérieur à V2.54.1.
  baseLevel?: string | null;
  // Les couleurs des badges du grimpeur qui sont ACTIFS à cet instant (déjà filtrées par
  // `computeBadgeActive` par l'appelant, qui seul dispose de l'inventaire de la salle).
  activeBadgeColors: string[];
  // Verrou posé par un admin : on ne touche alors jamais au niveau.
  levelOverride?: boolean | null;
}

// Les champs à écrire sur `users/{uid}`, ou `null` pour « n'écrire RIEN ».
//
// ⚠️ `null` et `{}` ne sont pas interchangeables : `null` veut dire qu'aucun `updateDoc`
// ne doit partir. Renvoyer un objet vide ferait écrire un document sans champ, ce qui
// coûte une écriture et touche `updatedAt` pour rien.
export type LevelSyncWrite = { level: string; baseLevel?: string } | null;

const rank = (lvl?: string | null): number =>
  lvl ? levelOrder.indexOf(lvl as Level) : -1;

export const resolveLevelSync = (input: LevelSyncInput): LevelSyncWrite => {
  // ① Verrou d'admin : intouchable, et c'est ce qui protège les 68 comptes du contest
  // tant que le déverrouillage n'a pas eu lieu.
  if (input.levelOverride) return null;

  const currentRank = rank(input.currentLevel);
  const plancherRank = levelOrder.indexOf(LOWEST_BADGE_LEVEL);

  const actifs = input.activeBadgeColors.filter(
    (c): c is string => !!c && levelOrder.includes(c as Level)
  );

  // ② Au moins un badge de couleur actif : le niveau suit le plus haut.
  if (actifs.length > 0) {
    const plusHaut = actifs.reduce((hi, c) => (rank(c) > rank(hi) ? c : hi));
    if (input.currentLevel === plusHaut) return null;

    const write: { level: string; baseLevel?: string } = { level: plusHaut };
    // Mémoriser le niveau déclaré, UNE SEULE FOIS, juste avant la première élévation par
    // un badge — et seulement si le niveau courant est un niveau « facile » sans badge.
    // Au-delà, la valeur courante est déjà pilotée par un badge : la sauvegarder
    // enregistrerait une mesure comme si c'était une déclaration.
    if (!input.baseLevel && currentRank >= 0 && currentRank < plancherRank) {
      write.baseLevel = input.currentLevel as string;
    }
    return write;
  }

  // ③ Aucun badge de couleur actif. Il n'y a quelque chose à faire que si le niveau
  // courant est ≥ violet : une telle valeur ne peut venir que d'un badge désormais en
  // veille (rotation de tous les murs de cette couleur).
  if (currentRank < plancherRank) return null;

  // 🔴 ③ bis — LE PLANCHER. Sans `baseLevel` lisible, il n'existe AUCUNE cible légitime :
  // on n'écrit rien et le niveau reste à sa dernière valeur connue. C'est la branche qui
  // écrivait `'bleu'` et faisait tomber 9 comptes de production.
  const baseRank = rank(input.baseLevel);
  if (baseRank < 0) return null;

  // ④ `baseLevel` connu : on y revient, et JAMAIS vers le haut — monter de niveau reste
  // le rôle des badges. Un `baseLevel` supérieur au niveau courant ne déclenche rien.
  if (baseRank >= currentRank) return null;
  return { level: input.baseLevel as string };
};
