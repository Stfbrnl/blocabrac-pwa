// Régénère le diplôme VIERGE imprimable, servi depuis public/docs/ et listé dans
// « Documents de la salle ».
//   cd frontend && node scripts/regen-diplome-vierge.cjs      (ou: npm run diplome:vierge)
//
// ⚠️ LE GABARIT N'EST PAS ÉCRIT ICI : il est importé de `src/utils/diplomaTemplate.ts`, c'est-
// à-dire du code qui produit les VRAIS diplômes dans l'application. Le recopier dans ce script
// aurait fabriqué la panne que ce dépôt sait nommer — une transcription littérale ne bouge pas
// quand la donnée bouge — et ce document-ci est IMPRIMÉ, donc définitif : il aurait cessé de
// ressembler au diplôme réel à la première retouche d'un des deux écrans, sans qu'aucun test
// ne rougisse. Même raison que l'affiche du barème, qui importe `climbingPoints.ts`.
//
// ⚠️ LE FOND EST L'ŒUVRE DU DIPLÔME (`assets/diploma-background.png`), la même que celle des
// deux écrans depuis le correctif du 10/11/2026 — `ClientStats.tsx` passait le logo, et
// produisait un diplôme sans œuvre. La zone de texte du gabarit est calibrée sur les
// diagonales de cette image : le fond n'est pas un choix de style, c'est la condition de
// lisibilité du texte. Ici elle est inlinée en `data:` URI, pour que la page rendue soit
// autonome et que le PDF ne dépende d'aucune requête qui pourrait échouer en silence.
//
// ⚠️ CE DOCUMENT NE PORTE PAS D'ESTAMPILLE IMPRIMÉE, contrairement aux deux topos. Un numéro
// de version sur un diplôme qu'un grimpeur affiche chez lui n'a aucun sens, et un diplôme ne
// se périme pas. L'estampille est donc enregistrée pour l'ÉCRAN seulement (même traitement que
// l'affiche du barème) : c'est un fait sur le fichier — quelle version du dépôt l'a produit, et
// quand — pas une relecture du document.
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const { resolve } = require('path');
const fs = require('fs');
const { versionDuDepot, formatDateFr, enregistrerEstampille } = require('./topo-stamp.cjs');

const FOND = resolve(__dirname, '../src/assets/diploma-background.png');
const OUT_PDF = resolve(__dirname, '../public/docs/diplome-vierge.pdf');
const NOM_PDF = 'diplome-vierge.pdf';

// A4 paysage à 96 dpi, l'unité dans laquelle Chromium met en page.
const PAGE_L = 1122.5; // 297 mm
const PAGE_H = 793.7; //  210 mm

(async () => {
  const {
    CHAMPS_DIPLOME_VIERGE,
    DIPLOME_HAUTEUR_PX,
    DIPLOME_LARGEUR_PX,
    LIGNE_A_REMPLIR,
    POLICE_CSS_URL,
    composerDiplomeHtml,
  } = await import(pathToFileURL(resolve(__dirname, '../src/utils/diplomaTemplate.ts')).href);

  // Le fond en ligne : la page rendue est autonome, donc le PDF ne dépend d'aucun chemin
  // relatif ni d'aucune requête qui pourrait échouer en silence et produire un diplôme nu.
  const fondDataUri = `data:image/png;base64,${fs.readFileSync(FOND).toString('base64')}`;

  // ⚠️ MISE À L'ÉCHELLE PAR `transform`, et pas en redimensionnant le bloc : les tailles de
  // police du gabarit sont en PIXELS, calibrées pour 800 × 600. Donner au bloc une taille en
  // millimètres laisserait le texte à sa taille d'origine — un diplôme au texte minuscule
  // dans un coin. Un `transform: scale` emporte tout, texte compris.
  //
  // Le facteur est borné par la HAUTEUR (le diplôme est en 4:3, la page en 1,41:1) : à
  // l'échelle de la largeur il déborderait verticalement.
  const echelle = PAGE_H / DIPLOME_HAUTEUR_PX;
  const largeurRendue = DIPLOME_LARGEUR_PX * echelle;
  const decalageX = (PAGE_L - largeurRendue) / 2;

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Diplôme Blocabrac — à remplir</title>
<link rel="stylesheet" href="${POLICE_CSS_URL}">
<style>
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; padding: 0; }
  /* Fond blanc : les bandes laissées par le rapport 4:3 sur une page 1,41:1 doivent être
     blanches à l'impression, pas transparentes (une transparence s'imprime en gris sur
     certaines imprimantes). */
  body { width: ${PAGE_L}px; height: ${PAGE_H}px; background: #fff; overflow: hidden; }
  #scene { position: relative; width: ${PAGE_L}px; height: ${PAGE_H}px; }
  #diplome {
    position: absolute; top: 0; left: ${decalageX}px;
    transform: scale(${echelle}); transform-origin: top left;
  }
</style>
</head>
<body><div id="scene"><div id="diplome">${composerDiplomeHtml(CHAMPS_DIPLOME_VIERGE, fondDataUri)}</div></div></body>
</html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Math.ceil(PAGE_L), height: Math.ceil(PAGE_H) } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  // La police doit être là AVANT la capture : sinon le diplôme sort en police de repli, ce
  // qui est parfaitement lisible et donc indétectable à la relecture d'un journal.
  await page.evaluate(() => document.fonts.ready);
  const policeChargee = await page.evaluate(() => document.fonts.check('16px "EB Garamond"'));

  // ─── Les trois contrôles, AVANT d'écrire quoi que ce soit ───────────────────────────────
  // ⚠️ Un garde qui échoue ne doit rien laisser derrière lui : placés après `page.pdf()`, ils
  // crieraient juste tout en laissant sur le disque le PDF fautif — celui qu'on imprime.
  // Leçon du 07/11/2026 (le filet des pieds de page du topo).

  // ① Le document est VIERGE, mesuré sur le DOM RENDU et pas sur la chaîne du gabarit (que le
  //    test unitaire couvre déjà) : c'est le document imprimé qui ne doit porter aucune
  //    donnée personnelle, puisqu'il part dans un dossier servi sans authentification.
  const texteRendu = await page.evaluate(() => document.getElementById('diplome').innerText);
  const chiffres = texteRendu.match(/\d/g) ?? [];
  if (chiffres.length > 0) {
    await browser.close();
    throw new Error(`Le diplôme vierge contient ${chiffres.length} chiffre(s) : « ${texteRendu.replace(/\s+/g, ' ')} ». Un vierge ne porte ni date ni nom.`);
  }
  // ⚠️ Normaliser LES DEUX CÔTÉS : `innerText` rend les espaces insécables tels quels, et ne
  // normaliser que l'aiguille donnait 0 trait sur un document parfaitement correct — un garde
  // qui échoue à tort est aussi coûteux qu'un garde qui laisse passer.
  const sansInsecables = (t) => t.replace(/ /g, ' ');
  const traits = sansInsecables(texteRendu).split(sansInsecables(LIGNE_A_REMPLIR)).length - 1;
  if (traits !== 4) {
    await browser.close();
    throw new Error(`${traits} trait(s) à remplir au lieu de 4 : les quatre champs (titulaire, type, date, signataire) doivent tous être remplissables.`);
  }

  // ② Rien ne déborde de la page. ⚠️ La MARGE n'est pas observable (la scène déclare une
  //    hauteur fixe) : seul le débordement se mesure, d'où un contrôle sur le rectangle réel
  //    du diplôme mis à l'échelle, et non sur l'espace qui resterait autour.
  const boite = await page.evaluate(() => {
    const r = document.getElementById('diplome').getBoundingClientRect();
    return { x: r.x, y: r.y, droite: r.right, bas: r.bottom };
  });
  const debordements = [];
  if (boite.x < -0.5) debordements.push(`gauche (${boite.x.toFixed(1)}px)`);
  if (boite.y < -0.5) debordements.push(`haut (${boite.y.toFixed(1)}px)`);
  if (boite.droite > PAGE_L + 0.5) debordements.push(`droite (${(boite.droite - PAGE_L).toFixed(1)}px)`);
  if (boite.bas > PAGE_H + 0.5) debordements.push(`bas (${(boite.bas - PAGE_H).toFixed(1)}px)`);
  if (debordements.length > 0) {
    await browser.close();
    throw new Error(`Le diplôme déborde de la page : ${debordements.join(', ')}. Revoir l'échelle.`);
  }

  // ③ La police est celle du diplôme, pas un repli.
  if (!policeChargee) {
    await browser.close();
    throw new Error("La police EB Garamond n'est pas chargée : le diplôme sortirait en police de repli, lisible et donc indétectable à la relecture.");
  }

  await page.pdf({
    path: OUT_PDF,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await browser.close();

  // ⚠️ Tout script dont la raison d'être est un effet de bord ANNONCE son effet : un succès
  // silencieux est indiscernable d'un no-op.
  const taille = (fs.statSync(OUT_PDF).size / 1024).toFixed(0);
  console.log(`✅ gabarit importé de src/utils/diplomaTemplate.ts (aucune copie dans ce script)`);
  console.log(`✅ 4 traits à remplir, 0 chiffre dans le document rendu, police EB Garamond chargée`);
  console.log(`✅ échelle ${echelle.toFixed(4)} — ${largeurRendue.toFixed(0)} × ${PAGE_H} px dans une page de ${PAGE_L} × ${PAGE_H}, centré (${decalageX.toFixed(0)} px de part et d'autre)`);
  console.log(`✅ ${OUT_PDF} (${taille} Ko)`);

  const estampille = { version: versionDuDepot(), dateTexte: formatDateFr(new Date()) };
  enregistrerEstampille(NOM_PDF, estampille);
  console.log(`✅ registre d'estampilles : ${NOM_PDF} → ${estampille.version}, généré le ${estampille.dateTexte}`);
})().catch((e) => { console.error(e); process.exit(1); });
