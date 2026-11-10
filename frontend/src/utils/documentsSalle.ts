/**
 * Le catalogue des documents de la salle, et la jointure avec leur estampille.
 *
 * ⚠️ POURQUOI CE N'EST PAS ÉCRIT EN LIGNE DANS L'ÉCRAN — la couverture de tests de ce dépôt
 * s'arrête au bord des composants (pas de harnais React) : ce qui y est composé en ligne est
 * structurellement invisible. Or ce module porte précisément la jointure qui peut mentir (un
 * document listé dont l'estampille vient d'ailleurs que de sa génération), donc il doit être
 * testable.
 *
 * ⚠️ ET L'ESTAMPILLE N'EST PAS DANS CE FICHIER : elle est lue dans `src/data/documentsStamp.json`,
 * que les trois générateurs écrivent au moment où ils produisent le PDF (voir
 * `frontend/scripts/topo-stamp.cjs`). La recopier ici serait reproduire à l'identique le défaut
 * du 03/11/2026 — deux topos annonçant V2.71.2 et V2.55 pendant que la production tournait en
 * V2.77 — puisqu'une transcription littérale ne bouge pas quand la donnée bouge.
 */
import registre from '../data/documentsStamp.json';

/** Ce que le registre généré contient pour un document. */
export interface EstampilleDocument {
  /** « V2.80 », au format de `formattedAppVersion`. */
  version: string;
  /** « 7 novembre 2026 ». */
  genereLe: string;
}

/** Une entrée du catalogue, telle qu'elle est écrite ci-dessous à la main. */
export interface DocumentSalle {
  /** Nom du fichier dans `public/docs/`. C'est AUSSI la clé du registre d'estampilles. */
  fichier: string;
  titre: string;
  /** À quoi il sert, en une ligne. Un lien sans cette ligne ne se choisit pas. */
  aQuoiCaSert: string;
  /** Variante HTML servie à côté, quand elle existe : elle s'ouvre sans téléchargement. */
  variantHtml?: string;
  /**
   * Raison, en clair, pour laquelle ce document n'a pas d'estampille dérivable. Présente
   * UNIQUEMENT sur les documents sans générateur.
   *
   * ⚠️ On préfère dire « fabriqué à la main, pas d'estampille » plutôt que de ne rien dire :
   * l'absence d'estampille est elle-même l'information utile (ce document ne se régénère pas,
   * donc rien ne le remettra à jour tout seul).
   */
  sansEstampille?: string;
}

/** Le même, une fois joint à son estampille. */
export interface DocumentSalleAffiche extends DocumentSalle {
  /** L'URL publique, servie par Firebase Hosting depuis `public/docs/`. */
  url: string;
  /** L'URL de la variante HTML, si elle existe. */
  urlHtml: string | null;
  /** `null` quand le registre ne connaît pas ce document — jamais une valeur inventée. */
  estampille: EstampilleDocument | null;
}

/**
 * Le catalogue. ⚠️ **Tout ajout ici publie un document** : `public/docs/` est servi sans
 * authentification, et le sous-menu est un confort de navigation, pas une protection. Lire
 * `frontend/public/docs/README.md` avant d'y ajouter une ligne.
 */
export const DOCUMENTS_SALLE: DocumentSalle[] = [
  {
    fichier: 'topo-blocabrac.pdf',
    titre: 'Topo de la salle',
    aQuoiCaSert:
      "Le fonctionnement complet de l'application, écran par écran et rôle par rôle : "
      + 'blocs du jour, compétitions, classements, badges, niveaux.',
  },
  {
    fichier: 'topo-roulettes-defis.pdf',
    titre: 'Topo des roulettes et des défis',
    aQuoiCaSert:
      'Le catalogue des propositions de la Bloc Roulette, les familles de défis et les bornes '
      + "de niveau — la référence du staff quand un grimpeur demande d'où sort son tirage.",
  },
  {
    fichier: 'affiche-bareme-competition.pdf',
    titre: 'Affiche du barème de points',
    aQuoiCaSert:
      "À imprimer et afficher à l'accueil : la table des points par couleur et par nombre "
      + "d'essais, calculée par le code de l'application lui-même.",
    variantHtml: 'affiche-bareme-competition.html',
  },
  {
    fichier: 'diplome-vierge.pdf',
    titre: 'Diplôme vierge',
    aQuoiCaSert:
      "Le diplôme de la salle sans aucun champ rempli, à imprimer pour une remise sans passer "
      + "par l'application : titulaire, type, date et signataire restent à écrire à la main. "
      + 'Fond sombre — prévoir un stylo clair.',
  },
  {
    fichier: 'aide-connexion-installation.pdf',
    titre: "Guide de connexion et d'installation",
    aQuoiCaSert:
      "À donner à un nouveau grimpeur : créer son compte et installer l'application sur son "
      + 'téléphone, Android comme iPhone.',
    variantHtml: 'aide-connexion-installation.html',
    sansEstampille:
      'Fabriqué à la main en septembre 2026 : aucun script ne le régénère, il n’a donc pas '
      + 'd’estampille dérivable.',
  },
];

/** Le préfixe servi. Les documents vivent dans `public/docs/`, donc à l'adresse `/docs/…`. */
export const PREFIXE_DOCS = '/docs/';

/**
 * Joint le catalogue au registre d'estampilles généré.
 *
 * ⚠️ **Aucun repli sur une estampille absente** : la jointure rend `null`, et c'est à l'écran
 * de le dire. Inventer une version (celle de l'application courante, par exemple) ferait
 * afficher une estampille *plausible et fausse* — exactement la forme de défaut que le registre
 * existe pour empêcher. Un « estampille inconnue » se repère ; un faux numéro, jamais.
 */
export const listerDocumentsSalle = (
  catalogue: DocumentSalle[] = DOCUMENTS_SALLE,
  estampilles: Record<string, EstampilleDocument> = registre as Record<string, EstampilleDocument>
): DocumentSalleAffiche[] =>
  catalogue.map((doc) => {
    const brute = estampilles[doc.fichier];
    // Une entrée de registre tronquée (un seul des deux champs) ne vaut pas mieux qu'une
    // absence : on la traite comme absente plutôt que d'afficher la moitié d'une estampille.
    const estampille =
      brute && typeof brute.version === 'string' && brute.version !== ''
      && typeof brute.genereLe === 'string' && brute.genereLe !== ''
        ? { version: brute.version, genereLe: brute.genereLe }
        : null;
    return {
      ...doc,
      url: `${PREFIXE_DOCS}${doc.fichier}`,
      urlHtml: doc.variantHtml ? `${PREFIXE_DOCS}${doc.variantHtml}` : null,
      estampille,
    };
  });
