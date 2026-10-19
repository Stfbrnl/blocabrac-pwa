// Annonce, à chaque déploiement, ce qui part avec lui et qui n'était pas là au précédent.
//
// ⚠️ POURQUOI — `firebase deploy` envoie le contenu de `dist/`, construit depuis l'arbre
// courant. **Ce qui dort sur `main` part au prochain déploiement, quel qu'en soit le motif.**
// Un correctif d'urgence poussé le 29 octobre emporterait avec lui tout ce qui attendait,
// y compris un chantier sensible qu'on ne voulait surtout pas voir partir à une semaine d'une
// compétition. Le cas n'est pas théorique : le 19/10/2026, la production tournait le commit
// `571601a` et **onze commits** attendaient derrière.
//
// La garde `assert-deploy-published.cjs` ne couvre pas ce risque, et c'est une distinction
// utile : elle vérifie que ce qu'on déploie est **poussé**, pas que c'est ce qu'on **voulait**
// déployer.
//
// ⚠️ CE SCRIPT N'EST PAS UNE GARDE — il n'échoue jamais et ne bloque rien. C'est un
// INVENTAIRE, imprimé à chaque exécution même quand il est vide, de la même famille que le
// compteur d'écarts de `audit-prod-catalog.js`. Un garde-fou de plus qui refuserait au moindre
// commit en attente deviendrait un obstacle qu'on apprend à contourner ; une liste qu'on lit
// reste une liste qu'on lit.
//
// ⚠️ ET IL DISTINGUE CE QUI COMPTE. Une file de commits de documentation est sans danger ; une
// file qui touche `frontend/src` change ce que les grimpeurs reçoivent. Un inventaire plat
// mettrait les deux sur le même plan, et c'est ainsi qu'une liste cesse d'être lue. Chaque
// ligne porte donc [app] ou [doc], et le total des [app] est répété en tête.
const { execFileSync } = require('child_process');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const PREFIXE = 'deploy/v';

try {
  let etiquette = null;
  try {
    // L'étiquette de déploiement la plus récente ATTEIGNABLE depuis HEAD. `--abbrev=0` rend
    // le nom seul, sans le suffixe de distance.
    etiquette = git('describe', '--tags', '--match', `${PREFIXE}*`, '--abbrev=0');
  } catch {
    etiquette = null;
  }

  if (!etiquette) {
    console.log('ℹ️  Aucune étiquette `deploy/v*` atteignable depuis HEAD.');
    console.log('   Ce déploiement en posera une (voir scripts/tag-deploy.cjs) : à partir du');
    console.log('   suivant, cette place portera la liste de ce qui part.');
    process.exit(0);
  }

  const lignes = git('log', '--format=%H%x09%h%x09%s', `${etiquette}..HEAD`)
    .split('\n')
    .filter(Boolean);

  if (lignes.length === 0) {
    console.log(`ℹ️  Rien de neuf depuis ${etiquette} : ce déploiement rejoue le même code.`);
    process.exit(0);
  }

  // Un commit « touche l'application » s'il modifie ce qui part réellement dans le bundle.
  //
  // ⚠️ `frontend/test` en est exclu (les e2e ne sont pas livrés), et `frontend/package.json`
  // n'y suffit PAS à lui seul : y ajouter un script npm ne change rien au bundle, seul le
  // champ `version` y est injecté (`__APP_VERSION__`). Vérifié à la main sur un commit de la
  // liste — `be31a29` était marqué [app] pour un ajout de script, et un inventaire qui crie
  // à tort est un inventaire qu'on cesse de lire.
  const toucheApp = (sha) => {
    const fichiers = git('show', '--pretty=format:', '--name-only', sha).split('\n').filter(Boolean);
    const livre = fichiers.some((f) => f.startsWith('frontend/src/')
      || f.startsWith('frontend/public/')
      || f === 'frontend/package-lock.json'
      || f === 'frontend/vite.config.ts'
      || f === 'frontend/index.html');
    if (livre) return true;
    if (!fichiers.includes('frontend/package.json')) return false;
    // Seul un changement du champ `version` de ce fichier atteint le bundle.
    return git('show', sha, '--', 'frontend/package.json')
      .split('\n')
      .some((l) => /^[+-]\s*"version"\s*:/.test(l));
  };

  const commits = lignes.map((l) => {
    const [sha, court, sujet] = l.split('\t');
    return { court, sujet, app: toucheApp(sha) };
  });
  const nApp = commits.filter((c) => c.app).length;

  const date = git('log', '-1', '--format=%ad', '--date=short', etiquette);
  console.log(`ℹ️  Depuis ${etiquette} (${date}) : ${commits.length} commit(s), `
    + `dont ${nApp} touchant l'application.`);
  for (const c of commits) {
    console.log(`     ${c.app ? '[app]' : '[doc]'} ${c.court} ${c.sujet}`);
  }
  if (nApp > 0) {
    console.log('   Tout ce qui précède part avec ce déploiement.');
  }
} catch (e) {
  // Un inventaire qui échoue ne doit pas empêcher un déploiement : il informe, il ne garde pas.
  console.log(`ℹ️  Inventaire des commits indisponible (${e.message}) — déploiement poursuivi.`);
}

process.exit(0);
