// Script Playwright ponctuel : couvre le flux "Premiers ascensionnistes"
// (PLAN-premiers-ascensionnistes.md) de bout en bout — deux clients valident
// successivement un bloc noir déjà à 3/5 (fixture, voir seed-first-ascents-users.mjs), puis
// un troisième tente sur une liste pleine (5/5) : aucune écriture ne doit avoir lieu, c'est
// la propriété qui borne le coût de la fonctionnalité (§1 du plan), donc celle qu'il faut
// verrouiller par un test. Contre l'app + les émulateurs locaux, jamais la production.
// Prérequis : seed-first-ascents-users.mjs.
import { chromium } from 'playwright';
import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
admin.initializeApp({ projectId: 'blocabrac' });
const adminAuth = admin.auth();
const adminDb = admin.firestore();

const BASE_URL = 'http://localhost:5174';
const PASSWORD = 'TestPassword123!';
const CLIENT1_EMAIL = 'client1.firstascents.test@blocabrac.test';
const CLIENT2_EMAIL = 'client2.firstascents.test@blocabrac.test';
const CLIENT3_EMAIL = 'client3.firstascents.test@blocabrac.test';

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

async function findSeedBoulder() {
  const snapshot = await adminDb.collection('boulders')
    .where('color', '==', 'noir')
    .where('type', '==', 'daily')
    .get();
  // Le seed peut coexister avec d'autres blocs noirs d'exécutions précédentes non nettoyées ;
  // celui qui nous intéresse porte exactement 3 entrées fictives au départ.
  const match = snapshot.docs.find((d) => {
    const fa = d.data().firstAscents;
    return Array.isArray(fa) && fa.length === 3 && fa.every((e) => e.uid.startsWith('fictif-'));
  });
  if (!match) throw new Error('Bloc de seed introuvable (relancer seed-first-ascents-users.mjs)');
  return { id: match.id, wall: match.data().wall, number: match.data().number };
}

// ✅ `maybeRecordFirstAscent` (ClientDaily.tsx) est un "fire-and-forget" volontaire (`void`,
// voir son commentaire) : la transaction sur firstAscents part APRÈS le message "Réussite
// enregistrée", pas avant. Une lecture admin immédiate après ce message est donc une course
// — on attend ici que la valeur atteigne le compte voulu plutôt que de lire une seule fois.
async function waitForFirstAscentsCount(boulderId, expectedCount, timeoutMs = 10000) {
  const start = Date.now();
  let data;
  while (Date.now() - start < timeoutMs) {
    data = (await adminDb.collection('boulders').doc(boulderId).get()).data();
    if ((data.firstAscents || []).length === expectedCount) return data;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`firstAscents n'a jamais atteint ${expectedCount} entrées, resté à ${(data?.firstAscents || []).length}`);
}

async function validateBoulder(page, wall, number) {
  await gotoAndWait(page, '/client/daily', 'Mon Blocabrac quotidien');
  await page.getByRole('button', { name: new RegExp(`^${wall}`) }).click();
  await page.getByText(`Bloc n°${number}`, { exact: false }).click();
  await page.getByText(`Bloc n°${number} - ${wall}`, { exact: false }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '✅ Réussi' }).click();
  await page.getByText('Réussite enregistrée', { exact: false }).waitFor({ timeout: 10000 });
}

async function main() {
  const browser = await chromium.launch();
  const client1P = await (await browser.newContext()).newPage();
  const client2P = await (await browser.newContext()).newPage();
  const client3P = await (await browser.newContext()).newPage();

  const { id: boulderId, wall, number } = await findSeedBoulder();
  const { uid: client1Uid } = await adminAuth.getUserByEmail(CLIENT1_EMAIL);
  const { uid: client2Uid } = await adminAuth.getUserByEmail(CLIENT2_EMAIL);
  const { uid: client3Uid } = await adminAuth.getUserByEmail(CLIENT3_EMAIL);

  await step('Connexion des trois clients', async () => {
    await login(client1P, CLIENT1_EMAIL);
    await login(client2P, CLIENT2_EMAIL);
    await login(client3P, CLIENT3_EMAIL);
  });

  await step('Client1 valide le bloc (3 -> 4 entrées, client1 en dernier)', async () => {
    await validateBoulder(client1P, wall, number);
    const data = await waitForFirstAscentsCount(boulderId, 4);
    assert(data.firstAscents[3].uid === client1Uid, 'La 4e entrée doit être client1');
    assert(data.firstAscents.slice(0, 3).every((e) => e.uid.startsWith('fictif-')),
      'Les 3 premières entrées (fictives) ne doivent pas avoir bougé');
  });

  await step('Client2 valide le bloc (4 -> 5 entrées, liste désormais pleine)', async () => {
    await validateBoulder(client2P, wall, number);
    const data = await waitForFirstAscentsCount(boulderId, 5);
    assert(data.firstAscents[4].uid === client2Uid, 'La 5e entrée doit être client2');
  });

  await step('Client3 valide le bloc sur une liste pleine : AUCUNE écriture sur firstAscents', async () => {
    // ✅ La validation du bloc elle-même (client_boulder_results) doit réussir normalement —
    // seule l'écriture sur firstAscents doit être refusée (règle Firestore, liste pleine).
    await validateBoulder(client3P, wall, number);
    let resultSnap;
    const start = Date.now();
    while (Date.now() - start < 10000) {
      resultSnap = await adminDb.collection('client_boulder_results').doc(`${client3Uid}_${boulderId}`).get();
      if (resultSnap.exists) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    assert(resultSnap.exists && resultSnap.data().success === true,
      'La validation du bloc par client3 doit rester enregistrée normalement');
    // Laisse le temps à une éventuelle (mauvaise) écriture de se produire avant de conclure
    // qu'il n'y en a pas eu — contrairement à waitForFirstAscentsCount, on attend ici
    // l'ABSENCE de changement, donc un délai fixe plutôt qu'un polling qui s'arrêterait tôt.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const data = (await adminDb.collection('boulders').doc(boulderId).get()).data();
    assert(data.firstAscents.length === 5, `La liste doit rester à 5, obtenu ${data.firstAscents.length}`);
    assert(!data.firstAscents.some((e) => e.uid === client3Uid), 'client3 ne doit pas figurer dans la liste');
  });

  await step('La fiche du bloc affiche la liste complète, dans l\'ordre, sans place restante', async () => {
    await gotoAndWait(client1P, '/client/daily', 'Mon Blocabrac quotidien');
    await client1P.getByRole('button', { name: new RegExp(`^${wall}`) }).click();
    await client1P.getByText(`Bloc n°${number}`, { exact: false }).click();
    await client1P.getByText('Premiers ascensionnistes', { exact: false }).waitFor({ timeout: 10000 });
    // 4e position = client1 (voir l'étape "Client1 valide le bloc" ci-dessus).
    await client1P.getByText(/4\. Client1 FirstAscents/, { exact: false }).waitFor({ timeout: 5000 });
    // Liste pleine : aucun texte "place(s) restante(s)" ne doit apparaître.
    const remaining = await client1P.getByText('restante', { exact: false }).count();
    assert(remaining === 0, 'La liste pleine ne doit afficher aucune "place restante"');
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
  console.error('SCRIPT_FAILED', err);
  process.exit(1);
});
