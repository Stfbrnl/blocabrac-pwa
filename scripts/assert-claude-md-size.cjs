// Garde : `CLAUDE.md` ne doit pas dépasser la limite au-delà de laquelle il est TRONQUÉ EN
// SILENCE — et une troncature coupe la fin du fichier, donc des sections entières.
//
// ⚠️ CE N'EST PAS UNE PRÉCAUTION THÉORIQUE, c'est un défaut mesuré. Le fichier a franchi
// 150 000 caractères au commit a14b6e94 du 02/10/2026 (150 890). Mesuré le 18/10 en relisant
// la tranche coupée à chaque commit de la période : au 03/10, la section `Testing` — qui
// porte TOUTES les règles de méthode du projet (« voir rouge d'abord », « un critère de sortie
// doit prédire toutes les grandeurs », la hiérarchie des preuves, « affirmer la taille avant
// d'affirmer sur l'ensemble ») — était INTÉGRALEMENT invisible, avec `Gestion des versions`.
// Au 18/10 avant le découpage, 37 946 caractères l'étaient.
//
// Ça fournit une explication mesurable aux règles « réapprises » des trois semaines passées :
// elles n'étaient pas oubliées, elles n'étaient pas lisibles.
//
// ⚠️ GARDE À L'ÉVÉNEMENT, pas compte affiché (RETOUR-18-10-suite.md §3) : la taille ne change
// qu'à un commit, donc c'est au commit qu'elle se vérifie. Un contrôle dans l'audit mensuel
// l'attraperait quand quelqu'un lance l'audit — c'est-à-dire exactement la situation vécue.
//
//   node scripts/assert-claude-md-size.cjs
const { readFileSync } = require('fs');
const { resolve } = require('path');

const LIMITE = 150000;
// On alerte AVANT la limite : franchir pendant un chantier, c'est perdre la tranche que ce
// chantier vient d'écrire.
const SEUIL_ALERTE = 142000;

const chemin = resolve(__dirname, '../CLAUDE.md');
const taille = readFileSync(chemin, 'utf8').length;
const pct = Math.round((taille / LIMITE) * 100);

if (taille > LIMITE) {
  console.error(`✘ CLAUDE.md : ${taille} / ${LIMITE} caractères (${pct} %) — IL EST TRONQUÉ.`);
  console.error(`   Les ${taille - LIMITE} derniers caractères ne sont pas lus, donc des sections`);
  console.error('   entières le sont. Sortir du RÉCIT vers docs/architecture/ (voir la section');
  console.error('   « Chantier documentation » du fichier) ; ce qui s\'applique sans condition y reste.');
  process.exit(1);
}
if (taille > SEUIL_ALERTE) {
  console.warn(`⚠️  CLAUDE.md : ${taille} / ${LIMITE} caractères (${pct} %) — approche de la limite.`);
} else {
  console.log(`✔ CLAUDE.md : ${taille} / ${LIMITE} caractères (${pct} %).`);
}
process.exit(0);
