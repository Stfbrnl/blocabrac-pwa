// ✅ Bloc Roulette (CONCEPTION-roulette-et-defis.md, Partie 1 — étapes 1+2+3 du §3) : tirage
// ludique d'une proposition de défi individuel parmi un catalogue fixe de 34 entrées.
//
// Module pur : AUCUN import Firestore ici (ni `firebase/firestore`, ni `services/firebaseConfig`).
// C'est la propriété qui rend la fonctionnalité gratuite (§1.9 du document) — le tirage et le
// "relancer" ne doivent jamais coûter de lecture/écriture. Toutes les données dont ce module a
// besoin (blocs du jour, niveau, compteurs) sont déjà en mémoire côté appelant (ClientDaily.tsx).
// L'anti-lassitude (localStorage) et le compteur par mur (Firestore, sur `users/{uid}.wallCounts`)
// sont gérés par l'appelant, jamais par ce module.

import type { Level } from './competitionEligibility';
import { levelOrder } from './competitionEligibility';
import { walls } from '../config/gymConfig';

export type Family = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type LevelTarget = 'max-1' | 'max' | 'max+1';

export interface Proposal {
  id: string;
  label: string; // placeholders littéraux : {couleur}, {mur}, {numéro}
  family: Family;
  levelTarget: LevelTarget;
  needsWall: boolean; // famille D + traversées G32/G33 — résolvent {mur}
  extreme: boolean; // "roulette de la mort" uniquement
  childWallWarning: boolean; // affiche un rappel murs enfants avant le tirage
}

// Catalogue relu et corrigé avec l'utilisateur le 18/08/2026 par rapport à la V2 du document
// source : A1 précise le mur (les numéros se répètent d'un mur à l'autre), A5 explicite qu'on
// ne regarde que les blocs de la couleur cible, B7 autorise les prises d'un bloc voisin pour
// rejoindre le départ assis, B13 remplace le contrôle 3s (déjà la norme) par une préhension à
// trois doigts. "À faire relire par l'ouvreur/le gérant" pour le reste — texte volontairement
// regroupé dans ce seul tableau pour rester facile à corriger après coup.
export const CATALOG: Proposal[] = [
  // A — Socle (max-1, vérifiable)
  { id: 'A1', label: 'Ton prochain bloc : {couleur} n°{numéro} sur {mur}.', family: 'A', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'A2', label: "Un bloc que tu n'as jamais validé.", family: 'A', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'A3', label: 'Deux blocs d\'affilée sur le même mur, sans t\'asseoir.', family: 'A', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'A4', label: 'Trois blocs, trois murs différents.', family: 'A', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'A5', label: "Le plus grand numéro de {couleur} (ton niveau max-1) que tu n'as pas encore fait.", family: 'A', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'A6', label: 'Un bloc posé cette semaine.', family: 'A', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },

  // B — Style (max-1, déclaratif)
  { id: 'B7', label: "Départ assis : si besoin, utilise les prises d'un bloc voisin pour rejoindre le premier mouvement assis.", family: 'B', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'B8', label: 'Pieds silencieux : aucun bruit de pied, du départ à la fin.', family: 'B', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'B9', label: 'Une seule fois par prise : interdit de repositionner une main.', family: 'B', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'B10', label: "Annonce chaque prise à voix haute avant de l'attraper.", family: 'B', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'B11', label: 'Enchaîne sans jamais reposer les deux mains en même temps.', family: 'B', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'B12', label: 'Repère tout le bloc depuis le sol, puis grimpe sans hésiter.', family: 'B', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'B13', label: 'Termine le bloc en tenant la prise finale trois secondes, à trois doigts.', family: 'B', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },

  // C — Chronométré (max-1, déclaratif)
  { id: 'C14', label: 'Ce bloc en moins de 45 secondes, du départ à la prise finale.', family: 'C', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'C15', label: 'Trois blocs en 10 minutes.', family: 'C', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'C16', label: 'Le plus de blocs possible en 15 minutes.', family: 'C', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'C17', label: 'Une minute de repos maximum entre deux essais, pendant 20 minutes.', family: 'C', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },

  // D — Murs et diversité (max-1, nécessite le compteur par mur)
  { id: 'D18', label: 'Ton mur le moins fréquenté en ce moment : {mur}. Un bloc dessus.', family: 'D', levelTarget: 'max-1', needsWall: true, extreme: false, childWallWarning: false },
  { id: 'D19', label: 'Un bloc sur chacun des trois murs que tu délaisses le plus.', family: 'D', levelTarget: 'max-1', needsWall: true, extreme: false, childWallWarning: false },
  { id: 'D20', label: 'Mur du jour : {mur}. Un bloc de chaque couleur jusqu\'à ton niveau.', family: 'D', levelTarget: 'max-1', needsWall: true, extreme: false, childWallWarning: false },
  { id: 'D21', label: "Cinq murs consécutifs dans l'ordre de la salle, un bloc sur chacun.", family: 'D', levelTarget: 'max-1', needsWall: true, extreme: false, childWallWarning: true },
  { id: 'D22', label: 'Le mur que tu n\'as pas touché depuis le plus longtemps.', family: 'D', levelTarget: 'max-1', needsWall: true, extreme: false, childWallWarning: false },

  // E — Progression (max+1, réussite partielle, déclaratif — jamais écrit en base)
  { id: 'E23', label: 'Trouve un {couleur} et fais-en les trois premiers mouvements.', family: 'E', levelTarget: 'max+1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'E24', label: 'Un {couleur} : réussis le départ et le premier mouvement, c\'est tout.', family: 'E', levelTarget: 'max+1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'E25', label: 'Repère le mouvement dur d\'un {couleur} et réussis-le isolément.', family: 'E', levelTarget: 'max+1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'E26', label: 'Un {couleur} : quatre mouvements n\'importe où dans le bloc.', family: 'E', levelTarget: 'max+1', needsWall: false, extreme: false, childWallWarning: false },

  // F — Sans échec (vérifiable via le nombre d'essais)
  { id: 'F27', label: 'Flash : ce bloc au premier essai.', family: 'F', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'F28', label: 'Trois flashs d\'affilée, deux niveaux en dessous du tien.', family: 'F', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'F29', label: 'Cinq blocs, aucun échec autorisé. Un raté et le défi tombe.', family: 'F', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'F30', label: 'Un bloc à ton niveau max, essais illimités, jusqu\'à le sortir.', family: 'F', levelTarget: 'max', needsWall: false, extreme: false, childWallWarning: false },

  // G — Créatif et traversées (déclaratif)
  { id: 'G31', label: 'Invente un bloc : compose une ligne avec des prises de plusieurs couleurs, annonce la cotation que tu lui donnes, fais-la valider par un ami.', family: 'G', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
  { id: 'G32', label: 'Traversée : trois murs consécutifs sans poser le pied au sol.', family: 'G', levelTarget: 'max-1', needsWall: true, extreme: false, childWallWarning: true },
  { id: 'G33', label: "Le grand tour : la salle entière dans l'ordre des murs, sans toucher le sol.", family: 'G', levelTarget: 'max-1', needsWall: true, extreme: false, childWallWarning: true },
  { id: 'G34', label: "Refais un bloc que tu connais en t'interdisant une prise sur deux.", family: 'G', levelTarget: 'max-1', needsWall: false, extreme: false, childWallWarning: false },
];

// "Roulette de la mort" : à part, jamais dans CATALOG (jamais tirée par `drawProposal`,
// jamais soumise à l'anti-lassitude — "son intérêt tient à sa rareté", §1.6). Un bouton séparé
// côté UI, `drawDeathProposal` ci-dessous.
export const DEATH_PROPOSAL: Proposal = {
  id: 'DEATH',
  label: 'Un {couleur}. En entier. Bonne chance.',
  family: 'E',
  levelTarget: 'max+1',
  needsWall: false,
  extreme: true,
  childWallWarning: false,
};

// Pondération du niveau visé (§1.2) : ~70% max-1 (socle), ~20% max (exigeant), ~10% max+1
// (progression, toujours en réussite partielle). RNG injectable pour des tests déterministes.
export const pickLevelTarget = (rng: () => number = Math.random): LevelTarget => {
  const r = rng();
  if (r < 0.70) return 'max-1';
  if (r < 0.90) return 'max';
  return 'max+1';
};

export interface ResolvedLevel {
  color: Level;
  appliedTarget: LevelTarget; // peut différer du target demandé après repli plancher/plafond
}

// Résout la couleur cible pour un niveau visé, en gérant les cas limites (§1.2, "cas limites
// à traiter") : niveau plancher (max-1 rabattu sur le niveau courant), niveau plafond (max+1
// rabattu sur max), niveau absent/inconnu (traité comme le plancher).
export const resolveTargetColor = (userLevel: Level | undefined, target: LevelTarget): ResolvedLevel => {
  const idx = userLevel ? levelOrder.indexOf(userLevel) : -1;
  const currentIdx = idx >= 0 ? idx : 0;

  if (target === 'max-1') {
    const targetIdx = Math.max(currentIdx - 1, 0);
    return { color: levelOrder[targetIdx], appliedTarget: 'max-1' };
  }
  if (target === 'max') {
    return { color: levelOrder[currentIdx], appliedTarget: 'max' };
  }
  // target === 'max+1'
  const nextIdx = currentIdx + 1;
  if (nextIdx >= levelOrder.length) {
    // Plafond atteint : pas de couleur au-dessus, repli sur 'max' (l'appelant sait alors que
    // la famille E doit être exclue du tirage — voir `levelExcludedE` dans DrawResult).
    return { color: levelOrder[currentIdx], appliedTarget: 'max' };
  }
  return { color: levelOrder[nextIdx], appliedTarget: 'max+1' };
};

export type WallCounts = Partial<Record<string, number>>;

// Mur le moins visité (famille D) : le compte le plus bas dans `wallCounts` (0 si absent),
// égalité départagée par l'ordre circulaire de `walls` (déterministe, pas de rng — c'est un
// mérite du mur le plus délaissé, pas un tirage).
export const leastVisitedWall = (wallCounts: WallCounts): string => {
  let best = walls[0];
  let bestCount = wallCounts[best] ?? 0;
  for (const wall of walls) {
    const count = wallCounts[wall] ?? 0;
    if (count < bestCount) {
      best = wall;
      bestCount = count;
    }
  }
  return best;
};

export interface DrawBoulder {
  id: string;
  color: string;
  wall: string;
  number: number | string;
}

export interface DrawInput {
  boulders: DrawBoulder[];
  userLevel: Level | undefined;
  // ✅ Limité à la session en cours (successResults de ClientDaily.tsx), pas l'historique
  // complet — décision actée pour rester "gratuit" (aucune lecture Firestore au tirage), voir
  // CONCEPTION-roulette-et-defis.md §1.4 et la discussion de conception du 18/08/2026.
  validatedBoulderIds: Set<string>;
  wallCounts: WallCounts;
  recentProposalIds: string[]; // anti-lassitude, ~10 derniers ids tirés (localStorage)
  rng?: () => number;
}

export interface DrawResult {
  proposal: Proposal;
  resolvedColor: Level;
  resolvedWall?: string;
  resolvedBoulder?: DrawBoulder; // tiré une fois pour toutes ("relancer" = nouvel appel complet)
  widened: boolean; // élargissement progressif appliqué (§1.4)
  levelExcludedE: boolean; // famille E exclue de ce tirage (plafond atteint)
}

// Familles où répéter un bloc déjà validé est le principe même de la proposition (§1.4 :
// "sauf familles B, C, E, où refaire un bloc connu est le principe même"). F reste soumise au
// filtre standard : flash/sans-échec n'ont de sens que sur un bloc pas encore acquis.
const REPEATABLE_FAMILIES: Family[] = ['B', 'C', 'E'];

const boulderMatchesColor = (b: DrawBoulder, color: string) => (b.color || '') === color;

// Tire un élément uniformément dans un tableau non vide via `rng` (0 inclus, 1 exclu).
const pickUniform = <T,>(items: T[], rng: () => number): T => items[Math.floor(rng() * items.length)];

export const drawProposal = (input: DrawInput): DrawResult => {
  const rng = input.rng ?? Math.random;
  const requestedTarget = pickLevelTarget(rng);
  const resolved = resolveTargetColor(input.userLevel, requestedTarget);
  const levelExcludedE = requestedTarget === 'max+1' && resolved.appliedTarget !== 'max+1';

  // ✅ Pool éligible : les entrées du niveau visé, moins la famille E si le plafond a été
  // atteint, moins celles tirées récemment (anti-lassitude). D et G ne sont pas pondérées à
  // part — elles concourent au même tirage uniforme que les autres familles du niveau visé.
  let pool = CATALOG.filter((p) => p.levelTarget === resolved.appliedTarget);
  if (levelExcludedE) pool = pool.filter((p) => p.family !== 'E');
  const poolMinusRecent = pool.filter((p) => !input.recentProposalIds.includes(p.id));
  // Si tout le pool a été tiré récemment (petit catalogue à ce niveau), on retombe sur le
  // pool complet plutôt que de planter — l'anti-lassitude est un confort, pas une garantie.
  const finalPool = poolMinusRecent.length > 0 ? poolMinusRecent : pool;
  const proposal = pickUniform(finalPool, rng);

  const repeatable = REPEATABLE_FAMILIES.includes(proposal.family);
  const sameWallColor = (b: DrawBoulder) => boulderMatchesColor(b, resolved.color);
  const notValidated = (b: DrawBoulder) => !input.validatedBoulderIds.has(b.id);

  let candidates = input.boulders.filter((b) => sameWallColor(b) && (repeatable || notValidated(b)));
  let widened = false;

  // Élargissement progressif (§1.4) : d'abord la couleur (couleur voisine dans levelOrder),
  // puis le filtre "déjà validé" — jamais une erreur affichée à l'utilisateur.
  if (candidates.length === 0) {
    const colorIdx = levelOrder.indexOf(resolved.color as Level);
    const neighborColors = [levelOrder[colorIdx - 1], levelOrder[colorIdx + 1]].filter(Boolean) as Level[];
    candidates = input.boulders.filter((b) => neighborColors.includes(b.color as Level) && (repeatable || notValidated(b)));
    widened = candidates.length > 0;
  }
  if (candidates.length === 0) {
    // Retire le filtre "déjà validé" (couleur cible d'origine).
    candidates = input.boulders.filter(sameWallColor);
    widened = candidates.length > 0;
  }
  if (candidates.length === 0) {
    // Repli ultime : n'importe quel bloc actif (secteur entièrement démonté/validé).
    candidates = input.boulders;
    widened = input.boulders.length > 0;
  }

  const resolvedBoulder = candidates.length > 0 ? pickUniform(candidates, rng) : undefined;
  const resolvedWall = proposal.needsWall
    ? (proposal.family === 'D' ? leastVisitedWall(input.wallCounts) : resolvedBoulder?.wall)
    : undefined;

  return {
    proposal,
    resolvedColor: resolved.color,
    resolvedWall,
    resolvedBoulder,
    widened,
    levelExcludedE,
  };
};

// Roulette de la mort : niveau max+1 strictement, AUCUN repli plafond (contrairement à
// `drawProposal`) — "son intérêt tient à sa rareté" (§1.6). `null` si aucun bloc n'existe à ce
// niveau pour l'instant, plutôt que de rabattre silencieusement sur un niveau inférieur.
export const drawDeathProposal = (
  input: Omit<DrawInput, 'recentProposalIds'>
): DrawResult | null => {
  const rng = input.rng ?? Math.random;
  const idx = input.userLevel ? levelOrder.indexOf(input.userLevel) : -1;
  const currentIdx = idx >= 0 ? idx : 0;
  const nextIdx = currentIdx + 1;
  if (nextIdx >= levelOrder.length) return null;
  const color = levelOrder[nextIdx];

  const candidates = input.boulders.filter((b) => boulderMatchesColor(b, color));
  if (candidates.length === 0) return null;

  const resolvedBoulder = pickUniform(candidates, rng);
  return {
    proposal: DEATH_PROPOSAL,
    resolvedColor: color,
    resolvedBoulder,
    widened: false,
    levelExcludedE: false,
  };
};
