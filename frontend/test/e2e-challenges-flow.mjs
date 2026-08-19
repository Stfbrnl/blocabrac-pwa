// Script Playwright ponctuel : couvre le flux "Défis entre potes" (V2.46,
// CONCEPTION-roulette-et-defis.md Partie 2) de bout en bout sur les deux structures les
// moins coûteuses à vérifier ensemble : "seuil" (mise à jour automatique depuis
// ClientDaily.tsx à la validation) et "declaratif" (bouton "C'est fait" dans
// ClientFriends.tsx). Contre l'app + les émulateurs locaux, jamais la production.
// Prérequis : seed-challenges-users.mjs (2 clients déjà amis + 2 blocs rouges actifs).
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5174';
const PASSWORD = 'TestPassword123!';
const CLIENT1_EMAIL = 'client1.challenges.test@blocabrac.test';
const CLIENT2_EMAIL = 'client2.challenges.test@blocabrac.test';
const WALL = 'Grotte Adultes';

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
    console.log(`   [console:${label}:${msg.type()}] ${msg.text()}`);
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

async function gotoFriends(page) {
  await page.goto(`${BASE_URL}/client/friends`);
  await page.getByRole('heading', { name: 'Potes de grimpe', exact: true }).waitFor({ timeout: 10000 });
}

// ✅ Reste volontairement sur la MÊME page (pas de page.goto entre deux blocs) : le delta
// de défi (comme celui du classement) est débounced en mémoire (CLASSEMENT_DEBOUNCE_MS) et
// flushé sur "pagehide" — un flush pendant une VRAIE navigation n'est pas garanti d'aboutir
// avant que le navigateur ne décharge le document (aucun sendBeacon/keepalive derrière une
// transaction Firestore). Valider les deux blocs dans le même mount, puis attendre le
// débounce normalement, est le seul moyen déterministe de vérifier les DEUX deltas cumulés.
async function openWallList(page) {
  await page.goto(`${BASE_URL}/client/daily`);
  await page.getByRole('heading', { name: 'Mon Blocabrac quotidien' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: new RegExp(`^${WALL}`) }).click();
}

async function validateBoulder(page, boulderNumber) {
  await page.getByText(`Bloc n°${boulderNumber}`, { exact: false }).click();
  await page.getByText(`Bloc n°${boulderNumber} - ${WALL}`, { exact: false }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '✅ Réussi' }).click();
  await page.getByText('Réussite enregistrée', { exact: false }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Annuler' }).click();
}

async function main() {
  const browser = await chromium.launch();
  const client1P = await (await browser.newContext()).newPage();
  const client2P = await (await browser.newContext()).newPage();
  logConsoleErrors(client1P, 'client1');
  logConsoleErrors(client2P, 'client2');

  await step('Connexion client1/client2', async () => {
    await login(client1P, CLIENT1_EMAIL);
    await login(client2P, CLIENT2_EMAIL);
  });

  await step('Client1 : lance un défi "seuil" (2 blocs rouges) avec client2', async () => {
    await gotoFriends(client1P);
    await client1P.getByRole('button', { name: 'Lancer un défi' }).click();
    await client1P.getByLabel('Titre du défi').fill('Premier à 2 rouges');
    await client1P.getByLabel('Nombre de blocs').fill('2');
    await client1P.getByRole('checkbox', { name: 'Défi Deux' }).check();
    await client1P.getByRole('button', { name: 'Lancer', exact: true }).click();
    await client1P.getByText('Premier à 2 rouges', { exact: false }).waitFor({ timeout: 10000 });
    await client1P.getByText('Premier à 2 blocs rouge', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client2 : découvre le défi en ouvrant "Potes de grimpe" (pas de notification push)', async () => {
    await gotoFriends(client2P);
    await client2P.getByText('Premier à 2 rouges', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client1 : valide 2 blocs rouges sur "Mon Blocabrac quotidien"', async () => {
    await openWallList(client1P);
    await validateBoulder(client1P, '1');
    await validateBoulder(client1P, '2');
    // ✅ Attend le débounce (3s, CLASSEMENT_DEBOUNCE_MS) plutôt que de naviguer : les deux
    // validations restent dans le même mount, leurs deltas s'accumulent en mémoire, et un
    // seul flush (minuteur, pas "pagehide") écrit le total — déterministe, contrairement à
    // un flush pendant une vraie navigation (voir commentaire sur validateBoulder).
    await client1P.waitForTimeout(3500);
  });

  await step('Client2 : voit la progression de client1 monter à 2 sans avoir rien validé lui-même', async () => {
    await gotoFriends(client2P);
    // ✅ Scope obligatoire par le titre du défi (unique sur la page) avant de chercher "Défi
    // Un" : ce nom apparaît AUSSI dans la liste "Mes potes de grimpe" plus haut sur la même
    // page, un `getByText` non scopé y trouverait un premier match sans rapport.
    const card = client2P.getByText('Premier à 2 rouges', { exact: false }).locator('xpath=ancestor::li[1]').first();
    const row = card.getByText('Défi Un', { exact: true }).locator('xpath=ancestor::li[1]').first();
    await row.getByText('2', { exact: true }).waitFor({ timeout: 10000 });
  });

  await step('Client2 : peut clôturer le défi (n\'importe quel participant, décision du 19/08/2026)', async () => {
    await client2P.getByRole('button', { name: /Clôturer/ }).click();
    await client2P.getByText('Terminé', { exact: true }).first().waitFor({ timeout: 10000 });
    await client2P.getByText('Vainqueur : Défi Un', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client1 : voit le défi comme terminé, avec le même vainqueur', async () => {
    await gotoFriends(client1P);
    await client1P.getByText('Vainqueur : Toi', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client1 : lance un défi "déclaratif" (invente un bloc)', async () => {
    await client1P.getByRole('button', { name: 'Lancer un défi' }).click();
    await client1P.getByLabel('Titre du défi').fill('Invente un bloc');
    await client1P.getByRole('radio', { name: /Défi déclaratif/ }).check();
    await client1P.getByLabel('Description du défi').fill('Une ligne avec des prises de plusieurs couleurs.');
    await client1P.getByRole('checkbox', { name: 'Défi Deux' }).check();
    await client1P.getByRole('button', { name: 'Lancer', exact: true }).click();
    await client1P.getByText('Invente un bloc', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client2 : marque le défi déclaratif comme fait', async () => {
    await gotoFriends(client2P);
    // ✅ "Défi Deux" (nom du client connecté) n'apparaît jamais dans sa propre vue —
    // chaque participant se voit affiché "Toi" (voir `nameFor` dans ClientFriends.tsx).
    // On repère donc la carte du défi par son titre, unique sur la page.
    const row = client2P.locator('li').filter({ hasText: 'Invente un bloc' }).first();
    await row.getByRole('button', { name: "C'est fait" }).click();
    await row.getByText('Fait', { exact: true }).waitFor({ timeout: 10000 });
  });

  await step('Client1 : voit que client2 a validé, mais pas lui-même (bouton encore actif)', async () => {
    await gotoFriends(client1P);
    const card = client1P.getByText('Invente un bloc', { exact: false }).locator('xpath=ancestor::li[1]').first();
    // ✅ client2 a validé -> "Fait" ; client1 (lui-même, pas encore validé) voit toujours le
    // bouton "C'est fait", jamais un chip "Pas encore" (réservé aux AUTRES participants — voir
    // ClientFriends.tsx, un participant ne voit jamais "Pas encore" sur sa propre ligne).
    await card.getByText('Fait', { exact: true }).waitFor({ timeout: 10000 });
    await card.getByRole('button', { name: "C'est fait" }).waitFor({ timeout: 10000 });
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
