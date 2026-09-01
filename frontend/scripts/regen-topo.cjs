// Régénère ../../topo-blocabrac.pdf depuis ../../topo-blocabrac-source.html.
// Playwright (chromium) est déjà une devDependency du frontend.
//   cd frontend && node scripts/regen-topo.cjs      (ou: npm run topo)
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const { resolve } = require('path');

const SRC = resolve(__dirname, '../../topo-blocabrac-source.html');
const OUT = resolve(__dirname, '../../topo-blocabrac.pdf');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(SRC).href, { waitUntil: 'networkidle' });
  // Les marges sont dans le CSS (.page : padding 18mm 16mm), donc marges PDF à zéro.
  await page.pdf({ path: OUT, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await browser.close();
  console.log(`✅ ${OUT} régénéré.`);
})().catch((e) => { console.error(e); process.exit(1); });
