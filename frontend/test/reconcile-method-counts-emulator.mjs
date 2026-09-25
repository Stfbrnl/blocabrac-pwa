// Test de régression sur émulateur de scripts/reconcile-method-counts.js
// (docs/handoffs/RETOUR-v2701-v2702.md §2) — même principe que reconcile-orphan-key-emulator.mjs.
// Émulateurs Firestore + Auth requis (`npx firebase-tools emulators:start --only auth,firestore`).
//
//   node test/reconcile-method-counts-emulator.mjs
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import admin from 'firebase-admin';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { resetEmulators } from './emulator-reset.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '../../scripts/reconcile-method-counts.js');

admin.initializeApp({ projectId: 'blocabrac' });
const db = admin.firestore();

const run = (...args) => {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT, ...args], { env: process.env, encoding: 'utf8' }) };
  } catch (err) {
    return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
};

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}`);
  if (!cond) failures += 1;
};

const boulder = (id, extra) => db.collection('boulders').doc(id).set({
  type: 'daily', is_active: true, wall: 'Dalle', number: 1, color: 'rouge', ...extra,
});
const vote = (uid, boulderId, methods, success = true) =>
  db.collection('client_boulder_results').doc(`${uid}_${boulderId}`).set({ userId: uid, boulderId, success, attempts: 2, methods });
const read = async (id) => {
  const d = (await db.collection('boulders').doc(id).get()).data();
  return { methodCounts: d.methodCounts || {}, methodVotes: d.methodVotes || 0 };
};

async function main() {
  await resetEmulators();

  // b-ok : juste (heel_hook 3 dont un vote resté sur une réussite annulée, crimp 1, 3 votants). b-gonfle : +1 fantôme sur heel_hook et 1 vote de trop.
  // b-zero : clé à 0 stockée, équivalente à absente (doit rester « juste »).
  // b-manque : 2 votes réels, rien de stocké. Un résultat SANS méthodes ne compte pas.
  await boulder('b-ok', { methodCounts: { heel_hook: 3, crimp: 1 }, methodVotes: 3 });
  await boulder('b-gonfle', { methodCounts: { heel_hook: 3, dyno: 1 }, methodVotes: 3 });
  await boulder('b-zero', { methodCounts: { crimp: 1, dyno: 0 }, methodVotes: 1 });
  await boulder('b-manque', {});
  for (let i = 0; i < 7; i += 1) await boulder(`b-vide-${i}`, {}); // blocs sans votes : hors ratio
  await vote('u1', 'b-ok', ['heel_hook', 'crimp']);
  await vote('u2', 'b-ok', ['heel_hook']);
  await vote('u3', 'b-ok', []); // pas de vote : ne compte pas
  await vote('u4', 'b-ok', ['heel_hook'], false); // vote resté sur une réussite annulée : compte
  await vote('u1', 'b-gonfle', ['heel_hook', 'dyno']);
  await vote('u2', 'b-gonfle', ['heel_hook']);
  await vote('u1', 'b-zero', ['crimp']);
  await vote('u1', 'b-manque', ['dyno']);
  await vote('u2', 'b-manque', ['dyno', 'crimp']);

  // 1. Simulation : détecte 2 écarts sur 4 blocs à votes (50 % mais < 3) et n'écrit rien.
  const before = await read('b-gonfle');
  const dry = run();
  check(dry.code === 0 && /2 bloc\(s\) en écart/.test(dry.out), `simulation : 2 écarts détectés (${dry.out.match(/\d+ bloc\(s\) en écart/)?.[0]})`);
  check(JSON.stringify(await read('b-gonfle')) === JSON.stringify(before), 'simulation : aucune écriture');

  // 2. --fix : corrige, sans toucher aux blocs justes.
  const fix = run('--fix');
  check(fix.code === 0 && /2 bloc\(s\) corrigé/.test(fix.out), '--fix : 2 blocs corrigés');
  const g = await read('b-gonfle');
  check(g.methodVotes === 2 && g.methodCounts.heel_hook === 2 && g.methodCounts.dyno === 1, `b-gonfle corrigé : ${JSON.stringify(g)}`);
  const m = await read('b-manque');
  check(m.methodVotes === 2 && m.methodCounts.dyno === 2 && m.methodCounts.crimp === 1, `b-manque corrigé : ${JSON.stringify(m)}`);
  const z = await read('b-zero');
  check(z.methodCounts.dyno === 0, 'b-zero : clé à 0 laissée telle quelle (équivalente à absente, pas un écart)');

  // 3. Relance : plus aucun écart (idempotent).
  check(/0 bloc\(s\) en écart/.test(run().out), 'relance : 0 écart');

  // 4. Garde-fou : dérive massive (3 blocs sur 4 faux) -> --fix refuse, --force passe.
  for (const id of ['b-ok', 'b-zero', 'b-manque']) await db.collection('boulders').doc(id).update({ methodVotes: 99 });
  const guarded = run('--fix');
  check(guarded.code !== 0 && /aucune écriture/.test(guarded.out), '--fix bloqué par le garde-fou (3/4 > 30 %)');
  check((await read('b-ok')).methodVotes === 99, 'garde-fou : rien écrit');
  const forced = run('--fix', '--force');
  check(forced.code === 0 && (await read('b-ok')).methodVotes === 3, '--fix --force : corrigé');

  console.log(failures === 0 ? '\nTOUT VERT' : `\n${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
