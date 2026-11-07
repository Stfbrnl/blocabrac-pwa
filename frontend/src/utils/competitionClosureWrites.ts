import {
  collection, query, where, getDocs, writeBatch, doc, deleteField,
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { decouperEnLots } from './firestoreBatchChunks';
import { planifierCloture, type BlocClotureInput, type PlanCloture } from './competitionClosure';

// LES ÉCRITURES DE « TERMINER LA COMPÉTITION », à un seul endroit.
//
// Pendant du module pur `competitionClosure.ts` : celui-là décide QUI est touché, celui-ci
// écrit. Même séparation que `firstAscents.ts` / `firstAscentWrites.ts`.
//
// DEUX APPELANTS, et c'est la raison d'être du module : le bouton de l'ouvreur
// (`CompetitionBouldersList.tsx`) et le couplage au changement de statut côté admin
// (`AdminCompetitionManagement.tsx`). ⚠️ **Tout nouveau chemin de clôture doit passer par ici** —
// le recopier ferait divergent le contrat d'un geste irréversible.

/** Ce que `chargerBlocsRattaches` rend par défaut : les champs de décision, plus le reste du document. */
export type BlocRattache = BlocClotureInput & Record<string, unknown>;

/**
 * TOUS les blocs rattachés à une compétition, ACTIFS OU NON.
 *
 * 🔴 LE DÉFAUT QUE CETTE FONCTION FERME (mesuré en prod le 06/11/2026). L'écran de l'ouvreur
 * filtre sur `is_active === true` avant de poser son état — ce qui est juste pour un ÉCRAN : un
 * ouvreur n'a rien à faire d'un bloc retiré du mur dans sa liste. Mais c'est cet état que
 * « Terminer la compétition » parcourait. **Un bloc désactivé pendant qu'il était rattaché
 * était donc invisible à l'écran ET sauté par la clôture** : il gardait `competition_active:
 * true` pour toujours, et plus aucune interface ne pouvait l'atteindre. Constaté sur le Contest
 * du 5 novembre, bloc n°7 du Dévers 40°.
 *
 * ⚠️ LA LEÇON, plus large que ce bouton : **un filtre d'AFFICHAGE ne doit jamais devenir le
 * périmètre d'une OPÉRATION DE DONNÉE.** L'écran décide de ce qu'on montre, la clôture décide
 * de ce qui est vrai.
 *
 * ⚠️ ET ON RELIT À L'INSTANT DE L'ÉCRITURE, jamais une copie en mémoire — même doctrine que
 * `firstAscentWrites.ts`. Deux raisons : l'état d'affichage est filtré (c'est le défaut
 * ci-dessus), et il peut être périmé si un collègue a saisi des blocs entre-temps, ce qui est
 * le cas NORMAL dans cette salle (la saisie se fait par vagues).
 *
 * Les deux requêtes restent séparées plutôt qu'un `type in [...]` : les blocs créés pour
 * l'épreuve s'identifient par leur seul `type`, les blocs quotidiens réutilisés par
 * `competition_active: true` — sans ce champ dédié, un ancien bloc de compétition devenu
 * `daily` après une clôture précédente reviendrait à tort, puisqu'il garde son
 * `competition_id` pour les statistiques.
 */
export const chargerBlocsRattaches = async <T extends BlocClotureInput = BlocRattache>(
  competitionId: string,
): Promise<T[]> => {
  const [classicSnapshot, reusedSnapshot] = await Promise.all([
    getDocs(query(
      collection(db, 'boulders'),
      where('competition_id', '==', competitionId),
      where('type', '==', 'competition'),
    )),
    getDocs(query(
      collection(db, 'boulders'),
      where('competition_id', '==', competitionId),
      where('type', '==', 'daily'),
      where('competition_active', '==', true),
    )),
  ]);
  return [...classicSnapshot.docs, ...reusedSnapshot.docs]
    .map((d) => ({ id: d.id, ...d.data() })) as T[];
};

/**
 * Échec d'une clôture, PORTEUR DU NOMBRE DE LOTS DÉJÀ COMMITÉS.
 *
 * ⚠️ `lotsFaits` n'est pas un détail de journalisation : le découpage en lots échange « rien
 * n'est écrit » contre « peut-être une partie », et le message affiché doit le DIRE. Un message
 * qui affirme « aucun bloc n'a été modifié » est vrai avec un lot et FAUX avec deux — et un
 * message faux sur un geste qui règle des points est pire que pas de message, puisque
 * l'utilisateur se fie alors à une salle qu'il croit intacte.
 */
export class ErreurCloture extends Error {
  constructor(public readonly lotsFaits: number, public readonly causeReelle: unknown) {
    super('La clôture des blocs a échoué.');
    this.name = 'ErreurCloture';
  }
}

export interface ResultatCloture {
  plan: PlanCloture;
  /** Combien de lots ont été commités. 1 = le geste a été atomique. */
  lotsFaits: number;
}

/**
 * Charge les blocs rattachés, calcule le plan, puis l'applique.
 *
 * ⚠️ À la fin d'une compétition, les blocs créés pour l'épreuve deviennent des blocs quotidiens,
 * leur cotation interne (jusque-là cachée) servant de point de départ à recoter. Les blocs
 * quotidiens réutilisés redeviennent simplement de purs blocs quotidiens : seul
 * `competition_active` est retiré, sans toucher à leur cotation publique. `competition_id` est
 * volontairement CONSERVÉ dans les deux cas — les pages de résultats et de classement
 * reconstruisent une compétition en interrogeant ce champ SEUL, sans filtre de type, et doivent
 * pouvoir le faire pour une épreuve terminée.
 *
 * ⚠️ `points_multiplier` est VOLONTAIREMENT ABSENT des deux écritures, et cette absence est un
 * contrat (`test/contrats/pointsMultiplier.test.ts`) : `competition_results` ne stocke QUE des
 * faits bruts et jamais de points — les points sont recalculés à chaque affichage depuis le
 * bloc et le mode. Effacer le multiplicateur ici rendrait donc au simple, POUR TOUJOURS, les
 * blocs doublés d'une épreuve terminée : l'histoire changerait après coup. Le champ appartient
 * au groupe de `competition_id` (conservé pour l'historique), pas à celui de `points_value`
 * (effacé). La remise à zéro vit au RATTACHEMENT, ce qui ferme le défaut inverse — l'héritage
 * du ×2 par une compétition future.
 *
 * ⚠️ DÉCOUPÉ EN LOTS : ce geste écrit une opération par bloc de l'épreuve. Avec toute la salle
 * engagée, un lot unique dépasserait 500, `commit()` lèverait et RIEN ne serait écrit — à
 * chaque tentative, le soir du contest, laissant tous les blocs `competition_active` et la
 * cotation cachée invisible. Sous le seuil, `decouperEnLots` rend UN lot : le geste est
 * inchangé, atomicité comprise.
 */
export const executerCloture = async (competitionId: string): Promise<ResultatCloture> => {
  const blocs = await chargerBlocsRattaches(competitionId);
  const plan = planifierCloture(blocs);

  // Une opération par bloc à toucher, construite AVANT le découpage : les blocs refusés n'en
  // produisent aucune, donc ils ne consomment pas de place dans un lot et ne peuvent pas être
  // écrits par distraction.
  const operations: Array<{ id: string; data: Record<string, unknown> }> = [
    ...plan.aDetacher.map((id) => ({
      id,
      // La valeur en points ne vaut que pour cette compétition : elle repart avec elle.
      data: { competition_active: deleteField(), points_value: deleteField() },
    })),
    ...plan.aMigrer.map(({ id, color }) => ({
      id,
      // Ce bloc devient un bloc quotidien ordinaire : s'il est un jour réutilisé dans une
      // future compétition en mode « Blocs validés », sa valeur en points doit être ressaisie
      // pour cette nouvelle épreuve, jamais héritée d'une épreuve déjà terminée.
      data: { type: 'daily', color, points_value: deleteField() },
    })),
  ];

  let lotsFaits = 0;
  try {
    for (const lot of decouperEnLots(operations)) {
      const batch = writeBatch(db);
      lot.forEach(({ id, data }) => batch.update(doc(db, 'boulders', id), data));
      await batch.commit();
      lotsFaits += 1;
    }
  } catch (error: unknown) {
    throw new ErreurCloture(lotsFaits, error);
  }

  return { plan, lotsFaits };
};
