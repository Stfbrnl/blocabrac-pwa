// Script Playwright ponctuel : couvre spécifiquement la file d'attente "blocs de
// mini-compétition" de ClientCourseSession.tsx (`boulderQueue`, PROCESSUS-erreurs-avalees.md
// §3 / useDebouncedFlushQueue) — jamais exercée par e2e-course-flow.mjs, qui ne valide qu'un
// exercice (`exerciseQueue`). Même structure de séance programmée -> active -> archivée que
// e2e-course-flow.mjs, réduite au strict nécessaire pour ce chemin précis. Contre l'app + les
// émulateurs locaux, jamais la production. Prérequis : seed-course-minicompetition.mjs.
import { chromium } from 'playwright';
import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
admin.initializeApp({ projectId: 'blocabrac' });
const adminAuth = admin.auth();
const adminDb = admin.firestore();

const BASE_URL = 'http://localhost:5174';
const MONITEUR_EMAIL = 'moniteur.minicomp.test@blocabrac.test';
const CLIENT_EMAIL = 'client.minicomp.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';
const SESSION_TITLE = `Séance MiniComp E2E ${Date.now()}`;
const MINI_COMPETITION_NAME = 'Mini-compét E2E';

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
  const moniteur = await (await browser.newContext()).newPage();
  const client = await (await browser.newContext()).newPage();

  await step('Connexion moniteur', () => login(moniteur, MONITEUR_EMAIL));
  await step('Connexion client', () => login(client, CLIENT_EMAIL));

  const today = new Date().toISOString().split('T')[0];

  await step('Le moniteur crée une séance avec la mini-compétition (pas d\'exercice)', async () => {
    await gotoAndWait(moniteur, '/moniteur/courses/new', 'Nouvelle séance');
    await moniteur.locator('input[name="title"]').fill(SESSION_TITLE);
    await moniteur.locator('input[type="date"]').fill(today);
    await moniteur.locator('input[type="time"]').fill('18:00');
    await moniteur.getByPlaceholder('Sélectionnez les mini-compétitions pour cette séance').click();
    await moniteur.getByText(MINI_COMPETITION_NAME, { exact: false }).first().click();
    await moniteur.keyboard.press('Escape');
    await moniteur.getByRole('button', { name: 'Créer' }).click();
    await moniteur.waitForURL((url) => url.pathname === '/moniteur/courses', { timeout: 10000 });
    await moniteur.getByText(SESSION_TITLE).waitFor({ timeout: 10000 });
  });

  await step('Le moniteur active la séance', async () => {
    const row = moniteur.locator('tr', { hasText: SESSION_TITLE });
    await row.getByLabel('Activer (séance du jour)').click();
    await row.getByText('Active').waitFor({ timeout: 5000 });
  });

  await step('Le client valide le bloc de la mini-compétition (Réussi, 3 essais)', async () => {
    await gotoAndWait(client, '/client/courses', 'Mes Cours');
    await client.getByText(SESSION_TITLE).waitFor({ timeout: 10000 });
    const activeCard = client.locator('.MuiCard-root', { hasText: SESSION_TITLE });
    await activeCard.getByRole('button', { name: 'Valider les exercices' }).click();
    await client.waitForURL(/\/client\/courses\/session\//, { timeout: 10000 });

    await client.getByText(`🏆 Mini-compétition : ${MINI_COMPETITION_NAME}`, { exact: false }).waitFor({ timeout: 10000 });
    const boulderCard = client.locator('.MuiCard-root', { hasText: 'Bloc n°42' });
    await boulderCard.getByRole('button', { name: '✅ Réussi' }).click();

    // ✅ Essais debouncés (voir boulderQueue, DEBOUNCE_MS=2500) — changer la valeur
    // exerce le chemin `enqueue`, pas seulement `writeNow` (déjà couvert par le clic
    // "Réussi" ci-dessus, toujours immédiat).
    await boulderCard.locator('div[role="combobox"]', { hasText: /essai/ }).click();
    await client.getByRole('option', { name: '3 essais', exact: true }).click();
  });

  await step('Backend : le résultat du bloc de mini-compétition est bien écrit (file "blocs", pas seulement "exercices")', async () => {
    // ✅ Attend le débounce (2500ms) plutôt que de naviguer, pour la même raison que
    // documentée dans CLAUDE.md/e2e-challenges-flow.mjs : un flush pendant une vraie
    // navigation n'est pas garanti d'aboutir avant déchargement du document.
    await client.waitForTimeout(3200);
    const { uid: clientUid } = await adminAuth.getUserByEmail(CLIENT_EMAIL);
    const snap = await adminDb.collection('client_course_results')
      .where('userId', '==', clientUid)
      .where('miniCompetitionId', '!=', null)
      .get();
    assert(!snap.empty, 'Un document client_course_results avec miniCompetitionId doit exister pour ce client');
    const data = snap.docs[0].data();
    assert(data.success === true, `success attendu true, obtenu ${data.success}`);
    assert(data.attempts === 3, `attempts attendu 3 (dernière valeur enqueue), obtenu ${data.attempts}`);
    assert(data.boulderColor === 'bleu', `boulderColor attendu "bleu" (figée à la validation), obtenu ${data.boulderColor}`);
  });

  await step('Le client recharge la page et retrouve sa validation du bloc (pas seulement des exercices)', async () => {
    await client.reload();
    await client.getByText(`🏆 Mini-compétition : ${MINI_COMPETITION_NAME}`, { exact: false }).waitFor({ timeout: 10000 });
    const boulderCard = client.locator('.MuiCard-root', { hasText: 'Bloc n°42' });
    const className = await boulderCard.getByRole('button', { name: '✅ Réussi' }).getAttribute('class');
    assert(className && className.includes('contained'), 'La validation du bloc doit être retrouvée après rechargement');
  });

  await step('Le client clique "Enregistrer les résultats" (exerce writeNow sur la file "blocs")', async () => {
    await client.getByRole('button', { name: 'Enregistrer les résultats' }).click();
    await client.getByText('Résultats enregistrés avec succès', { exact: false }).waitFor({ timeout: 5000 });
  });

  await step('Le moniteur archive la séance', async () => {
    await gotoAndWait(moniteur, '/moniteur/courses', 'Gestion des séances');
    const row = moniteur.locator('tr', { hasText: SESSION_TITLE });
    await row.getByLabel('Archiver maintenant').click();
    await row.getByText('Archivée').waitFor({ timeout: 5000 });
  });

  await step('Le client voit le résultat du bloc de mini-compétition en lecture seule (avec les points)', async () => {
    await gotoAndWait(client, '/client/courses', 'Mes Cours');
    const card = client.locator('.MuiCard-root', { hasText: SESSION_TITLE });
    await card.getByRole('button', { name: 'Voir les détails' }).click();
    await client.waitForURL(/\/client\/courses\/session\//, { timeout: 10000 });
    // ✅ Le libellé en lecture seule inclut les points ("— N pts"), contrairement à celui
    // d'un exercice — un bon repère que c'est bien la file "blocs" qui est vérifiée ici.
    await client.getByText('Réussi (3 essai(s)) —', { exact: false }).waitFor({ timeout: 10000 });
  });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} étapes réussies`);
  if (failed.length > 0) {
    console.log('Échecs :', failed.map((f) => `[${f.n}] ${f.name}: ${f.error}`).join('\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erreur fatale du script :', err);
  process.exit(1);
});
