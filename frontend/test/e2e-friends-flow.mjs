// Script Playwright ponctuel : couvre le flux "Potes de grimpe" (V2.10) de bout en
// bout — demande d'ami, acceptation, statut "je grimpe" éphémère, "ma prochaine
// session", retrait d'ami — avec deux clients et un moniteur (feature accessible à
// tous les rôles). Contre l'app + les émulateurs locaux, jamais la production.
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5174';
const PASSWORD = 'TestPassword123!';
const CLIENT1_EMAIL = 'client1.friends.test@blocabrac.test';
const CLIENT2_EMAIL = 'client2.friends.test@blocabrac.test';
const MONITEUR_EMAIL = 'moniteur.friends.test@blocabrac.test';

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

async function gotoFriends(page) {
  await page.goto(`${BASE_URL}/client/friends`);
  await page.getByRole('heading', { name: 'Potes de grimpe', exact: true }).waitFor({ timeout: 10000 });
}

async function main() {
  const browser = await chromium.launch();
  const client1P = await (await browser.newContext()).newPage();
  const client2P = await (await browser.newContext()).newPage();
  const moniteurP = await (await browser.newContext()).newPage();
  logConsoleErrors(client1P, 'client1');
  logConsoleErrors(client2P, 'client2');
  logConsoleErrors(moniteurP, 'moniteur');

  await step('Connexion client1/client2/moniteur', async () => {
    await login(client1P, CLIENT1_EMAIL);
    await login(client2P, CLIENT2_EMAIL);
    await login(moniteurP, MONITEUR_EMAIL);
  });

  await step('"Mon espace" est accessible aux 3 rôles (tout compte porte "client")', async () => {
    for (const p of [client1P, client2P, moniteurP]) {
      await p.goto(`${BASE_URL}/`);
      await p.getByRole('link', { name: 'MON ESPACE' }).waitFor({ timeout: 10000 });
    }
  });

  await step('Moniteur : atteint "Potes de grimpe" en cliquant depuis "Mon espace" (comme les autres boutons du rôle)', async () => {
    await moniteurP.goto(`${BASE_URL}/client`);
    await moniteurP.getByRole('heading', { name: 'Mon espace personnel' }).waitFor({ timeout: 10000 });
    await moniteurP.getByRole('button', { name: 'Potes de grimpe' }).click();
    await moniteurP.getByRole('heading', { name: 'Potes de grimpe', exact: true }).waitFor({ timeout: 10000 });
  });

  await step("Client1 : recherche client2 et lui envoie une demande d'ami", async () => {
    await gotoFriends(client1P);
    await client1P.getByLabel('Rechercher par nom').fill('Grimpe Ami2');
    await client1P.getByRole('listitem').filter({ hasText: 'Grimpe Ami2' })
      .getByRole('button', { name: 'Ajouter' }).click();
    await client1P.getByText('En attente de confirmation', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step("Client2 : voit la demande reçue et l'accepte", async () => {
    await gotoFriends(client2P);
    await client2P.getByRole('heading', { name: 'Demandes reçues' }).waitFor({ timeout: 10000 });
    await client2P.getByText('Filou Ami1', { exact: false }).waitFor({ timeout: 10000 });
    await client2P.getByRole('button', { name: 'Accepter' }).click();
    await client2P.getByRole('heading', { name: 'Mes potes de grimpe' })
      .locator('xpath=..').getByText('Filou Ami1', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client1 : voit désormais client2 dans ses amis (plus dans "envoyées")', async () => {
    await gotoFriends(client1P);
    const outgoingHeading = client1P.getByRole('heading', { name: 'Demandes envoyées' });
    const stillPending = await outgoingHeading.isVisible({ timeout: 2000 }).catch(() => false);
    if (stillPending) throw new Error('La demande apparaît toujours comme "envoyée" côté client1 après acceptation par client2.');
    await client1P.getByText('Grimpe Ami2', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client2 : active "Je suis en train de grimper"', async () => {
    await gotoFriends(client2P);
    await client2P.getByRole('button', { name: 'Je suis en train de grimper' }).click();
    await client2P.getByText('Actif depuis', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client1 : voit le statut "En salle en ce moment" de client2', async () => {
    await gotoFriends(client1P);
    await client1P.getByText('En salle en ce moment', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client2 : renseigne sa prochaine session', async () => {
    await gotoFriends(client2P);
    await client2P.locator('#next-session-day-label').waitFor({ timeout: 5000 }).catch(() => {});
    await client2P.getByLabel('Jour').click();
    await client2P.getByRole('option', { name: 'Mercredi' }).click();
    await client2P.getByLabel('Créneau horaire').fill('19h-21h');
    await client2P.getByRole('button', { name: 'Enregistrer' }).click();
    await client2P.getByRole('button', { name: 'Effacer' }).waitFor({ timeout: 10000 });
  });

  await step('Client1 : voit la prochaine session de client2', async () => {
    await gotoFriends(client1P);
    await client1P.getByText('Prochaine session : Mercredi · 19h-21h', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Moniteur : recherche client1 et lui envoie une demande (amitié inter-rôles)', async () => {
    await gotoFriends(moniteurP);
    await moniteurP.getByLabel('Rechercher par nom').fill('Filou Ami1');
    await moniteurP.getByRole('listitem').filter({ hasText: 'Filou Ami1' })
      .getByRole('button', { name: 'Ajouter' }).click();
    await moniteurP.getByText('En attente de confirmation', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client1 : accepte la demande du moniteur', async () => {
    await gotoFriends(client1P);
    await client1P.getByText('Momo Ami3', { exact: false }).waitFor({ timeout: 10000 });
    await client1P.getByRole('button', { name: 'Accepter' }).click();
    await client1P.waitForTimeout(500);
  });

  await step('Moniteur : voit désormais client1 dans ses amis', async () => {
    await gotoFriends(moniteurP);
    const outgoingHeading = moniteurP.getByRole('heading', { name: 'Demandes envoyées' });
    const stillPending = await outgoingHeading.isVisible({ timeout: 2000 }).catch(() => false);
    if (stillPending) throw new Error('La demande apparaît toujours comme "envoyée" côté moniteur après acceptation.');
    await moniteurP.getByText('Filou Ami1', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client2 : retire client1 de ses amis', async () => {
    await gotoFriends(client2P);
    await client2P.getByRole('button', { name: 'Retirer cet ami' }).click();
    await client2P.waitForTimeout(500);
    const stillThere = await client2P.getByText('Filou Ami1', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    if (stillThere) throw new Error("Client1 apparaît toujours dans la liste d'amis de client2 après retrait.");
  });

  await step("Client1 : ne voit plus client2 dans ses amis après le retrait", async () => {
    await gotoFriends(client1P);
    const stillThere = await client1P.getByText('Grimpe Ami2', { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    if (stillThere) throw new Error("Client2 apparaît toujours dans la liste d'amis de client1 alors que client2 a retiré la relation.");
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
