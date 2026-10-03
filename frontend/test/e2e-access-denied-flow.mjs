// Script Playwright ponctuel : un compte dont `roles` ne contient PAS `client` doit aboutir
// à un ÉCRAN TERMINAL, jamais à une boucle de redirection. Contre l'app + les émulateurs
// locaux, jamais la production.
//
// ⚠️ POURQUOI CE TEST EXISTE, ET POURQUOI IL NE FAUT PAS « RÉPARER » LE SEED
// (docs/handoffs/RETOUR-labels-apres-dom.md §3.1) :
//
// Jusqu'au 03/10/2026, ProtectedRoute faisait `<Navigate to="/" replace />` quand le rôle
// manquait. Or `/` est Home, dont le useEffect pousse vers `/client/screen`, lui-même protégé
// par `role="client"`. Un compte sans ce rôle partait donc en boucle infinie : écran
// scintillant pendant plusieurs secondes, puis « Throttling navigation to prevent the browser
// from hanging », application TOTALEMENT inutilisable — pas dégradée, bloquée.
//
// En production l'invariant « tout compte porte client » l'empêchait. Mais cet invariant est
// tenu par une CONVENTION D'ÉCRITURE, pas par une contrainte : décocher `client` sur un
// compte ouvreur depuis AdminUsers.tsx suffisait à rendre ce compte inutilisable, sans autre
// recours qu'une édition directe dans la console Firebase.
//
// Le défaut n'a été découvert que parce que `seed-daily-users.mjs` crée un ouvreur
// `roles: ['ouvreur']`, VIOLANT cet invariant. « Corriger » le seed en y ajoutant `client`
// aurait fait disparaître le symptôme en supprimant la seule chose qui ait jamais exercé ce
// chemin — le motif documenté quatre fois dans ce projet : faire taire le signal plutôt que
// traiter la cause qu'il désignait. Ce compte reste donc délibérément sans `client`, et c'est
// CE test qui en fait un cas d'épreuve au lieu d'un accident.
//
// Prérequis : émulateurs Auth/Firestore locaux + `vite --port 5174` + `node test/seed-daily-users.mjs`.
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5174';
// Compte volontairement privé du rôle `client` — voir l'en-tête.
const OUVREUR_SANS_CLIENT = 'ouvreur.daily.test@blocabrac.test';
const PASSWORD = 'TestPassword123!';

// La boucle se manifestait dans les premières secondes suivant la connexion : on attend
// délibérément plus longtemps que ça avant de conclure, sinon le test passerait au vert
// simplement parce qu'il a regardé trop tôt.
const FENETRE_OBSERVATION_MS = 6000;
// Une boucle produit des dizaines de navigations ; le chemin nominal en produit une poignée
// (login -> / -> /client/screen). Le seuil est volontairement large : on cherche à distinguer
// un ordre de grandeur, pas à figer un nombre exact qui casserait au moindre ajout de route.
const NAVIGATIONS_MAX = 15;

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

const browser = await chromium.launch();
const page = await browser.newPage();

let navigations = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations += 1; });
let throttled = false;
page.on('console', (msg) => {
  if (msg.text().includes('Throttling navigation')) throttled = true;
  if (msg.type() === 'error') console.log(`   [console] ${msg.text().slice(0, 140)}`);
});

try {
  await step('connexion du compte sans rôle client', async () => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('#email').fill(OUVREUR_SANS_CLIENT);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForTimeout(FENETRE_OBSERVATION_MS);
  });

  await step('aucune boucle de redirection (pas de bridage par le navigateur)', async () => {
    assert(!throttled, 'le navigateur a bridé la navigation : la boucle est de retour');
    assert(
      navigations <= NAVIGATIONS_MAX,
      `${navigations} navigations observées (max ${NAVIGATIONS_MAX}) : comportement de boucle`
    );
  });

  await step('un écran terminal d\'accès refusé est affiché', async () => {
    assert(await page.getByText('Accès non autorisé').count() > 0, 'titre d\'accès refusé absent');
    assert(
      await page.getByText("Votre compte n'a pas accès à cet espace").count() > 0,
      'message d\'accès refusé absent'
    );
  });

  await step('l\'écran ne navigue pas tout seul', async () => {
    const avant = page.url();
    await page.waitForTimeout(1500);
    assert(page.url() === avant, `l\'écran a navigué tout seul (${avant} -> ${page.url()})`);
  });

  // ⚠️ L'invariant complet (ClaudeNav, 03/10/2026) : une page terminale doit TOUJOURS offrir
  // une issue, sinon on a remplacé une boucle infinie par un cul-de-sac. Et pour CE compte,
  // « Retour à l'accueil » n'en est pas une : Home repousse vers /client/screen, qui réaffiche
  // cet écran. Seule la déconnexion sort vraiment — c'est donc elle que ce test exige.
  await step('l\'écran offre une issue réelle : la déconnexion', async () => {
    assert(
      await page.getByRole('button', { name: 'Se déconnecter' }).count() > 0,
      'aucun bouton de déconnexion : l\'écran terminal est un cul-de-sac'
    );
    assert(
      await page.getByRole('link', { name: 'Retour à l\'accueil' }).count() > 0,
      'le lien de retour à l\'accueil est absent (utile aux comptes qui ont bien le rôle client)'
    );
  });

  await step('l\'espace autorisé par son rôle reste accessible', async () => {
    // Le compte est ouvreur : le refus doit être cantonné aux espaces qu'il n'a pas, et ne
    // pas dégénérer en blocage général.
    await page.goto(`${BASE_URL}/ouvreur/daily-boulders`);
    await page.getByRole('heading', { name: 'Sélectionnez un mur pour gérer les blocs quotidiens' })
      .waitFor({ timeout: 15000 });
  });

  // ⚠️ EN DERNIER, délibérément : cette étape déconnecte le compte, donc toute vérification
  // qui suivrait échouerait pour une raison sans rapport avec ce qu'elle teste.
  await step('la déconnexion ramène effectivement à l\'écran de connexion', async () => {
    await page.goto(`${BASE_URL}/client/screen`);
    await page.getByRole('button', { name: 'Se déconnecter' }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    // performLogout() termine par un window.location.reload() : on attend la reprise.
    await page.waitForTimeout(5000);
    const surConnexion = await page.locator('#email').count() > 0
      || await page.getByRole('button', { name: 'Se connecter' }).count() > 0;
    assert(surConnexion, `la déconnexion n'a pas abouti à un écran de connexion (${page.url()})`);
  });
} finally {
  await browser.close();
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} étapes réussies`);
  if (ok !== results.length) process.exit(1);
}
