// Régénère ../../topo-roulettes-defis.pdf depuis ../../topo-roulettes-defis-source.html.
// Document équipe compagnon du Topo Blocabrac, dédié à la Bloc Roulette et aux Défis entre
// potes (catalogue complet + barèmes). Même mécanique que regen-topo.cjs.
//   cd frontend && node scripts/regen-topo-roulettes.cjs      (ou: npm run topo:roulettes)
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const { resolve } = require('path');

const SRC = resolve(__dirname, '../../topo-roulettes-defis-source.html');
const OUT = resolve(__dirname, '../../topo-roulettes-defis.pdf');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(SRC).href, { waitUntil: 'networkidle' });
  // Les marges sont dans le CSS (.page : padding 18mm 16mm), donc marges PDF à zéro.
  await page.pdf({ path: OUT, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await browser.close();
  // ✅ Garde à l'ÉVÉNEMENT plutôt que compte affiché : la pagination ne change qu'à une
  // régénération, donc c'est ici qu'elle se vérifie — pas dans un contrôle qu'il faudrait
  // penser à lancer. Un débordement fait disparaître un pied de page EN SILENCE.
  require("child_process").execFileSync(
    "node", [resolve(__dirname, "assert-topo-footers.cjs"), resolve(__dirname, "../../topo-roulettes-defis-source.html")],
    { stdio: "inherit" }
  );
  console.log(`✅ ${OUT} régénéré.`);
})().catch((e) => { console.error(e); process.exit(1); });
