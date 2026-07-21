// Script Playwright ponctuel : vérifie le flux séances Moniteur/Client de bout
// en bout (programmée -> active -> archivée) contre l'app + les émulateurs
// locaux (jamais la production). Lancé manuellement, pas via `npm test`.
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5174';
const MONITEUR_EMAIL = 'moniteur.test@blocabrac.test';
const CLIENT_EMAIL = 'client.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';
const SESSION_TITLE = `Séance E2E ${Date.now()}`;

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
  const moniteurCtx = await browser.newContext();
  const clientCtx = await browser.newContext();
  const moniteur = await moniteurCtx.newPage();
  const client = await clientCtx.newPage();

  await step('Connexion moniteur', () => login(moniteur, MONITEUR_EMAIL));
  await step('Connexion client', () => login(client, CLIENT_EMAIL));

  const today = new Date().toISOString().split('T')[0];

  await step('Le moniteur crée une séance (auto-inscription du groupe)', async () => {
    await gotoAndWait(moniteur, '/moniteur/courses/new', 'Nouvelle séance');
    await moniteur.locator('input[name="title"]').fill(SESSION_TITLE);
    await moniteur.locator('textarea[name="description"]').fill('Travailler équilibre et dévers.');
    await moniteur.locator('input[type="date"]').fill(today);
    await moniteur.locator('input[type="time"]').fill('18:00');
    await moniteur.getByPlaceholder('Sélectionnez les exercices pour cette séance').click();
    await moniteur.getByText('Grimpe équilibrée', { exact: false }).first().click();
    await moniteur.keyboard.press('Escape');
    await moniteur.getByRole('button', { name: 'Créer' }).click();
    await moniteur.waitForURL((url) => url.pathname === '/moniteur/courses', { timeout: 10000 });
    await moniteur.getByRole('heading', { name: 'Gestion des séances' }).waitFor({ timeout: 10000 });
    await moniteur.getByText(SESSION_TITLE).waitFor({ timeout: 10000 });
    await moniteur.screenshot({ path: '/tmp/e2e-01-course-list.png', fullPage: true });
    assert(await moniteur.getByText('Programmée').isVisible(), 'Le statut doit être "Programmée"');
  });

  await step('Le client voit la séance à venir avec les objectifs, sans le contenu', async () => {
    await gotoAndWait(client, '/client/courses', 'Mes Cours');
    await client.getByText(SESSION_TITLE).waitFor({ timeout: 10000 });
    await client.screenshot({ path: '/tmp/e2e-02-client-upcoming.png', fullPage: true });
    assert(await client.getByText('Travailler équilibre et dévers.', { exact: false }).isVisible(), 'Les objectifs (description) doivent être visibles');
    assert(!(await client.getByText('Grimpe équilibrée').isVisible().catch(() => false)), "Le nom de l'exercice ne doit PAS être visible avant activation");
  });

  await step('Le client se désiste puis revient sur sa décision', async () => {
    await client.getByRole('button', { name: 'Je ne pourrai pas venir' }).click();
    await client.getByText('Vous vous êtes désisté', { exact: false }).waitFor({ timeout: 5000 });
    await client.getByRole('button', { name: 'Je viens finalement' }).click();
    await client.getByText('Je ne pourrai pas venir').waitFor({ timeout: 5000 });
  });

  await step('Le moniteur active la séance ("séance du jour")', async () => {
    await moniteur.reload();
    await moniteur.getByRole('heading', { name: 'Gestion des séances' }).waitFor({ timeout: 10000 });
    const row = moniteur.locator('tr', { hasText: SESSION_TITLE });
    await row.getByLabel('Activer (séance du jour)').click();
    await row.getByText('Active').waitFor({ timeout: 5000 });
    await moniteur.screenshot({ path: '/tmp/e2e-03-course-active.png', fullPage: true });
  });

  await step('Le client voit maintenant le contenu et valide un exercice', async () => {
    await gotoAndWait(client, '/client/courses', 'Mes Cours');
    await client.getByText(SESSION_TITLE).waitFor({ timeout: 10000 });
    await client.screenshot({ path: '/tmp/e2e-04-client-active.png', fullPage: true });
    const activeCard = client.locator('.MuiCard-root', { hasText: SESSION_TITLE });
    await activeCard.getByRole('button', { name: 'Valider les exercices' }).click();
    await client.waitForURL(/\/client\/courses\/session\//, { timeout: 10000 });
    await client.getByText('Grimpe équilibrée').waitFor({ timeout: 10000 });
    await client.getByRole('button', { name: '✅ Réussi' }).click();
    await client.getByRole('button', { name: 'Enregistrer les résultats' }).click();
    await client.getByText('Résultats enregistrés avec succès', { exact: false }).waitFor({ timeout: 5000 });
    await client.screenshot({ path: '/tmp/e2e-05-client-validated.png', fullPage: true });
  });

  await step('Le moniteur archive la séance', async () => {
    await gotoAndWait(moniteur, '/moniteur/courses', 'Gestion des séances');
    const row = moniteur.locator('tr', { hasText: SESSION_TITLE });
    await row.getByLabel('Archiver maintenant').click();
    await row.getByText('Archivée').waitFor({ timeout: 5000 });
  });

  await step('Le client voit la séance archivée en lecture seule, avec son résultat', async () => {
    await gotoAndWait(client, '/client/courses', 'Mes Cours');
    await client.getByText(SESSION_TITLE).waitFor({ timeout: 10000 });
    const card = client.locator('.MuiCard-root', { hasText: SESSION_TITLE });
    await card.getByRole('button', { name: 'Voir les détails' }).click();
    await client.waitForURL(/\/client\/courses\/session\//, { timeout: 10000 });
    await client.getByText('Grimpe équilibrée').waitFor({ timeout: 10000 });
    await client.screenshot({ path: '/tmp/e2e-06-client-archived.png', fullPage: true });
    assert(await client.getByText('Réussi (1 essai', { exact: false }).isVisible(), 'Le résultat "Réussi" doit être visible en lecture seule');
    assert(!(await client.getByRole('button', { name: '✅ Réussi' }).isVisible().catch(() => false)), 'Les contrôles de validation ne doivent plus apparaître');
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
