// Script Playwright ponctuel : l'écran live de compétition, vérifié avant le déploiement du
// départage des ex æquo (03/10/2026). Question de l'utilisateur : « ces éléments touchent-ils
// et risquent-ils de casser l'écran live ? »
//
// ⚠️ POURQUOI CET ÉCRAN MÉRITE SON PROPRE e2e, alors que les deux autres écrans de classement
// sont déjà couverts par e2e-competition-simulation.mjs :
//
//   1. C'est le SEUL des trois à PAGINER. La première page est `globalClassement.slice(0, 10)`,
//      et les rangs y sont calculés sur la tranche, pas sur la liste entière. C'est correct
//      parce que c'est un PRÉFIXE (il commence à l'indice 0) — mais c'est fragile : si
//      quelqu'un pagine un jour autrement (page 2 = 11..20), les rangs repartiraient à 1 sur
//      chaque page sans que rien ne rougisse. Le pas 4 verrouille exactement ça.
//   2. Il tourne SANS SURVEILLANCE sur une télévision, pendant des heures. Et le dépôt n'a
//      AUCUN ErrorBoundary (vérifié, pas supposé) : une exception ici, c'est un écran blanc
//      que personne ne voit tomber.
//   3. Il se recalcule en direct via deux onSnapshot. Les pas 6 et 7 mutent donc Firestore
//      PENDANT que la page est ouverte, au lieu de recharger : c'est le chemin que la télé
//      emprunte réellement un soir de compétition.
//
// Prérequis : émulateurs Auth/Firestore + `vite --port 5174` + `node test/seed-competition-simulation.mjs`.
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
const RECOMPUTE_WAIT_MS = 4000; // debounce de 1,5 s + marge
const ROTATION_WAIT_MS = 22000; // rotation à 18 s + marge

const attendu = JSON.parse(readFileSync(join(__dirname, '.simulation-attendu.json'), 'utf8'));

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Lit les lignes affichées. L'écran live n'est pas un `<table>` : chaque ligne est une Box
 * dont les enfants directs sont les cellules (rang, nom, [provisoire], score).
 *
 * ⚠️ Ne pas filtrer les cellules sur « n'a pas d'enfant p/h5 » : les Typography de cet écran
 * sont des `<h5>` qui ne s'imbriquent pas, et ce filtre renvoyait des cellules vides. On lit
 * les enfants DIRECTS de la ligne, dans l'ordre du DOM, et on nomme explicitement le rang,
 * le nom et le score (dernière cellule) plutôt que de deviner par position.
 */
async function lireLignes(page) {
  return page.evaluate(() => {
    const titre = document.querySelector('h4');
    const conteneur = titre?.nextElementSibling;
    if (!conteneur) return [];
    return [...conteneur.children].map((ligne) => {
      const cellules = [...ligne.children].map((el) => (el.textContent || '').trim());
      return { rang: cellules[0], nom: cellules[1], score: cellules[cellules.length - 1], cellules };
    });
  });
}

const titreCourant = (page) => page.locator('h4').first().innerText();

/** Une numérotation de compétition valide : commence à 1, et chaque rang vaut i+1 ou le précédent. */
function rangsValides(rangs) {
  if (rangs.length === 0) return true;
  if (rangs[0] !== 1) return false;
  return rangs.every((r, i) => i === 0 || r === i + 1 || r === rangs[i - 1]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const erreursConsole = [];
page.on('console', (m) => {
  if (m.type() === 'error') {
    erreursConsole.push(m.text());
    console.log(`   [console] ${m.text().slice(0, 140)}`);
  }
});
page.on('pageerror', (e) => {
  erreursConsole.push(`pageerror: ${e.message}`);
  console.log(`   [pageerror] ${e.message.slice(0, 140)}`);
});

try {
  await step('La compétition simulée est mise en diffusion (liveDisplayEnabled)', async () => {
    // Le seed la crée à false exprès (l'écran live n'est pas son sujet) : on l'active ici.
    await db.collection('competitions').doc(attendu.competitionId).update({ liveDisplayEnabled: true });
    const snap = await db.collection('competitions').doc(attendu.competitionId).get();
    assert(snap.data().liveDisplayEnabled === true, 'liveDisplayEnabled non activé');
    assert(snap.data().status === 'en cours', `statut inattendu : ${snap.data().status}`);
  });

  await step('Connexion admin', async () => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('#email').fill(attendu.adminEmail);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
  });

  await step('L\'écran live s\'ouvre et affiche la première page', async () => {
    await page.goto(`${BASE_URL}/admin/competitions/live-display/${attendu.competitionId}`);
    await page.locator('h4').first().waitFor({ timeout: 20000 });
    const titre = await titreCourant(page);
    assert(/Top 10/i.test(titre), `première page inattendue : « ${titre} »`);
  });

  // ⚠️ LE PAS QUI COMPTE : les rangs de la première page sont calculés sur une TRANCHE.
  // Ils doivent être identiques aux rangs GLOBAUX de l'oracle, départage compris.
  await step('Page 1 : les rangs de la tranche sont les rangs globaux de l\'oracle', async () => {
    const lignes = await lireLignes(page);
    assert(lignes.length === 10, `${lignes.length} lignes au lieu de 10`);
    const dixPremiers = attendu.open.slice(0, 10);
    lignes.forEach(({ rang, nom, score }, i) => {
      assert(
        rang === String(dixPremiers[i].rang),
        `ligne ${i + 1} : rang affiché ${rang}, oracle ${dixPremiers[i].rang} (une tranche renumérotée ?)`
      );
      assert(nom === dixPremiers[i].nom, `ligne ${i + 1} : « ${nom} » au lieu de « ${dixPremiers[i].nom} »`);
      assert(
        score === `${dixPremiers[i].score} pts`,
        `ligne ${i + 1} : score ${score} au lieu de ${dixPremiers[i].score} pts`
      );
    });
    console.log(`   rangs page 1 : ${lignes.map((l) => l.rang).join(', ')}`);
  });

  await step('La rotation change de page, et une page de catégorie renumérote à partir de 1', async () => {
    const titreInitial = await titreCourant(page);
    await page.waitForFunction(
      (precedent) => (document.querySelector('h4')?.textContent || '') !== precedent,
      titreInitial,
      { timeout: ROTATION_WAIT_MS }
    );
    const titre = await titreCourant(page);
    const lignes = await lireLignes(page);
    const rangs = lignes.map((l) => Number(l.rang));
    assert(lignes.length > 0, `page « ${titre} » vide`);
    assert(
      rangs[0] === 1,
      `page « ${titre} » : premier rang ${rangs[0]} au lieu de 1 — un rang global a fui dans une catégorie`
    );
    assert(rangsValides(rangs), `page « ${titre} » : numérotation invalide (${rangs.join(', ')})`);
    // Ordre interne : la catégorie est un filtre de la liste globale, l'ordre doit être conservé.
    const attenduCategorie = (attendu.parCategorie[titre.trim()] || []).map((e) => e.nom);
    if (attenduCategorie.length > 0) {
      assert(
        JSON.stringify(lignes.map((l) => l.nom)) === JSON.stringify(attenduCategorie),
        `page « ${titre} » : ordre ${lignes.map((l) => l.nom).join(', ')} au lieu de ${attenduCategorie.join(', ')}`
      );
    }
    console.log(`   page « ${titre} » : rangs ${rangs.join(', ')}`);
  });

  // ⚠️ Le cas que le tirage aléatoire ne produit jamais, et qui sera la réalité des dix
  // premières minutes de l'épreuve : plusieurs grimpeurs n'ont QUE des échecs. Ils sont tous
  // à 0 point, avec un départage vide, donc STRICTEMENT ex æquo — et l'écran doit l'afficher
  // (rang 1 partout) plutôt que de faire croire à un classement. C'est la même décision que
  // pour le mode officiel, où « les égalités sont l'état normal, pas un cas limite ».
  await step('Début d\'épreuve : avec uniquement des échecs, tout le monde partage le rang 1', async () => {
    const resultats = await db.collection('competition_results')
      .where('competition_id', '==', attendu.competitionId).get();
    const lot = db.batch();
    resultats.docs.forEach((d) => lot.update(d.ref, { success: false }));
    await lot.commit();

    await page.waitForTimeout(RECOMPUTE_WAIT_MS);
    const lignes = await lireLignes(page);
    assert(lignes.length > 0, 'plus aucune ligne affichée');
    const rangs = lignes.map((l) => Number(l.rang));
    const scores = lignes.map((l) => l.score);
    assert(scores.every((s) => s === '0 pts'), `scores non nuls : ${scores.join(', ')}`);
    assert(
      rangs.every((r) => r === 1),
      `rangs ${rangs.join(', ')} : des grimpeurs strictement à égalité doivent partager le rang 1`
    );
    console.log(`   ${rangs.length} lignes, toutes au rang 1, toutes à 0 pts`);
  });

  await step('Aucun résultat du tout : l\'écran affiche l\'attente, il ne tombe pas', async () => {
    const resultats = await db.collection('competition_results')
      .where('competition_id', '==', attendu.competitionId).get();
    const lot = db.batch();
    resultats.docs.forEach((d) => lot.delete(d.ref));
    await lot.commit();

    await page.waitForTimeout(RECOMPUTE_WAIT_MS);
    await page.getByText(/En attente des premières validations/i).first()
      .waitFor({ timeout: 10000 });
    const titres = await page.locator('h4').count();
    assert(titres === 0, 'un titre de page subsiste alors qu\'il n\'y a plus rien à classer');
  });

  await step('Aucune exception pendant toute la séquence', async () => {
    // L'écran tourne sans surveillance et le dépôt n'a aucun ErrorBoundary : une exception
    // ici serait un écran blanc que personne ne voit tomber.
    // Le Wake Lock est refusé en navigateur sans interface : l'écran live demande à garder
    // la télévision allumée, l'application journalise le refus et continue. C'est le
    // comportement voulu, pas un défaut — et sur la vraie télévision la permission est
    // accordée. Tout le reste doit être vide.
    const graves = erreursConsole.filter(
      (e) => !/favicon|Download the React DevTools|Wake Lock/i.test(e)
    );
    assert(graves.length === 0, `${graves.length} erreur(s) console : ${graves[0]}`);
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
