import { ageBands, openCategoryLabel, unknownCategoryLabel, type AgeBand } from '../config/gymConfig';

// Réexports conservés tels quels (nom historique "FFME") pour ne pas casser les
// nombreux imports existants — la donnée elle-même vit maintenant dans gymConfig.ts.
export type FfmeAgeBand = AgeBand;
export const OPEN_CATEGORY = openCategoryLabel;
export const UNKNOWN_CATEGORY = unknownCategoryLabel;
export const FFME_AGE_BANDS: FfmeAgeBand[] = ageBands;

// Âge atteint au 31 décembre de l'année de `referenceDate`, calculé depuis une date de
// naissance (format ISO "YYYY-MM-DD"). Repli sur `legacyAge` (nombre saisi manuellement,
// non lié à une date) si aucune date de naissance n'est renseignée — comportement non
// régressif pour les comptes existants tant qu'ils n'ont pas de date de naissance.
export const getSeasonAge = (
  dateOfBirth?: string,
  legacyAge?: number,
  referenceDate: Date = new Date()
): number | undefined => {
  if (dateOfBirth) {
    // Extraction directe de l'année plutôt que new Date(dateOfBirth).getFullYear(),
    // pour éviter un décalage d'un jour près du 1er janvier selon le fuseau horaire.
    const birthYear = parseInt(dateOfBirth.slice(0, 4), 10);
    if (!Number.isNaN(birthYear)) {
      return referenceDate.getFullYear() - birthYear;
    }
  }
  return legacyAge;
};

export const getFfmeCategory = (seasonAge?: number): string => {
  if (seasonAge === undefined || seasonAge === null || Number.isNaN(seasonAge)) {
    return UNKNOWN_CATEGORY;
  }
  const band = FFME_AGE_BANDS.find(
    (b) => seasonAge >= b.minAge && (b.maxAge === undefined || seasonAge <= b.maxAge)
  );
  return band?.label ?? UNKNOWN_CATEGORY;
};

// ─── DEUX ÂGES, UNE SEULE DATE STOCKÉE ───────────────────────────────────────────────────
//
// `getSeasonAge` ci-dessus rend l'âge **de saison** (année de référence − année de naissance,
// convention FFME « âge atteint au 31 décembre ») : c'est la grandeur qui DÉCIDE — catégorie
// d'âge, classements par catégorie, compétitions, seuils de missions. Elle doit rester
// insensible au jour et au mois, sinon un grimpeur changerait de catégorie au milieu d'une
// saison.
//
// `getCivilAge` ci-dessous rend l'âge **civil**, celui qu'un humain entend quand il lit
// « Âge » : 50 ans jusqu'à la veille de son anniversaire, 51 le jour même. Il ne décide de
// RIEN, il n'est QUE de l'affichage.
//
// ⚠️ Les deux vivent dans ce fichier exprès. La règle à tenir n'est pas « un seul point de
// dérivation » — il y en a deux, légitimement — mais : **aucun appelant qui dérive une
// catégorie, un classement ou un seuil ne doit appeler `getCivilAge`.** L'inverse est permis
// (un écran peut afficher la catégorie), parce qu'afficher ne décide rien. Le jour où un
// appelant hésite, la question qui tranche est celle de CLAUDE.md : *ce nombre sera-t-il
// annoncé à quelqu'un ?* — s'il est seulement lu, c'est l'âge civil ; s'il sert à ranger
// quelqu'un dans une catégorie, c'est l'âge de saison.
//
// ⚠️ Pas de repli sur `legacyAge`, contrairement à `getSeasonAge` : le champ hérité `age` est
// un nombre figé à la saisie, sans date rattachée — il est donc *impossible* d'en dériver un
// âge civil, et en rendre un serait affirmer une précision qu'on n'a pas. `undefined` est la
// réponse juste pour les comptes hérités, et c'est à l'écran de dire « date de naissance
// inconnue » plutôt que d'afficher un nombre inventé.

/**
 * Âge civil (révolu) à la date de référence, dérivé d'une date de naissance ISO
 * « YYYY-MM-DD ». Rend `undefined` si la date est absente ou illisible.
 *
 * Une date de naissance dans le futur rend volontairement un nombre **négatif** plutôt que
 * `undefined` : une saisie fautive doit se voir à l'écran (« -4 ans »), alors qu'un
 * `undefined` serait rendu « N/A » par les appelants et confondu avec une date absente.
 */
export const getCivilAge = (
  dateOfBirth?: string,
  referenceDate: Date = new Date()
): number | undefined => {
  if (!dateOfBirth) return undefined;

  // Découpage par parties, jamais `new Date(dateOfBirth)` : une chaîne « YYYY-MM-DD » est
  // interprétée en UTC par le constructeur, donc décalée d'un jour pour tout fuseau à l'ouest
  // de Greenwich — un anniversaire tomberait la veille. Même raison que dans `getSeasonAge`.
  const parts = dateOfBirth.slice(0, 10).split('-');
  if (parts.length !== 3) return undefined;
  const [annee, mois, jour] = parts.map((p) => parseInt(p, 10));
  if (Number.isNaN(annee) || Number.isNaN(mois) || Number.isNaN(jour)) return undefined;

  // La date de référence est lue en heure LOCALE (getMonth/getDate), pour que « aujourd'hui »
  // soit le aujourd'hui du grimpeur et non celui d'UTC.
  let age = referenceDate.getFullYear() - annee;
  const moisRef = referenceDate.getMonth() + 1; // getMonth() est 0-indexé
  const jourRef = referenceDate.getDate();
  // Anniversaire pas encore atteint cette année → une année de moins. L'égalité stricte
  // compte l'anniversaire du jour comme ATTEINT (on a 51 ans le jour de ses 51 ans).
  if (moisRef < mois || (moisRef === mois && jourRef < jour)) {
    age -= 1;
  }
  return age;
};

// ⚠️ Libellé court de la même bande que `getFfmeCategory`, pour un affichage où le libellé
// complet ferait doublon avec le nombre qu'on vient d'écrire. Jamais stocké : rien ne doit
// jamais écrire `shortLabel` dans un document, puisque c'est `label` que relisent
// `ClientClassement.tsx` et les palmarès gelés.
export const getFfmeCategoryShort = (seasonAge?: number): string => {
  if (seasonAge === undefined || seasonAge === null || Number.isNaN(seasonAge)) {
    return UNKNOWN_CATEGORY;
  }
  const band = FFME_AGE_BANDS.find(
    (b) => seasonAge >= b.minAge && (b.maxAge === undefined || seasonAge <= b.maxAge)
  );
  return band?.shortLabel ?? UNKNOWN_CATEGORY;
};

/** Ce qu'on affiche quand aucun âge n'est dérivable, ni par date ni par le champ hérité. */
export const AGE_INCONNU = 'Date de naissance inconnue';

/**
 * La chaîne d'âge telle qu'elle s'affiche à un humain : **l'âge civil**, suivi de la
 * **catégorie** que produit l'âge de saison.
 *
 * ─── POURQUOI UNE FONCTION PARTAGÉE, ET POURQUOI DEUX GRANDEURS DANS UNE CHAÎNE ─────────
 *
 * Quatre écrans affichaient `getSeasonAge(...) ?? 'N/A'` sous une colonne intitulée « Âge ».
 * Le nombre était juste pour la FFME et faux comme âge civil pour quiconque n'a pas encore
 * eu son anniversaire — c'est-à-dire pour la moitié de la salle à tout instant, et c'est
 * sous cette forme que le défaut a été rapporté (« l'appli m'annonce 51 ans en novembre »).
 *
 * La correction n'étiquette pas les deux nombres, elle en **supprime un** : l'âge de saison
 * n'est plus affiché nulle part, il redevient un intermédiaire interne. Ce qu'un admin a
 * besoin de lire, ce n'est pas « 51 », c'est la **catégorie** — la seule chose que l'âge de
 * saison serve à produire. Deux nombres côte à côte auraient demandé de lire une étiquette
 * pour savoir lequel compte ; une catégorie ne se confond avec aucun âge.
 *
 * ⚠️ Composée ici, pas en ligne dans les `.tsx` : la couverture de tests de ce dépôt s'arrête
 * au bord des composants (pas de harnais React), donc une chaîne composée dans un `.tsx` est
 * structurellement invisible — et quatre écrans qui la recomposeraient chacun divergeraient.
 */
export const formatAgeDisplay = (
  dateOfBirth?: string,
  legacyAge?: number,
  referenceDate: Date = new Date()
): string => {
  const civil = getCivilAge(dateOfBirth, referenceDate);
  const saison = getSeasonAge(dateOfBirth, legacyAge, referenceDate);
  const categorie = getFfmeCategoryShort(saison);

  if (civil !== undefined) return `${civil} ans · ${categorie}`;

  // Compte hérité : un nombre figé sans date rattachée (champ `age`, plus jamais écrit). On
  // affiche ce qu'on a en DISANT ce qui manque et en marquant le nombre comme saisi — il
  // vieillit mal par construction, et le présenter comme un âge courant serait un mensonge.
  // La catégorie, elle, reste affichée : elle est correctement dérivée pour ces comptes, et
  // l'omettre leur retirerait l'information utile sans raison.
  if (saison !== undefined) return `Date inconnue · ${saison} ans (saisi) · ${categorie}`;

  return AGE_INCONNU;
};

/** Ce qu'on dit au grimpeur dont la date de naissance manque — une invitation, pas un reproche. */
export const AGE_HELPER_SANS_DATE =
  'Renseignez votre date de naissance pour apparaître dans les classements par catégorie d\'âge.';

/**
 * La même information que `formatAgeDisplay`, mais pour le grimpeur lui-même, sous son champ
 * « Date de naissance » — avec le mot « catégorie » et la règle qui la produit.
 *
 * ⚠️ C'est le SEUL endroit de l'application où la règle de l'année est expliquée à un
 * grimpeur, et c'est le bon : juste sous le champ qu'il vient de remplir. Ailleurs elle ne
 * peut qu'être subie — c'est précisément d'avoir lu « 51 ans » trois semaines avant son
 * anniversaire, sans explication possible à l'écran, qu'est né ce chantier.
 *
 * ⚠️ Pas de repli `legacyAge` ici, et volontairement : `ClientProfile.tsx` ne lit pas ce
 * champ hérité, et pour un grimpeur dont la date manque, la réponse utile n'est pas un
 * nombre figé — c'est l'invitation à saisir sa date.
 */
export const formatAgeHelper = (
  dateOfBirth?: string,
  referenceDate: Date = new Date()
): string => {
  const civil = getCivilAge(dateOfBirth, referenceDate);
  if (civil === undefined) return AGE_HELPER_SANS_DATE;
  const categorie = getFfmeCategoryShort(getSeasonAge(dateOfBirth, undefined, referenceDate));
  return `${civil} ans · catégorie ${categorie} — la catégorie se calcule sur l'année de `
    + 'naissance, pas sur le jour de l\'anniversaire.';
};
