// VÉRIFIE QUE LA VERSION DÉPLOYÉE EST CELLE QUI EST RÉELLEMENT SERVIE — dans un vrai
// navigateur, SERVICE WORKER ACTIF. Lecture seule, aucun compte, aucune écriture.
//
// ⚠️ POURQUOI PAS `curl` : `curl` ne passe par AUCUN service worker, et c'est le service worker
// qui peut répondre autre chose que le fichier demandé. Le 28/10/2026 trois vérifications curl
// ont déclaré bon un PDF que le navigateur rendait en écran blanc. La couche où vit le défaut
// est le navigateur ; mesurer la couche HTTP et conclure sur le navigateur est l'erreur à ne
// pas refaire.
//
// LA RECETTE, et ses deux précautions sans lesquelles la mesure ne traverse rien :
//   ① un contexte NEUF (pas de service worker déjà installé) ;
//   ② un RECHARGEMENT après la première ouverture — sous `registerType: 'prompt'` le service
//      worker ne contrôle PAS la page au premier chargement. Tant que `controller` est nul, on
//      mesure le réseau nu, pas l'application telle que les grimpeurs la reçoivent.
//
// CE QUI FAIT PREUVE : les noms de fichiers de `dist/assets/` portent un hachage de CONTENU.
// Si l'origine rend 200 sur le nom de fichier du build LOCAL, c'est que ce build-là est en
// ligne — pas un homonyme, pas un reliquat. On vérifie en plus que le fichier contient bien le
// littéral de version, parce qu'un 200 sur le bon nom ne dit pas ce qu'il y a dedans.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ORIGINE = process.env.ORIGINE || 'https://blocabrac.web.app';
const DIST = path.join(__dirname, '..', 'dist');
const VERSION = require(path.join(__dirname, '..', 'package.json')).version;

(async () => {
  // Le chunk local qui porte le littéral de version — trouvé par OBSERVATION du dist, jamais
  // par un nom codé en dur (le hachage change à chaque build).
  // ⚠️ LES TROIS FORMES DE LITTÉRAL, et pourquoi l'énumération est nécessaire : le minifieur
  // choisit la forme, pas nous. Vite remplace `__APP_VERSION__` par `JSON.stringify(version)`,
  // donc des guillemets doubles, mais rolldown réécrit en littéral GABARIT — la version vit
  // en production sous la forme `` `V${`2.78`.replace(/\.0$/,``)}` ``. Un test qui ne cherchait
  // que les guillemets ne trouvait rien et ce script refusait de conclure : c'est le
  // comportement voulu, mais la cause était le test, pas le build.
  //
  // 🔴 ET C'EST POURQUOI ON NE CHERCHE PAS LE NOMBRE NU. Un `grep "2.78"` sur dist/ trouve
  // `m23 12-2.44-2.78.34-3.68` — un fragment de TRACÉ SVG. Ce faux positif m'a fait annoncer
  // « le bundle porte bien 2.78 » alors que je n'avais rien vérifié. Un littéral se cherche
  // avec ses délimiteurs, jamais comme une sous-chaîne de chiffres.
  const formes = [`"${VERSION}"`, `'${VERSION}'`, '`' + VERSION + '`'];
  const assets = fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
  const porteurs = assets.filter((f) => {
    const t = fs.readFileSync(path.join(DIST, 'assets', f), 'utf8');
    return formes.some((forme) => t.includes(forme));
  });
  if (porteurs.length === 0) {
    console.error(`✘ Aucun fichier de dist/assets ne contient le littéral "${VERSION}".`);
    console.error('  Le build local ne porte pas la version de package.json : rebuilder AVANT de conclure.');
    process.exit(1);
  }
  console.log(`Build local : ${assets.length} fichiers JS, ${porteurs.length} portant "${VERSION}"`);
  porteurs.forEach((f) => console.log(`   ${f}`));

  const navigateur = await chromium.launch();
  const contexte = await navigateur.newContext(); // ① contexte NEUF
  const page = await contexte.newPage();

  console.log(`\n── ① Premier chargement de ${ORIGINE} ──`);
  await page.goto(ORIGINE, { waitUntil: 'load' });

  // 🔴 ATTENDRE L'ÉTAT, JAMAIS UNE DURÉE — et avec un primitif qui attend VRAIMENT.
  //
  // La recette du 03/11/2026 disait « attendre ~3 s ». Le 06/11, trois secondes ne
  // suffisaient plus : ce service worker précache 148 fichiers / 4,6 Mo, donc la durée dépend
  // du réseau et n'est pas une condition. Jusque-là, simple fragilité.
  //
  // 🔴 MAIS LE PIÈGE EST AILLEURS, ET IL ÉTAIT DANS CE SCRIPT : `page.waitForFunction` avec un
  // prédicat **async** se résout IMMÉDIATEMENT, parce que la fonction renvoie une `Promise` et
  // qu'une `Promise` est *truthy*. Mesuré : l'attente « activated » rendait la main en 312 ms,
  // alors qu'il n'existait même pas encore d'enregistrement. Le rechargement tombait donc
  // avant toute installation, la page revenait sans contrôleur, et le script annonçait « le
  // service worker ne prend jamais le contrôle » — un verdict faux, produit par l'instrument
  // et non par le système. `page.evaluate`, lui, attend bel et bien la promesse rendue.
  //
  // `navigator.serviceWorker.ready` est le primitif juste : il se résout quand il existe un
  // enregistrement ACTIF pour cette portée.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  console.log('   service worker : actif (navigator.serviceWorker.ready résolu)');
  console.log(`   contrôle la page : ${await page.evaluate(() => !!navigator.serviceWorker.controller)}`
    + '   (false ATTENDU sous \'prompt\' au 1er chargement)');

  // ⚠️ Sous `registerType: 'prompt'`, `clientsClaim` est faux : un service worker qui vient de
  // s'activer ne RÉCLAME PAS la page déjà ouverte. Il faut une nouvelle navigation, et si
  // l'activation s'est terminée pendant la vie de cette page-là, il en faut une seconde.
  // On boucle donc sur l'OBSERVATION du contrôleur au lieu de parier sur un nombre de
  // rechargements — mesuré : 2 ont été nécessaires le 06/11.
  console.log('\n── ② Rechargement(s) — c\'est ici que la mesure devient valide ──');
  let apres = false;
  let tours = 0;
  while (!apres && tours < 4) {
    tours += 1;
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.waitForTimeout(1500);
    apres = await page.evaluate(() => !!navigator.serviceWorker.controller);
    console.log(`   rechargement n°${tours} → contrôle la page : ${apres}`);
  }
  if (!apres) {
    console.error('\n✘ Le service worker ne contrôle TOUJOURS pas la page après 4 rechargements.');
    console.error('  La suite ne traverserait pas le service worker : ne rien conclure.');
    await navigateur.close();
    process.exit(1);
  }

  console.log('\n── ③ Les fichiers du build local sont-ils ceux que l\'origine sert ? ──');
  console.log('   (fetch évalué DEPUIS la page contrôlée, donc à travers le service worker)');
  let echecs = 0;
  for (const f of porteurs) {
    const r = await page.evaluate(async (nom) => {
      try {
        const res = await fetch('/assets/' + nom, { cache: 'no-store' });
        const t = await res.text();
        return { statut: res.status, type: res.headers.get('content-type'), taille: t.length, texte: t };
      } catch (e) { return { erreur: String(e) }; }
    }, f);
    const localeTaille = fs.statSync(path.join(DIST, 'assets', f)).size;
    const contientVersion = r.texte ? formes.some((forme) => r.texte.includes(forme)) : false;
    const ok = r.statut === 200 && contientVersion;
    console.log(`   ${ok ? '✔' : '✘'} ${f}`);
    // ⚠️ NE PAS COMPARER CES DEUX NOMBRES. `r.taille` est une longueur de chaîne JS (unités
    // UTF-16, mesurée dans la page), `localeTaille` des octets UTF-8 sur le disque : ils
    // diffèrent dès qu'il y a un caractère non-ASCII, et ici de 43 unités sans qu'aucun octet
    // ne soit en cause. La PREUVE d'identité est ailleurs, et elle est plus forte : le nom du
    // fichier porte un hachage de CONTENU, donc un 200 sur ce nom-là prouve ce contenu-là.
    console.log(`       HTTP ${r.statut ?? r.erreur} | ${r.type || '?'}`);
    console.log(`       longueur servie ${r.taille} unités UTF-16 · fichier local ${localeTaille} octets UTF-8`);
    console.log('       (grandeurs de natures différentes — la preuve est le hachage du nom)');
    console.log(`       contient le littéral "${VERSION}" : ${contientVersion}`);
    if (!ok) echecs += 1;
  }

  await navigateur.close();

  console.log('\n════ VERDICT ════');
  if (echecs > 0) {
    console.error(`✘ ${echecs} fichier(s) en échec : la version servie N'EST PAS ${VERSION}.`);
    process.exit(1);
  }
  console.log(`✔ La version ${VERSION} est SERVIE, service worker ACTIF.`);
  console.log('⚠️  Portée : Chromium sans interface, sur ordinateur. WebKit (iPhone) peut différer');
  console.log('    à la marge. Et un grimpeur déjà installé reste sur son ancienne version tant');
  console.log('    qu\'il n\'a pas cliqué « Mettre à jour » — c\'est la contrepartie de \'prompt\'.');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC : ' + (e && e.stack ? e.stack : e)); process.exit(1); });
