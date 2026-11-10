// Garde de déploiement : refuser de publier un document qui annonce une version périmée.
//
// ─── POURQUOI (10/11/2026) ──────────────────────────────────────────────────────────────
//
// Les documents de `public/docs/` portent une estampille « version + date de génération »,
// dérivée par `frontend/scripts/topo-stamp.cjs` et affichée à côté de chaque lien dans
// « Documents de la salle ». Sa raison d'être, écrite sur l'écran lui-même : *un document daté
// se repère périmé.*
//
// ⚠️ MAIS UNE ESTAMPILLE NE SE MET PAS À JOUR TOUTE SEULE. Elle est écrite au moment de la
// génération — donc un document non régénéré depuis deux versions annonce honnêtement la
// version qui l'a produit, et le lecteur ne peut pas distinguer « ce document est encore juste,
// il n'avait pas besoin d'être refait » de « ce document décrit une application qui a changé
// depuis ». Les deux se présentent exactement pareil : un numéro en retard.
//
// 🔴 C'EST ARRIVÉ DEUX FOIS, DANS LES DEUX SENS. Le 03/11/2026 les deux topos annonçaient
// V2.71.2 et V2.55 pendant que la production tournait en V2.77 — tout en contenant l'encadré
// ×2 livré le jour même, donc un document à la fois périmé et en avance sur sa propre
// estampille. Et le 10/11, après la livraison de V2.83, deux documents sur quatre étaient
// restés en V2.82 : non pas parce que quelqu'un l'avait décidé, mais parce que rien ne le
// demandait.
//
// ⚠️ LA DÉCISION PRISE (Stéphane, 10/11) : **tous les documents générés portent la version
// courante, systématiquement.** L'estampille cesse alors de répondre « quelle version a produit
// ce fichier » pour répondre « quelle version ce document décrit » — ce qui est la question que
// le lecteur se pose réellement. Le prix est une régénération par version ; ce script est ce
// qui fait que personne n'ait à y penser.
//
// ⚠️ BRANCHÉ EN `predeploy` HOSTING, donc sur l'ÉVÉNEMENT où le défaut devient public : c'est
// au déploiement qu'un document périmé est servi. Pas dans `npm test`, où il rougirait pendant
// qu'on écrit du code, pour une raison étrangère au code qu'on écrit — et un rouge qu'on
// apprend à ignorer ne garde plus rien. Pas en `predeploy` firestore non plus : un déploiement
// de règles ne publie aucun document.
//
// ⚠️ NE CONTRÔLE QUE LES DOCUMENTS GÉNÉRÉS, c'est-à-dire ceux que le registre connaît.
// `aide-connexion-installation.*` est fabriqué à la main, n'a pas de générateur, donc pas
// d'estampille dérivable — et le catalogue dit pourquoi (`sansEstampille`). L'exclure ici n'est
// pas un oubli : exiger de lui une version serait exiger l'impossible, et une règle
// impossible à satisfaire est une règle qu'on désarme.
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', 'frontend');
const REGISTRE = path.join(RACINE, 'src', 'data', 'documentsStamp.json');
const DOSSIER_DOCS = path.join(RACINE, 'public', 'docs');

// ⚠️ La version se lit par le MÊME module que celui qui écrit les estampilles. La reformater
// ici en recopiant la règle (« 2.83 » -> « V2.83 ») fabriquerait deux conventions qui peuvent
// diverger — et ce script compare justement des chaînes formatées : une divergence de format
// ferait échouer le déploiement sur des documents parfaitement à jour.
const { versionDuDepot } = require(path.join(RACINE, 'scripts', 'topo-stamp.cjs'));

const attendue = versionDuDepot();

if (!fs.existsSync(REGISTRE)) {
  console.error(`✘ DÉPLOIEMENT REFUSÉ — registre d'estampilles introuvable : ${REGISTRE}`);
  console.error('   Remède : cd frontend && npm run docs');
  process.exit(1);
}

const registre = JSON.parse(fs.readFileSync(REGISTRE, 'utf8'));
const refus = [];

for (const [nom, estampille] of Object.entries(registre)) {
  if (!estampille || estampille.version !== attendue) {
    const vue = estampille && estampille.version ? estampille.version : '(aucune)';
    refus.push(`${nom} annonce ${vue}, l'application est en ${attendue}`);
  }
  // Une estampille dont le fichier n'existe plus serait un mensonge sur l'écran : le lien
  // mènerait à rien tout en affichant fièrement une version et une date.
  if (!fs.existsSync(path.join(DOSSIER_DOCS, nom))) {
    refus.push(`${nom} est au registre mais ABSENT de public/docs/`);
  }
}

if (Object.keys(registre).length === 0) {
  refus.push('le registre est vide : aucun document généré ne serait estampillé');
}

if (refus.length === 0) {
  console.log(
    `✔ Documents à jour : ${Object.keys(registre).length} document(s) généré(s), tous estampillés ${attendue}.`
  );
  process.exit(0);
}

if (process.env.BLOCABRAC_DEPLOY_FORCE === '1') {
  console.warn('⚠️  GARDE DES DOCUMENTS CONTOURNÉE (BLOCABRAC_DEPLOY_FORCE=1) :');
  for (const r of refus) console.warn(`   - ${r}`);
  console.warn('   Des documents publics annonceront une version qui n\'est pas celle servie.');
  console.warn('   Les régénérer dès que possible.');
  process.exit(0);
}

console.error('✘ DÉPLOIEMENT REFUSÉ — un document public annoncerait une version périmée.');
for (const r of refus) console.error(`   - ${r}`);
console.error('');
console.error('   ⚠️ Ces fichiers sont IMPRIMÉS : une version fausse sur papier est définitive,');
console.error('      et c\'est la ligne dont un lecteur se sert pour juger le reste du document.');
console.error('');
console.error('   Remède normal : cd frontend && npm run docs   (puis npm run build)');
console.error('   Dérogation (correctif urgent) :');
console.error('     BLOCABRAC_DEPLOY_FORCE=1 npx firebase-tools deploy --only hosting');
process.exit(1);
