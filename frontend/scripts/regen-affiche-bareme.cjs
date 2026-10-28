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

  // --- La courbe ------------------------------------------------------------------------
  // ⚠️ Les ordonnées ne sont PAS un second calcul : ce sont les points du BLEU, obtenus par
  // le meme appel que la table. Le bleu valant 100 de base, sa ligne SE LIT directement en
  // pourcentage — la courbe est donc litteralement la ligne « bleu » imprimee au-dessus
  // d'elle, et le script le VERIFIE. Un graphique qui raconterait autre chose que les
  // chiffres au-dessus de lui serait pire que pas de graphique du tout.
  if (basePoints.bleu !== 100) {
    throw new Error(`le bleu vaut ${basePoints.bleu} et non 100 : la courbe ne se lit plus en pourcentage, il faut changer son axe`);
  }
  const X_MAX = ESSAIS[ESSAIS.length - 1]; // meme borne que la derniere colonne de la table
  const serie = [];
  for (let n = 1; n <= X_MAX; n += 1) serie.push([n, points('bleu', n)]);
  // L'identite courbe / table, affirmee colonne par colonne.
  ESSAIS.forEach(n => {
    const surLaCourbe = serie[n - 1][1];
    const dansLaTable = points('bleu', n);
    if (surLaCourbe !== dansLaTable) throw new Error(`à ${n} essai(s) la courbe dit ${surLaCourbe} et la table ${dansLaTable}`);
  });
  if (serie.length !== X_MAX) throw new Error(`la courbe a ${serie.length} points au lieu de ${X_MAX}`);

  const PLANCHER_PCT = Math.round(PLANCHER_RATIO * 100);
  // Repere : x de 1 a X_MAX essais, y de 0 a 100 % de la valeur du bloc. UN SEUL axe des
  // ordonnees, une seule serie — donc pas de legende, le titre de la figure la nomme.
  const X0 = 52, X1 = 684, Y0 = 28, Y1 = 148;
  const sx = (n) => X0 + ((n - 1) / (X_MAX - 1)) * (X1 - X0);
  const sy = (v) => Y1 - (v / 100) * (Y1 - Y0);
  const f2 = (v) => Math.round(v * 100) / 100;

  const grille = [0, 25, 50, 75, 100].map(v =>
    `<line x1="${X0}" y1="${f2(sy(v))}" x2="${X1}" y2="${f2(sy(v))}" class="g" />`
    + `<text x="${X0 - 8}" y="${f2(sy(v)) + 4}" class="ty">${v} %</text>`).join('');
  const ticksX = [1, 5, 10, 20, 30, 40, 50].filter(n => n <= X_MAX).map(n =>
    `<text x="${f2(sx(n))}" y="164" class="tx">${n}</text>`).join('');
  const trace = serie.map(([n, v]) => `${f2(sx(n))},${f2(sy(v))}`).join(' ');
  const aire = `${X0},${f2(sy(0))} ${trace} ${X1},${f2(sy(0))}`;
  // Reperes directs sur quelques essais seulement — jamais un nombre sur chaque point.
  // ⚠️ 1 essai est MARQUE mais pas ETIQUETE : son point est dans l'angle haut-gauche, et son
  // etiquette se superposait a celle de 2 essais et a la graduation « 100 % » de l'axe —
  // trois textes au meme endroit, vu en regardant le PDF. L'axe dit deja 100 %.
  const ETIQUETES = [2, 5, 10, 20].filter(n => n <= X_MAX);
  const jalons = [1, ...ETIQUETES].map(n => {
    const v = serie[n - 1][1];
    const point = `<circle cx="${f2(sx(n))}" cy="${f2(sy(v))}" r="4.5" class="pt" />`;
    if (!ETIQUETES.includes(n)) return point;
    // ⚠️ Une etiquette centree sur un point proche du bord gauche deborde sur les
    // graduations de l'axe et s'y fond (« 100 %89 % », vu dans le PDF). REGLE, pas cas
    // particulier : trop pres du bord, l'etiquette passe a droite du point.
    const AU_BORD = sx(n) - 22 < X0;
    const ancre = AU_BORD ? 'start' : 'middle';
    const dx = AU_BORD ? 9 : 0;
    return point + `<text x="${f2(sx(n) + dx)}" y="${f2(sy(v)) - 9}" text-anchor="${ancre}" class="lab">${v} %</text>`;
  }).join('');

  const courbe = [
    `<svg viewBox="0 0 700 185" role="img" aria-labelledby="courbe-t courbe-d" class="courbe">`,
    `<title id="courbe-t">Points restants selon le nombre d'essais</title>`,
    `<desc id="courbe-d">La valeur d'un bloc réussi chute vite sur les premiers essais puis s'aplatit, sans jamais descendre sous ${PLANCHER_PCT} % de sa valeur. Les mêmes nombres figurent dans la table ci-dessus.</desc>`,
    grille,
    `<polygon points="${aire}" class="aire" />`,
    `<line x1="${X0}" y1="${f2(sy(PLANCHER_PCT))}" x2="${X1}" y2="${f2(sy(PLANCHER_PCT))}" class="pl" />`,
    `<text x="${X0 + 6}" y="${f2(sy(PLANCHER_PCT)) - 6}" class="labpl">plancher : ${PLANCHER_PCT} %</text>`,
    `<polyline points="${trace}" class="ln" />`,
    jalons,
    `<line x1="${X0}" y1="${Y1}" x2="${X1}" y2="${Y1}" class="ax" />`,
    ticksX,
    `<text x="${f2((X0 + X1) / 2)}" y="180" text-anchor="middle" class="tx">nombre d'essais</text>`,
    `</svg>`,
  ].join('');

  const guide = fs.readFileSync(GUIDE, 'utf8');
  const fontFace = extrait(guide, /@font-face\s*\{[\s\S]*?\}/, 'La règle @font-face Dosis');
  const logo = extrait(guide, /<div class="logo-badge"><img src="(data:image\/png;base64,[A-Za-z0-9+/=]+)"/, 'Le logo');

  let html = fs.readFileSync(GABARIT, 'utf8');
  html = injecte(html, '<!--FONT-FACE-->', fontFace);
  html = injecte(html, '<!--LOGO-->', logo);
  html = injecte(html, '<!--ENTETE-->', entete);
  html = injecte(html, '<!--TABLE-->', lignes.trimStart());
  html = injecte(html, '<!--COURBE-->', courbe);
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
  console.log(`✅ courbe : ${serie.length} points (1 à ${X_MAX} essais), identiques à la ligne « bleu » de la table.`);
  console.log(`✅ ${OUT_HTML}`);
  console.log(`✅ ${OUT_PDF}`);
})().catch((e) => { console.error(e); process.exit(1); });
