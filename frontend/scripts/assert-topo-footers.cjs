// Filet sur les topos : AUCUNE section ne doit dépasser la hauteur d'une page A4.
//
// ⚠️ POURQUOI CE SCRIPT EXISTE — un débordement est une défaillance SILENCIEUSE qui détruit de
// l'information. Chaque `<section class="page">` est traitée comme une page physique ; quand
// son contenu dépasse, il coule sur la page suivante **et le pied de page de la page concernée
// disparaît**. Rien ne le signale : la génération réussit, le PDF s'ouvre.
//
// C'est arrivé DEUX FOIS dans la même matinée du 18/10/2026, sur deux pages différentes, en
// ajoutant une ligne de tableau à l'une et deux encadrés à l'autre. Le topo est encore modifié
// régulièrement et il est imprimé pour servir à l'accueil : la vérification ne peut pas rester
// un œil sur un lecteur PDF.
//
// ⚠️ ON MESURE LA CAUSE, PAS LE SYMPTÔME. Compter les pieds de page dans le PDF rendu
// demanderait d'en extraire le texte page par page (pdfjs n'est pas dans ce dépôt) et ne
// dirait que « il en manque un ». Ici on mesure la hauteur de chaque section dans le
// navigateur qui sert déjà à générer le PDF : le script NOMME la section trop pleine et de
// combien, ce qui est l'information dont on a besoin pour la rééquilibrer.
//
// ⚠️ CE QUE CE FILET NE COUVRE PAS, et il faut le dire : il garde la PAGINATION, pas le RENDU.
// Une page peut tenir et rester laide, ou couper un encadré au mauvais endroit. L'impression
// reste nécessaire — deux portées distinctes, comme l'épinglage et l'e2e.
//
//   node scripts/assert-topo-footers.cjs            (les deux topos)
//   node scripts/assert-topo-footers.cjs ../topo-blocabrac-source.html
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const { resolve, basename } = require('path');
const { existsSync } = require('fs');

// 297 mm à 96 dpi, l'unité CSS de référence : c'est la hauteur que `.page` déclare en
// `min-height`, donc une section PLUS HAUTE que ça déborde sur la suivante.
const HAUTEUR_A4_PX = (297 / 25.4) * 96;
// Marge de tolérance : les arrondis de rendu font varier la dernière fraction de pixel.
const TOLERANCE_PX = 2;

const CIBLES = process.argv.length > 2
  ? process.argv.slice(2).map((p) => resolve(process.cwd(), p))
  : [
    resolve(__dirname, '../../topo-blocabrac-source.html'),
    resolve(__dirname, '../../topo-roulettes-defis-source.html'),
  ];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let echec = false;

  for (const chemin of CIBLES) {
    const nom = basename(chemin);
    if (!existsSync(chemin)) {
      console.error(`✘ ${nom} : introuvable (${chemin})`);
      echec = true;
      continue;
    }
    await page.goto(pathToFileURL(chemin).href, { waitUntil: 'networkidle' });
    // ⚠️ Mesurer en média `print` : c'est celui que `page.pdf()` applique, et une feuille
    // `@media print` pourrait changer les hauteurs. Mesurer à l'écran répondrait à côté.
    await page.emulateMedia({ media: 'print' });

    const sections = await page.evaluate((limite) => [...document.querySelectorAll('section.page')]
      .map((s, i) => {
        const titre = s.querySelector('h1, h2')?.textContent.trim().slice(0, 48) || '(sans titre)';
        const pied = !!s.querySelector('footer.pagefoot');
        return { n: i + 1, titre, hauteur: Math.round(s.getBoundingClientRect().height), pied };
      })
      .filter((s) => s.hauteur > limite || !s.pied), HAUTEUR_A4_PX + TOLERANCE_PX);

    const total = await page.evaluate(() => document.querySelectorAll('section.page').length);

    if (sections.length === 0) {
      console.log(`✔ ${nom} : ${total} sections, toutes dans une page, toutes avec leur pied.`);
    } else {
      echec = true;
      console.error(`✘ ${nom} : ${total} sections, ${sections.length} en défaut.`);
      for (const s of sections) {
        if (!s.pied) {
          console.error(`   section ${s.n} « ${s.titre} » : AUCUN footer.pagefoot.`);
        } else {
          const debord = s.hauteur - Math.round(HAUTEUR_A4_PX);
          console.error(
            `   section ${s.n} « ${s.titre} » : ${s.hauteur} px pour ${Math.round(HAUTEUR_A4_PX)} `
            + `disponibles — déborde de ${debord} px, son pied de page disparaîtra.`
          );
        }
      }
      console.error(
        '   Rééquilibrer en déplaçant EXPLICITEMENT un groupe sur une page de suite '
        + '(le document le fait déjà pour plusieurs sections), puis régénérer.'
      );
    }
  }

  await browser.close();
  process.exit(echec ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
