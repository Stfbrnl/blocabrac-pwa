// Garde de déploiement : refuser de déployer du code qui n'existe que sur ce poste.
//
// ⚠️ POURQUOI — du 15 au 18/10/2026, l'application que les grimpeurs utilisaient avait **une
// seule copie de sa source au monde**, sur une machine : V2.74 et V2.74.1 étaient déployées
// alors que leurs 11 commits n'avaient jamais été poussés. Un disque qui lâche, et il restait
// un bundle minifié en production et rien pour le reconstruire.
//
// La cause est structurelle, pas humaine : `firebase deploy` fonctionne parfaitement depuis un
// arbre sale et non poussé. L'invariant « ce qui est déployé est poussé » était tenu par le
// fait de s'en souvenir — c'est-à-dire par rien.
//
// ⚠️ ET LE HASH NE SUFFIT PAS À LE GARANTIR. `__GIT_HASH__` est bien injecté dans le bundle et
// affiché dans l'application, donc « quel commit tourne en prod ? » a déjà une réponse. Mais
// **un hash d'arbre sale ou non poussé est un hash parfaitement valide** : il identifie le
// commit, il ne prouve pas qu'il est atteignable par quelqu'un d'autre. C'est exactement ce
// que cette garde ajoute.
//
// Branchée en `predeploy` dans `firebase.json`, donc sur l'ÉVÉNEMENT : l'état « déployé =
// poussé » ne peut changer qu'au déploiement, il se garde donc là, et pas dans un contrôle
// qu'il faudrait penser à lancer.
//
// ⚠️ DÉROGATION EXPLICITE, prévue plutôt qu'inventée dans l'urgence : `BLOCABRAC_DEPLOY_FORCE=1`.
// Le scénario est précis — le 5 novembre au soir, un correctif à déployer et GitHub
// injoignable depuis la salle. Sans sortie, la garde empêcherait la réparation au seul moment
// où elle compte. Même logique que le `--force` des scripts de réconciliation : le refus est
// le défaut, la sortie existe et se prend en connaissance de cause.
const { execFileSync } = require('child_process');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const refus = [];

try {
  // ① L'arbre doit être propre : un fichier modifié non commité ne sera nulle part ailleurs.
  //    On inclut les fichiers non suivis — c'est ainsi qu'un document de chantier se perd.
  const sale = git('status', '--porcelain');
  if (sale) {
    refus.push(
      `l'arbre de travail n'est pas propre :\n${sale.split('\n').map((l) => `      ${l}`).join('\n')}`
    );
  }

  // ② HEAD doit exister sur origin. `git fetch` d'abord : sans lui, on compare à une image
  //    locale de la branche distante qui peut dater de plusieurs jours — et répondre « oui »
  //    à tort n'est pas une option pour une garde dont c'est toute la raison d'être.
  try {
    execFileSync('git', ['fetch', 'origin', '--quiet'], { stdio: 'pipe' });
  } catch {
    // Réseau indisponible : on ne peut pas trancher. On refuse, et le message nomme la
    // dérogation — c'est précisément le cas qu'elle couvre.
    refus.push('`git fetch origin` a échoué : impossible de vérifier que le commit est publié');
  }

  const head = git('rev-parse', 'HEAD');
  let publie = false;
  try {
    // `--contains` répond « quelles branches distantes contiennent ce commit ».
    publie = git('branch', '--remotes', '--contains', head).trim().length > 0;
  } catch {
    publie = false;
  }
  if (!publie) {
    refus.push(
      `le commit ${head.slice(0, 8)} n'est sur aucune branche distante — il n'existe que sur ce poste`
    );
  }
} catch (e) {
  refus.push(`vérification impossible : ${e.message}`);
}

if (refus.length === 0) {
  console.log('✔ Déploiement autorisé : arbre propre, et le commit déployé est publié.');
  process.exit(0);
}

if (process.env.BLOCABRAC_DEPLOY_FORCE === '1') {
  console.warn('⚠️  GARDE DE DÉPLOIEMENT CONTOURNÉE (BLOCABRAC_DEPLOY_FORCE=1) :');
  for (const r of refus) console.warn(`   - ${r}`);
  console.warn('   Ce qui part en production n\'est peut-être reconstructible que depuis ce poste.');
  console.warn('   Pousser dès que possible.');
  process.exit(0);
}

console.error('✘ DÉPLOIEMENT REFUSÉ — ce qui est déployé doit être poussé.');
for (const r of refus) console.error(`   - ${r}`);
console.error('');
console.error('   Remède normal : `git push`, trois secondes.');
console.error('   Dérogation (GitHub injoignable, correctif urgent) :');
console.error('     BLOCABRAC_DEPLOY_FORCE=1 npx firebase-tools deploy --only hosting');
process.exit(1);
