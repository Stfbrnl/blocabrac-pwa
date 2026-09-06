// Script Playwright ponctuel : "grandeur nature" du REDÉMARRAGE du classement de saison
// (V2.56, Modèle A — HANDOFF/RETOUR-redemarrage-saison-2026-09-06). Plusieurs comptes
// existants, blocs actifs + retirés, validations anciennes : on clique le bouton
// "Redémarrer la saison" et on vérifie que season.* repart des validations existantes
// des blocs encore présents (base figée), que rien ne redescend à une rotation, que la
// réconciliation reste exacte, et que la clôture de fin de saison remet aussi base* à
// zéro. Contre l'app + les émulateurs locaux, jamais la production.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFileSync } from 'child_process';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'blocabrac' });
const db = admin.firestore();
const auth = admin.auth();

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const BASE_URL = 'http://localhost:5174';
const PASSWORD = 'TestPassword123!';
const ADMIN_EMAIL = 'admin.restart.test@blocabrac.test';

let stepNum = 0;
const results = [];
async function step(name, fn) {
  stepNum += 1;
  try { await fn(); results.push({ n: stepNum, name, ok: true }); console.log(`✔ [${stepNum}] ${name}`); }
  catch (err) { results.push({ n: stepNum, name, ok: false, error: err.message }); console.error(`✘ [${stepNum}] ${name}\n   ${err.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function isoDate(offsetDays) { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); }
function runScript(scriptPath, args = []) {
  return execFileSync('node', [scriptPath, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'localhost:8080', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' },
    encoding: 'utf8',
  });
}
const colorCountsEqual = (a, b) => {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) if ((a?.[k] || 0) !== (b?.[k] || 0)) return false;
  return true;
};
async function profileByEmail(email) {
  const { uid } = await auth.getUserByEmail(email);
  return { uid, data: (await db.collection('classement_profiles').doc(uid).get()).data() || {} };
}

// Attendus baseline (voir seed-season-restart-users.mjs) — blocs retirés COMPTÉS.
const EXPECTED = {
  'climber.a.restart@blocabrac.test': { score: 740, colorCounts: { vert: 1, bleu: 1, rouge: 1, violet: 1 } },
  'climber.b.restart@blocabrac.test': { score: 150, colorCounts: { vert: 1, bleu: 1 } },
  'climber.c.restart@blocabrac.test': { score: 1710, colorCounts: { rouge: 1, noir: 1, blanc: 1 } },
  'climber.d.restart@blocabrac.test': { score: 450, colorCounts: { vert: 1, rouge: 1 } },
};

async function main() {
  const browser = await chromium.launch();
  const adminP = await (await browser.newContext()).newPage();
  adminP.on('pageerror', (e) => console.log(`   [pageerror] ${e.message}`));

  await step('Connexion admin', async () => {
    await adminP.goto(`${BASE_URL}/login`);
    await adminP.locator('#email').fill(ADMIN_EMAIL);
    await adminP.locator('#password').fill(PASSWORD);
    await adminP.getByRole('button', { name: 'Se connecter' }).click();
    await adminP.waitForURL((u) => u.pathname === '/', { timeout: 10000 });
  });

  await step('AVANT redémarrage : la réconciliation IGNORE season.* (aucun baseScore posé)', async () => {
    // ✅ Retour ClaudeNav : pré-redémarrage, l'ancien compteur et le nouveau modèle ne
    // sont pas comparables — computeExpectedProfile renvoie seasonScore:undefined, donc
    // aucune "dérive" season.* malgré les season.* volontairement faux du seed.
    const out = runScript(join(REPO_ROOT, 'scripts/reconcile-classement-profiles.js'));
    assert(!/seasonScore/.test(out), `la réconciliation ne doit signaler aucun écart season.* avant redémarrage.\n${out}`);
  });

  await step('Admin : règle la fenêtre puis clique "Redémarrer la saison maintenant"', async () => {
    await adminP.goto(`${BASE_URL}/admin/season-config`);
    await adminP.getByRole('heading', { name: 'Classement de saison' }).waitFor({ timeout: 10000 });
    await adminP.getByLabel('Début de la saison').fill(isoDate(0));
    await adminP.getByLabel('Fin de la saison').fill(isoDate(280));

    adminP.once('dialog', (d) => d.accept());
    await adminP.getByRole('button', { name: 'Redémarrer la saison maintenant' }).click();
    await adminP.getByText(/Saison redémarrée : \d+ profil/, { timeout: 20000 }).waitFor();
    await adminP.screenshot({ path: '/tmp/season-restart-01-admin.png', fullPage: true });
  });

  await step('Backend : chaque profil a season.score = season.baseScore = crédit recalculé, sans clé orpheline', async () => {
    for (const [email, exp] of Object.entries(EXPECTED)) {
      const { data } = await profileByEmail(email);
      assert(data.season?.score === exp.score, `${email} season.score attendu ${exp.score}, obtenu ${data.season?.score}`);
      assert(data.season?.baseScore === exp.score, `${email} season.baseScore attendu ${exp.score}, obtenu ${data.season?.baseScore}`);
      assert(colorCountsEqual(data.season?.colorCounts, exp.colorCounts),
        `${email} season.colorCounts attendu ${JSON.stringify(exp.colorCounts)}, obtenu ${JSON.stringify(data.season?.colorCounts)} (clé orpheline ?)`);
      assert(colorCountsEqual(data.season?.baseColorCounts, exp.colorCounts),
        `${email} season.baseColorCounts attendu ${JSON.stringify(exp.colorCounts)}, obtenu ${JSON.stringify(data.season?.baseColorCounts)}`);
      assert(!('orpheline' in (data.season?.colorCounts || {})), `${email} : la clé orpheline du seed doit avoir disparu`);
    }
  });

  await step('Backend : le score all-time n\'est PAS touché par le redémarrage', async () => {
    const allTime = { 'climber.a.restart@blocabrac.test': 740, 'climber.b.restart@blocabrac.test': 150, 'climber.c.restart@blocabrac.test': 1710, 'climber.d.restart@blocabrac.test': 450 };
    for (const [email, expScore] of Object.entries(allTime)) {
      const { data } = await profileByEmail(email);
      assert(data.score === expScore, `${email} score all-time attendu ${expScore} (inchangé), obtenu ${data.score}`);
    }
  });

  await step('Backend : la fenêtre a été réécrite, cloturee reste false', async () => {
    const cfg = (await db.collection('app_config').doc('classement_saison').get()).data();
    assert(cfg.debut === isoDate(0), `debut attendu ${isoDate(0)}, obtenu ${cfg.debut}`);
    assert(cfg.cloturee === false, 'cloturee doit rester false après un redémarrage');
  });

  await step('APRÈS redémarrage : la réconciliation ne trouve AUCUN écart season.*', async () => {
    const out = runScript(join(REPO_ROOT, 'scripts/reconcile-classement-profiles.js'));
    assert(!/seasonScore|seasonColorCounts/.test(out), `réconciliation : aucun écart season.* attendu juste après un redémarrage.\n${out}`);
  });

  await step('Monotone : désactiver un bloc ne fait baisser NI le season.score NI le all-time de C', async () => {
    // ✅ V2.56 §3 : le all-time est un compteur d'accumulation au même titre que la saison —
    // un bloc validé puis retiré garde ses points partout. La réconciliation ne doit trouver
    // AUCUN écart après le retrait du bloc noir (que C a validé).
    await db.collection('boulders').doc('br-noir').set({ is_active: false }, { merge: true });
    const out = runScript(join(REPO_ROOT, 'scripts/reconcile-classement-profiles.js'));
    assert(/0 en écart réel/.test(out),
      `aucun écart RÉEL attendu après le retrait d'un bloc (all-time + saison monotones).\n${out}`);
    const { data } = await profileByEmail('climber.c.restart@blocabrac.test');
    assert(data.season?.score === 1710, `season.score de C doit rester 1710, obtenu ${data.season?.score}`);
    assert(data.season?.baseScore === 1710, `season.baseScore de C inchangé, obtenu ${data.season?.baseScore}`);
    assert(colorCountsEqual(data.season?.colorCounts, { rouge: 1, noir: 1, blanc: 1 }),
      `season.colorCounts de C inchangé (noir toujours compté), obtenu ${JSON.stringify(data.season?.colorCounts)}`);
    assert(data.score === 1710, `all-time de C doit rester 1710 (noir toujours compté), obtenu ${data.score}`);
  });

  await step('Fin de saison : compute-classement-saison.js --fix remet AUSSI baseScore/baseColorCounts à zéro', async () => {
    await db.collection('app_config').doc('classement_saison').set({ fin: isoDate(-1) }, { merge: true });
    const out = runScript(join(REPO_ROOT, 'scripts/compute-classement-saison.js'), ['--fix']);
    assert(/Clôture de la saison/.test(out), `la clôture doit s'exécuter.\n${out}`);
    for (const email of Object.keys(EXPECTED)) {
      const { data } = await profileByEmail(email);
      assert(data.season?.score === 0, `${email} season.score doit être 0 après clôture, obtenu ${data.season?.score}`);
      assert(data.season?.baseScore === 0, `${email} season.baseScore doit être 0 après clôture, obtenu ${data.season?.baseScore}`);
      assert(colorCountsEqual(data.season?.colorCounts, {}), `${email} season.colorCounts doit être vide, obtenu ${JSON.stringify(data.season?.colorCounts)}`);
      assert(colorCountsEqual(data.season?.baseColorCounts, {}), `${email} season.baseColorCounts doit être vide, obtenu ${JSON.stringify(data.season?.baseColorCounts)}`);
    }
    // l'archive doit contenir le top filles / top garçons calculé sur les crédits de départ
    const archives = await db.collection('classement_saisons').get();
    assert(archives.size === 1, `une archive attendue, ${archives.size} trouvée(s)`);
    const arch = archives.docs[0].data();
    const topFillesUids = arch.top_filles.map((e) => e.uid);
    const { uid: cUid } = await auth.getUserByEmail('climber.c.restart@blocabrac.test');
    const { uid: dUid } = await auth.getUserByEmail('climber.d.restart@blocabrac.test');
    assert(arch.top_garcons.some((e) => e.uid === cUid), 'C (Homme, opt-in) doit être dans top_garcons');
    assert(!topFillesUids.includes(dUid) && !arch.top_garcons.some((e) => e.uid === dUid), 'D (opt-out) ne doit être nulle part dans l\'archive');
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} étapes réussies`);
  if (failed.length > 0) {
    console.log('Échecs :', failed.map((f) => `[${f.n}] ${f.name}: ${f.error}`).join('\n'));
    process.exit(1);
  }
}

main().catch((err) => { console.error('Erreur fatale :', err); process.exit(1); });
