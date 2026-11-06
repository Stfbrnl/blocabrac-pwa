// NORMALISATION D'UNE COULEUR DE BLOC — explicite, ou refus. Jamais une devinette.
//
// 🔴 LE DÉFAUT QUE CE MODULE EXISTE POUR FERMER. Sept blocs de production portent une
// `difficulty` saisie à la main dans un champ libre, et deux ne sont pas canoniques : `"noire"`
// (féminin) et `"Rouge"` (majuscule). Le chemin normal de révélation d'une cotation
// (« Terminer la compétition ») fait `color: boulder.difficulty` **tel quel** — il écrirait donc
// un `color` hors de `levelOrder`. Conséquence : le bloc sortirait de `colorById`, donc du
// barème et de tous les compteurs, **en silence**. Un bloc qui ne compte plus, sans message.
//
// ⚠️ POURQUOI UNE LISTE D'ALIAS EXPLICITE ET NON UNE HEURISTIQUE. On pourrait retirer les
// accents, couper un `e` final, comparer par distance d'édition. Chacune de ces règles
// trancherait aussi les cas qu'elle ne devrait pas trancher — et sur une donnée qui décide de
// points, **une normalisation fausse est pire qu'un refus** : le refus se voit et s'instruit,
// la normalisation fausse part en base et s'oublie. Tout ce qui n'est pas dans la liste rend
// `null`, et l'appelant doit alors s'arrêter plutôt que d'écrire.
//
// ⚠️ La liste des couleurs canoniques n'est pas recopiée : elle dérive de `BASE_POINTS`, qui est
// déjà la seule table CommonJS du barème. Deux listes de couleurs finiraient par différer.
const { BASE_POINTS } = require('./bareme-quotidien.cjs');

const COULEURS_CANONIQUES = Object.keys(BASE_POINTS);

// Les formes FÉMININES des couleurs qui en ont une distincte. `jaune`, `rouge` et `rose` sont
// invariables, elles ne figurent donc pas ici — et c'est volontaire : une entrée `rouge: 'rouge'`
// laisserait croire que cette table traite la casse, alors que la casse est traitée par le
// `toLowerCase()` ci-dessous. Une table ne doit décrire qu'une seule sorte de variation.
const ALIAS_FEMININS = {
  verte: 'vert',
  bleue: 'bleu',
  violette: 'violet',
  noire: 'noir',
  blanche: 'blanc',
};

// Rend la couleur canonique, ou `null` si elle n'est pas reconnue avec CERTITUDE.
// Traite : la casse (`"Rouge"` → `rouge`), les espaces parasites, et les cinq féminins.
const normaliserCouleur = (valeur) => {
  if (typeof valeur !== 'string') return null;
  const nue = valeur.trim().toLowerCase();
  if (!nue) return null;
  if (COULEURS_CANONIQUES.includes(nue)) return nue;
  return ALIAS_FEMININS[nue] || null;
};

// Vrai si la valeur est DÉJÀ canonique — distinct de « normalisable ». L'appelant a besoin des
// deux : l'un dit s'il y a quelque chose à écrire, l'autre s'il peut écrire.
const estCanonique = (valeur) => typeof valeur === 'string' && COULEURS_CANONIQUES.includes(valeur);

module.exports = { COULEURS_CANONIQUES, ALIAS_FEMININS, normaliserCouleur, estCanonique };
