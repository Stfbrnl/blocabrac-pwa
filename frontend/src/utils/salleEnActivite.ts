/**
 * Le voyant « la salle est-elle en train de s'en servir ? » — composé dans une fonction pure.
 *
 * ─── POURQUOI CE VOYANT PLUTÔT QU'UN PRÉAVIS (07/11/2026) ───────────────────────────────
 *
 * Le besoin réel n'est pas d'avertir tout le monde tout le temps, c'est de **savoir si
 * quelqu'un est en train de s'en servir** avant de toucher à quelque chose. Et les trois
 * sortes de modification n'ont pas du tout le même rayon :
 *
 *   - **déploiement du code** (`--only hosting`) : l'onglet ouvert garde son ancien bundle,
 *     l'écran courant n'est pas touché ; seule une navigation vers un écran chargé à la
 *     demande peut échouer (voir `preloadErrorGuard.ts`). Presque inoffensif ;
 *   - **déploiement des règles** (`--only firestore:rules`) : **immédiat, côté serveur, sur
 *     TOUS les clients, ancien bundle compris.** Si une règle nouvelle exige un champ que
 *     l'ancien bundle n'écrit pas, toutes les écritures des clients non mis à jour échouent,
 *     sans message explicite. **C'est la modification silencieuse** ;
 *   - **changement de données en admin** : immédiat, par `onSnapshot` ou à la lecture
 *     suivante. Désactiver un bloc ou retirer une mini-compétition, la séance en cours le voit.
 *
 * ⚠️ **D'où le libellé PAR SA CONSÉQUENCE, et non par son état** : « 1 séance en cours — ne
 * pas déployer les règles » vaut mieux que « séances actives : 1 ». Celui qui lit le voyant
 * cherche une décision, pas un nombre.
 *
 * ⚠️ **Et ce voyant ne prouve jamais que personne ne s'en sert** : il ne voit que les séances
 * du jour et la dernière validation connue. Un grimpeur seul qui consulte sans rien valider
 * est invisible. C'est pourquoi l'état calme s'énonce « aucune activité détectée », jamais
 * « personne n'utilise l'application » — **annoncer son dénominateur** plutôt que laisser
 * croire à une couverture qu'on n'a pas.
 */
import { getSessionStatus, type SessionLike } from './courseSessionStatus';

export interface SeanceVoyant extends SessionLike {
  id: string;
  name?: string;
}

export type NiveauActivite = 'seance' | 'activite' | 'calme';

export interface VoyantSalle {
  niveau: NiveauActivite;
  /** Les séances réellement actives, après dérivation du statut. */
  seancesActives: SeanceVoyant[];
  /** Minutes depuis la dernière validation connue, ou `null` si aucune. */
  minutesDerniereValidation: number | null;
  /** Ce qui se passe, en une ligne. */
  titre: string;
  /** Ce qu'il faut en faire, en une ligne. C'est elle qui porte la valeur du voyant. */
  consigne: string;
  /** Ce que le voyant a REGARDÉ — pour qu'on ne lui prête pas une portée qu'il n'a pas. */
  portee: string;
}

/**
 * ⚠️ 30 minutes : au-delà, « quelqu'un vient de valider » ne renseigne plus sur l'instant
 * présent. En dessous d'une dizaine de minutes, le voyant s'éteindrait entre deux blocs d'un
 * même grimpeur — la grandeur qu'on veut suivre est la présence dans la salle, pas la cadence.
 */
export const FENETRE_ACTIVITE_MINUTES = 30;

export const evaluerActiviteSalle = (
  seances: SeanceVoyant[],
  derniereValidationMs: number | null,
  maintenant: Date = new Date(),
  fenetreMinutes: number = FENETRE_ACTIVITE_MINUTES
): VoyantSalle => {
  // ⚠️ Le statut est DÉRIVÉ par `getSessionStatus`, jamais relu d'un champ : c'est le même
  // point de dérivation que le reste de l'application (archivage automatique à minuit du
  // lendemain compris). Une seconde implémentation ici divergerait le jour où la règle change.
  const seancesActives = seances.filter((s) => getSessionStatus(s, maintenant) === 'active');

  const minutesDerniereValidation = derniereValidationMs === null
    ? null
    : Math.max(0, Math.floor((maintenant.getTime() - derniereValidationMs) / 60_000));

  const recent = minutesDerniereValidation !== null && minutesDerniereValidation <= fenetreMinutes;

  const portee = 'Mesuré sur les séances dont la date est aujourd\'hui et sur la dernière '
    + 'validation enregistrée. Un grimpeur qui consulte sans rien valider est invisible : '
    + '« calme » ne prouve pas que personne n\'utilise l\'application.';

  if (seancesActives.length > 0) {
    const n = seancesActives.length;
    return {
      niveau: 'seance',
      seancesActives,
      minutesDerniereValidation,
      titre: `${n} séance${n > 1 ? 's' : ''} en cours`,
      consigne: 'Ne pas déployer les règles Firestore et ne pas modifier les données '
        + '(blocs, séances, mini-compétitions) maintenant. Un déploiement du code seul '
        + '(--only hosting) est presque inoffensif.',
      portee,
    };
  }

  if (recent) {
    return {
      niveau: 'activite',
      seancesActives,
      minutesDerniereValidation,
      titre: `Quelqu'un grimpe — dernière validation il y a ${minutesDerniereValidation} min`,
      consigne: 'Aucune séance encadrée, mais la salle est utilisée : repousser un '
        + 'déploiement des règles Firestore. Le code seul passe.',
      portee,
    };
  }

  return {
    niveau: 'calme',
    seancesActives,
    minutesDerniereValidation,
    titre: minutesDerniereValidation === null
      ? 'Aucune activité détectée'
      : `Aucune activité détectée — dernière validation il y a ${minutesDerniereValidation} min`,
    consigne: 'Aucun risque connu : c\'est le moment pour un déploiement des règles '
      + 'Firestore ou une modification de données.',
    portee,
  };
};
