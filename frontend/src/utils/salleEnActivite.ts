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
import { getSessionStatus } from './courseSessionStatus';

/**
 * Une séance telle qu'elle SORT DE FIRESTORE, et non telle que `SessionLike` la décrit.
 *
 * 🔴 LA DIFFÉRENCE EST LA CAUSE D'UN DÉFAUT LIVRÉ ET CORRIGÉ LE 07/11/2026.
 * `SessionLike.date` est un `string` "YYYY-MM-DD" — mais c'est une forme **dérivée**, pas la
 * forme stockée : en production, `courses.date` est un **Timestamp Firestore** (mesuré sur les
 * 3 documents de prod, tous Timestamp). Tous les écrans convertissent avant d'appeler
 * `getSessionStatus` (`CoursesList.tsx`'s `convertFirestoreDate` + `toDateStr`,
 * `CourseDetail.tsx`, `ClientCourseSession.tsx`) ; le premier voyant, lui, interrogeait
 * `where('date','==','2026-11-07')` — une **égalité de chaîne contre un Timestamp**, qui ne
 * peut par construction rien trouver.
 *
 * ⚠️ **Et la conséquence était pire que l'absence de voyant** : il affichait « aucune activité
 * détectée » pendant qu'une séance tournait, **sans rien signaler**. Or c'est sur sa foi qu'on
 * déploie les règles. Un instrument qui se trompe dans le sens rassurant est un piège, pas une
 * approximation.
 *
 * ⚠️ **Ce que ça coûte en doctrine** : le type d'une interface ne dit pas la forme stockée.
 * `SessionLike` décrit ce que `getSessionStatus` CONSOMME, après conversion par l'appelant —
 * et `CLAUDE.md` l'énonçait comme la forme du champ. Devant un champ de date, **mesurer la
 * production** plutôt que lire un type.
 */
export interface SeanceVoyant {
  id: string;
  name?: string;
  /** La valeur brute : Timestamp, `{seconds}`, `Date`, ou chaîne. Normalisée ci-dessous. */
  date: unknown;
  activatedAt?: string;
  archivedAt?: string;
}

/**
 * Rend le jour d'une séance au format "YYYY-MM-DD", quelle que soit la forme stockée, ou
 * `null` si elle est illisible.
 *
 * ⚠️ **LA CONVERSION SUIT CELLE QUE LES AUTRES ÉCRANS FONT DÉJÀ** — `toISOString().slice(0,10)`,
 * donc le jour **UTC** et non le jour local. Ce n'est pas un choix : `CoursesList.tsx`,
 * `CourseDetail.tsx` et `ClientCourseSession.tsx` le font tous ainsi, et un voyant qui
 * déciderait du jour autrement serait en désaccord avec l'écran du moniteur sur la date d'une
 * même séance. Une seconde convention de date est une divergence, pas une amélioration.
 */
export const normaliserDateSeance = (valeur: unknown): string | null => {
  if (valeur === null || valeur === undefined) return null;
  // Un Timestamp Firestore (forme réelle en production) ou tout objet qui porte `toDate`.
  if (typeof valeur === 'object' && 'toDate' in valeur
    && typeof (valeur as { toDate: unknown }).toDate === 'function') {
    const d = (valeur as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (valeur instanceof Date) {
    return Number.isNaN(valeur.getTime()) ? null : valeur.toISOString().slice(0, 10);
  }
  // Un Timestamp sérialisé (lu depuis un cache, ou passé par JSON).
  if (typeof valeur === 'object' && typeof (valeur as { seconds?: unknown }).seconds === 'number') {
    const d = new Date((valeur as { seconds: number }).seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof valeur === 'string') {
    // Déjà au bon format : rendu tel quel, sans aller-retour par Date — un "2026-11-07" parsé
    // puis réémis en UTC reste identique, mais ne pas y toucher évite la question.
    if (/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return valeur;
    const d = new Date(valeur);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
};

export type NiveauActivite = 'seance' | 'activite' | 'calme';

export interface VoyantSalle {
  niveau: NiveauActivite;
  /** Les séances réellement actives, après dérivation du statut. */
  seancesActives: SeanceVoyant[];
  /** Combien de séances ont été EXAMINÉES — le dénominateur du voyant. */
  seancesExaminees: number;
  /**
   * Les séances dont la date est illisible. ⚠️ Comptées et affichées, jamais écartées en
   * silence : une séance qu'on ne sait pas dater est précisément celle qui pourrait être
   * active sans qu'on le voie.
   */
  seancesIllisibles: SeanceVoyant[];
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
  //
  // 🔴 Et la date est NORMALISÉE d'abord : `getSessionStatus` fait `date.split('-')`, donc un
  // Timestamp — la forme réelle en production — le ferait LEVER. Une séance dont la date est
  // illisible est comptée à part plutôt qu'écartée en silence.
  const seancesLisibles: { seance: SeanceVoyant; jour: string }[] = [];
  const seancesIllisibles: SeanceVoyant[] = [];
  for (const s of seances) {
    const jour = normaliserDateSeance(s.date);
    if (jour === null) seancesIllisibles.push(s);
    else seancesLisibles.push({ seance: s, jour });
  }
  const seancesActives = seancesLisibles
    .filter(({ seance, jour }) => getSessionStatus(
      { date: jour, activatedAt: seance.activatedAt, archivedAt: seance.archivedAt },
      maintenant
    ) === 'active')
    .map(({ seance }) => seance);

  const minutesDerniereValidation = derniereValidationMs === null
    ? null
    : Math.max(0, Math.floor((maintenant.getTime() - derniereValidationMs) / 60_000));

  const recent = minutesDerniereValidation !== null && minutesDerniereValidation <= fenetreMinutes;

  // ⚠️ La portée ANNONCE SON DÉNOMINATEUR : combien de séances ont été regardées, et combien
  // n'ont pas pu être datées. Le premier voyant disait « mesuré sur les séances du jour » alors
  // que sa requête n'en trouvait aucune — une portée qui décrit l'intention, pas la mesure.
  const portee = `Mesuré sur ${seances.length} séance(s) examinée(s) et sur la dernière `
    + 'validation enregistrée. Un grimpeur qui consulte sans rien valider est invisible : '
    + '« calme » ne prouve pas que personne n\'utilise l\'application.'
    + (seancesIllisibles.length > 0
      ? ` ⚠️ ${seancesIllisibles.length} séance(s) à la date illisible n'ont pas pu être évaluées.`
      : '');

  if (seancesActives.length > 0) {
    const n = seancesActives.length;
    return {
      niveau: 'seance',
      seancesActives,
      seancesExaminees: seances.length,
      seancesIllisibles,
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
      seancesExaminees: seances.length,
      seancesIllisibles,
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
    seancesExaminees: seances.length,
    seancesIllisibles,
    minutesDerniereValidation,
    titre: minutesDerniereValidation === null
      ? 'Aucune activité détectée'
      : `Aucune activité détectée — dernière validation il y a ${minutesDerniereValidation} min`,
    consigne: 'Aucun risque connu : c\'est le moment pour un déploiement des règles '
      + 'Firestore ou une modification de données.',
    portee,
  };
};
