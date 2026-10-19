// Pose l'étiquette `deploy/v<version>` sur le commit qui vient d'être déployé.
//
// C'est la moitié qui rend l'autre utile : sans repère posé automatiquement,
// `list-commits-since-last-deploy.cjs` n'aurait rien à quoi comparer, et un repère qu'il
// faudrait penser à poser à la main serait oublié exactement les jours où il compte.
//
// ⚠️ EN `postdeploy`, JAMAIS EN `predeploy` : l'étiquette dit « ceci EST en production ». La
// poser avant l'envoi la rendrait fausse dès le premier déploiement qui échoue — et c'est
// alors l'inventaire d'après qui mentirait, en taisant du travail réellement parti ou en
// promettant du travail resté à quai. (`postdeploy` est bien exécuté par le CLI, vérifié dans
// `firebase-tools/lib/deploy/index.js` plutôt que supposé.)
//
// ⚠️ IL N'ÉCHOUE JAMAIS. Un déploiement a réussi : rien de ce qui suit ne doit se présenter
// comme un échec. Une étiquette non posée se rattrape en une commande ; un code de sortie non
// nul après un envoi réussi apprend à ignorer la sortie des déploiements.
//
// L'étiquette est DÉPLACÉE si elle existe déjà (re-déploiement de la même version) : ce qu'on
// veut retenir est « le dernier point déployé », pas l'historique des envois — que l'historique
// git porte déjà.
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

try {
  const { version } = JSON.parse(
    readFileSync(join(__dirname, '..', 'frontend', 'package.json'), 'utf8')
  );
  const etiquette = `deploy/v${version}`;
  const head = git('rev-parse', 'HEAD');

  git('tag', '-f', etiquette, head);
  console.log(`✔ Étiquette ${etiquette} posée sur ${head.slice(0, 8)}.`);

  try {
    // `--force` pour accompagner le déplacement local ; sans lui, un re-déploiement de la même
    // version laisserait l'étiquette distante sur l'ancien commit, donc fausse.
    execFileSync('git', ['push', '--force', 'origin', etiquette], { stdio: 'pipe' });
    console.log(`✔ Étiquette ${etiquette} publiée sur origin.`);
  } catch (e) {
    console.warn(`⚠️  Étiquette ${etiquette} posée localement mais NON publiée (${e.message.split('\n')[0]}).`);
    console.warn(`   À rattraper : git push --force origin ${etiquette}`);
  }
} catch (e) {
  console.warn(`⚠️  Étiquette de déploiement non posée (${e.message}).`);
  console.warn('   Sans elle, le prochain inventaire comparera au déploiement PRÉCÉDENT et');
  console.warn('   listera donc trop de commits — gênant, pas dangereux.');
}

process.exit(0);
