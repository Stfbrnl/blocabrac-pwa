// Organisation des blocs sur l'écran de validation d'une compétition.
//
// docs/plans/2026-11-06-CN-plan-bareme-unifie-et-ecran-competition.md partie B.
//
// LE DIAGNOSTIC, plus précis que « pas de numéros » : six grimpeurs devant 92 blocs dans une
// liste plate. Les numéros existaient — ils sont attachés au **mur**, pas à la salle. Le tri
// global par numéro qu'utilisait l'écran (`a.number - b.number`) mettait donc tous les n°1 des
// sept murs ensemble : il **entrelaçait les murs**, ce qui avait un sens pour 30 blocs créés
// pour une épreuve et aucun pour toute la salle.
//
// ✅ CONSÉQUENCE DE CONCEPTION, et elle évite un chantier entier : le regroupement par mur rend
// les numéros par mur non ambigus. Il n'y a donc **rien à renuméroter** côté blocs quotidiens —
// la section porte le mur, la ligne porte le numéro, et ça correspond à ce qui est écrit sur la
// prise. Renuméroter en 1..N des blocs quotidiens réutilisés désynchroniserait l'application du
// physique : un grimpeur chercherait le bloc 47 devant une étiquette qui dit 3.
//
// ⚠️ Module PUR, aucun import Firestore — même discipline que `roulette.ts`, `challenges.ts` et
// `weeklyGoal.ts`. La couverture de tests de ce dépôt s'arrête au bord des `.tsx` (pas de
// harnais React) : ce qui est composé en ligne dans un composant est STRUCTURELLEMENT
// invisible, et c'est là que naissent les défauts. Tout ce qui décide de quoi est montré vit
// donc ici.
import { walls } from '../config/gymConfig';
import { levelOrder, type Level } from './competitionEligibility';

export interface GroupableBoulder {
  id: string;
  number: number;
  wall: string;
  // Présente sur un bloc du jour réutilisé (couleur publique, le grimpeur la lit déjà sur le
  // mur), absente sur un bloc créé pour l'épreuve (sa cotation est cachée).
  color?: string;
}

// Le nom de section d'un bloc dont le champ `wall` est vide ou absent. Exporté parce que
// l'écran s'en sert aussi : deux littéraux identiques dans deux fichiers sont deux littéraux
// qui finiront par différer.
export const MUR_SANS_NOM = 'Mur non renseigné';

export interface WallSection<T extends GroupableBoulder> {
  wall: string;
  // Les blocs À MONTRER — donc éventuellement amputés par le filtre.
  boulders: T[];
  // ⚠️ `total` compte les blocs DU MUR, jamais ceux qui restent après filtrage : c'est le
  // dénominateur que le grimpeur lit dans l'en-tête, et un dénominateur qui rétrécit quand on
  // masque des lignes ferait croire que des blocs ont disparu de l'épreuve.
  total: number;
  validated: number;
  hidden: number;
}

// ⚠️ L'ordre des sections suit `gymConfig.walls`, qui est le CIRCUIT PHYSIQUE RÉEL de la salle
// (voir CLAUDE.md), et non l'ordre alphabétique. Le plan proposait de propager le
// `a.wall.localeCompare(b.wall)` de `fetchCandidates` ; c'est un écart assumé, et la raison est
// que ces sections s'ouvrent pendant qu'on marche dans la salle : « Dalle » avant « Dévers 15° »
// n'a de sens que pour un lecteur de dictionnaire. Un mur absent du tableau (renommé, retiré de
// la configuration sans l'être des blocs) passe après les autres, par ordre alphabétique —
// jamais écarté en silence.
const rangDuMur = (wall: string): number => {
  const i = walls.indexOf(wall);
  return i === -1 ? walls.length : i;
};

export const compareWalls = (a: string, b: string): number =>
  rangDuMur(a) - rangDuMur(b) || a.localeCompare(b, 'fr');

// À l'intérieur d'une section : par numéro, puis par identifiant pour que deux blocs portant le
// même numéro sur le même mur (saisie en double, cas réel sur une salle entière) gardent un
// ordre STABLE d'un rendu à l'autre. Sans ce second critère, deux lignes pourraient échanger
// leur place pendant qu'un doigt vise l'une des deux.
export const compareByNumber = <T extends GroupableBoulder>(a: T, b: T): number =>
  (a.number || 0) - (b.number || 0) || a.id.localeCompare(b.id);

// ✅ Le tri par couleur, à l'intérieur d'une section : du plus tendre au plus dur.
export const compareByColor = <T extends GroupableBoulder>(a: T, b: T): number =>
  levelOrder.indexOf((a.color || '') as Level) - levelOrder.indexOf((b.color || '') as Level) ||
  compareByNumber(a, b);

// 🔴 LE TRI PAR COULEUR EST TOUT OU RIEN, ET LA CONDITION SE DÉRIVE DE LA DONNÉE.
//
// Il n'est offert que si TOUS les blocs de la liste portent une couleur publique cotable. La
// raison n'est pas l'esthétique d'une liste mixte : c'est qu'un format mixte est possible (le
// Contest du 5 novembre en était un — des blocs déjà en place plus un mur neuf), et qu'alors un
// tri par couleur **placerait quelque part les blocs à cotation cachée**. Leur position dans la
// liste triée révélerait leur cotation : le tri deviendrait la fuite exacte que la cotation
// cachée existe pour empêcher.
//
// ⚠️ Et la condition se lit sur le CONTENU RÉEL de la liste, jamais sur un réglage de
// compétition. Un réglage peut être posé à tort par un ouvreur pressé ; une condition lue sur
// la donnée ne peut pas mentir. Même forme que la décision prise pour le multiplicateur.
//
// Une liste vide rend `false` : il n'y a rien à trier, et `[].every(...)` rendrait `true`.
export const peutTrierParCouleur = (boulders: GroupableBoulder[]): boolean =>
  boulders.length > 0 &&
  boulders.every((b) => !!b.color && levelOrder.indexOf(b.color as Level) !== -1);

export interface GroupOptions {
  // Les blocs réellement validés À L'INSTANT. Sert UNIQUEMENT à compter, dans l'en-tête de
  // section.
  validatedIds: ReadonlySet<string>;
  // ⚠️ DÉLIBÉRÉMENT DISTINCT de `validatedIds`, et c'est le cœur du filtre : les blocs à
  // MASQUER sont un INSTANTANÉ, pris au moment où le filtre est activé (et rafraîchi à la
  // réouverture d'une section), jamais l'ensemble vivant des validés. Un bloc qui disparaît
  // sous le doigt à l'instant où on le valide est déroutant — la ligne ne s'efface qu'au
  // prochain basculement du filtre.
  //
  // Les deux ensembles se ressemblent et ne sont pas le même : les confondre est précisément
  // le défaut à éviter, d'où deux paramètres plutôt qu'un drapeau.
  hiddenIds?: ReadonlySet<string>;
  sortByColor?: boolean;
}

// Regroupe les blocs par mur, sections dans l'ordre du circuit physique, lignes triées par
// numéro (ou par couleur si demandé ET autorisé par la donnée — voir `peutTrierParCouleur`).
//
// ⚠️ AUCUN BLOC NE SE PERD ENTRE LES SECTIONS : la somme des `total` égale la longueur de la
// liste d'entrée, par construction (chaque bloc est rangé dans la section de son `wall`, et un
// `wall` vide ou absent devient sa propre section nommée). Un bloc masqué reste compté dans
// `total` et apparaît dans `hidden` — masquer change ce qui est MONTRÉ, jamais ce qui existe.
export const groupBouldersByWall = <T extends GroupableBoulder>(
  boulders: T[],
  options: GroupOptions,
): WallSection<T>[] => {
  const { validatedIds, hiddenIds, sortByColor } = options;
  const parMur = new Map<string, T[]>();
  boulders.forEach((boulder) => {
    // Un `wall` absent ou vide ne fait pas disparaître le bloc : il est rangé sous un nom
    // explicite, qui se voit à l'écran et se corrige.
    const wall = boulder.wall || MUR_SANS_NOM;
    const liste = parMur.get(wall);
    if (liste) liste.push(boulder);
    else parMur.set(wall, [boulder]);
  });

  // Le tri par couleur n'est appliqué que si la donnée l'autorise, sur la liste ENTIÈRE et pas
  // mur par mur : une seule section à cotation cachée suffit à rendre la fuite possible.
  const parCouleur = !!sortByColor && peutTrierParCouleur(boulders);

  return [...parMur.entries()]
    .sort(([a], [b]) => compareWalls(a, b))
    .map(([wall, liste]) => {
      const triees = [...liste].sort(parCouleur ? compareByColor : compareByNumber);
      const montres = hiddenIds ? triees.filter((b) => !hiddenIds.has(b.id)) : triees;
      return {
        wall,
        boulders: montres,
        total: liste.length,
        validated: liste.filter((b) => validatedIds.has(b.id)).length,
        hidden: triees.length - montres.length,
      };
    });
};
