// Régénère ../../topo-roulettes-defis.pdf depuis ../../topo-roulettes-defis-source.html.
// Document équipe compagnon du Topo Blocabrac, dédié à la Bloc Roulette et aux Défis entre
// potes (catalogue complet + barèmes). Même mécanique que regen-topo.cjs.
//   cd frontend && node scripts/regen-topo-roulettes.cjs      (ou: npm run topo:roulettes)
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const { resolve } = require('path');
const { rmSync } = require('fs');
const { preparerSourceEstampillee } = require('./topo-stamp.cjs');

const SRC = resolve(__dirname, '../../topo-roulettes-defis-source.html');
const OUT = resolve(__dirname, '../../topo-roulettes-defis.pdf');

(async () => {
  // ✅ 03/11/2026 — l'estampille (version + date) est DÉRIVÉE, plus jamais écrite dans le
  // HTML : voir scripts/topo-stamp.cjs pour la raison. On rend une copie estampillée placée
  // À CÔTÉ de la source, pour que le `@import` de police et tout chemin relatif résolvent
  // à l'identique. `preparerSourceEstampillee` LÈVE si un jeton manque — pas de repli.
  const { cheminTemp, version, dateTexte } = preparerSourceEstampillee(SRC);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(cheminTemp).href, { waitUntil: 'networkidle' });
    // ⚠️ On RELIT l'estampille dans le DOM rendu au lieu de faire confiance à la valeur
    // qu'on vient d'injecter : un remplacement réussi dans une chaîne et une estampille
    // réellement PRÉSENTE SUR LA PAGE sont deux choses différentes. C'est une observation
    // du document, pas un littéral du script.
    const vu = await page.evaluate(() => ({
      version: document.querySelector('[data-topo-version]')?.textContent?.trim() ?? null,
      date: document.querySelector('[data-topo-date]')?.textContent?.trim() ?? null,
    }));
    if (vu.version !== version || vu.date !== `Généré le ${dateTexte}`) {
      throw new Error(
        `Estampille absente ou incorrecte dans le rendu : lu ${JSON.stringify(vu)}, `
        + `attendu version=${version} date=Généré le ${dateTexte}`
      );
    }
    // Les marges sont dans le CSS (.page : padding 18mm 16mm), donc marges PDF à zéro.
    await page.pdf({ path: OUT, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    // ✅ Annonce l'effet : un succès silencieux est indiscernable d'un no-op.
    console.log(`   estampille posée : ${version}, généré le ${dateTexte}`);
  } finally {
    await browser.close();
    rmSync(cheminTemp, { force: true });
  }
  // ✅ Garde à l'ÉVÉNEMENT plutôt que compte affiché : la pagination ne change qu'à une
  // régénération, donc c'est ici qu'elle se vérifie — pas dans un contrôle qu'il faudrait
  // penser à lancer. Un débordement fait disparaître un pied de page EN SILENCE.
  require("child_process").execFileSync(
    "node", [resolve(__dirname, "assert-topo-footers.cjs"), resolve(__dirname, "../../topo-roulettes-defis-source.html")],
    { stdio: "inherit" }
  );
  console.log(`✅ ${OUT} régénéré.`);
})().catch((e) => { console.error(e); process.exit(1); });
