// Régénère l'affiche du barème de compétition (HTML servi en ligne + PDF imprimable) depuis
// ../../affiche-bareme-competition-source.html.
//   cd frontend && node scripts/regen-affiche-bareme.cjs      (ou: npm run affiche:bareme)
//
// ⚠️ LA RAISON D'ÊTRE DE CE SCRIPT EST LA TABLE, ET ELLE N'EST PAS SAISIE À LA MAIN : elle est
// calculée en important `src/utils/climbingPoints.ts`, c'est-à-dire LE calcul de l'application.
// L'affiche est un artefact qui SORT de l'application (§5 du plan du 28/10/2026 : on publie la
// table, pas la formule), et un chiffre affiché qui ne serait pas celui que le code calcule
// serait pire que l'ancien barème — c'est le grimpeur qui a soulevé la question qui s'en
// apercevrait le premier. Réimplémenter la formule ici fabriquerait une divergence de plus,
// exactement comme l'aurait fait un script de palmarès (voir CLAUDE.md).
//
// Node ≥ 22.18 déshabille les types TypeScript tout seul, donc `import()` du .ts suffit : pas
// de dépendance de compilation ajoutée pour cela.
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const { resolve } = require('path');
const fs = require('fs');

const GABARIT = resolve(__dirname, '../../affiche-bareme-competition-source.html');
const GUIDE = resolve(__dirname, '../public/docs/aide-connexion-installation.html');
const OUT_HTML = resolve(__dirname, '../public/docs/affiche-bareme-competition.html');
const OUT_PDF = resolve(__dirname, '../public/docs/affiche-bareme-competition.pdf');

// L'ordre du barème, du plus facile au plus dur, et la pastille de couleur qui l'accompagne.
const COULEURS = [
  ['jaune', '#F2C200'],
  ['vert', '#36A13B'],
  ['bleu', '#1E6FD9'],
  ['violet', '#8E44AD'],
  ['rouge', '#D32F2F'],
  ['noir', '#1A1A1A'],
  ['blanc', '#FFFFFF'],
  ['rose', '#E91E8C'],
];
const ESSAIS = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50];
const MODE = 'blocabrac_plancher';

// Remplacement COMPTÉ : un marqueur absent ou en double, et le document sortirait plausible et
// faux (un marqueur non remplacé n'est pas visible dans un PDF, c'est un commentaire HTML).
const injecte = (html, marqueur, valeur) => {
  const n = html.split(marqueur).length - 1;
  if (n !== 1) throw new Error(`Marqueur ${marqueur} présent ${n} fois (attendu : 1)`);
  return html.replace(marqueur, valeur);
};

const extrait = (source, regex, quoi) => {
  const m = source.match(regex);
  if (!m) throw new Error(`${quoi} introuvable dans aide-connexion-installation.html`);
  return m[1] !== undefined ? m[1] : m[0];
};

(async () => {
  const { calculateCompetitionPoints, basePoints, PLANCHER_RATIO } =
    await import(pathToFileURL(resolve(__dirname, '../src/utils/climbingPoints.ts')).href);

  const points = (couleur, essais) =>
    calculateCompetitionPoints({ color: couleur }, essais, true, MODE);

  // ⚠️ Contrôle de cohérence AVANT d'écrire : si le mode avait disparu ou changé de clé,
  // `calculateCompetitionPoints` retomberait silencieusement sur l'ancien barème et l'affiche
  // publierait des zéros plausibles. On vérifie donc les deux propriétés que l'affiche AFFIRME
  // en toutes lettres, sur toute la plage utile — pas seulement sur les colonnes imprimées.
  for (let essais = 1; essais <= 500; essais += 1) {
    let precedent = 0;
    for (const [couleur] of COULEURS) {
      const v = points(couleur, essais);
      if (!(v > 0)) throw new Error(`${couleur} à ${essais} essai(s) vaut ${v} : l'affiche promet qu'un bloc réussi rapporte toujours des points`);
      if (!(v > precedent)) throw new Error(`${couleur} à ${essais} essai(s) ne dépasse pas la couleur précédente (${v} ≤ ${precedent}) : l'affiche promet l'ordre des couleurs`);
      precedent = v;
    }
  }
  for (const [couleur] of COULEURS) {
    if (points(couleur, 1) !== basePoints[couleur]) throw new Error(`${couleur} au premier essai ne vaut pas sa base : l'affiche promet que le flash est le maximum`);
  }

  const entete = ['<th>couleur</th>']
    .concat(ESSAIS.map((n, i) => `<th>${n}${i === ESSAIS.length - 1 ? '+' : ''}${i === 0 ? ' essai' : ''}</th>`))
    .join('');

  const lignes = COULEURS.map(([couleur, teinte]) => {
    const cellules = ESSAIS.map((n, i) => {
      const classe = i === 0 ? ' class="flash"' : (i === ESSAIS.length - 1 ? ' class="plancher"' : '');
      return `<td${classe}>${points(couleur, n)}</td>`;
    }).join('');
    return `        <tr><th><span class="pastille" style="background:${teinte}"></span>${couleur}</th>${cellules}</tr>`;
  }).join('\n');

  const guide = fs.readFileSync(GUIDE, 'utf8');
  const fontFace = extrait(guide, /@font-face\s*\{[\s\S]*?\}/, 'La règle @font-face Dosis');
  const logo = extrait(guide, /<div class="logo-badge"><img src="(data:image\/png;base64,[A-Za-z0-9+/=]+)"/, 'Le logo');

  let html = fs.readFileSync(GABARIT, 'utf8');
  html = injecte(html, '<!--FONT-FACE-->', fontFace);
  html = injecte(html, '<!--LOGO-->', logo);
  html = injecte(html, '<!--ENTETE-->', entete);
  html = injecte(html, '<!--TABLE-->', lignes.trimStart());
  html = injecte(html, '<!--PIED-->', `Barème en vigueur depuis le ${new Date().toLocaleDateString('fr-FR')} · minimum garanti : ${Math.round(PLANCHER_RATIO * 100)} % de la valeur du bloc`);

  fs.writeFileSync(OUT_HTML, html);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  // Les marges sont dans le CSS (.page : padding), donc marges PDF à zéro — même convention
  // que les deux topos.
  await page.pdf({ path: OUT_PDF, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });

  // ⚠️ Une affiche qui déborde sur une 2ᵉ page perd son encadré de bas de page EN SILENCE
  // (même défaut que les pieds de page du topo). Le garde est donc à l'ÉVÉNEMENT, ici, et pas
  // dans un contrôle qu'il faudrait penser à lancer.
  const pages = (await page.evaluate(() => {
    const p = document.querySelector('.page');
    // 297 mm à 96 dpi = 1122,5 px ; on tolère 4 px d'arrondi de rendu.
    return Math.ceil((p.getBoundingClientRect().height - 4) / 1122.5);
  }));
  await browser.close();
  if (pages !== 1) throw new Error(`L'affiche tient sur ${pages} page(s) : elle doit en faire exactement 1, sinon l'encadré de bas de page disparaît.`);

  // ⚠️ Tout script dont la raison d'être est un effet de bord ANNONCE son effet : un succès
  // silencieux est indiscernable d'un no-op.
  console.log(`✅ ${COULEURS.length} couleurs × ${ESSAIS.length} colonnes = ${COULEURS.length * ESSAIS.length} valeurs calculées par climbingPoints.ts (mode « ${MODE} »), 1 page.`);
  console.log(`✅ ${OUT_HTML}`);
  console.log(`✅ ${OUT_PDF}`);
})().catch((e) => { console.error(e); process.exit(1); });
