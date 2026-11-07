/**
 * Le RELEVÉ d'une mini-compétition : qui a fait quoi, élèves en lignes, blocs en colonnes.
 *
 * ─── UN RELEVÉ N'EST PAS UN CLASSEMENT (07/11/2026) ──────────────────────────────────────
 *
 * ⚠️ **Ce sont deux objets différents, et aucun ne se déduit de l'autre.** Le classement
 * (`miniCompetitionRanking.ts`) est un **résumé compétitif** : il dit qui a gagné. Le relevé
 * est un **état des lieux pédagogique** : il dit qui a buté sur quoi.
 *
 * Un classement ne dira jamais que Léa a buté trois fois sur le bleu de la dalle pendant que
 * le reste du groupe le flashait. C'est pourtant la seule information de la séance qui ait une
 * valeur pédagogique — et c'est ce manque, pas un défaut d'affichage, que ce module comble.
 *
 * ─── LES TROIS PIÈGES QU'IL ÉVITE ────────────────────────────────────────────────────────
 *
 * 🔴 ① **UN ÉLÈVE SANS AUCUNE VALIDATION DOIT APPARAÎTRE**, ligne vide. L'absence est une
 * information pédagogique. C'est pourquoi les lignes viennent des **participants de la
 * séance**, jamais d'un parcours des résultats : `userResults` de `StatsList.tsx` est construit
 * DEPUIS les résultats, donc un élève qui n'a rien validé n'y existe tout simplement pas, et
 * un `map` dessus l'aurait fait disparaître sans bruit.
 *
 * 🔴 ② **LA COULEUR AFFICHÉE EST CELLE FIGÉE À LA VALIDATION** (`result.boulderColor`), jamais
 * la couleur courante du bloc. C'est le défaut mesuré le 18/10/2026 — 80 points chez la
 * monitrice contre 900 chez l'élève, sur la même validation. Un écran neuf qui relirait la
 * couleur courante le ferait revenir, **dans l'écran même où il avait été corrigé**. La couleur
 * courante n'entre donc nulle part dans ce module : les blocs n'y apportent que leur
 * identité (mur, numéro), jamais leur cotation.
 *
 * ⚠️ ③ **LE TAUX DE RÉUSSITE ANNONCE SON DÉNOMINATEUR.** Un « 50 % » nu confond deux
 * situations opposées : « un seul a essayé, et il a échoué » et « la moitié du groupe a
 * échoué ». Le premier ne dit rien du bloc, le second dit qu'il était trop dur. D'où trois
 * nombres et non un pourcentage : réussis, tentés, et l'effectif.
 */

/** La forme minimale d'un résultat de `client_course_results`, filtré sur une mini-compétition. */
export interface ReleveResultatInput {
  userId: string;
  boulderId?: string;
  /** ⚠️ FIGÉE à la validation. Voir le piège ② en tête de fichier. */
  boulderColor?: string;
  attempts?: number;
  success?: boolean;
}

/** Un participant de la séance. C'est LUI qui fait exister une ligne, pas ses résultats. */
export interface ReleveParticipantInput {
  id: string;
  displayName: string;
  /** Désisté avant l'activation de la séance : signalé, mais présent. */
  desiste?: boolean;
}

/** Un bloc de la mini-compétition. ⚠️ Son `color` n'est VOLONTAIREMENT pas lu ici. */
export interface ReleveBlocInput {
  id: string;
  wall?: string;
  number?: number;
}

export interface ReleveCellule {
  /** `true` réussi, `false` tenté et échoué. */
  success: boolean;
  /** Nombre d'essais, `null` sur un échec (c'est un état légal). */
  attempts: number | null;
  /** La couleur FIGÉE à la validation, `null` si le résultat n'en portait pas. */
  couleurFigee: string | null;
}

export interface ReleveLigne {
  userId: string;
  displayName: string;
  desiste: boolean;
  /** Une entrée par colonne, dans le même ordre. `null` = rien d'enregistré. */
  cellules: (ReleveCellule | null)[];
  blocsReussis: number;
  blocsTentes: number;
}

export interface ReleveColonne {
  boulderId: string;
  /** « Dalle n°3 », ou le mur seul, ou l'identifiant en dernier recours. */
  etiquette: string;
  wall: string | null;
  number: number | null;
  /** ⚠️ Trois nombres, jamais un pourcentage nu — voir le piège ③. */
  reussis: number;
  tentes: number;
  /** Moyenne des essais des RÉUSSITES seulement, arrondie au dixième. `null` si aucune. */
  essaisMoyensReussites: number | null;
}

export interface Releve {
  lignes: ReleveLigne[];
  colonnes: ReleveColonne[];
  /** L'effectif, dénominateur de tous les taux. */
  effectif: number;
  /**
   * Le nombre de cellules renseignées. ⚠️ **À comparer au nombre de résultats fournis** :
   * c'est le contrôle qui attrape une validation perdue entre les deux représentations. Un
   * écart signifie qu'un résultat porte un `userId` hors de la séance ou un `boulderId` hors
   * de la mini-compétition — il est alors compté ci-dessous, jamais silencieusement ignoré.
   */
  cellulesRemplies: number;
  /** Résultats fournis qu'aucune cellule n'a pu accueillir, avec la raison. */
  resultatsHorsTableau: { resultat: ReleveResultatInput; raison: 'eleve-hors-seance' | 'bloc-hors-epreuve' }[];
}

/**
 * ⚠️ L'ordre des colonnes suit le CIRCUIT PHYSIQUE de la salle (`gymConfig.walls`) puis le
 * numéro, pas l'alphabet et surtout pas l'identifiant. C'est le même ordre que l'écran de
 * compétition du grimpeur, et pour la même raison : **les numéros sont attachés au MUR**, donc
 * un tri global par numéro entrelacerait les murs.
 *
 * Les comparateurs sont IMPORTÉS de `competitionBoulderGroups.ts`, pas réécrits : une seconde
 * implémentation de l'ordre des murs divergerait le jour où le circuit change.
 */
import { compareWalls, compareByNumber } from './competitionBoulderGroups';

const etiquetteDuBloc = (bloc: ReleveBlocInput): string => {
  const mur = bloc.wall?.trim();
  if (mur && typeof bloc.number === 'number') return `${mur} n°${bloc.number}`;
  if (mur) return mur;
  if (typeof bloc.number === 'number') return `n°${bloc.number}`;
  // Dernier recours : un bloc dont on n'a ni mur ni numéro doit rester IDENTIFIABLE, sinon
  // deux colonnes anonymes sont indiscernables l'une de l'autre.
  return `Bloc ${bloc.id.slice(0, 6)}`;
};

export const buildMiniCompetitionReleve = (
  participants: ReleveParticipantInput[],
  blocs: ReleveBlocInput[],
  resultats: ReleveResultatInput[]
): Releve => {
  // Les colonnes, dans l'ordre du circuit. On trie une copie : l'entrée n'est pas à nous.
  // `compareByNumber` exige un `number` non optionnel par son type, alors que son corps
  // traite déjà l'absence (`a.number || 0`). On normalise donc à l'appel plutôt que de
  // réécrire la comparaison : un bloc sans numéro passe en tête de son mur, exactement comme
  // sur l'écran de compétition.
  const pourTri = (b: ReleveBlocInput) => ({ id: b.id, wall: b.wall || '', number: b.number ?? 0 });
  const colonnesTriees = [...blocs].sort((a, b) => {
    const parMur = compareWalls(a.wall || '', b.wall || '');
    return parMur !== 0 ? parMur : compareByNumber(pourTri(a), pourTri(b));
  });
  const indexColonne = new Map(colonnesTriees.map((b, i) => [b.id, i]));
  const idsParticipants = new Set(participants.map((p) => p.id));

  // Les cellules, remplies depuis les RÉSULTATS mais dans une grille dimensionnée par les
  // participants et les blocs — l'inverse ferait disparaître les lignes et colonnes vides.
  const cellules = new Map<string, ReleveCellule>();
  const resultatsHorsTableau: Releve['resultatsHorsTableau'] = [];
  for (const r of resultats) {
    if (!idsParticipants.has(r.userId)) {
      resultatsHorsTableau.push({ resultat: r, raison: 'eleve-hors-seance' });
      continue;
    }
    if (!r.boulderId || !indexColonne.has(r.boulderId)) {
      resultatsHorsTableau.push({ resultat: r, raison: 'bloc-hors-epreuve' });
      continue;
    }
    cellules.set(`${r.userId}\u0000${r.boulderId}`, {
      success: r.success === true,
      // ⚠️ Pas de valeur par défaut à 1 : « réussi sans nombre d'essais saisi » est un état
      // réel de la saisie, et l'afficher comme « 1 essai » serait inventer un flash.
      attempts: typeof r.attempts === 'number' ? r.attempts : null,
      // ⚠️ La couleur FIGÉE, telle quelle. Voir le piège ② en tête de fichier.
      couleurFigee: r.boulderColor ?? null,
    });
  }

  const lignes: ReleveLigne[] = participants.map((p) => {
    const mesCellules = colonnesTriees.map(
      (b) => cellules.get(`${p.id}\u0000${b.id}`) ?? null
    );
    return {
      userId: p.id,
      displayName: p.displayName,
      desiste: p.desiste === true,
      cellules: mesCellules,
      blocsReussis: mesCellules.filter((c) => c?.success === true).length,
      blocsTentes: mesCellules.filter((c) => c !== null).length,
    };
  });

  const colonnes: ReleveColonne[] = colonnesTriees.map((b, i) => {
    const colonne = lignes.map((l) => l.cellules[i]);
    const reussites = colonne.filter((c): c is ReleveCellule => c?.success === true);
    const essais = reussites
      .map((c) => c.attempts)
      .filter((n): n is number => typeof n === 'number');
    return {
      boulderId: b.id,
      etiquette: etiquetteDuBloc(b),
      wall: b.wall?.trim() || null,
      number: typeof b.number === 'number' ? b.number : null,
      reussis: reussites.length,
      tentes: colonne.filter((c) => c !== null).length,
      essaisMoyensReussites: essais.length === 0
        ? null
        : Math.round((essais.reduce((t, n) => t + n, 0) / essais.length) * 10) / 10,
    };
  });

  return {
    lignes,
    colonnes,
    effectif: participants.length,
    cellulesRemplies: cellules.size,
    resultatsHorsTableau,
  };
};
