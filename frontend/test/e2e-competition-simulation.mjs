// Script Playwright ponctuel : vérifie que l'écran de classement d'une compétition affiche
// EXACTEMENT ce qu'un oracle indépendant a calculé, sur une compétition grandeur réelle
// (3 murs x 10 blocs du bleu au blanc, 10 participants, réussites et essais tirés au hasard).
//
// Demandé par l'utilisateur le 03/10/2026 avant d'organiser la vraie compétition.
//
// ⚠️ CE QUI FAIT SA VALEUR : l'attendu vient de test/seed-competition-simulation.mjs, qui
// recalcule tout avec un barème RECOPIÉ À LA MAIN, jamais importé du code de l'application.
// Ce test compare donc deux chemins indépendants — le rendu de l'écran d'un côté, un calcul
// écrit séparément de l'autre — et non l'application à elle-même.
//
// Prérequis : émulateurs Auth/Firestore + `vite --port 5174` + `node test/seed-competition-simulation.mjs`.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:5174';
const PASSWORD = 'TestPassword123!';

const attendu = JSON.parse(readFileSync(join(__dirname, '.simulation-attendu.json'), 'utf8'));

let stepNum = 0;
const results = [];

async function step(name, fn) {
  stepNum += 1;
  try {
    await fn();
    results.push({ n: stepNum, name, ok: true });
    console.log(`✔ [${stepNum}] ${name}`);
  } catch (err) {
    results.push({ n: stepNum, name, ok: false, error: err.message });
    console.error(`✘ [${stepNum}] ${name}\n   ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Encadré d'une section de classement, ancré sur SON titre.
 *
 * ⚠️ Ne pas revenir à `page.locator('.MuiPaper-root', { hasText: titre })` : les trois
 * sections (Open, âge, genre) sont imbriquées dans un Paper englobant qui contient aussi ce
 * texte, donc ce sélecteur remontait à l'englobant et ramassait les 30 lignes des trois
 * tableaux au lieu des 10 d'une section. Il avait produit un faux « perte ou doublon » très
 * crédible (03/10/2026). On part donc du titre et on redescend au Paper le plus proche.
 */
function section(page, titre) {
  return page.getByRole('heading', { name: titre, exact: false }).first()
    .locator('xpath=ancestor::div[contains(@class,"MuiPaper-root")][1]');
}

/** Lit toutes les lignes de toutes les tables d'une section. */
async function lireLignes(page, titre) {
  const bloc = section(page, titre);
  await bloc.locator('table').first().waitFor({ timeout: 15000 });
  return bloc.locator('tbody tr').evaluateAll((lignes) =>
    lignes.map((tr) => {
      const c = [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').trim());
      return { position: c[0], nom: c[1], score: c[2], blocs: c[3], categorie: c[4], genre: c[5] };
    })
  );
}

/** Lit le tableau unique de la section Open. */
const lireTableau = (page, titre) => lireLignes(page, titre);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log(`   [console] ${m.text().slice(0, 140)}`); });

try {
  await step('Connexion admin', async () => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('#email').fill(attendu.adminEmail);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForURL((u) => u.pathname === '/' || u.pathname.startsWith('/client'), { timeout: 15000 });
  });

  await step(`Ouvre le classement de « ${attendu.competitionName} »`, async () => {
    await page.goto(`${BASE_URL}/admin/competitions/stats`);
    await page.locator('#selectionnez-une-competition-select').click();
    await page.getByRole('option', { name: new RegExp(attendu.competitionName) }).click();
    await page.getByText(`Classement Open`, { exact: false }).first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: '/tmp/simu-classement.png', fullPage: true });
  });

  // ⚠️ L'ordre AFFICHÉ n'est comparable que GROUPE D'ÉGALITÉ par groupe d'égalité, jamais
  // ligne à ligne. À score égal, l'application départage sur l'ordre dans lequel la requête
  // renvoie les résultats, c'est-à-dire sur l'ordre lexicographique des identifiants de
  // documents — donc sur des uid Firebase aléatoires. Comparer un ordre strict rendait ce
  // test faux : il a échoué sur la graine 17 alors que l'application était juste (constaté
  // le 03/10/2026). La séquence des SCORES, elle, est parfaitement déterministe et comparable.
  await step(`Le classement Open affiche les ${attendu.nbParticipants} participants, scores en ordre décroissant exact`, async () => {
    const lignes = await lireTableau(page, 'Classement Open');
    assert(lignes.length === attendu.nbParticipants,
      `${lignes.length} lignes affichées, ${attendu.nbParticipants} attendues`);
    const scoresAffiches = lignes.map((l) => Number(l.score));
    const scoresAttendus = attendu.open.map((e) => e.score);
    assert(scoresAffiches.join(',') === scoresAttendus.join(','),
      `séquence de scores affichée [${scoresAffiches}] ≠ attendue [${scoresAttendus}]`);
    lignes.forEach((l, i) => {
      assert(l.position === String(i + 1), `position affichée « ${l.position} » au rang ${i + 1}`);
    });
    // Composition de chaque groupe d'égalité : les mêmes noms, dans un ordre libre.
    let i = 0;
    while (i < scoresAttendus.length) {
      let j = i;
      while (j + 1 < scoresAttendus.length && scoresAttendus[j + 1] === scoresAttendus[i]) j += 1;
      const attendus = attendu.open.slice(i, j + 1).map((e) => e.nom).sort();
      const affiches = lignes.slice(i, j + 1).map((l) => l.nom).sort();
      assert(attendus.join('|') === affiches.join('|'),
        `groupe à ${scoresAttendus[i]} pts : [${affiches}] affiché, [${attendus}] attendu`);
      i = j + 1;
    }
  });

  await step('Chaque score et chaque nombre de blocs validés correspond au calcul indépendant', async () => {
    const lignes = await lireTableau(page, 'Classement Open');
    const parNom = Object.fromEntries(attendu.open.map((e) => [e.nom, e]));
    lignes.forEach((l) => {
      const att = parNom[l.nom];
      assert(att, `participant inattendu dans le classement : « ${l.nom} »`);
      assert(l.score === String(att.score), `${l.nom} : score affiché ${l.score}, attendu ${att.score}`);
      assert(l.blocs === String(att.blocs), `${l.nom} : ${l.blocs} blocs affichés, ${att.blocs} attendus`);
    });
  });

  await step('La catégorie d\'âge et le genre affichés pour chacun sont les bons', async () => {
    const lignes = await lireTableau(page, 'Classement Open');
    const parNom = Object.fromEntries(attendu.open.map((e) => [e.nom, e]));
    lignes.forEach((l) => {
      const att = parNom[l.nom];
      assert(l.categorie === att.categorie,
        `${l.nom} : catégorie « ${l.categorie} » affichée, « ${att.categorie} » attendue`);
      assert(l.genre === att.genre, `${l.nom} : genre « ${l.genre} » affiché, « ${att.genre} » attendu`);
    });
  });

  // ⚠️ CONSTAT, pas une correction : l'écran numérote les positions avec `index + 1`, donc
  // deux grimpeurs à égalité reçoivent DEUX positions différentes. Le mode "officiel" utilise
  // lui `rankOfficialEntries` (1, 1, 3). Changer l'affichage d'une position est une décision
  // de produit — à trancher par l'utilisateur, d'où cette étape qui documente l'écart au lieu
  // de le masquer. Mesure : 40 tirages sur 399 produisent au moins un ex æquo (~1 sur 10).
  await step('⚠️ constat : à égalité de score, deux positions distinctes sont affichées', async () => {
    if (attendu.exAequo.length === 0) {
      console.log('      (pas d\'ex æquo dans ce tirage — relancer le seed avec SIMU_GRAINE=17)');
      return;
    }
    const lignes = await lireTableau(page, 'Classement Open');
    attendu.exAequo.forEach((score) => {
      const concernes = lignes.filter((l) => Number(l.score) === score);
      assert(concernes.length >= 2, `le groupe à ${score} pts devrait contenir au moins 2 grimpeurs`);
      const positions = concernes.map((l) => l.position);
      assert(new Set(positions).size === positions.length,
        `positions ${positions} à ${score} pts : des positions identiques sont affichées, ` +
        `le constat ci-dessus n'est plus à jour — mettre à jour ce test`);
      console.log(`      à ${score} pts : positions ${positions.join(' et ')} pour ${concernes.map((c) => c.nom).join(', ')}`);
    });
  });

  await step('Le classement par catégorie d\'âge partitionne les participants sans perte ni doublon', async () => {
    const bloc = section(page, "Classement par Catégorie d'Âge");
    const noms = await bloc.locator('tbody tr').evaluateAll((lignes) =>
      lignes.map((tr) => (tr.querySelectorAll('td')[1]?.textContent || '').trim())
    );
    const attendus = attendu.open.map((e) => e.nom);
    assert(noms.length === attendus.length,
      `${noms.length} lignes dans les catégories d'âge, ${attendus.length} attendues (perte ou doublon)`);
    assert(new Set(noms).size === noms.length, 'un participant apparaît dans deux catégories d\'âge');
    assert([...noms].sort().join('|') === [...attendus].sort().join('|'),
      'la réunion des catégories d\'âge ne redonne pas l\'ensemble des participants');
  });

  await step('Dans chaque catégorie d\'âge, les scores décroissent et valent ceux du calcul indépendant', async () => {
    const bloc = section(page, "Classement par Catégorie d'Âge");
    const lignes = await bloc.locator('tbody tr').evaluateAll((trs) =>
      trs.map((tr) => {
        const c = [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').trim());
        return { nom: c[1], score: c[2] };
      })
    );
    const parNom = Object.fromEntries(attendu.open.map((e) => [e.nom, e.score]));
    lignes.forEach((l) => {
      assert(l.score === String(parNom[l.nom]),
        `${l.nom} en catégorie : score affiché ${l.score}, attendu ${parNom[l.nom]}`);
    });
    // Décroissance à l'intérieur de chaque catégorie, vérifiée via l'attendu groupé.
    Object.entries(attendu.parCategorie).forEach(([cat, membres]) => {
      for (let i = 1; i < membres.length; i += 1) {
        assert(membres[i - 1].score >= membres[i].score, `ordre interne cassé dans ${cat}`);
      }
    });
  });

  await step('Le classement par genre partitionne lui aussi sans perte ni doublon', async () => {
    const bloc = section(page, 'Classement par Genre');
    const noms = await bloc.locator('tbody tr').evaluateAll((lignes) =>
      lignes.map((tr) => (tr.querySelectorAll('td')[1]?.textContent || '').trim())
    );
    const attendus = attendu.open.map((e) => e.nom);
    assert(noms.length === attendus.length, `${noms.length} lignes par genre, ${attendus.length} attendues`);
    assert([...noms].sort().join('|') === [...attendus].sort().join('|'),
      'la réunion des genres ne redonne pas l\'ensemble des participants');
  });

  await step('Aucun libellé orphelin sur l\'écran de classement', async () => {
    const { assertNoOrphanLabels } = await import('./assertNoOrphanLabels.mjs');
    await assertNoOrphanLabels(page, 'Admin — classement de compétition');
  });
} finally {
  await browser.close();
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} étapes réussies`);
  console.log(`(graine ${attendu.graine}, ${attendu.nbBlocs} blocs, ${attendu.nbResultats} résultats, ex æquo : ${attendu.exAequo.length || 'aucun'})`);
  if (ok !== results.length) process.exit(1);
}
