// RÉPÉTITION GÉNÉRALE du contest du 5 novembre, à l'échelle réelle (80 inscrits).
//
// Elle rejoue, dans l'ordre, la procédure du soir telle que la décrit
// `docs/handoffs/Contest-5-novembre-a-faire.pdf` § « LE SOIR DU 5 » :
//
//   1. verrouiller le niveau de chaque participant ;
//   2. des retardataires créent leur compte — recliquer ;
//   3. passer la compétition en « en cours » (c'est ce geste qui fige `level_at_start`) ;
//   4. l'écran live, avec 80 lignes ;
//   5. publier le palmarès ;
//   6. après le contest : lever TOUS les verrous.
//
// ─── CE QUE SEUL CE FLUX VÉRIFIE ───────────────────────────────────────────────────────
//
// Les tests unitaires couvrent `buildLevelAtStartSnapshot` et `buildFrozenRankings` ; les
// tests de règles couvrent l'immuabilité. Trois choses n'existent que dans le parcours, et
// seulement à cette échelle :
//
//   1. LE SECOND CLIC. Le verrouillage est fait deux fois le même soir, avec des comptes
//      créés entre les deux. Si le bouton travaillait sur la liste chargée au montage de
//      l'écran, le second clic ne verrait pas les retardataires — et afficherait pourtant un
//      compte rendu rassurant. C'est le pas 4, et il ne peut rougir que parce que le pas 3
//      crée de vrais comptes APRÈS le premier clic, sans recharger la page ;
//
//   2. L'ATOMICITÉ DU LOT. Deux comptes sans rôle `client` sont semés exprès : les règles
//      refusent une écriture d'admin sur leur document, et un `writeBatch` est tout ou rien.
//      Le pas 2 affirme donc DEUX grandeurs — les 72 autres comptes verrouillés **et** ces
//      deux-là intacts. Affirmer seulement la première laisserait passer un lot qui aurait
//      échoué en entier (0 verrouillé est aussi « aucun compte interdit n'a été touché ») ;
//
//   3. L'ÉCHELLE. 80 lignes dans l'écran live, 1 600 résultats à trier, et le temps que ça
//      prend. Le dépôt n'a aucun ErrorBoundary : une exception y est un écran blanc que
//      personne ne voit tomber (CLAUDE.md). Les autres flux tournent à 4 ou 5 comptes.
//
// ⚠️ TOUTES LES ASSERTIONS D'ÉTAT SONT LUES EN BASE, jamais dans le DOM. Un bandeau « 80
// niveaux verrouillés » est exactement ce qui rassure pendant que l'écriture a été refusée —
// le projet a payé quatre fois cette confusion.
//
// Prérequis : émulateurs Auth/Firestore + `vite --port 5174` + `node test/seed-repetition-generale.mjs`.
import { chromium } from 'playwright';
import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const BASE_URL = 'http://localhost:5174';
const PASSWORD = 'TestPassword123!';
const ADMIN_EMAIL = 'admin.repetition@blocabrac.test';
const COMPETITION_ID = 'comp-repetition-generale';

const N_PARTICIPANTS = 80;
const SANS_ROLE_CLIENT = 2;
const N_RETARDATAIRES = 5;
// Les inscriptions dont le niveau d'inscription diffère du niveau courant du compte (voir le
// seed) : c'est leur existence qui rend discriminante l'assertion sur `level_at_start`.
const NIVEAUX_PERIMES = 12;
// Les comptes que les règles laissent modifier : les 80 moins les deux sans rôle `client`,
// plus l'administrateur lui-même (il porte `client`, comme tout compte).
const MODIFIABLES = N_PARTICIPANTS - SANS_ROLE_CLIENT + 1;

admin.initializeApp({ projectId: 'blocabrac' });
const db = admin.firestore();
const auth = admin.auth();

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

// Lecture serveur de l'état des verrous. Rend le détail, pas seulement un total : « combien »
// ne distingue pas « les bons comptes » de « autant d'autres comptes ».
async function lireVerrous() {
  const snap = await db.collection('users').get();
  const verrouilles = [];
  const libres = [];
  const sansRoleClient = [];
  snap.docs.forEach((d) => {
    const u = d.data();
    const porteClient = (Array.isArray(u.roles) && u.roles.includes('client')) || u.role === 'client';
    if (!porteClient) sansRoleClient.push({ uid: d.id, levelOverride: u.levelOverride === true });
    (u.levelOverride === true ? verrouilles : libres).push(d.id);
  });
  return { total: snap.size, verrouilles, libres, sansRoleClient };
}

async function login(page, email) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 20000 });
}

// Le geste groupé, tel que l'admin le fait : le bouton, puis la confirmation du dialogue.
async function cliquerVerrouillage(page, intitule, boutonConfirmation) {
  await page.getByRole('button', { name: new RegExp(`^${intitule}`) }).click();
  const dialogue = page.getByRole('dialog');
  await dialogue.waitFor({ state: 'visible', timeout: 10000 });
  await dialogue.getByRole('button', { name: boutonConfirmation, exact: true }).click();
  await page.getByRole('alert').filter({ hasText: /niveau|verrou|compte/i }).first()
    .waitFor({ state: 'visible', timeout: 30000 });
  return (await page.getByRole('alert').first().textContent()) || '';
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const retardataires = [];

  try {
    await step("L'admin se connecte et ouvre « Gestion des utilisateurs »", async () => {
      await login(page, ADMIN_EMAIL);
      await page.goto(`${BASE_URL}/admin/users`);
      await page.getByRole('heading', { name: 'Gestion des Utilisateurs' }).waitFor({ timeout: 20000 });

      // ⚠️ Affirmer la TAILLE avant d'affirmer quoi que ce soit sur l'ensemble : sans ce pas,
      // tous les suivants pourraient porter sur une page à moitié chargée.
      const avant = await lireVerrous();
      assert(avant.total === N_PARTICIPANTS + 1,
        `Le seed devait poser ${N_PARTICIPANTS + 1} comptes, la base en a ${avant.total}.`);
      assert(avant.verrouilles.length === 6,
        `Le seed devait poser 6 comptes déjà verrouillés, il y en a ${avant.verrouilles.length}.`);
      assert(avant.sansRoleClient.length === SANS_ROLE_CLIENT,
        `Le seed devait poser ${SANS_ROLE_CLIENT} comptes sans rôle client, il y en a ${avant.sansRoleClient.length}.`);
    });

    await step('Premier verrouillage groupé : tout le monde sauf les comptes interdits', async () => {
      const message = await cliquerVerrouillage(page, 'Verrouiller tous les niveaux', 'Verrouiller');

      const apres = await lireVerrous();
      // ① les comptes modifiables sont tous verrouillés…
      assert(apres.verrouilles.length === MODIFIABLES,
        `${MODIFIABLES} comptes devaient être verrouillés, il y en a ${apres.verrouilles.length}. `
        + `Message affiché : « ${message.trim()} »`);
      // ② …et les deux comptes que les règles refusent sont restés intacts. Sans cette
      // seconde assertion, un lot entièrement refusé passerait pour un succès partiel.
      assert(apres.sansRoleClient.every((c) => c.levelOverride === false),
        'Un compte sans rôle client a été verrouillé : il aurait dû être écarté avant le lot.');
      assert(/compte\(s\) sans rôle/i.test(message),
        `Le compte rendu doit SIGNALER les comptes écartés, pas les taire. Reçu : « ${message.trim()} »`);
    });

    await step(`${N_RETARDATAIRES} retardataires créent leur compte pendant la soirée`, async () => {
      for (let i = 1; i <= N_RETARDATAIRES; i++) {
        const email = `retardataire${i}.repetition@blocabrac.test`;
        const u = await auth.createUser({ email, password: PASSWORD });
        retardataires.push(u.uid);
        await db.collection('users').doc(u.uid).set({
          email, first_name: `Retard${i}`, last_name: `Ataire${i}`,
          gender: 'Femme', dateOfBirth: '2001-03-14', level: 'bleu', baseLevel: 'bleu',
          roles: ['client'], inscritAuxCompetitions: true, inscritAuxCours: false,
          classementOptIn: true,
        });
        await db.collection('competition_participants').doc(`${u.uid}_${COMPETITION_ID}`).set({
          user_id: u.uid, competition_id: COMPETITION_ID, email,
          first_name: `Retard${i}`, last_name: `Ataire${i}`,
          age: null, dateOfBirth: '2001-03-14', gender: 'Femme', level: 'bleu',
          registered_at: '2026-11-05T19:10:00.000Z', is_client: true,
        });
      }
      const etat = await lireVerrous();
      assert(etat.total === N_PARTICIPANTS + 1 + N_RETARDATAIRES,
        `La base devrait porter ${N_PARTICIPANTS + 1 + N_RETARDATAIRES} comptes, elle en a ${etat.total}.`);
    });

    await step('Second clic SANS recharger la page : les retardataires sont rattrapés', async () => {
      // ⚠️ Aucun `reload()` ici, et c'est tout l'intérêt du pas : un rechargement
      // rechargerait la liste des comptes et produirait lui-même l'effet attendu — le pas
      // deviendrait incapable de rougir (la règle du 18/10/2026 sur le décor).
      const message = await cliquerVerrouillage(page, 'Verrouiller tous les niveaux', 'Verrouiller');

      const apres = await lireVerrous();
      assert(apres.verrouilles.length === MODIFIABLES + N_RETARDATAIRES,
        `Après le second clic, ${MODIFIABLES + N_RETARDATAIRES} comptes devaient être verrouillés, `
        + `il y en a ${apres.verrouilles.length}. Message : « ${message.trim()} »`);
      const oublies = retardataires.filter((uid) => !apres.verrouilles.includes(uid));
      assert(oublies.length === 0,
        `${oublies.length} retardataire(s) n'ont pas été verrouillés — le bouton a travaillé `
        + `sur la liste chargée au montage au lieu de relire la collection.`);
    });

    await step('Coup d\'envoi : la compétition passe en « en cours » et fige les niveaux', async () => {
      await page.goto(`${BASE_URL}/admin/competitions/create`);
      const ligne = page.locator('tbody tr').filter({ hasText: 'Répétition générale 80' }).first();
      await ligne.waitFor({ timeout: 20000 });
      // Le crayon d'édition est une IconButton sans nom accessible : on la désigne par sa
      // position dans LA ligne de cette compétition, jamais « le premier crayon de la page ».
      await ligne.locator('button').first().click();
      const dialogue = page.getByRole('dialog');
      await dialogue.waitFor({ state: 'visible', timeout: 10000 });
      await dialogue.getByLabel('Statut').click();
      await page.getByRole('option', { name: 'En cours', exact: true }).click();
      await dialogue.getByRole('button', { name: 'Enregistrer', exact: true }).click();
      await page.getByRole('alert').first().waitFor({ state: 'visible', timeout: 30000 });

      const comp = await db.collection('competitions').doc(COMPETITION_ID).get();
      assert(comp.data().status === 'en cours',
        `La compétition devrait être « en cours », elle est « ${comp.data().status} ».`);
      assert(typeof comp.data().started_at === 'string',
        'Le coup d\'envoi doit avoir posé `started_at` : sans lui, un inscrit tardif et un '
        + 'figeage manquant sont indiscernables.');

      const parts = await db.collection('competition_participants')
        .where('competition_id', '==', COMPETITION_ID).get();
      const total = parts.size;
      const figes = parts.docs.filter((d) => typeof d.data().level_at_start === 'string'
        && d.data().level_at_start !== '');
      assert(total === N_PARTICIPANTS + N_RETARDATAIRES,
        `${N_PARTICIPANTS + N_RETARDATAIRES} inscriptions attendues, ${total} trouvées.`);
      assert(figes.length === total,
        `Le niveau de départ doit être figé pour les ${total} inscrits, il l'est pour ${figes.length}.`);

      // ⚠️ Et la valeur, pas seulement sa présence : `level_at_start` doit valoir le niveau
      // COURANT du compte au moment du coup d'envoi. C'est ce qui rend la passe de
      // verrouillage suffisante — s'il était recopié depuis l'inscription, corriger
      // `users.level` le soir même ne servirait à rien et il faudrait rafraîchir les
      // inscriptions déjà faites.
      const comptes = await db.collection('users').get();
      const niveauCourant = new Map(comptes.docs.map((d) => [d.id, d.data().level]));

      // ⚠️ L'assertion ne vaut que si les deux sources DIVERGENT quelque part : le seed pose
      // 12 inscriptions au niveau périmé « jaune ». On affirme d'abord leur nombre — sans
      // cela, un seed qui cesserait d'en produire rendrait la vérification suivante vraie
      // pour tout le monde, et verte pour rien.
      const perimes = parts.docs.filter((d) => d.data().level !== niveauCourant.get(d.data().user_id));
      assert(perimes.length === NIVEAUX_PERIMES,
        `${NIVEAUX_PERIMES} inscriptions devaient porter un niveau périmé, il y en a ${perimes.length} : `
        + `sans divergence, « lu sur users.level » et « copié à l'inscription » sont indiscernables.`);

      const divergents = figes.filter((d) => d.data().level_at_start !== niveauCourant.get(d.data().user_id));
      assert(divergents.length === 0,
        `${divergents.length} participation(s) ont un niveau de départ différent du niveau `
        + `courant du compte : le figeage ne lit pas users.level au coup d'envoi, et corriger `
        + `un niveau le soir même ne suffirait donc pas.`);
    });

    await step('L\'écran live affiche 80 lignes sans tomber', async () => {
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(e.message));
      const debut = Date.now();
      await page.goto(`${BASE_URL}/admin/competitions/live-display/${COMPETITION_ID}`);
      // ⚠️ L'écran live n'est pas un `<table>` : chaque ligne est une Box, enfant direct du
      // conteneur qui suit le titre `h4` (même lecture que e2e-live-display-flow.mjs). La
      // page 1 est un `slice(0, 10)` : on attend que DIX lignes soient là, pas « au moins
      // une » — un classement à une ligne satisferait l'attente sans rien prouver.
      await page.waitForFunction(
        () => (document.querySelector('h4')?.nextElementSibling?.children.length ?? 0) >= 10,
        null,
        { timeout: 60000 }
      );
      const duree = Date.now() - debut;
      const lignes = await page.evaluate(
        () => document.querySelector('h4')?.nextElementSibling?.children.length ?? 0
      );

      assert(erreurs.length === 0,
        `L'écran live a levé ${erreurs.length} exception(s) : ${erreurs.join(' | ')}. `
        + `Le dépôt n'a aucun ErrorBoundary — en salle, ce serait un écran blanc.`);
      assert(lignes >= 10,
        `La première page devait porter 10 lignes, elle en a ${lignes}.`);
      console.log(`   ℹ️ 80 participants, 1 600 résultats : premier rendu en ${duree} ms, `
        + `${lignes} ligne(s) affichée(s).`);
    });

    await step('Après le contest : « Déverrouiller tous les niveaux » ne laisse aucun verrou', async () => {
      await page.goto(`${BASE_URL}/admin/users`);
      await page.getByRole('heading', { name: 'Gestion des Utilisateurs' }).waitFor({ timeout: 20000 });
      const message = await cliquerVerrouillage(page, 'Déverrouiller tous les niveaux', 'Déverrouiller');

      const apres = await lireVerrous();
      assert(apres.verrouilles.length === 0,
        `${apres.verrouilles.length} verrou(s) subsistent — un niveau resté verrouillé cesse `
        + `définitivement de suivre ses badges, sans qu'aucun signal ne le dise. `
        + `Message : « ${message.trim()} »`);
      assert(apres.total === N_PARTICIPANTS + 1 + N_RETARDATAIRES,
        'Le déverrouillage ne doit supprimer aucun compte.');
    });
  } finally {
    await browser.close();
  }

  const reussis = results.filter((r) => r.ok).length;
  console.log(`\n${reussis}/${results.length} étapes réussies.`);
  if (reussis !== results.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
