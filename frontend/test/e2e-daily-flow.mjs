// Script Playwright ponctuel : vérifie le flux "blocs quotidiens" de bout en bout
// (le plus utilisé par les clients) : création par l'ouvreur -> validation/note/
// signalement par le client -> stats + signalements côté ouvreur -> classement en
// continu. Contre l'app + les émulateurs locaux, jamais la production.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:5174';
const OUVREUR_EMAIL = 'ouvreur.daily.test@blocabrac.test';
const CLIENT_EMAIL = 'client.daily.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';
const WALL = 'Dalle';
const BOULDER_NUMBER = String(Math.floor(Math.random() * 9000) + 100); // évite les collisions entre runs

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
  const ouvreurP = await (await browser.newContext()).newPage();
  const clientP = await (await browser.newContext()).newPage();
  logConsoleErrors(ouvreurP, 'ouvreur');
  logConsoleErrors(clientP, 'client');

  await step('Connexion ouvreur', () => login(ouvreurP, OUVREUR_EMAIL));
  await step('Connexion client', () => login(clientP, CLIENT_EMAIL));

  await step('Ouvreur : crée un bloc quotidien (image + annotations)', async () => {
    await gotoAndWait(ouvreurP, '/ouvreur/daily-boulders', 'Sélectionnez un mur pour gérer les blocs quotidiens');
    await ouvreurP.getByRole('button', { name: WALL, exact: true }).click();
    await ouvreurP.getByRole('heading', { name: 'Créer un bloc quotidien' }).waitFor({ timeout: 10000 });

    await ouvreurP.getByLabel('Numéro du bloc').fill(BOULDER_NUMBER);
    await ouvreurP.locator('#cotation-select').click();
    await ouvreurP.getByRole('option', { name: /Rouge/ }).click();

    await ouvreurP.locator('input[type="file"]').setInputFiles(join(__dirname, 'fixtures/test-boulder.jpg'));
    const canvas = ouvreurP.locator('canvas');
    await canvas.waitFor({ state: 'visible', timeout: 10000 });
    await ouvreurP.waitForTimeout(500);

    const box = await canvas.boundingBox();
    assert(box, 'Le canvas doit avoir une taille mesurable');
    await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.8 } });
    await canvas.click({ position: { x: box.width * 0.6, y: box.height * 0.8 } });
    await ouvreurP.getByRole('button', { name: 'Fin (Vert)' }).click();
    await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.2 } });
    await canvas.click({ position: { x: box.width * 0.6, y: box.height * 0.2 } });

    await ouvreurP.getByRole('button', { name: 'Créer le bloc' }).click();
    await ouvreurP.getByText(`Bloc n°${BOULDER_NUMBER}`, { exact: false }).waitFor({ timeout: 10000 });
    await ouvreurP.screenshot({ path: '/tmp/daily-01-ouvreur-created.png', fullPage: true });
  });

  await step('Client : active le classement puis valide/note/signale le bloc', async () => {
    // ✅ Active l'opt-in classement via le vrai formulaire (pas un seed), pour tester
    // ce chemin précis avant de valider un bloc.
    await gotoAndWait(clientP, '/client/profile', 'Modifier mes informations');
    const optInSwitch = clientP.getByLabel('Apparaître dans le classement des grimpeurs');
    if (!(await optInSwitch.isChecked())) await optInSwitch.click();
    await clientP.getByRole('button', { name: 'Enregistrer' }).click();
    await clientP.waitForTimeout(2500); // laisser le temps au message de succès + redirection

    await gotoAndWait(clientP, '/client/daily', 'Mon Blocabrac quotidien');
    await clientP.getByRole('button', { name: new RegExp(`^${WALL}`) }).click();
    await clientP.getByText(`Bloc n°${BOULDER_NUMBER}`, { exact: false }).click();
    await clientP.getByText(`Bloc n°${BOULDER_NUMBER} - ${WALL}`, { exact: false }).waitFor({ timeout: 10000 });

    await clientP.getByRole('button', { name: '✅ Réussi' }).click();
    await clientP.getByText('Réussite enregistrée', { exact: false }).waitFor({ timeout: 10000 });

    await clientP.locator('#nombre-d-essais-select').click();
    await clientP.getByRole('option', { name: '3 essais', exact: true }).click();
    await clientP.locator('[role="presentation"].MuiPopover-root').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    // Note à 4 étoiles (input radio caché derrière le composant Rating) — cliquer sur
    // le <label> associé plutôt que sur l'input (visuellement masqué, non actionnable).
    const ratingInput = clientP.locator('input[type="radio"][value="4"]').first();
    const ratingInputId = await ratingInput.getAttribute('id');
    await clientP.locator(`label[for="${ratingInputId}"]`).click();

    await clientP.locator('#type-de-signalement-select').click();
    await clientP.getByRole('option', { name: 'Défaillance de prise' }).click();
    await clientP.getByLabel('Commentaire ou signalement').fill('Prise de départ qui tourne, à resserrer.');

    await clientP.getByRole('button', { name: 'Signaler un problème' }).click();
    await clientP.getByText('Signalement envoyé', { exact: false }).waitFor({ timeout: 10000 });
    await clientP.screenshot({ path: '/tmp/daily-02-client-boulder-dialog.png', fullPage: true });

    await clientP.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await clientP.waitForTimeout(500);
  });

  await step('Classement en continu : le client validé apparaît (opt-in)', async () => {
    await gotoAndWait(clientP, '/client/classement', 'Classement des grimpeurs');
    await clientP.getByText('Dali Ente', { exact: false }).waitFor({ timeout: 10000 });
    await clientP.screenshot({ path: '/tmp/daily-03-classement.png', fullPage: true });
  });

  await step('Ouvreur : voit la note et la validation dans les stats du mur', async () => {
    await gotoAndWait(ouvreurP, '/ouvreur/reports-and-stats', 'Signalements et Statistiques');
    await ouvreurP.getByRole('tab', { name: 'Stats Blocs Quotidiens' }).click();
    await ouvreurP.locator('#selectionnez-un-mur-select').click();
    await ouvreurP.getByRole('option', { name: WALL, exact: true }).click();
    await ouvreurP.getByText(`Bloc ${BOULDER_NUMBER}`, { exact: false }).first().waitFor({ timeout: 10000 });
    await ouvreurP.screenshot({ path: '/tmp/daily-04-ouvreur-stats.png', fullPage: true });
    assert(await ouvreurP.getByText('Dali Ente', { exact: false }).first().isVisible().catch(() => false),
      "L'ouvreur doit voir le nom du client ayant validé, pas juste son UID");
  });

  await step('Ouvreur : voit le signalement et peut le marquer résolu', async () => {
    await ouvreurP.getByRole('tab', { name: 'Signalements' }).click();
    // ✅ .first() : plusieurs runs successifs contre le même émulateur accumulent des
    // signalements avec le même message, ce qui violerait le mode strict de Playwright.
    await ouvreurP.getByText('Prise de départ qui tourne', { exact: false }).first().waitFor({ timeout: 10000 });
    const row = ouvreurP.locator('tr', { hasText: 'Prise de départ qui tourne' });
    assert(await row.getByText('Dali Ente', { exact: false }).isVisible().catch(() => false),
      "Le signalement doit afficher le nom de l'utilisateur");
    await ouvreurP.screenshot({ path: '/tmp/daily-05-ouvreur-reports.png', fullPage: true });
    await row.getByTitle('Marquer comme résolu').click();
    await ouvreurP.waitForTimeout(1000);
    const resolvedChip = row.getByText('resolved', { exact: false });
    assert(await resolvedChip.isVisible().catch(() => false), 'Le signalement doit passer au statut "resolved"');
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
