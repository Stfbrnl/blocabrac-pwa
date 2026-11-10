/**
 * Le gabarit du diplôme, composé UNE fois pour TROIS lecteurs.
 *
 * ─── POURQUOI CE MODULE EXISTE (10/11/2026) ───────────────────────────────────────────────
 *
 * Le diplôme était composé **impérativement, deux fois**, dans `Moniteur/Stats/StatsList.tsx`
 * (celui qui le décerne) et dans `Client/Stats/ClientStats.tsx` (celui qui le télécharge) :
 * une centaine de lignes de `document.createElement` chacune, identiques ligne pour ligne à
 * une exception près — l'image de fond. Composé dans un `.tsx`, c'était **structurellement
 * invisible** aux tests, puisque la couverture de ce dépôt s'arrête au bord des composants.
 *
 * Il a fallu lui ajouter un TROISIÈME lecteur : le **diplôme vierge**, imprimable depuis
 * « Documents de la salle » (`scripts/regen-diplome-vierge.cjs`). ⚠️ Le recopier une
 * troisième fois dans un script aurait fabriqué exactement la panne que ce dépôt sait
 * nommer : **une transcription littérale ne bouge pas quand la donnée bouge.** Le vierge
 * imprimé — donc définitif — aurait cessé de ressembler au diplôme réel à la première
 * retouche de l'un des deux écrans, sans qu'aucun test ne rougisse.
 *
 * ⚠️ L'IMAGE DE FOND EST UN PARAMÈTRE POUR UNE RAISON TECHNIQUE, PAS POUR LAISSER LE CHOIX.
 * Les trois lecteurs passent la MÊME œuvre — `assets/diploma-background.png` — mais pas sous
 * la même forme : les deux écrans reçoivent l'URL que le bundler fabrique, le générateur du
 * vierge une `data:` URI, pour que sa page rendue soit autonome. Aucun appelant n'a le droit
 * d'en passer une autre.
 *
 * 🔴 **Et ce n'est pas une précaution théorique : les deux écrans ont DIVERGÉ**, jusqu'au
 * 10/11/2026. `ClientStats.tsx` passait `logoAssetUrl`, et produisait donc un diplôme **sans
 * œuvre** — du doré pâle sur du blanc, presque illisible — pendant que le moniteur en
 * décernait un complet. Personne ne l'avait vu, parce que personne n'ouvre les deux écrans
 * côte à côte : le moniteur décerne, le grimpeur télécharge, et chacun ne voit que le sien.
 * ⚠️ La zone de texte ci-dessous (38 %–92 %, 68 % de large, texte doré ombré) est calibrée
 * sur les diagonales de cette œuvre : **le fond n'est pas un choix de style, c'est la
 * condition de lisibilité du texte.** `test/contrats/gabaritDiplome.test.ts` vérifie que les
 * deux écrans passent bien la même.
 *
 * ⚠️ ET LE PASSAGE À UNE CHAÎNE HTML CRÉE UNE VOIE D'INJECTION QUE `textContent` N'AVAIT PAS.
 * Les noms affichés viennent de documents Firestore — et sur l'écran du moniteur, `titulaire`
 * est le nom de QUELQU'UN D'AUTRE. Tout champ est donc échappé ici, systématiquement, et un
 * test l'épingle. C'est le seul endroit où cette garantie peut être tenue : les appelants
 * passent des chaînes brutes.
 */

/** Dimensions du bloc, en pixels. L'image de fond a ce rapport (4:3) — ne pas les désaccorder. */
export const DIPLOME_LARGEUR_PX = 800;
export const DIPLOME_HAUTEUR_PX = 600;

/** L'or du diplôme, et l'ombre qui le rend lisible sur un fond photographique. */
const OR = '#D4AF37';
const OMBRE_TITRE = '2px 2px 4px rgba(0, 0, 0, 0.6)';
const OMBRE_TEXTE = '1px 1px 3px rgba(0, 0, 0, 0.6)';

/** La police du diplôme, et la feuille de style qui la fournit aux appelants. */
export const DIPLOME_POLICE = "'EB Garamond', serif";
export const POLICE_CSS_URL =
  'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;700&display=swap';

/**
 * Ce qu'on écrit sur un diplôme vierge à la place d'une valeur : un trait à remplir à la main.
 *
 * ⚠️ Des espaces INSÉCABLES entre les points, parce qu'en HTML une suite d'espaces ordinaires
 * se réduit à un seul — le trait deviendrait une rangée de points serrés, sur laquelle on
 * n'écrit pas. Et assez long pour qu'un nom y tienne : un vierge dont les traits sont trop
 * courts se remplit à côté des traits, ce qui est pire que pas de trait du tout.
 */
export const LIGNE_A_REMPLIR = ' .'.repeat(18);

/** Les quatre champs du diplôme, déjà formatés par l'appelant (dates comprises). */
export interface ChampsDiplome {
  titulaire: string;
  type: string;
  /** Déjà formatée — ce module ne connaît aucune date. */
  date: string;
  decernePar: string;
}

/**
 * Échappement HTML. ⚠️ Les cinq caractères, l'apostrophe comprise : les attributs de style de
 * ce gabarit sont en guillemets doubles, mais un champ pourrait un jour atterrir dans un
 * attribut en guillemets simples, et un échappement partiel est un échappement qui tombe le
 * jour où le gabarit bouge.
 */
export const echapperHtml = (brut: string): string =>
  brut
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ligne = (texte: string, taille: number, italique = false): string =>
  `<p style="font-size:${taille}px;font-weight:400;margin:0;color:${OR};`
  + `text-shadow:${OMBRE_TEXTE};${italique ? 'font-style:italic;' : ''}">`
  + `${echapperHtml(texte)}</p>`;

/**
 * Le contenu intérieur du diplôme (tout sauf le bloc de fond), prêt à poser en `innerHTML`.
 *
 * Rendu séparément du conteneur parce que les deux écrans construisent ce conteneur en
 * JavaScript — ils l'ajoutent au DOM pour le capturer par `html2canvas` — alors que le
 * générateur du vierge a besoin d'une page HTML complète. Le contenu, lui, est le même.
 */
export const composerContenuDiplome = (champs: ChampsDiplome): string => {
  const titre =
    `<h1 style="font-size:34px;font-weight:700;margin:0;color:${OR};`
    + 'text-shadow:' + OMBRE_TITRE + ';">DIPLÔME OFFICIEL</h1>';

  // ⚠️ Zone de texte contrainte à la partie bleutée du fond (sous le logo, à l'intérieur des
  // diagonales dorées) : verticalement de 38 % à 92 %, largeur limitée à 68 % centrée pour ne
  // jamais toucher les diagonales latérales. Commentaire d'origine de StatsList.tsx, conservé
  // mot pour mot : ces quatre pourcentages décrivent une IMAGE, ils ne se devinent pas.
  const styleZone =
    'position:absolute;top:38%;bottom:8%;left:16%;right:16%;display:flex;'
    + 'flex-direction:column;align-items:center;justify-content:space-between;'
    + `text-align:center;color:${OR};`;

  const contenu = [
    ligne(`Ce diplôme est décerné à : ${champs.titulaire}`, 20),
    ligne(`Type : ${champs.type}`, 18),
    ligne(`Le ${champs.date}`, 16),
    ligne(`Décerné par : ${champs.decernePar}`, 16),
  ].join('');

  return `<div style="${styleZone}">`
    + titre
    + '<div style="display:flex;flex-direction:column;align-items:center;gap:12px;">'
    + contenu
    + '</div>'
    + ligne('Félicitations pour votre progression !', 15, true)
    + '</div>';
};

/**
 * Les styles du bloc de fond, pour l'élément que les deux écrans créent eux-mêmes.
 * Clés en casse JavaScript : elles s'affectent directement sur un `HTMLElement.style`.
 */
export const stylesFondDiplome = (urlImageFond: string): Record<string, string> => ({
  width: `${DIPLOME_LARGEUR_PX}px`,
  height: `${DIPLOME_HAUTEUR_PX}px`,
  backgroundImage: `url(${urlImageFond})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  position: 'relative',
  fontFamily: DIPLOME_POLICE,
  boxSizing: 'border-box',
});

/**
 * Le diplôme entier en un seul bloc HTML : fond + contenu. C'est ce dont le générateur du
 * vierge a besoin, et c'est aussi la forme la plus simple à épingler dans un test.
 */
export const composerDiplomeHtml = (champs: ChampsDiplome, urlImageFond: string): string => {
  const style = Object.entries(stylesFondDiplome(urlImageFond))
    .map(([cle, valeur]) => `${cle.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${valeur}`)
    .join(';');
  return `<div style="${style};">${composerContenuDiplome(champs)}</div>`;
};

/** Les champs d'un diplôme vierge : quatre traits à remplir à la main. */
export const CHAMPS_DIPLOME_VIERGE: ChampsDiplome = {
  titulaire: LIGNE_A_REMPLIR,
  type: LIGNE_A_REMPLIR,
  date: LIGNE_A_REMPLIR,
  decernePar: LIGNE_A_REMPLIR,
};
