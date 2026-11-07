// Estampille des topos : numéro de version et date de génération, DÉRIVÉS et jamais écrits
// à la main.
//
// ─── POURQUOI CE MODULE EXISTE (03/11/2026) ────────────────────────────────────────────
//
// Les deux topos portaient leur estampille en DUR dans le HTML : « V2.71.2 » et « Généré le
// 25 septembre 2026 » pour le topo principal, « V2.55 » et « 6 septembre 2026 » pour celui des
// roulettes. Régénérés le 03/11 avec la production en V2.77, ils annonçaient donc décrire une
// version de six semaines plus tôt — tout en contenant l'encadré du multiplicateur ×2, livré
// le jour même et absent de la version annoncée.
//
// 🔴 **C'est la ligne qu'un lecteur utilise pour décider s'il peut faire confiance au reste.**
// Quelqu'un qui ouvre le topo en janvier lit « V2.71.2 », en conclut soit que la section
// multiplicateur est fausse, soit que le document est périmé — et va vérifier ailleurs ce que
// ce document existe précisément pour éviter.
//
// ⚠️ **Et c'est la forme exacte du défaut que ce dépôt sait nommer** : une estampille écrite à
// la main est une **transcription littérale** qui ne bouge pas quand la donnée bouge. Même
// famille que le harnais qui recopie le code au lieu de l'exécuter et rend le même chiffre pour
// toujours. Les corriger à la main les ferait rementir à la régénération suivante : il faut les
// DÉRIVER.
//
// ⚠️ **Aucun repli, par conception.** Si un jeton d'estampille est absent du HTML, ces
// fonctions LÈVENT au lieu de laisser passer. Un repli silencieux (laisser le jeton visible, ou
// mettre une chaîne vide) rendrait le défaut invisible exactement là où il compte : dans un
// document imprimé, donc définitif.
const fs = require('fs');
const path = require('path');

const JETON_VERSION = '{{APP_VERSION}}';
const JETON_DATE = '{{GENERATED_ON}}';

// Miroir EXACT de `formattedAppVersion` (frontend/src/config/appVersion.ts) : "2.77" -> "V2.77",
// "2.25.0" -> "V2.25" (le .0 de patch n'apporte rien), "2.14.3" -> "V2.14.3" (un vrai correctif
// reste visible). ⚠️ À garder synchronisé à la main avec ce fichier — c'est lui la référence.
function formatVersion(brut) {
  if (typeof brut !== 'string' || brut.trim() === '') {
    throw new Error(`topo-stamp : version illisible (${JSON.stringify(brut)})`);
  }
  return `V${brut.replace(/\.0$/, '')}`;
}

// « 3 novembre 2026 ». Node porte l'ICU complet, donc pas de table de mois à maintenir.
function formatDateFr(date) {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Lit la version depuis la SOURCE DE VÉRITÉ du dépôt, jamais depuis une copie.
function versionDuDepot() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  return formatVersion(pkg.version);
}

// Remplace les deux jetons dans le texte du HTML. Lève si l'un manque, ou s'il apparaît
// plusieurs fois : dans les deux cas, l'estampille n'est plus celle qu'on croit.
function injecterEstampille(html, { version, dateTexte }) {
  let sortie = html;
  for (const [jeton, valeur] of [[JETON_VERSION, version], [JETON_DATE, dateTexte]]) {
    const n = sortie.split(jeton).length - 1;
    if (n !== 1) {
      throw new Error(
        `topo-stamp : le jeton ${jeton} apparaît ${n} fois dans la source (attendu : 1). `
        + 'L\'estampille ne peut pas être dérivée — ne pas la réécrire à la main, remettre le jeton.'
      );
    }
    sortie = sortie.split(jeton).join(valeur);
  }
  return sortie;
}

// Écrit une copie estampillée À CÔTÉ de la source, pour que les chemins relatifs et le
// `@import` de police continuent de résoudre à l'identique. Rend le chemin du fichier
// temporaire ET les valeurs posées, pour que l'appelant puisse les ANNONCER : un script dont la
// raison d'être est un effet de bord doit dire quel effet il a eu.
function preparerSourceEstampillee(cheminSource) {
  const version = versionDuDepot();
  const dateTexte = formatDateFr(new Date());
  const html = injecterEstampille(fs.readFileSync(cheminSource, 'utf8'), { version, dateTexte });
  const cheminTemp = path.join(
    path.dirname(cheminSource),
    `.${path.basename(cheminSource, '.html')}.estampille.html`
  );
  fs.writeFileSync(cheminTemp, html);
  return { cheminTemp, version, dateTexte };
}

// Le CHEMIN du registre d'estampilles lu par l'application (src/data/documentsStamp.json).
// ⚠️ C'est un fichier GÉNÉRÉ : il est écrit ici, à la génération du document, et jamais à la
// main. Voir enregistrerEstampille ci-dessous pour la raison.
const REGISTRE = path.resolve(__dirname, '../src/data/documentsStamp.json');

// Enregistre l'estampille d'un document généré, pour que l'écran « Documents de la salle »
// puisse l'AFFICHER sans la recopier.
//
// ─── POURQUOI PASSER PAR UN FICHIER PLUTÔT QUE PAR UN LITTÉRAL DANS L'ÉCRAN (07/11/2026) ──
//
// L'écran doit montrer, à côté de chaque lien, la version et la date du document — « un
// document daté se repère périmé ; un document nu ne se repère jamais ». Les écrire dans le
// composant serait reproduire À L'IDENTIQUE le défaut que ce module existe pour avoir corrigé :
// une transcription littérale ne bouge pas quand la donnée bouge. Un écran annonçant « V2.80 »
// à côté d'un PDF régénéré en V2.95 serait pire qu'un écran qui n'annonce rien, puisque c'est
// précisément cette ligne qu'un lecteur utilise pour décider s'il fait confiance au document.
//
// La seule écriture qui ne puisse pas mentir est donc celle que fait LE GÉNÉRATEUR, dans le
// même geste que le PDF : les deux sortent de la même exécution ou d'aucune.
//
// ⚠️ Lecture-modification-écriture, et non réécriture : chaque générateur ne connaît QUE son
// document. Réécrire le registre entier ferait disparaître les estampilles des deux autres à
// chaque régénération d'un seul — une perte silencieuse, et dans le sens qui ne se voit pas
// (l'écran retomberait sur « estampille inconnue » sans qu'aucun script n'échoue).
function enregistrerEstampille(nomFichier, { version, dateTexte }) {
  if (typeof nomFichier !== 'string' || nomFichier.trim() === '') {
    throw new Error(`topo-stamp : nom de fichier illisible (${JSON.stringify(nomFichier)})`);
  }
  if (typeof version !== 'string' || typeof dateTexte !== 'string' || !version || !dateTexte) {
    throw new Error(
      `topo-stamp : estampille incomplète pour ${nomFichier} `
      + `(version=${JSON.stringify(version)}, date=${JSON.stringify(dateTexte)}). `
      + 'Pas de repli : une estampille vide dans un écran est indiscernable d\'une absence.'
    );
  }
  let registre = {};
  if (fs.existsSync(REGISTRE)) {
    registre = JSON.parse(fs.readFileSync(REGISTRE, 'utf8'));
  }
  registre[nomFichier] = { version, genereLe: dateTexte };
  // Clés triées : le registre est un fichier versionné, un diff ne doit montrer que ce qui
  // a réellement changé — pas un réordonnancement dû à l'ordre d'exécution des scripts.
  const trie = {};
  for (const cle of Object.keys(registre).sort()) trie[cle] = registre[cle];
  fs.writeFileSync(REGISTRE, `${JSON.stringify(trie, null, 2)}\n`);
  return { nomFichier, version, dateTexte };
}

module.exports = {
  JETON_VERSION,
  JETON_DATE,
  formatVersion,
  formatDateFr,
  versionDuDepot,
  injecterEstampille,
  preparerSourceEstampillee,
  enregistrerEstampille,
  REGISTRE,
};
