// Script Playwright ponctuel : l'AUTO-INSCRIPTION du grimpeur, sur le vrai parcours
// (« Mon espace » -> « Mes compétitions » -> « S'inscrire »), vérifiée avant déploiement
// le 03/10/2026 à la demande de l'utilisateur.
//
// Deux choses à démontrer, et aucune ne pouvait l'être en lisant le code :
//
//   A. la RÈGLE DE STATUT : on doit pouvoir s'inscrire à une compétition « à venir » ou
//      « en cours » (pour les retardataires), jamais à une « terminée ».
//   B. ce que l'auto-inscription ÉCRIT réellement sur le document de participation, et donc
//      ce que l'écran live — qui lit ce document SANS repli sur `users` — peut en faire.
//
// Prérequis : émulateurs Auth/Firestore + `vite --port 5174` + `node test/seed-client-registration.mjs`.
import { chromium } from 'playwright';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:5174';
const PASSWORD = 'TestPassword123!';

const attendu = JSON.parse(readFileSync(join(__dirname, '.inscription-attendu.json'), 'utf8'));

admin.initializeApp({ projectId: 'blocabrac' });
const db = admin.firestore();

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

const assert = (condition, message) => { if (!condition) throw new Error(message); };

/** Carte d'une compétition dans « Mes compétitions », ancrée sur son nom. */
const carte = (page, nom) =>
  page.getByRole('heading', { name: nom, exact: true }).first()
    .locator('xpath=ancestor::div[contains(@class,"MuiCard-root")][1]');

const connexion = async (page, email) => {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') console.log(`   [console] ${m.text().slice(0, 130)}`); });

try {
  await step('Connexion du grimpeur, puis onglet « Mes compétitions »', async () => {
    await connexion(page, attendu.grimpeurEmail);
    await page.goto(`${BASE_URL}/client/competitions`);
    await page.getByRole('heading', { name: /Mes Compétitions/i }).first().waitFor({ timeout: 20000 });
  });

  // A. La règle de statut, les trois cas dans le même pas : c'est une règle à trois
  // branches, et n'en vérifier qu'une ne dirait rien des deux autres.
  await step('Règle de statut : « en cours » et « à venir » proposées, « terminée » absente', async () => {
    const visible = async (nom) => (await carte(page, nom).count()) > 0;
    const enCours = await visible(attendu.competitions.enCours.name);
    const aVenir = await visible(attendu.competitions.aVenir.name);
    const terminee = await visible(attendu.competitions.terminee.name);
    console.log(`   en cours: ${enCours} | à venir: ${aVenir} | terminée: ${terminee}`);
    assert(enCours, 'la compétition « en cours » n\'est pas proposée au grimpeur');
    assert(!terminee, 'la compétition « terminée » est proposée : un grimpeur pourrait s\'y inscrire');
    assert(aVenir, 'la compétition « à venir » n\'est pas proposée : impossible de s\'inscrire à l\'avance');
  });

  await step('Le grimpeur s\'inscrit lui-même à la compétition en cours', async () => {
    const bloc = carte(page, attendu.competitions.enCours.name);
    await bloc.getByRole('button', { name: /S'inscrire|Valider mes blocs/i }).first().click();
    // ⚠️ Ce dialogue ne contient AUCUN champ à saisir : le code d'accès y est seulement
    // AFFICHÉ. Ma première version remplissait « le dernier champ texte de la page », ce qui
    // ne correspondait à rien. Une seule action : confirmer.
    await page.getByRole('button', { name: /Confirmer l'inscription/i }).click({ timeout: 10000 });
    await page.waitForTimeout(3000);
  });

  // B. Ce que l'auto-inscription écrit vraiment. Lu côté serveur (firebase-admin), donc
  // sans passer par les règles ni par l'interface : c'est le document, pas son affichage.
  await step('Le document de participation existe, et porte les champs que l\'écran live lit', async () => {
    const id = `${attendu.grimpeurUid}_${attendu.competitions.enCours.id}`;
    const snap = await db.collection('competition_participants').doc(id).get();
    assert(snap.exists, `aucune participation écrite sous ${id} — l'inscription n'a pas abouti`);
    const d = snap.data();
    console.log(`   champs écrits : ${Object.keys(d).sort().join(', ')}`);
    assert(d.first_name, 'first_name vide : l\'écran live afficherait une ligne sans nom');
    // ⚠️ L'écran live lit dateOfBirth et gender UNIQUEMENT ici, sans repli sur `users`.
    assert(d.dateOfBirth, 'dateOfBirth absente : l\'écran live rangerait ce grimpeur en « Inconnu »');
    assert(d.gender, 'gender absent : le classement par genre de l\'écran live serait faux');
  });

  await step('Écran live (admin) : le grimpeur apparaît dans sa vraie catégorie d\'âge', async () => {
    await connexion(page, attendu.adminEmail);
    await page.goto(`${BASE_URL}/admin/competitions/live-display/${attendu.competitions.enCours.id}`);
    // Sans résultat, l'écran affiche l'attente : on écrit une réussite pour le faire classer.
    const blocs = await db.collection('boulders')
      .where('competition_id', '==', attendu.competitions.enCours.id).get();
    const blocId = blocs.docs[0].id;
    await db.collection('competition_results')
      .doc(`${attendu.grimpeurUid}_${blocId}_${attendu.competitions.enCours.id}`)
      .set({
        user_id: attendu.grimpeurUid, competition_id: attendu.competitions.enCours.id,
        boulder_id: blocId, success: true, attempts: 2,
        createdAt: new Date().toISOString(), submitted: false,
      });
    // La rotation commence sur le « Top 10 » : on attend la page de catégorie.
    const titres = [];
    await page.waitForFunction(() => document.querySelector('h4'), null, { timeout: 20000 });
    for (let i = 0; i < 30; i += 1) {
      const t = await page.locator('h4').first().innerText().catch(() => '');
      if (t && !titres.includes(t)) titres.push(t);
      if (titres.some((x) => /ans|Inconnu/i.test(x))) break;
      await page.waitForTimeout(2000);
    }
    console.log(`   pages vues : ${titres.join(' | ')}`);
    const categorie = titres.find((t) => /ans|Inconnu/i.test(t)) || '(aucune page de catégorie)';
    assert(
      categorie.trim() === attendu.categorieAttendue,
      `catégorie affichée « ${categorie.trim() }» au lieu de « ${attendu.categorieAttendue} »`
    );
  });
  // ⚠️ LE PAS QUI COMPTE POUR LA PRODUCTION ACTUELLE. Le pas 5 passe parce que les DEUX
  // correctifs sont en place (l'inscription écrit les champs, et l'écran live se replie sur
  // `users`). Mais les participations DÉJÀ écrites en production ont été créées par l'ancien
  // code : elles n'ont ni date de naissance, ni genre, ni nom, et rien ne les rétroremplit.
  // On reproduit donc exactement cet état et on exige que l'écran live s'en sorte quand même
  // — c'est le repli, et lui seul, qui est éprouvé ici.
  await step('Participation « ancienne » (sans identité) : le repli sur `users` la rattrape', async () => {
    const id = `${attendu.grimpeurUid}_${attendu.competitions.enCours.id}`;
    await db.collection('competition_participants').doc(id).set({
      user_id: attendu.grimpeurUid,
      competition_id: attendu.competitions.enCours.id,
      email: attendu.grimpeurEmail,
      first_name: '', last_name: '',
      registered_at: new Date().toISOString(),
      is_client: true,
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('h4'), null, { timeout: 20000 });
    const titres = [];
    for (let i = 0; i < 30; i += 1) {
      const t = await page.locator('h4').first().innerText().catch(() => '');
      if (t && !titres.includes(t)) titres.push(t);
      if (titres.some((x) => /ans|Inconnu/i.test(x))) break;
      await page.waitForTimeout(2000);
    }
    const categorie = (titres.find((t) => /ans|Inconnu/i.test(t)) || '(aucune)').trim();
    console.log(`   catégorie malgré une participation sans identité : « ${categorie} »`);
    assert(
      categorie === attendu.categorieAttendue,
      `catégorie « ${categorie} » au lieu de « ${attendu.categorieAttendue} » : le repli sur \`users\` ne joue pas`
    );
    // Et le nom doit être affiché, pas une ligne vide.
    const lignes = await page.evaluate(() => {
      const conteneur = document.querySelector('h4')?.nextElementSibling;
      return conteneur ? [...conteneur.children].map((l) => [...l.children].map((c) => c.textContent.trim())) : [];
    });
    assert(lignes.length > 0, 'aucune ligne affichée');
    assert(lignes[0][1] && lignes[0][1].length > 1, `nom affiché « ${lignes[0][1]} » : ligne sans nom`);
    console.log(`   nom affiché : « ${lignes[0][1]} »`);
  });
} finally {
  await browser.close();
  const ko = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ko.length}/${results.length} pas réussis`);
  if (ko.length > 0) {
    ko.forEach((r) => console.log(`  ✘ [${r.n}] ${r.name} : ${r.error}`));
    process.exit(1);
  }
}
