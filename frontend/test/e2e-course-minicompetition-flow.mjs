// Script Playwright ponctuel : couvre spécifiquement la file d'attente "blocs de
// mini-compétition" de ClientCourseSession.tsx (`boulderQueue`, docs/processus/PROCESSUS-erreurs-avalees.md
// §3 / useDebouncedFlushQueue) — jamais exercée par e2e-course-flow.mjs, qui ne valide qu'un
// exercice (`exerciseQueue`). Même structure de séance programmée -> active -> archivée que
// e2e-course-flow.mjs, réduite au strict nécessaire pour ce chemin précis. Contre l'app + les
// émulateurs locaux, jamais la production. Prérequis : seed-course-minicompetition.mjs.
import { chromium } from 'playwright';
import admin from 'firebase-admin';
import { assertNoOrphanLabels } from './assertNoOrphanLabels.mjs';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
admin.initializeApp({ projectId: 'blocabrac' });
const adminAuth = admin.auth();
const adminDb = admin.firestore();

const BASE_URL = 'http://localhost:5174';
const MONITEUR_EMAIL = 'moniteur.minicomp.test@blocabrac.test';
const CLIENT_EMAIL = 'client.minicomp.test@blocabrac.test';
const CLIENT2_EMAIL = 'client2.minicomp.test@blocabrac.test';
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
  const client2 = await (await browser.newContext()).newPage();

  await step('Connexion moniteur', () => login(moniteur, MONITEUR_EMAIL));
  await step('Connexion client', () => login(client, CLIENT_EMAIL));
  await step('Connexion du second élève (il sert à produire une ÉGALITÉ)', () => login(client2, CLIENT2_EMAIL));

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

    // ✅ PLAN-labels-non-associes.md §4.1 — posé ICI précisément : cet écran rend ses Select
    // d'essais À L'INTÉRIEUR de boucles (une par exercice, une par bloc de mini-compétition),
    // donc c'est le seul où la vérification des identifiants dupliqués de l'assertion a un
    // sujet. Un identifiant figé dans ces boucles passerait les deux signalements de Chrome
    // sans être vu. Voir docs/handoffs/RETOUR-labels-apres-dom.md §4.
    await assertNoOrphanLabels(client, 'Client — séance de cours (exercices + mini-compétition)');
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

  await step('Le SECOND élève valide le même bloc avec le même nombre d\'essais (égalité)', async () => {
    await gotoAndWait(client2, '/client/courses', 'Mes Cours');
    const activeCard = client2.locator('.MuiCard-root', { hasText: SESSION_TITLE });
    await activeCard.getByRole('button', { name: 'Valider les exercices' }).click();
    await client2.waitForURL(/\/client\/courses\/session\//, { timeout: 10000 });
    const boulderCard = client2.locator('.MuiCard-root', { hasText: 'Bloc n°42' });
    await boulderCard.getByRole('button', { name: '✅ Réussi' }).click();
    await boulderCard.locator('div[role="combobox"]', { hasText: /essai/ }).click();
    await client2.getByRole('option', { name: '3 essais', exact: true }).click();
    await client2.waitForTimeout(3200);

    const { uid } = await adminAuth.getUserByEmail(CLIENT2_EMAIL);
    const snap = await adminDb.collection('client_course_results')
      .where('userId', '==', uid).where('miniCompetitionId', '!=', null).get();
    assert(snap.size === 1, `1 résultat attendu pour le second élève, vu ${snap.size}`);
    assert(snap.docs[0].data().attempts === 3, 'le second élève doit avoir le MÊME nombre d\'essais');
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

  // ═══ LE CLASSEMENT CÔTÉ MONITEUR (corrections du 18/10/2026) ════════════════════════
  //
  // ⚠️ Ce pas tient à une propriété du JEU D'ESSAI : la mini-compétition n'a PAS de
  // `createdBy` (voir seed-course-minicompetition.mjs). C'est le cas d'une mini-compétition
  // créée par un collègue — et l'écran ne listait que celles dont le moniteur est l'auteur,
  // donc le bloc « Classement » n'apparaissait pas du tout. On l'affirme ici, sans quoi
  // « compléter » le seed rendrait ce pas muet.
  const lireClassement = async () => moniteur.evaluate(() => {
    const t = [...document.querySelectorAll('table')].find((x) =>
      [...x.querySelectorAll('thead th')].some((th) => th.textContent.trim() === 'Rang'));
    if (!t) return null;
    return [...t.querySelectorAll('tbody tr')].map((tr) => {
      const c = [...tr.children].map((td) => td.textContent.trim());
      return { rang: c[0], participant: c[1], blocs: c[2], points: c[3] };
    });
  });

  let classementAvantRecotation = null;

  await step('Le moniteur voit le classement d\'une mini-compétition qu\'il n\'a PAS créée', async () => {
    const mini = await adminDb.collection('mini_competitions').get();
    assert(mini.size === 1, `1 mini-compétition attendue dans le jeu d'essai, vue ${mini.size}`);
    assert(
      mini.docs[0].data().createdBy === undefined,
      'le jeu d\'essai doit porter une mini-compétition SANS createdBy : c\'est ce que ce pas vérifie'
    );

    await gotoAndWait(moniteur, '/moniteur/stats', 'Statistiques des exercices');
    await moniteur.getByRole('heading', { name: /Classement mini-compétition/ }).waitFor({ timeout: 15000 });
    await moniteur.getByRole('combobox', { name: /Mini-compétition/i }).click();
    await moniteur.getByRole('option', { name: MINI_COMPETITION_NAME, exact: false }).first().click();
    await moniteur.waitForTimeout(800);

    classementAvantRecotation = await lireClassement();
    assert(classementAvantRecotation, 'aucun tableau de classement affiché');
    // ⚠️ Affirmer la TAILLE avant d'affirmer sur l'ensemble : « tous les rangs valent 1 »
    // serait vrai, et vide, sur une seule ligne.
    assert(
      classementAvantRecotation.length === 2,
      `2 lignes attendues (deux élèves), vu ${classementAvantRecotation.length}`
    );
  });

  await step('Deux élèves à égalité PARTAGENT le rang 1 (ce n\'était pas 1 et 2)', async () => {
    const rangs = classementAvantRecotation.map((l) => l.rang);
    assert(
      JSON.stringify(rangs) === JSON.stringify(['1', '1']),
      `rangs attendus 1,1 — vus ${rangs.join(',')}`
    );
    const points = classementAvantRecotation.map((l) => l.points);
    assert(
      points.every((p) => p === '80'),
      `80 points attendus pour les deux (bleu, 3 essais), vus ${points.join(',')}`
    );
  });

  // ═══ LE TEST DÉCISIF : une recotation ne doit plus faire diverger les deux écrans ═════
  //
  // Prédiction complète, les DEUX grandeurs nommées d'avance : le bloc passe de bleu (80 pts
  // à 3 essais) à rose (900 pts à 3 essais). Si l'écran de l'élève recalculait encore depuis
  // la couleur courante, il afficherait 900 — c'est exactement ce qui a été mesuré le
  // 18/10/2026, contre 80 chez la monitrice sur la même validation.
  await step('⚠️ DÉCISIF : après recotation, l\'élève et le moniteur affichent le MÊME score', async () => {
    const blocs = await adminDb.collection('boulders').where('number', '==', 42).get();
    assert(blocs.size === 1, `1 bloc n°42 attendu, vu ${blocs.size}`);
    await blocs.docs[0].ref.update({ color: 'rose' });

    await moniteur.reload();
    await moniteur.getByRole('combobox', { name: /Mini-compétition/i }).click();
    await moniteur.getByRole('option', { name: MINI_COMPETITION_NAME, exact: false }).first().click();
    await moniteur.waitForTimeout(800);
    const apres = await lireClassement();
    assert(
      JSON.stringify(apres) === JSON.stringify(classementAvantRecotation),
      'le classement du moniteur a bougé après la recotation'
    );

    await client.reload();
    const carte = client.locator('.MuiCard-root', { hasText: 'Bloc n°42' });
    const texte = await carte.innerText();
    assert(
      texte.includes('80 pts'),
      `l'élève doit toujours voir 80 pts (couleur figée à la validation) — vu : ${texte.replace(/\n/g, ' | ')}`
    );
    assert(
      !texte.includes('900 pts'),
      'l\'élève affiche 900 pts : son écran recalcule depuis la couleur COURANTE du bloc'
    );
    // Et la pastille porte la couleur qui a réellement rapporté les points, pas la nouvelle.
    assert(
      texte.includes('bleu') && !texte.includes('rose'),
      `la pastille doit montrer la couleur figée « bleu » — vu : ${texte.replace(/\n/g, ' | ')}`
    );
  });

  await step('La colonne « Exercice » du moniteur nomme la mini-compétition (elle était vide)', async () => {
    const cellules = await moniteur.evaluate(() => {
      const t = [...document.querySelectorAll('table')].find((x) =>
        [...x.querySelectorAll('thead th')].some((th) => th.textContent.trim() === 'Exercice'));
      if (!t) return null;
      const i = [...t.querySelectorAll('thead th')].findIndex((th) => th.textContent.trim() === 'Exercice');
      return [...t.querySelectorAll('tbody tr')].map((tr) => tr.children[i].textContent.trim());
    });
    assert(cellules && cellules.length >= 2, `au moins 2 lignes de résultats attendues, vu ${cellules?.length}`);
    assert(
      cellules.every((c) => c.includes(MINI_COMPETITION_NAME)),
      `chaque ligne doit nommer la mini-compétition — vu : ${JSON.stringify(cellules)}`
    );
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
