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

async function openBoulder(page, wall, number) {
  await page.getByRole('button', { name: new RegExp(`^${escapeRegex(wall)}`) }).click();
  await page.getByText(`Bloc n°${number}`, { exact: false }).first().click();
  await page.getByText(`Bloc n°${number} - ${wall}`, { exact: false }).waitFor({ timeout: 10000 });
}

async function closeDialogs(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
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

  await step('1re réussite (violet, Réta Adultes, flash) -> M6 + M3 stockées', async () => {
    await openBoulder(page, 'Réta Adultes', 9101);
    await page.getByRole('button', { name: '✅ Réussi' }).click();
    await page.getByText('Réussite enregistrée', { exact: false }).waitFor({ timeout: 10000 });
    await closeDialogs(page);
    const m = await waitForMissions((s) => hasAll(s.done, ['M6', 'M3']));
    assert(hasAll(m.done, ['M6', 'M3']), `done attendu ⊇ [M6, M3], obtenu ${JSON.stringify(m)}`);
  });

  await step('Échec sur un max+1 (noir, Dévers 30°) -> M4 AJOUTÉE, M6/M3 CONSERVÉES', async () => {
    await openBoulder(page, 'Dévers 30°', 9102);
    await page.getByRole('button', { name: '❌ Échoué' }).click();
    await page.waitForTimeout(800);
    await closeDialogs(page);
    const m = await waitForMissions((s) => (s.done || []).includes('M4'));
    assert(hasAll(m.done, ['M6', 'M3', 'M4']), `done attendu ⊇ [M6, M3, M4], obtenu ${JSON.stringify(m)}`);
    assert(hasAll(m.walls, ['Réta Adultes', 'Dévers 30°']), `walls attendus ⊇ [Réta Adultes, Dévers 30°], obtenu ${JSON.stringify(m.walls)}`);
  });

  await step('Revalidation d\'un rouge déjà réussi -> M1 AJOUTÉE, le reste CONSERVÉ', async () => {
    await openBoulder(page, 'Grande Face', 9103);
    await page.getByRole('button', { name: '✅ Réussi' }).click();
    await page.waitForTimeout(1500);
    await closeDialogs(page);
    const m = await waitForMissions((s) => (s.done || []).includes('M1'));
    assert(hasAll(m.done, ['M6', 'M3', 'M4', 'M1']), `done attendu ⊇ [M6, M3, M4, M1], obtenu ${JSON.stringify(m)}`);
  });

  // ✅ §1.2 du retour ClaudeNav : quel que soit l'état stocké à ce stade (sain ou déjà
  // corrompu par les étapes précédentes), une PREMIÈRE réussite relit le document et ne doit
  // rien perdre de ce qui y est. Si cette étape échoue, il y a une seconde cause.
  await step('Contrôle §1.2 : 1re réussite (vert, Dalle) -> le stocké précédent est intégralement conservé + M7', async () => {
    const before = await readMissions();
    await openBoulder(page, 'Dalle', 9104);
    await page.getByRole('button', { name: '✅ Réussi' }).click();
    await page.getByText('Réussite enregistrée', { exact: false }).waitFor({ timeout: 10000 });
    await closeDialogs(page);
    const m = await waitForMissions((s) => (s.done || []).includes('M7'));
    assert(hasAll(m.done, [...(before.done || []), 'M7']),
      `done attendu ⊇ ${JSON.stringify([...(before.done || []), 'M7'])}, obtenu ${JSON.stringify(m.done)}`);
    assert(hasAll(m.walls, [...(before.walls || []), 'Dalle']),
      `walls attendus ⊇ ${JSON.stringify([...(before.walls || []), 'Dalle'])}, obtenu ${JSON.stringify(m.walls)}`);
  });

  await step('État final : 6 missions (M1 M2 M3 M4 M6 M7), 4 murs', async () => {
    const m = await readMissions();
    assert(hasAll(m.done, ['M1', 'M2', 'M3', 'M4', 'M6', 'M7']), `done final attendu ⊇ [M1 M2 M3 M4 M6 M7], obtenu ${JSON.stringify(m.done)}`);
    assert((m.walls || []).length === 4, `4 murs attendus, obtenu ${JSON.stringify(m.walls)}`);
  });

  // ✅ V2.68.1 §1.4 : "J'ai relevé le défi" (M8) relit désormais user_ludic_state dans une
  // transaction au lieu de recomposer la grille depuis la mémoire — elle doit s'ajouter aux 6.
  await step('Roulette "J\'ai relevé le défi" -> M8 AJOUTÉE, les 6 autres CONSERVÉES', async () => {
    await page.getByRole('button', { name: 'Bloc Roulette', exact: true }).click();
    const valider = page.getByRole('button', { name: "J'ai relevé le défi" });
    await valider.waitFor({ timeout: 10000 });
    await valider.click();
    await page.getByText(/Bravo, \d+ᵉ défi Roulette relevé/).waitFor({ timeout: 10000 });
    const m = await readMissions();
    assert(hasAll(m.done, ['M1', 'M2', 'M3', 'M4', 'M6', 'M7', 'M8']), `done attendu ⊇ 7 missions, obtenu ${JSON.stringify(m.done)}`);
  });

  await step('Rechargement : la grille affichée reflète l\'état stocké (7 cases cochées)', async () => {
    await page.reload();
    await page.getByText('Missions de la semaine', { exact: false }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    const checked = await page.getByText('✅', { exact: true }).count();
    assert(checked >= 7, `au moins 7 cases ✅ attendues après rechargement, obtenu ${checked}`);
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
