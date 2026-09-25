// Script Playwright ponctuel : grille de missions hebdomadaires de bout en bout, contre
// l'app + les émulateurs locaux (jamais la production). Prérequis : seed-weekly-missions-users.mjs.
//
// ✅ docs/handoffs/RETOUR-bug-missions-et-revalidation.md §1.2/§5.4 : reproduit le bug V2.68
// (grille effacée par un flush qui ne contenait QUE des deltas de missions — un échec pour
// M4, une revalidation pour M1 — et n'avait donc pas relu `user_ludic_state`), et vérifie
// qu'une première réussite, elle, préserve bien la grille stockée (contrôle "seconde cause").
// Assertions directes firebase-admin sur `weeklyMissions` après chaque geste
// (docs/processus/PROCESSUS-erreurs-avalees.md §4).
import { chromium } from 'playwright';
import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
admin.initializeApp({ projectId: 'blocabrac' });
const adminAuth = admin.auth();
const adminDb = admin.firestore();

const BASE_URL = 'http://localhost:5174';
const CLIENT_EMAIL = 'client.missions.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

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

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function readMissions() {
  const { uid } = await adminAuth.getUserByEmail(CLIENT_EMAIL);
  const data = (await adminDb.collection('user_ludic_state').doc(uid).get()).data() || {};
  return data.weeklyMissions || { done: [], walls: [] };
}

// Le flush du classement/missions est débouncé (3 s) : on attend que la valeur attendue
// apparaisse plutôt qu'un délai fixe, avec un plafond.
async function waitForMissions(predicate, timeoutMs = 12000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await readMissions();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 500));
  }
  return last;
}

const hasAll = (arr, expected) => expected.every((x) => (arr || []).includes(x));

async function readResult(boulderId) {
  const { uid } = await adminAuth.getUserByEmail(CLIENT_EMAIL);
  const snap = await adminDb.collection('client_boulder_results').doc(`${uid}_${boulderId}`).get();
  return snap.exists ? snap.data() : null;
}

async function waitForResult(boulderId, predicate, timeoutMs = 15000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await readResult(boulderId);
    if (last && predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`résultat ${boulderId} attendu non atteint, dernier état : ${JSON.stringify(last)}`);
}

async function chooseAttempts(page, label) {
  await page.locator('#nombre-d-essais-select').click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await page.locator('[role="presentation"].MuiPopover-root').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

async function openBoulder(page, wall, number) {
  await closeDialogs(page);
  await page.getByRole('button', { name: new RegExp(`^${escapeRegex(wall)}`) }).click();
  await page.getByText(`Bloc n°${number}`, { exact: false }).first().click();
  await page.getByText(`Bloc n°${number} - ${wall}`, { exact: false }).waitFor({ timeout: 10000 });
}

// Ferme la fiche du bloc puis la liste du mur — boucle jusqu'à ce qu'aucune modale ne reste
// (deux Escape à délai fixe laissaient parfois la liste du mur ouverte).
async function closeDialogs(page) {
  for (let i = 0; i < 6; i += 1) {
    if (await page.locator('[role="dialog"]').count() === 0) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  globalThis.__page = page;
  page.on('console', (msg) => { if (msg.type() === 'error') console.log(`   [console] ${msg.text()}`); });
  page.on('pageerror', (err) => console.log(`   [pageerror] ${err.message}`));

  await step('Connexion + ouverture du Blocabrac quotidien (grille visible)', async () => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('#email').fill(CLIENT_EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
    await page.goto(`${BASE_URL}/client/daily`);
    await page.getByText('Missions de la semaine', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('1re réussite (violet, Réta Adultes) : « Réussi » bloqué sans nombre d\'essais, puis 1 essai -> M6 + M3', async () => {
    await openBoulder(page, 'Réta Adultes', 9101);
    assert(await page.getByRole('button', { name: '✅ Réussi' }).isDisabled(), '« Réussi » doit être désactivé tant que le nombre d\'essais n\'est pas choisi (V2.69)');
    await chooseAttempts(page, '1 essai');
    await page.getByRole('button', { name: '✅ Réussi' }).click();
    await waitForResult('missions-b1', (r) => r.success === true && r.attempts === 1);
    await closeDialogs(page);
    const m = await waitForMissions((s) => hasAll(s.done, ['M6', 'M3']));
    assert(hasAll(m.done, ['M6', 'M3']), `done attendu ⊇ [M6, M3], obtenu ${JSON.stringify(m)}`);
  });

  await step('« J\'ai testé ce bloc » sur un max+1 (noir) -> M4, AUCUN résultat de bloc écrit', async () => {
    await openBoulder(page, 'Dévers 30°', 9102);
    await page.getByRole('button', { name: "J'ai testé ce bloc" }).click();
    await closeDialogs(page);
    const m = await waitForMissions((s) => (s.done || []).includes('M4'), 20000);
    assert(hasAll(m.done, ['M6', 'M3', 'M4']), `done attendu ⊇ [M6, M3, M4], obtenu ${JSON.stringify(m)}`);
    const result = await readResult('missions-b2');
    assert(!result, `aucun client_boulder_results attendu pour un geste de mission, obtenu ${JSON.stringify(result)}`);
  });

  // ✅ Régression V2.68 : un échec sur un bloc jamais réussi, sur un mur nouveau, produit un flush
  // qui ne porte QUE des missions (un mur) — c'est ce flush qui vidait la grille.
  await step('Échec (bleu, Güllich) -> flush « missions seules » : la grille est CONSERVÉE', async () => {
    await openBoulder(page, 'Güllich', 9105);
    await page.getByRole('button', { name: '❌ Échoué' }).click();
    await page.waitForTimeout(800);
    await closeDialogs(page);
    const m = await waitForMissions((s) => (s.walls || []).includes('Güllich'));
    assert(hasAll(m.done, ['M6', 'M3', 'M4']), `done attendu ⊇ [M6, M3, M4], obtenu ${JSON.stringify(m)}`);
    assert(hasAll(m.walls, ['Réta Adultes', 'Dévers 30°', 'Güllich']), `walls attendus ⊇ 3 murs, obtenu ${JSON.stringify(m.walls)}`);
  });

  await step('Bloc déjà réussi (rouge) : lecture seule, « Je l\'ai refait » -> M1, résultat d\'origine INTACT', async () => {
    await openBoulder(page, 'Grande Face', 9103);
    await page.getByText('Déjà validé le', { exact: false }).waitFor({ timeout: 10000 });
    await page.getByText('en 3 essais', { exact: false }).waitFor({ timeout: 5000 });
    assert(!(await page.getByRole('button', { name: '✅ Réussi' }).isVisible().catch(() => false)), '« Réussi » ne doit plus être proposé sur un bloc déjà réussi');
    await page.getByRole('button', { name: "Je l'ai refait" }).click();
    await closeDialogs(page);
    const m = await waitForMissions((s) => (s.done || []).includes('M1'), 20000);
    assert(hasAll(m.done, ['M6', 'M3', 'M4', 'M1']), `done attendu ⊇ [M6, M3, M4, M1], obtenu ${JSON.stringify(m)}`);
    const r = await readResult('missions-b3');
    assert(r && r.success === true && r.attempts === 3 && r.rating === 4 && r.comment === 'Beau bloc',
      `le résultat d'origine (3 essais, note 4, commentaire) doit être intact, obtenu ${JSON.stringify(r)}`);
  });

  // ✅ §1.2 du retour ClaudeNav : quel que soit l'état stocké, une PREMIÈRE réussite relit le
  // document et ne doit rien perdre de ce qui y est.
  await step('Contrôle §1.2 : 1re réussite (vert, Dalle) -> le stocké précédent est intégralement conservé + M7', async () => {
    const before = await readMissions();
    await openBoulder(page, 'Dalle', 9104);
    await chooseAttempts(page, '2 essais');
    await page.getByRole('button', { name: '✅ Réussi' }).click();
    await waitForResult('missions-b4', (r) => r.success === true && r.attempts === 2);
    await closeDialogs(page);
    const m = await waitForMissions((s) => (s.done || []).includes('M7'));
    assert(hasAll(m.done, [...(before.done || []), 'M7']),
      `done attendu ⊇ ${JSON.stringify([...(before.done || []), 'M7'])}, obtenu ${JSON.stringify(m.done)}`);
    assert(hasAll(m.walls, [...(before.walls || []), 'Dalle']),
      `walls attendus ⊇ ${JSON.stringify([...(before.walls || []), 'Dalle'])}, obtenu ${JSON.stringify(m.walls)}`);
  });

  await step('« Corriger ma saisie » : 2 -> 4 essais, réussite conservée, date d\'origine conservée', async () => {
    const before = await readResult('missions-b4');
    await openBoulder(page, 'Dalle', 9104);
    await page.getByRole('button', { name: 'Corriger ma saisie' }).click();
    await chooseAttempts(page, '4 essais');
    await page.getByRole('button', { name: 'Enregistrer la correction' }).click();
    await waitForResult('missions-b4', (r) => r.attempts === 4);
    await closeDialogs(page);
    const r = await readResult('missions-b4');
    assert(r && r.success === true && r.attempts === 4 && r.createdAt === before.createdAt,
      `attendu success:true, attempts:4, createdAt inchangé, obtenu ${JSON.stringify(r)}`);
  });

  await step('État final : 6 missions (M1 M2 M3 M4 M6 M7), 5 murs', async () => {
    const m = await readMissions();
    assert(hasAll(m.done, ['M1', 'M2', 'M3', 'M4', 'M6', 'M7']), `done final attendu ⊇ [M1 M2 M3 M4 M6 M7], obtenu ${JSON.stringify(m.done)}`);
    assert((m.walls || []).length === 5, `5 murs attendus, obtenu ${JSON.stringify(m.walls)}`);
  });

  // ✅ V2.68.1 §1.4 : "J'ai relevé le défi" (M8) relit user_ludic_state dans une transaction.
  await step('Roulette « J\'ai relevé le défi » -> M8 AJOUTÉE, les 6 autres CONSERVÉES', async () => {    await page.getByRole('button', { name: 'Bloc Roulette', exact: true }).click();
    const valider = page.getByRole('button', { name: "J'ai relevé le défi" });
    await valider.waitFor({ timeout: 10000 });
    await valider.click();
    await page.getByText(/Bravo, \d+ᵉ défi Roulette relevé/).waitFor({ timeout: 10000 });
    const m = await readMissions();
    assert(hasAll(m.done, ['M1', 'M2', 'M3', 'M4', 'M6', 'M7', 'M8']), `done attendu ⊇ 7 missions, obtenu ${JSON.stringify(m.done)}`);
  });

  await step('Rechargement : la grille affichée reflète l\'état stocké (7 missions validées)', async () => {
    await page.reload();
    await page.getByText('Missions de la semaine', { exact: false }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    const done = await page.locator('[data-mission-done="true"]').count();
    assert(done === 7, `7 tuiles validées attendues après rechargement, obtenu ${done}`);
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
