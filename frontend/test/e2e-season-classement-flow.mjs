// Script Playwright ponctuel : vérifie le flux "classement de saison" de bout en bout
// (CONCEPTION-classement-saisonnier.md) — config admin de la fenêtre, validation client
// comptabilisée dans season.*, suivi en direct, texte d'aide opt-in, bouton "Générer le
// roster" avant/après clôture. Contre l'app + les émulateurs locaux, jamais la
// production. Mêle Playwright (UI) et firebase-admin (assertions backend + invocation
// des scripts de clôture/réconciliation en sous-processus, même émulateur).
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFileSync } from 'child_process';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'blocabrac' });
const db = admin.firestore();

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const BASE_URL = 'http://localhost:5174';
const ADMIN_EMAIL = 'admin.season.test@blocabrac.test';
const OUVREUR_EMAIL = 'ouvreur.season.test@blocabrac.test';
const CLIENT_EMAIL = 'client.season.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';
const WALL = 'Dalle';
const BOULDER_NUMBER = String(Math.floor(Math.random() * 9000) + 100);
const CLIENT_NAME = 'Sai Zon';

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

function isoDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function runScript(scriptPath, args = []) {
  return execFileSync('node', [scriptPath, ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
    },
    encoding: 'utf8',
  });
}

async function main() {
  const browser = await chromium.launch();
  const adminP = await (await browser.newContext()).newPage();
  const ouvreurP = await (await browser.newContext()).newPage();
  const clientP = await (await browser.newContext()).newPage();
  logConsoleErrors(adminP, 'admin');
  logConsoleErrors(ouvreurP, 'ouvreur');
  logConsoleErrors(clientP, 'client');

  await step('Connexion admin/ouvreur/client', async () => {
    await login(adminP, ADMIN_EMAIL);
    await login(ouvreurP, OUVREUR_EMAIL);
    await login(clientP, CLIENT_EMAIL);
  });

  await step('Admin : configure la fenêtre de saison (aujourd\'hui inclus)', async () => {
    await gotoAndWait(adminP, '/admin/season-config', 'Classement de saison');
    await adminP.getByLabel('Début de la saison').fill(isoDate(-10));
    await adminP.getByLabel('Fin de la saison').fill(isoDate(0));
    await adminP.getByRole('button', { name: 'Enregistrer' }).click();
    await adminP.getByText('Fenêtre de saison enregistrée', { exact: false }).waitFor({ timeout: 10000 });
    await adminP.screenshot({ path: '/tmp/season-01-admin-config.png', fullPage: true });
  });

  await step('Admin : "Générer le roster" sans archive → message explicite, rien créé', async () => {
    await gotoAndWait(adminP, '/admin/competitions/create', 'Gestion des Compétitions');
    const row = adminP.locator('tr', { hasText: 'Finale de test' });
    await row.getByRole('button', { name: 'Générer le roster' }).click();
    await adminP.getByText('Aucun classement de saison archivé', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Ouvreur : crée un bloc quotidien (vert)', async () => {
    await gotoAndWait(ouvreurP, '/ouvreur/daily-boulders', 'Sélectionnez un mur pour gérer les blocs quotidiens');
    await ouvreurP.getByRole('button', { name: WALL, exact: true }).click();
    await ouvreurP.getByRole('heading', { name: 'Créer un bloc quotidien' }).waitFor({ timeout: 10000 });

    await ouvreurP.getByLabel('Numéro du bloc').fill(BOULDER_NUMBER);
    await ouvreurP.locator('#cotation-select').click();
    await ouvreurP.getByRole('option', { name: /Vert/ }).click();

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
  });

  await step('Client : voit le texte d\'aide sous l\'opt-in classement, l\'active', async () => {
    await gotoAndWait(clientP, '/client/profile', 'Modifier mes informations');
    await clientP.getByText('Désactiver ce réglage vous retire aussi de la qualification pour la Finale', { exact: false })
      .waitFor({ timeout: 10000 });
    const optInSwitch = clientP.getByLabel('Apparaître dans le classement des grimpeurs');
    if (!(await optInSwitch.isChecked())) await optInSwitch.click();
    await clientP.getByRole('button', { name: 'Enregistrer' }).click();
    await clientP.waitForTimeout(2500);
  });

  await step('Client : valide le bloc (1 essai, dans la fenêtre de saison)', async () => {
    await gotoAndWait(clientP, '/client/daily', 'Mon Blocabrac quotidien');
    await clientP.getByRole('button', { name: new RegExp(`^${WALL}`) }).click();
    await clientP.getByText(`Bloc n°${BOULDER_NUMBER}`, { exact: false }).click();
    await clientP.getByText(`Bloc n°${BOULDER_NUMBER} - ${WALL}`, { exact: false }).waitFor({ timeout: 10000 });
    await clientP.getByRole('button', { name: '✅ Réussi' }).click();
    await clientP.getByText('Réussite enregistrée', { exact: false }).waitFor({ timeout: 10000 });
    await clientP.waitForTimeout(3500); // laisse le flush débounced (3s) écrire classement_profiles
  });

  await step('Backend : season.score = 50 (vert, 1er essai) sur classement_profiles', async () => {
    const usersSnap = await db.collection('users').where('email', '==', CLIENT_EMAIL).get();
    const clientUid = usersSnap.docs[0].id;
    const profileSnap = await db.collection('classement_profiles').doc(clientUid).get();
    const data = profileSnap.data();
    assert(data, 'classement_profiles doit exister pour le client après validation');
    assert(data.score === 50, `score all-time attendu 50, obtenu ${data.score}`);
    assert(data.season?.score === 50, `season.score attendu 50, obtenu ${data.season?.score}`);
    assert(data.season?.colorCounts?.vert === 1, `season.colorCounts.vert attendu 1, obtenu ${data.season?.colorCounts?.vert}`);
  });

  await step('Client : le classement de saison affiche le score (bascule sans nouvel appel réseau)', async () => {
    await gotoAndWait(clientP, '/client/classement', 'Classement des grimpeurs');
    await clientP.getByRole('button', { name: 'Classement de saison' }).click();
    const row = clientP.locator('tr', { hasText: CLIENT_NAME });
    await row.waitFor({ timeout: 10000 });
    const rowText = await row.innerText();
    assert(rowText.includes('50'), `la ligne du classement de saison doit afficher 50 points, contenu réel : "${rowText}"`);
    await clientP.screenshot({ path: '/tmp/season-02-client-classement-saison.png', fullPage: true });
  });

  await step('Script : force la fin de saison dans le passé (simule la clôture)', async () => {
    await db.collection('app_config').doc('classement_saison').set({ fin: isoDate(-1) }, { merge: true });
  });

  await step('Script compute-classement-saison.js : archive + reset', async () => {
    const output = runScript(join(REPO_ROOT, 'scripts/compute-classement-saison.js'));
    console.log(output);
    assert(output.includes('Clôture de la saison'), 'le script doit déclencher une clôture réelle');

    const configSnap = await db.collection('app_config').doc('classement_saison').get();
    assert(configSnap.data().cloturee === true, 'cloturee doit passer à true après clôture');

    const usersSnap = await db.collection('users').where('email', '==', CLIENT_EMAIL).get();
    const clientUid = usersSnap.docs[0].id;
    const profileSnap = await db.collection('classement_profiles').doc(clientUid).get();
    assert(profileSnap.data().season?.score === 0, 'season.score doit être remis à 0 après clôture');
    assert(profileSnap.data().score === 50, 'score all-time ne doit PAS être touché par la clôture');

    const seasonsSnap = await db.collection('classement_saisons').get();
    assert(seasonsSnap.size === 1, `une seule archive attendue, ${seasonsSnap.size} trouvée(s)`);
    const archive = seasonsSnap.docs[0].data();
    assert(archive.top_filles.length === 1 && archive.top_filles[0].uid === clientUid,
      'la cliente (Femme) doit être seule qualifiée, dans top_filles');
    assert(archive.top_garcons.length === 0, 'aucun garçon qualifié dans ce jeu de données');
  });

  await step('Script compute-classement-saison.js : second run = no-op (déjà clôturée)', async () => {
    const output = runScript(join(REPO_ROOT, 'scripts/compute-classement-saison.js'));
    assert(output.includes('déjà clôturée'), 'un second run ne doit rien refaire (garde-fou cloturee)');
    const seasonsSnap = await db.collection('classement_saisons').get();
    assert(seasonsSnap.size === 1, 'toujours une seule archive après un second run');
  });

  await step('Script reconcile-classement-profiles.js : ignore season.* pendant que cloturee=true', async () => {
    const output = runScript(join(REPO_ROOT, 'scripts/reconcile-classement-profiles.js'));
    assert(output.includes('season.* ignoré'), 'la réconciliation doit signaler season.* ignoré tant que cloturee=true');
  });

  await step('Admin : "Générer le roster" avec archive → ajoute la qualifiée', async () => {
    await gotoAndWait(adminP, '/admin/competitions/create', 'Gestion des Compétitions');
    const row = adminP.locator('tr', { hasText: 'Finale de test' });
    await row.getByRole('button', { name: 'Générer le roster' }).click();
    await adminP.getByText('1 qualifié(s) ajouté(s) au roster', { exact: false }).waitFor({ timeout: 10000 });
    await adminP.screenshot({ path: '/tmp/season-03-admin-roster.png', fullPage: true });

    const competitionsSnap = await db.collection('competitions').where('name', '==', 'Finale de test').get();
    const competitionId = competitionsSnap.docs[0].id;
    const usersSnap = await db.collection('users').where('email', '==', CLIENT_EMAIL).get();
    const clientUid = usersSnap.docs[0].id;
    const participantSnap = await db.collection('competition_participants').doc(`${clientUid}_${competitionId}`).get();
    assert(participantSnap.exists, 'le document competition_participants doit avoir été créé');
    assert(participantSnap.data().gender === 'Femme', 'les infos du participant doivent venir de son profil users');
  });

  await step('Admin : "Générer le roster" une 2e fois → idempotent, personne de plus', async () => {
    const row = adminP.locator('tr', { hasText: 'Finale de test' });
    await row.getByRole('button', { name: 'Générer le roster' }).click();
    await adminP.getByText('déjà inscrits — rien à ajouter', { exact: false }).waitFor({ timeout: 10000 });
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
