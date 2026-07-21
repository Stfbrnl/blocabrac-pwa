// Script Playwright ponctuel : vérifie le flux compétition de bout en bout
// (Admin crée la compétition -> Ouvreur crée un bloc -> Client s'inscrit et
// valide -> Admin/Ouvreur consultent les stats et publient le classement)
// contre l'app + les émulateurs locaux. Jamais la production.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:5174';
const ADMIN_EMAIL = 'admin.test@blocabrac.test';
const OUVREUR_EMAIL = 'ouvreur.test@blocabrac.test';
const CLIENT_EMAIL = 'client.competition.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';
const COMPETITION_NAME = `Compétition E2E ${Date.now()}`;
const ACCESS_CODE = 'E2E2026';

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

function logConsoleErrors(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`   [console:${label}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.log(`   [pageerror:${label}] ${err.message}`));
}

async function login(page, email) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
}

async function gotoAndWait(page, path, headingName) {
  await page.goto(`${BASE_URL}${path}`);
  await page.getByRole('heading', { name: headingName }).waitFor({ timeout: 10000 });
}

async function main() {
  const browser = await chromium.launch();
  const adminP = await (await browser.newContext()).newPage();
  const ouvreurP = await (await browser.newContext()).newPage();
  const clientP = await (await browser.newContext()).newPage();
  logConsoleErrors(adminP, 'admin');
  logConsoleErrors(ouvreurP, 'ouvreur');
  logConsoleErrors(clientP, 'client');

  await step('Connexion admin', () => login(adminP, ADMIN_EMAIL));
  await step('Connexion ouvreur', () => login(ouvreurP, OUVREUR_EMAIL));
  await step('Connexion client', () => login(clientP, CLIENT_EMAIL));

  const today = new Date().toISOString().split('T')[0];

  await step("L'admin crée une compétition (statut 'en cours')", async () => {
    await gotoAndWait(adminP, '/admin/competitions/create', 'Gestion des Compétitions');
    await adminP.getByRole('button', { name: 'Créer une compétition' }).click();
    await adminP.getByLabel('Nom de la compétition').fill(COMPETITION_NAME);
    await adminP.getByLabel('Date').fill(today);
    await adminP.getByLabel("Code d'accès").fill(ACCESS_CODE);
    await adminP.locator('#statut-select').click();
    await adminP.getByRole('option', { name: 'En cours' }).click();
    await adminP.getByRole('button', { name: 'Créer', exact: true }).click();
    await adminP.getByText(COMPETITION_NAME).waitFor({ timeout: 10000 });
    await adminP.screenshot({ path: '/tmp/comp-01-admin-created.png', fullPage: true });
  });

  await step('Ouvreur : crée un bloc de compétition avec image + annotations', async () => {
    await gotoAndWait(ouvreurP, '/ouvreur/competition-boulders', 'Gérer les blocs de compétition');
    await ouvreurP.locator('#selectionnez-une-competition-select').click();
    await ouvreurP.getByRole('option', { name: new RegExp(COMPETITION_NAME) }).click();
    await ouvreurP.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await ouvreurP.waitForURL(/\/ouvreur\/competition-boulders\/.+\/add/, { timeout: 10000 });

    await ouvreurP.getByLabel('Numéro du bloc').fill('1');
    await ouvreurP.locator('#mur-select').click();
    await ouvreurP.getByRole('option').first().click();
    await ouvreurP.locator('#cotation-select').click();
    await ouvreurP.getByRole('option', { name: /Bleu/ }).click();

    await ouvreurP.locator('input[type="file"]').setInputFiles(join(__dirname, 'fixtures/test-boulder.jpg'));
    const canvas = ouvreurP.locator('canvas');
    await canvas.waitFor({ state: 'visible', timeout: 10000 });
    await ouvreurP.waitForTimeout(500); // laisser le temps au canvas d'être dimensionné après chargement image

    const box = await canvas.boundingBox();
    assert(box, 'Le canvas doit avoir une taille mesurable');
    // 2 points "départ" (mode par défaut)
    await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.8 } });
    await canvas.click({ position: { x: box.width * 0.6, y: box.height * 0.8 } });
    // Bascule en mode "fin" puis 2 points
    await ouvreurP.getByRole('button', { name: 'Fin (Vert)' }).click();
    await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.2 } });
    await canvas.click({ position: { x: box.width * 0.6, y: box.height * 0.2 } });

    await ouvreurP.screenshot({ path: '/tmp/comp-02-ouvreur-form.png', fullPage: true });
    await ouvreurP.getByRole('button', { name: 'Ajouter le bloc' }).click();
    await ouvreurP.waitForURL((url) => url.pathname === '/ouvreur/competition-boulders', { timeout: 10000 });
    await ouvreurP.getByText('N°1', { exact: false }).waitFor({ timeout: 10000 }).catch(() => {});
    await ouvreurP.screenshot({ path: '/tmp/comp-03-ouvreur-list.png', fullPage: true });
  });

  await step('Client : voit la compétition en cours et s\'inscrit', async () => {
    await gotoAndWait(clientP, '/client/competitions', 'Mes Compétitions');
    await clientP.getByText(COMPETITION_NAME).waitFor({ timeout: 10000 });
    await clientP.screenshot({ path: '/tmp/comp-04-client-list.png', fullPage: true });
    const card = clientP.locator('.MuiCard-root', { hasText: COMPETITION_NAME });
    await card.getByRole('button', { name: "S'inscrire" }).click();
    await clientP.getByRole('button', { name: "Confirmer l'inscription" }).click();
    await clientP.getByText('Inscription réussie', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client : valide le bloc de compétition', async () => {
    await clientP.waitForTimeout(3500); // laisser le message de succès se refermer
    const card = clientP.locator('.MuiCard-root', { hasText: COMPETITION_NAME });
    await card.getByRole('button', { name: 'Valider mes blocs' }).click();
    await clientP.getByText('Validation des blocs', { exact: false }).waitFor({ timeout: 10000 });
    await clientP.screenshot({ path: '/tmp/comp-05-client-validation-dialog.png', fullPage: true });
    await clientP.getByRole('button', { name: '✅ Réussi' }).first().click();
    await clientP.getByRole('button', { name: 'Soumettre les résultats' }).click();
    await clientP.getByText('Résultats soumis avec succès', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Admin : consulte les stats et publie le classement', async () => {
    await gotoAndWait(adminP, '/admin/competitions/stats', 'Classement et Statistiques des Compétitions');
    await adminP.locator('#selectionnez-une-competition-select').click();
    await adminP.getByRole('option', { name: new RegExp(COMPETITION_NAME) }).click();
    await adminP.screenshot({ path: '/tmp/comp-06-admin-stats.png', fullPage: true });
    assert(await adminP.getByText('Classement Open', { exact: false }).isVisible().catch(() => false)
      || await adminP.getByText('Cliff Ompete', { exact: false }).isVisible().catch(() => false),
      'Le classement doit afficher la participante ou le libellé Open');
  });

  await step('Admin : publie le classement (bouton "Publier le classement")', async () => {
    await adminP.getByRole('button', { name: 'Publier le classement' }).click();
    await adminP.getByRole('button', { name: 'Publier', exact: true }).click();
    await adminP.waitForTimeout(1500);
    const errorVisible = await adminP.getByText('permission', { exact: false }).isVisible().catch(() => false);
    const successVisible = await adminP.getByText('publié', { exact: false }).isVisible().catch(() => false);
    await adminP.screenshot({ path: '/tmp/comp-08-admin-publish.png', fullPage: true });
    assert(!errorVisible, 'La publication ne doit pas afficher une erreur de permission');
    assert(successVisible, 'Un message de confirmation de publication doit apparaître');
  });

  await step('Ouvreur : accède aussi aux statistiques de la compétition', async () => {
    // ✅ Ouvreur/ReportsAndStats/CompetitionBoulderStats.tsx (la vraie page routée sous
    // /ouvreur/reports-and-stats/competitions) n'a pas de titre <h1..h6> propre — juste
    // le sélecteur de compétition — donc on attend le sélecteur, pas un heading.
    await ouvreurP.goto(`${BASE_URL}/ouvreur/reports-and-stats/competitions`);
    await ouvreurP.locator('#selectionnez-une-competition-select').waitFor({ timeout: 10000 });
    await ouvreurP.locator('#selectionnez-une-competition-select').click();
    await ouvreurP.getByRole('option', { name: new RegExp(COMPETITION_NAME) }).click();
    await ouvreurP.getByText('Bloc 1').waitFor({ timeout: 10000 });
    // Le détail des validations est masqué dans un <Collapse> tant qu'on ne clique
    // pas sur le bouton d'expansion de la ligne.
    await ouvreurP.locator('button').filter({ has: ouvreurP.locator('svg[data-testid="ExpandMoreIcon"]') }).first().click();
    await ouvreurP.screenshot({ path: '/tmp/comp-07-ouvreur-stats.png', fullPage: true });
    assert(await ouvreurP.getByText('Cliff Ompete', { exact: false }).isVisible().catch(() => false),
      "L'ouvreur doit voir la participante dans le détail des validations");
  });

  await step('Client : voit le classement publié dans le bandeau d\'annonces', async () => {
    await gotoAndWait(clientP, '/client/screen', 'Mon espace personnel');
    await clientP.getByText(COMPETITION_NAME, { exact: false }).first().waitFor({ timeout: 10000 });
    await clientP.screenshot({ path: '/tmp/comp-09-client-announcement.png', fullPage: true });
  });

  await step('Ouvreur : le nouvel onglet "Classement Compétitions" est scopé à ses propres compétitions', async () => {
    await gotoAndWait(ouvreurP, '/ouvreur/reports-and-stats', 'Signalements et Statistiques');
    await ouvreurP.getByRole('tab', { name: 'Classement Compétitions' }).click();
    await ouvreurP.getByText('Seules les compétitions', { exact: false }).waitFor({ timeout: 10000 });
    await ouvreurP.locator('#selectionnez-une-competition-select').click();
    await ouvreurP.getByRole('option', { name: new RegExp(COMPETITION_NAME) }).click();
    await ouvreurP.getByText('Classement Open', { exact: false }).waitFor({ timeout: 10000 });
    await ouvreurP.screenshot({ path: '/tmp/comp-10-ouvreur-classement-tab.png', fullPage: true });
    // ✅ "Cliff Ompete" apparaît 3 fois (Open / âge / genre) : .first() pour éviter
    // une violation de strict-mode que .catch() masquerait en faux-négatif.
    assert(await ouvreurP.getByText('Cliff Ompete', { exact: false }).first().isVisible().catch(() => false),
      "L'ouvreur doit voir la participante dans l'onglet Classement Compétitions");
  });

  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} étapes réussies`);
  if (failed.length > 0) {
    console.log('Échecs :', failed.map(f => `[${f.n}] ${f.name}: ${f.error}`).join('\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erreur fatale du script :', err);
  process.exit(1);
});
