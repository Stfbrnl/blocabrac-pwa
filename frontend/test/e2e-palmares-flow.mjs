// e2e du palmarès officiel gelé (docs/plans/PLAN-classements-competition-5-novembre.md §2).
//
// ─── CE QUE SEUL UN NAVIGATEUR PEUT VÉRIFIER ICI ───────────────────────────────────────
//
// Les tests unitaires établissent que `buildFrozenRankings` compose les bons rangs, et les
// tests de règles que le document est immuable. Ce qu'aucun des deux ne dit :
//
//   1. que l'écran du grimpeur LIT le document gelé au lieu de recalculer. C'est le vrai
//      risque du §2.2, et il n'est visible que sur la page ;
//   2. que le parcours admin aboutit réellement à un document en base — « le document stocké
//      EST ce qui s'affiche » ne vaut que si l'écriture a bien eu lieu. Un test qui
//      fabriquerait lui-même le palmarès ne prouverait rien (leçon du 25/09/2026 : le test de
//      règles semait son propre badge, masquant qu'il n'existait pas en prod) ;
//   3. LE TEST DÉCISIF DU §6 : recoter un bloc APRÈS le gel, et vérifier que le palmarès ne
//      bouge pas d'une ligne. Et, comme le plan l'exige, prédire les DEUX grandeurs : le
//      palmarès inchangé **et** le fait que la recotation aurait dû changer le score. Ici
//      Chloe garde 100 points sur un bloc devenu rose, qui en vaut 1000 : si quoi que ce soit
//      recalculait, le chiffre serait 1000. Un palmarès inchangé ne prouve rien seul.
//
// ⚠️ CE QUE CET e2e NE PEUT PAS VÉRIFIER, et il faut le dire : le §4.4 (un appareil qui a
// ouvert la page AVANT la publication ne doit pas se voir resservir l'absence depuis le cache
// IndexedDB). La persistance Firestore est **désactivée de force** quand
// `VITE_USE_EMULATOR === 'true'` (firebaseConfig.ts), précisément pour qu'un cache périmé ne
// masque pas un défaut de permissions. Le code lit donc le palmarès en direct, et non en
// cache-first, mais cela ne se CONSTATE que sur un vrai téléphone ayant visité la page avant
// la publication. Reste à faire à la main.
//
// Prérequis : émulateurs Auth/Firestore + `vite --port 5174` + `node test/seed-palmares-users.mjs`.
import { chromium } from 'playwright';
import admin from 'firebase-admin';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const BASE_URL = 'http://localhost:5174';
const PASSWORD = 'TestPassword123!';
const COMPETITION_ID = 'comp-palmares-essai';
const ADMIN_EMAIL = 'admin.palmares@blocabrac.test';
const CLIENT_EMAIL = 'amandine.palmares@blocabrac.test';

admin.initializeApp({ projectId: 'blocabrac' });
const db = admin.firestore();

// Le script de depublication vit a la racine du depot et resout ses modules depuis la.
const RACINE = join(process.cwd(), '..');
const sauvegardeAttendue = () => join(
  RACINE, 'firestore-migration',
  `dump-palmares-${COMPETITION_ID}-${new Date().toISOString().slice(0, 10)}.emulator.json`
);

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
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15000 });
}

const lirePalmaresEnBase = async () => {
  const snap = await db.collection('competition_rankings').doc(COMPETITION_ID).get();
  return snap.exists ? snap.data() : null;
};

async function main() {
  const browser = await chromium.launch();
  const adminPage = await (await browser.newContext()).newPage();
  const clientPage = await (await browser.newContext()).newPage();

  await step('aucun palmarès avant publication (état normal, pas une erreur)', async () => {
    assert((await lirePalmaresEnBase()) === null, 'un palmarès existe déjà avant publication');
  });

  await step('le grimpeur voit « aucun palmarès publié », et non une page en erreur', async () => {
    await login(clientPage, CLIENT_EMAIL);
    await clientPage.goto(`${BASE_URL}/client/competitions`);
    await clientPage.getByRole('heading', { name: 'Palmarès officiels' }).waitFor({ timeout: 15000 });
    const texte = await clientPage.locator('body').innerText();
    assert(texte.includes('Aucun palmarès publié'), 'le message d\'absence n\'est pas affiché');
  });

  await step('l\'admin voit le bouton de publication sur la compétition terminée', async () => {
    await login(adminPage, ADMIN_EMAIL);
    await adminPage.goto(`${BASE_URL}/admin/competitions/create`);
    await adminPage.getByRole('button', { name: 'Publier le palmarès' }).waitFor({ timeout: 15000 });
  });

  await step('l\'aperçu montre l\'égalité au rang 1 et des noms tronqués', async () => {
    await adminPage.getByRole('button', { name: 'Publier le palmarès' }).click();
    await adminPage.getByRole('heading', { name: 'Publier le palmarès officiel' }).waitFor({ timeout: 10000 });
    const texte = await adminPage.locator('[role="dialog"]').innerText();
    // Deux grimpeurs au rang 1 : l'aperçu doit le montrer, sinon l'admin publierait sans
    // avoir vu l'égalité qu'il gèle.
    const lignesRang1 = texte.split('\n').filter((l) => l.trim().startsWith('1.'));
    assert(lignesRang1.length === 2, `attendu 2 lignes au rang 1, vu ${lignesRang1.length}`);
    assert(texte.includes('Amandine D.'), 'le nom tronqué d\'Amandine est absent de l\'aperçu');
    assert(!texte.includes('Dupont-Lachaise'), 'l\'aperçu affiche un nom de famille complet');
    assert(texte.includes('définitive'), 'l\'aperçu ne prévient pas que la publication est définitive');
  });

  await step('la publication écrit réellement le document, avec les rangs partagés', async () => {
    await adminPage.getByRole('button', { name: 'Publier définitivement' }).click();
    await adminPage.getByText('Palmarès officiel publié').waitFor({ timeout: 15000 });

    const data = await lirePalmaresEnBase();
    assert(data !== null, 'aucun document competition_rankings après publication');
    // Le document stocké EST ce qui s'affichera : on l'assertionne là où il vit.
    assert(data.general_open.length === 4, `4 participants attendus au général, vu ${data.general_open.length}`);
    const rangs = data.general_open.map((e) => e.rank);
    assert(JSON.stringify(rangs) === JSON.stringify([1, 1, 3, 4]), `rangs attendus 1,1,3,4 — vu ${rangs.join(',')}`);
    const scores = data.general_open.map((e) => e.score);
    assert(JSON.stringify(scores) === JSON.stringify([480, 480, 400, 100]), `scores inattendus : ${scores.join(',')}`);
  });

  await step('le document ne porte aucun nom de famille ni date de naissance', async () => {
    const serialise = JSON.stringify(await lirePalmaresEnBase());
    for (const nom of ['Dupont-Lachaise', 'Vandenberghe', 'Visiteur']) {
      assert(!serialise.includes(nom), `le document contient le nom complet « ${nom} »`);
    }
    assert(!serialise.includes('1996-'), 'le document contient une date de naissance');
    assert(serialise.includes('Amandine D.'), 'le nom tronqué attendu est absent');
  });

  await step('le non-client est au classement général, dans aucun classement client', async () => {
    const data = await lirePalmaresEnBase();
    const general = data.general_open.map((e) => e.display_name);
    assert(general.includes('Victor V.'), 'le non-client est absent du classement général');
    const clients = [
      ...data.client_open,
      ...data.client_gender.flatMap((g) => g.entries),
      ...data.client_age.flatMap((g) => g.entries),
      ...data.client_level_max.flatMap((g) => g.entries),
    ].map((e) => e.display_name);
    // Taille d'abord : sans elle, « Victor n'y est pas » serait vrai d'un ensemble vide.
    assert(clients.length === 12, `12 lignes clientes attendues, vu ${clients.length}`);
    assert(!clients.includes('Victor V.'), 'le non-client apparaît dans un classement client');
  });

  await step('les paquets de niveau et la catégorie « Inconnu » sont ceux attendus', async () => {
    const data = await lirePalmaresEnBase();
    const paquets = data.client_level_max.map((g) => `${g.category}:${g.entries.length}`);
    assert(
      JSON.stringify(paquets) === JSON.stringify(['Niveau rouge:2', 'Niveau bleu:1']),
      `paquets inattendus : ${paquets.join(' | ')}`
    );
    const ages = data.client_age.map((g) => g.category);
    // Chloe n'a pas de date de naissance : sa catégorie est « Inconnu », affichée et non masquée.
    assert(ages.includes('Inconnu'), `catégorie « Inconnu » absente : ${ages.join(', ')}`);
  });

  await step('le bouton de publication a disparu, remplacé par la date', async () => {
    await adminPage.reload();
    await adminPage.getByText('Palmarès publié le').waitFor({ timeout: 15000 });
    const boutons = await adminPage.getByRole('button', { name: 'Publier le palmarès' }).count();
    assert(boutons === 0, 'le bouton de publication est encore proposé alors que le palmarès existe');
  });

  await step('le grimpeur voit le palmarès, avec le rang partagé et sans nom de famille', async () => {
    await clientPage.reload();
    await clientPage.getByRole('button', { name: /Contest essai palmares/ }).click();
    await clientPage.getByRole('heading', { name: 'Classement général (open)' }).waitFor({ timeout: 10000 });
    const texte = await clientPage.locator('body').innerText();
    assert(texte.includes('Amandine D.'), 'le nom tronqué est absent de l\'écran du grimpeur');
    assert(!texte.includes('Dupont-Lachaise'), 'l\'écran du grimpeur affiche un nom de famille complet');
    assert(texte.includes('Palmarès officiel'), 'le libellé « Palmarès officiel » est absent');
    // Le rang partagé doit se VOIR : deux lignes au rang 1 dans le tableau général.
    const rangs = await clientPage.evaluate(() => {
      const tables = [...document.querySelectorAll('table')];
      if (tables.length === 0) return [];
      return [...tables[0].querySelectorAll('tbody tr')].map((tr) => tr.children[0].textContent.trim());
    });
    assert(rangs.length === 4, `4 lignes attendues au tableau général, vu ${rangs.length}`);
    assert(
      JSON.stringify(rangs) === JSON.stringify(['1', '1', '3', '4']),
      `rangs affichés inattendus : ${rangs.join(',')}`
    );
  });


  // ═══ LE CHEMIN DE RÉCUPÉRATION, EXERCÉ DE BOUT EN BOUT (retour ClaudeNav §4.1) ═══════
  //
  // « Écrit n'est pas exercé », et c'est désormais le SEUL chemin de correction d'un palmarès :
  // les règles interdisent `update` et `delete` à tout le monde, application comprise. Le
  // 5 novembre au soir, si le palmarès part avec une erreur, le seul recours est le poste de
  // Stéphane et la clé de service. Un chemin de secours jamais emprunté est un filet jamais vu
  // attraper quelque chose.
  //
  // ⚠️ On lance le VRAI script, dans un vrai processus — pas une suppression équivalente via
  // l'Admin SDK depuis ce test. C'est le script qui doit être exercé, ses gardes comprises.
  //
  // ⚠️ Et « identique » ne peut pas inclure `published_at` : il est horodaté au moment de
  // l'aperçu, donc il DOIT changer. L'assertion porte sur tout le reste, et nommer cette
  // exception est ce qui l'empêche d'être une comparaison vide.
  let palmaresAvantDepublication = null;

  await step('§4.1 — la simulation du script de dépublication ne supprime rien', async () => {
    palmaresAvantDepublication = await lirePalmaresEnBase();
    assert(palmaresAvantDepublication !== null, 'aucun palmarès à dépublier');

    execFileSync('node', ['scripts/unpublish-competition-rankings.js', '--competitionId', COMPETITION_ID], {
      cwd: RACINE, env: { ...process.env }, encoding: 'utf8',
    });

    assert((await lirePalmaresEnBase()) !== null, 'la simulation a supprimé le palmarès');
    assert(
      !existsSync(sauvegardeAttendue()),
      `la simulation a écrit une sauvegarde (${sauvegardeAttendue()}) — une simulation n'écrit rien, nulle part`
    );
  });

  await step('§4.1 — le script dépublie réellement, et sauvegarde avant', async () => {
    execFileSync('node', ['scripts/unpublish-competition-rankings.js', '--competitionId', COMPETITION_ID, '--fix'], {
      cwd: RACINE, env: { ...process.env }, encoding: 'utf8',
    });

    assert((await lirePalmaresEnBase()) === null, 'le palmarès existe encore après --fix');
    assert(existsSync(sauvegardeAttendue()), `aucune sauvegarde produite (${sauvegardeAttendue()})`);
    const sauvegarde = JSON.parse(readFileSync(sauvegardeAttendue(), 'utf8'));
    assert(
      JSON.stringify(sauvegarde.data) === JSON.stringify(palmaresAvantDepublication),
      'la sauvegarde ne reproduit pas le palmarès supprimé'
    );
  });

  await step('§4.1 — republication : le palmarès est identique, hors date de publication', async () => {
    await adminPage.reload();
    await adminPage.getByRole('button', { name: 'Publier le palmarès' }).waitFor({ timeout: 15000 });
    await adminPage.getByRole('button', { name: 'Publier le palmarès' }).click();
    await adminPage.getByRole('heading', { name: 'Publier le palmarès officiel' }).waitFor({ timeout: 10000 });
    await adminPage.getByRole('button', { name: 'Publier définitivement' }).click();
    await adminPage.getByText('Palmarès officiel publié').waitFor({ timeout: 15000 });

    const republie = await lirePalmaresEnBase();
    assert(republie !== null, 'aucun palmarès après republication');

    // La date DOIT avoir changé : sans cette assertion, on pourrait comparer deux fois le
    // même document sans s'en apercevoir.
    assert(
      republie.published_at !== palmaresAvantDepublication.published_at,
      'published_at n\'a pas changé : le document n\'a probablement pas été réécrit'
    );

    const sansDate = (d) => JSON.stringify({ ...d, published_at: null });
    assert(
      sansDate(republie) === sansDate(palmaresAvantDepublication),
      'le palmarès republié diffère de l\'original sur une donnée inchangée'
    );

    // Le nettoyage de la sauvegarde d'essai : elle vit dans un dossier gitignoré, mais la
    // laisser ferait échouer le pas « la simulation n'écrit rien » au prochain passage.
    rmSync(sauvegardeAttendue(), { force: true });
  });

  // ═══ LE TEST DÉCISIF (§6, point 6) ═══════════════════════════════════════════════════
  await step('⚠️ DÉCISIF : recoter un bloc après le gel ne déplace pas le palmarès', async () => {
    const avant = JSON.stringify(await lirePalmaresEnBase());

    // Le bloc bleu (100 points) devient ROSE (1000 points). Si quoi que ce soit recalculait,
    // Chloe passerait de 100 à 1000 et sauterait au rang 1. C'est la prédiction complète :
    // on nomme la valeur qui DEVRAIT apparaître si le gel ne gelait rien.
    await db.collection('boulders').doc('bloc-bleu-essai').update({ difficulty: 'rose' });

    const apres = JSON.stringify(await lirePalmaresEnBase());
    assert(avant === apres, 'le document du palmarès a changé après la recotation');

    const data = await lirePalmaresEnBase();
    const chloe = data.general_open.find((e) => e.display_name === 'Chloe');
    assert(chloe, 'Chloe est absente du palmarès');
    assert(chloe.score === 100, `Chloe devrait rester à 100 points, vue à ${chloe.score}`);
    assert(chloe.rank === 4, `Chloe devrait rester au rang 4, vue au rang ${chloe.rank}`);
  });

  await step('⚠️ DÉCISIF (suite) : et l\'écran du grimpeur l\'affiche toujours à l\'identique', async () => {
    // La moitié qui porte vraiment : c'est la PAGE qui pourrait recalculer, pas la base.
    await clientPage.reload();
    await clientPage.getByRole('button', { name: /Contest essai palmares/ }).click();
    await clientPage.getByRole('heading', { name: 'Classement général (open)' }).waitFor({ timeout: 10000 });
    const lignes = await clientPage.evaluate(() => {
      const tables = [...document.querySelectorAll('table')];
      return [...tables[0].querySelectorAll('tbody tr')].map((tr) => ({
        rang: tr.children[0].textContent.trim(),
        nom: tr.children[1].textContent.trim(),
        points: tr.children[2].textContent.trim(),
      }));
    });
    assert(lignes.length === 4, `4 lignes attendues, vu ${lignes.length}`);
    const chloe = lignes.find((l) => l.nom === 'Chloe');
    assert(chloe, 'Chloe est absente du tableau affiché');
    assert(chloe.points === '100', `Chloe affichée à ${chloe.points} points au lieu de 100 — la page recalcule !`);
    assert(chloe.rang === '4', `Chloe affichée au rang ${chloe.rang} au lieu de 4`);
  });

  await browser.close();

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} étapes vertes`);
  if (ok !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
