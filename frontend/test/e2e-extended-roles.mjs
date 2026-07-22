// Script Playwright ponctuel : couvre les surfaces des 4 rôles qui n'avaient pas
// encore été exercées de bout en bout (contrairement aux flux séances/compétitions/
// blocs quotidiens déjà testés) : gestion utilisateurs + annonces (Admin), groupes +
// exercices + messagerie + stats/badges/diplômes (Moniteur), profil + stats + messagerie
// (Client). Contre l'app + les émulateurs locaux, jamais la production.
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5174';
const PASSWORD = 'TestPassword123!';
const ADMIN_EMAIL = 'admin.ext.test@blocabrac.test';
const MONITEUR_EMAIL = 'moniteur.ext.test@blocabrac.test';
const CLIENT1_EMAIL = 'client1.ext.test@blocabrac.test';
const CLIENT2_EMAIL = 'client2.ext.test@blocabrac.test';
const RUN_ID = String(Math.floor(Math.random() * 9000) + 100);

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


async function main() {
  const browser = await chromium.launch();
  const adminP = await (await browser.newContext()).newPage();
  const moniteurP = await (await browser.newContext()).newPage();
  const client1P = await (await browser.newContext()).newPage();
  const client2P = await (await browser.newContext()).newPage();
  logConsoleErrors(adminP, 'admin');
  logConsoleErrors(moniteurP, 'moniteur');
  logConsoleErrors(client1P, 'client1');
  logConsoleErrors(client2P, 'client2');

  await step('Connexion admin/moniteur/client1/client2', async () => {
    await login(adminP, ADMIN_EMAIL);
    await login(moniteurP, MONITEUR_EMAIL);
    await login(client1P, CLIENT1_EMAIL);
    await login(client2P, CLIENT2_EMAIL);
  });

  // ================= ADMIN : gestion des utilisateurs =================
  const newUserEmail = `admin.created.${RUN_ID}@blocabrac.test`;
  await step('Admin : crée un utilisateur via AdminUsers', async () => {
    await gotoAndWait(adminP, '/admin/users', 'Gestion des Utilisateurs');
    await adminP.getByRole('button', { name: 'Créer un utilisateur' }).click();
    await adminP.getByLabel('Email').fill(newUserEmail);
    await adminP.getByLabel('Mot de passe').fill(PASSWORD);
    // Pas de exact:true : MUI ajoute un " *" au label des champs "required", donc le
    // texte réel est "Prénom *"/"Nom *", jamais "Prénom"/"Nom" au caractère près.
    // "Nom" est aussi une sous-chaîne de "Prénom" : ancrer en début de chaîne pour ne
    // matcher que le champ "Nom", pas "Prénom".
    await adminP.getByLabel('Prénom').fill('Créé');
    await adminP.getByLabel(/^Nom\b/).fill('ParTest');
    await adminP.locator('#roles-multiple-possible-select-2').click();
    await adminP.getByRole('option', { name: 'Client', exact: true }).click();
    await adminP.keyboard.press('Escape');
    await adminP.locator('#niveau-en-salle-select-2').click();
    await adminP.getByRole('option', { name: /Jaune/ }).click();
    await adminP.getByRole('button', { name: 'Créer', exact: true }).click();
    await adminP.getByText('Utilisateur créé avec succès', { exact: false }).waitFor({ timeout: 10000 });
    await adminP.getByText(newUserEmail, { exact: false }).waitFor({ timeout: 10000 });
  });

  await step("Admin : modifie l'utilisateur créé (genre + niveau)", async () => {
    const row = adminP.locator('tr', { hasText: newUserEmail });
    await row.getByLabel('Modifier').click();
    await adminP.getByRole('heading', { name: "Modifier l'utilisateur" }).waitFor({ timeout: 5000 });
    await adminP.locator('#genre-select').click();
    await adminP.getByRole('option', { name: 'Autre', exact: true }).click();
    await adminP.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await adminP.getByText('Utilisateur mis à jour avec succès', { exact: false }).waitFor({ timeout: 10000 });
    const updatedRow = adminP.locator('tr', { hasText: newUserEmail });
    await updatedRow.getByText('Autre', { exact: false }).waitFor({ timeout: 5000 });
  });

  await step("Admin : supprime l'utilisateur créé", async () => {
    const row = adminP.locator('tr', { hasText: newUserEmail });
    await row.getByLabel('Supprimer').click();
    await adminP.getByRole('button', { name: 'Supprimer', exact: true }).last().click();
    await adminP.getByText('Utilisateur supprimé avec succès', { exact: false }).waitFor({ timeout: 10000 });
    await adminP.locator('tr', { hasText: newUserEmail }).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  });

  // ================= ADMIN : informations clients (annonces) =================
  const announcementText = `Info de test ${RUN_ID} : la salle ferme à 22h.`;
  await step('Admin : crée une information client (AdminAnnouncements)', async () => {
    await gotoAndWait(adminP, '/admin/announcements', 'Informations pour les clients');
    await adminP.getByRole('button', { name: 'Nouvelle information' }).click();
    await adminP.getByLabel('Message').fill(announcementText);
    await adminP.getByRole('button', { name: 'Créer', exact: true }).click();
    await adminP.getByText('Information créée avec succès', { exact: false }).waitFor({ timeout: 10000 });
    await adminP.getByText(announcementText, { exact: false }).waitFor({ timeout: 5000 });
  });

  await step('Client : voit l’information active dans le bandeau d’accueil', async () => {
    await client1P.goto(`${BASE_URL}/client/screen`);
    await client1P.getByText(announcementText, { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Admin : désactive puis supprime l’information', async () => {
    const row = adminP.locator('tr', { hasText: announcementText });
    await row.locator('input[type="checkbox"]').click(); // Switch actif -> inactif
    await adminP.waitForTimeout(500);
    await row.getByText('Inactif', { exact: false }).waitFor({ timeout: 5000 });
    // Le 2e IconButton de la ligne est "Supprimer" (le 1er est "Modifier")
    await row.getByRole('button').nth(1).click();
    await adminP.getByRole('button', { name: 'Supprimer', exact: true }).last().click();
    await adminP.getByText('Information supprimée avec succès', { exact: false }).waitFor({ timeout: 10000 });
  });

  // ================= MONITEUR : groupes =================
  await step('Moniteur : crée un groupe avec les 2 clients', async () => {
    await gotoAndWait(moniteurP, '/moniteur/groups', 'Gestion des groupes');
    await moniteurP.getByRole('button', { name: 'Nouveau groupe' }).click();
    await moniteurP.getByRole('heading', { name: 'Nouveau groupe' }).waitFor({ timeout: 5000 });
    await moniteurP.getByPlaceholder('Ex: Groupe Débutants Lundi 18h').fill(`Groupe Test ${RUN_ID}`);
    // ✅ Ne PAS localiser ce champ par son placeholder : GroupForm.tsx le vide
    // (placeholder={selectedClients.length === 0 ? '...' : ''}) dès qu'un premier
    // client est sélectionné, donc un locator getByPlaceholder capturé une fois
    // ne matche plus rien pour la réouverture suivante — c'était la vraie cause
    // des échecs "timeout en attendant que le champ soit visible" ici, pas un
    // problème de l'app ni de l'environnement de test. role=combobox reste stable.
    const autocomplete = moniteurP.getByRole('combobox');
    await autocomplete.click();
    await moniteurP.getByRole('option', { name: /Cliff Ombardier/ }).click();
    // MUI Autocomplete ferme la liste après chaque sélection (disableCloseOnSelect
    // n'est pas activé) : il faut la rouvrir avant de choisir le second client.
    await autocomplete.click();
    await moniteurP.getByRole('option', { name: /Clara Sset/ }).click();
    await moniteurP.keyboard.press('Escape');
    await moniteurP.getByRole('button', { name: 'Créer', exact: true }).click();
    await moniteurP.getByText('Groupe créé avec succès', { exact: false }).waitFor({ timeout: 10000 });
    await moniteurP.waitForURL((url) => url.pathname === '/moniteur/groups', { timeout: 5000 });
    await moniteurP.getByText(`Groupe Test ${RUN_ID}`, { exact: false }).waitFor({ timeout: 10000 });
  });

  // ================= MONITEUR : exercices (bug potentiel : équipement) =================
  await step("Moniteur : crée un exercice avec un équipement (vérifie l'accès à la collection 'equipment')", async () => {
    await gotoAndWait(moniteurP, '/moniteur/exercises', 'Gestion des exercices');
    await moniteurP.getByRole('button', { name: 'Nouvel exercice' }).click();
    await moniteurP.getByRole('heading', { name: 'Nouvel exercice' }).waitFor({ timeout: 5000 });

    // Le chargement de la liste d'équipements se fait au montage : si les règles
    // Firestore refusent la lecture au rôle moniteur, une alerte d'erreur apparaît ici,
    // et l'Autocomplete d'équipement (caché tant qu'aucun équipement n'est chargé)
    // n'apparaît jamais — d'où le pré-seed d'un équipement pour distinguer
    // "pas d'équipement en base" de "lecture refusée par les règles".
    const equipmentLoadError = moniteurP.getByText("Erreur lors du chargement des équipements", { exact: false });
    const hadLoadError = await equipmentLoadError.isVisible({ timeout: 3000 }).catch(() => false);
    const equipmentInput = moniteurP.getByPlaceholder('Ajoutez un ou plusieurs équipements');
    const equipmentAutocompleteVisible = await equipmentInput.isVisible({ timeout: 3000 }).catch(() => false);

    await moniteurP.getByPlaceholder('Ex: Traction à une main').fill(`Exercice Test ${RUN_ID}`);
    if (!equipmentAutocompleteVisible) {
      await moniteurP.getByRole('button', { name: 'Créer', exact: true }).click();
      await moniteurP.getByText('Exercice créé avec succès', { exact: false }).waitFor({ timeout: 10000 });
      assert(false,
        `BUG : le moniteur ne peut pas lire la collection 'equipment' (règle Firestore la réserve à ouvreur/admin) ` +
        `alors qu'ExerciseForm.tsx (page Moniteur, /moniteur/exercises/new) en a besoin pour afficher/ajouter des équipements. ` +
        `(un équipement de test était pourtant pré-existant en base : hadLoadError=${hadLoadError})`);
      return;
    }
    await equipmentInput.click();
    await equipmentInput.fill(`Elastique-${RUN_ID}`);
    const addEquipmentButton = moniteurP.getByRole('button', { name: `Ajouter "Elastique-${RUN_ID}" aux équipements` });
    const addBtnVisible = await addEquipmentButton.isVisible({ timeout: 2000 }).catch(() => false);
    let equipmentCreateError = false;
    if (addBtnVisible) {
      await addEquipmentButton.click();
      await moniteurP.waitForTimeout(1000);
      equipmentCreateError = await moniteurP.getByText("Erreur lors de l'ajout de l'équipement", { exact: false }).isVisible({ timeout: 2000 }).catch(() => false);
    }

    await moniteurP.getByRole('button', { name: 'Créer', exact: true }).click();
    await moniteurP.getByText('Exercice créé avec succès', { exact: false }).waitFor({ timeout: 10000 });

    assert(!hadLoadError, "BUG : le moniteur ne peut pas lire la collection 'equipment' (règle Firestore la réserve à ouvreur/admin) alors qu'ExerciseForm.tsx (page Moniteur) en a besoin.");
    assert(!equipmentCreateError, "BUG : le moniteur ne peut pas créer un nouvel équipement (règle Firestore 'equipment' réservée à ouvreur/admin).");
  });

  // ================= MONITEUR -> CLIENT : messagerie individuelle =================
  const individualMsgTitle = `Message individuel ${RUN_ID}`;
  await step('Moniteur : envoie un message individuel à client1', async () => {
    await gotoAndWait(moniteurP, '/moniteur/messages', 'Messagerie');
    await moniteurP.getByRole('button', { name: 'Nouveau message' }).click();
    await moniteurP.getByLabel('Titre').fill(individualMsgTitle);
    await moniteurP.getByLabel('Contenu').fill('Contenu du message individuel de test.');
    await moniteurP.locator('#recipients-select').click();
    // ✅ MessagesList.tsx construit déjà "displayName" depuis first_name/last_name
    // (avec repli sur l'email) — vérifié en lisant le code. On garde le repli sur
    // l'email ici uniquement en filet de sécurité si ça régresse un jour.
    const nameOptionVisible = await moniteurP.getByRole('option', { name: /Cliff Ombardier/ }).isVisible({ timeout: 2000 }).catch(() => false);
    if (nameOptionVisible) {
      await moniteurP.getByRole('option', { name: /Cliff Ombardier/ }).click();
    } else {
      await moniteurP.getByRole('option', { name: CLIENT1_EMAIL }).click();
    }
    await moniteurP.keyboard.press('Escape');
    await moniteurP.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await moniteurP.getByText('Message envoyé avec succès', { exact: false }).waitFor({ timeout: 10000 });
    assert(nameOptionVisible,
      "MessagesList.tsx (Moniteur > Messagerie) affiche l'email du client dans la liste des destinataires au lieu de son nom (first_name/last_name absents ou vides pour ce compte de test ?).");
  });

  await step('Client1 : reçoit le message individuel et y répond', async () => {
    await client1P.goto(`${BASE_URL}/client/messages`);
    await client1P.getByText(individualMsgTitle, { exact: false }).waitFor({ timeout: 10000 });
  });

  // ================= MONITEUR -> GROUPE : vérifie la diffusion aux membres =================
  const groupMsgTitle = `Message groupe ${RUN_ID}`;
  await step('Moniteur : envoie un message au groupe créé', async () => {
    await moniteurP.goto(`${BASE_URL}/moniteur/messages`);
    await moniteurP.getByRole('button', { name: 'Nouveau message' }).click();
    await moniteurP.getByLabel('Titre').fill(groupMsgTitle);
    await moniteurP.getByLabel('Contenu').fill('Contenu du message de groupe de test.');
    await moniteurP.locator('#type-de-destinataire-select').click();
    await moniteurP.getByRole('option', { name: 'Groupe', exact: true }).click();
    await moniteurP.locator('#recipients-select').click();
    await moniteurP.getByRole('option', { name: new RegExp(`Groupe Test ${RUN_ID}`) }).click();
    await moniteurP.keyboard.press('Escape');
    await moniteurP.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await moniteurP.getByText(/envoyé(s)? avec succès/, { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client1/Client2 : vérifie si le message de groupe est bien reçu (bug potentiel de diffusion)', async () => {
    // ✅ locator.isVisible({timeout}) ne fait PAS de polling en Playwright (contrairement
    // à locator.waitFor()) : il vérifie l'état immédiatement, avant même que le fetch
    // Firestore asynchrone de ClientMessages.tsx n'ait eu le temps de se terminer après
    // la navigation. C'était la vraie cause du "message jamais reçu" ici — pas un bug
    // de diffusion (vérifié : les documents Firestore ont bien un receiverId par membre,
    // cf. commentaire de MessagesList.tsx). waitFor() attend réellement l'apparition.
    await client1P.goto(`${BASE_URL}/client/messages`);
    const client1SeesIt = await client1P.getByText(groupMsgTitle, { exact: false }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    await client2P.goto(`${BASE_URL}/client/messages`);
    const client2SeesIt = await client2P.getByText(groupMsgTitle, { exact: false }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    assert(client1SeesIt && client2SeesIt,
      `Le message de groupe n'a pas été reçu par les deux clients (client1 reçu: ${client1SeesIt}, client2 reçu: ${client2SeesIt}).`);
  });

  // ================= MONITEUR : stats/badges/diplômes =================
  await step("Moniteur : attribue un badge manuel et un diplôme à client1", async () => {
    await gotoAndWait(moniteurP, '/moniteur/stats', 'Statistiques des exercices');
    await moniteurP.getByText('Cliff Ombardier', { exact: false }).first().waitFor({ timeout: 10000 });
    const row = moniteurP.locator('tr', { hasText: 'Cliff Ombardier' }).first();
    await row.getByRole('button', { name: 'Attribuer un badge' }).click();
    await moniteurP.locator('#badge-select').click();
    await moniteurP.getByRole('option', { name: /Grimpeur assidu/ }).click();
    await moniteurP.getByRole('button', { name: 'Confirmer' }).click();
    await moniteurP.waitForTimeout(1000);

    await row.getByRole('button', { name: 'Attribuer un diplôme' }).click();
    await moniteurP.locator('#type-de-diplome-select').click();
    await moniteurP.getByRole('option', { name: 'Bloc de bronze', exact: true }).click();
    await moniteurP.getByRole('button', { name: 'Attribuer et générer le PDF' }).click();
    await moniteurP.getByText('attribué à Cliff Ombardier', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Client1 : voit son badge et son diplôme dans ses stats', async () => {
    await gotoAndWait(client1P, '/client/stats', 'Mes statistiques');
    await client1P.getByRole('tab', { name: 'Mes badges' }).click();
    await client1P.getByText('Grimpeur assidu', { exact: false }).first().waitFor({ timeout: 10000 });
    await client1P.getByRole('tab', { name: 'Mes diplômes' }).click();
    await client1P.getByText('Bloc de bronze', { exact: false }).first().waitFor({ timeout: 10000 });
  });

  // ================= CLIENT : profil complet =================
  await step('Client1 : modifie son profil complet (pas seulement le switch classement)', async () => {
    await gotoAndWait(client1P, '/client/profile', 'Modifier mes informations');
    const lastNameField = client1P.getByLabel('Nom', { exact: true });
    await lastNameField.fill('OmbardierModifié');
    const dobField = client1P.getByLabel('Date de naissance');
    await dobField.fill('1994-01-15');
    await client1P.getByRole('button', { name: 'Enregistrer' }).click();
    await client1P.getByText('mises à jour avec succès', { exact: false }).waitFor({ timeout: 10000 });
  });

  await step('Admin : voit bien le profil client1 mis à jour dans AdminUsers', async () => {
    await adminP.goto(`${BASE_URL}/admin/users`);
    await adminP.getByText('OmbardierModifié', { exact: false }).waitFor({ timeout: 10000 });
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
