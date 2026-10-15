/**
 * Le nom d'un participant tel qu'il s'affiche hors de son propre écran : prénom + initiale.
 *
 * ─── POURQUOI UNE FONCTION PARTAGÉE ────────────────────────────────────────────────────
 *
 * Deux lecteurs, deux raisons, la même exigence :
 *
 *  - l'écran live de compétition est **projeté dans la salle** (docs/plans/
 *    CONCEPTION-ecran-live-competition.md §7). Les catégories FFME impliquent des mineurs : le
 *    nom complet n'a rien à faire sur un écran public ;
 *  - le palmarès officiel gelé (`competition_rankings`) est **lisible par tout compte
 *    authentifié** — c'est la condition même de son existence, un classement se lit. Il ne doit
 *    donc porter que ce que son lecteur consomme, et son lecteur a besoin de reconnaître
 *    quelqu'un, pas de l'identifier. Même doctrine que `classement_profiles`, qui a déjà coûté
 *    une fuite de dates de naissance le 17/08/2026 pour avoir recopié un champ « puisqu'il
 *    était là ».
 *
 * ⚠️ Conséquence : le nom est tronqué **à l'écriture** dans le palmarès gelé, pas à
 * l'affichage. Un gel qui stockerait le nom complet et tronquerait au rendu ne protégerait
 * rien — la donnée serait dans la charge réseau de tout le monde, pour toujours, puisque le
 * document est immuable. Tronquer à l'affichage protège l'écran ; tronquer à l'écriture
 * protège la donnée.
 *
 * ─── CAS LIMITES ───────────────────────────────────────────────────────────────────────
 *
 * Un nom de famille absent ou vide ne doit produire NI « Stéphane . » NI une cellule vide :
 * c'est le cas réel d'un compte rattrapé le 03/10/2026, qui n'a ni nom ni date de naissance.
 * Sans prénom non plus, on affiche un libellé explicite plutôt que du vide — une ligne sans
 * rien est illisible sur un écran projeté et inquiétante dans un palmarès.
 */

export interface ParticipantNameParts {
  first_name?: string | null;
  last_name?: string | null;
}

/** Ce qu'on affiche quand le participant ne porte aucun nom exploitable. */
export const NOM_PARTICIPANT_INCONNU = 'Grimpeur sans nom';

export const shortParticipantName = (p: ParticipantNameParts): string => {
  const prenom = (p.first_name ?? '').trim();
  const nom = (p.last_name ?? '').trim();
  const initiale = nom.charAt(0).toUpperCase();

  if (prenom && initiale) return `${prenom} ${initiale}.`;
  if (prenom) return prenom;
  // Pas de prénom : une initiale seule ne nomme personne et n'apprend rien ; mieux vaut le
  // dire. (Et surtout : jamais le nom de famille seul, ce serait l'inverse de l'intention.)
  return NOM_PARTICIPANT_INCONNU;
};
