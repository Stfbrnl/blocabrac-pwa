// Régénère ../public/docs/topo-blocabrac.pdf depuis ../../topo-blocabrac-source.html.
//
// ⚠️ LA SORTIE EST DANS public/docs/, PAS À LA RACINE DU DÉPÔT (07/11/2026). Elle y était, et
// un document à la racine n'est SERVI NULLE PART : le topo était donc introuvable autrement
// qu'en ouvrant le dépôt. Le motif correct est celui de regen-affiche-bareme.cjs — la SOURCE
// reste à la racine (ce n'est pas un document, c'est un gabarit), la SORTIE va dans le
// périmètre servi. Changer ce chemin remettrait le document hors de portée en silence, à la
// prochaine régénération et non au moment du changement.
// Playwright (chromium) est déjà une devDependency du frontend.
//   cd frontend && node scripts/regen-topo.cjs      (ou: npm run topo)
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const { resolve } = require('path');
const { rmSync } = require('fs');
const { preparerSourceEstampillee, enregistrerEstampille } = require('./topo-stamp.cjs');

const SRC = resolve(__dirname, '../../topo-blocabrac-source.html');
const OUT = resolve(__dirname, '../public/docs/topo-blocabrac.pdf');
const NOM = 'topo-blocabrac.pdf';

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
    // ✅ L'estampille n'est enregistrée pour l'écran QU'APRÈS avoir été relue dans le DOM
    // rendu ci-dessus et APRÈS l'écriture du PDF : l'écran ne doit jamais annoncer une
    // estampille dont le document correspondant n'existe pas.
    enregistrerEstampille(NOM, { version, dateTexte });
    // ✅ Annonce l'effet : un succès silencieux est indiscernable d'un no-op.
    console.log(`   estampille posée : ${version}, généré le ${dateTexte} (+ registre)`);
  } finally {
    await browser.close();
    rmSync(cheminTemp, { force: true });
  }
  // ✅ Garde à l'ÉVÉNEMENT plutôt que compte affiché : la pagination ne change qu'à une
  // régénération, donc c'est ici qu'elle se vérifie — pas dans un contrôle qu'il faudrait
  // penser à lancer. Un débordement fait disparaître un pied de page EN SILENCE.
  require("child_process").execFileSync(
    "node", [resolve(__dirname, "assert-topo-footers.cjs"), resolve(__dirname, "../../topo-blocabrac-source.html")],
    { stdio: "inherit" }
  );
  console.log(`✅ ${OUT} régénéré.`);
})().catch((e) => { console.error(e); process.exit(1); });
