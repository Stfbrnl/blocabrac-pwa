// docs/handoffs/RETOUR-v2701-v2702.md §2 : filet de sécurité du carnet de méthodes (V2.67).
// `boulders/{id}.methodCounts` / `methodVotes` sont des compteurs INCRÉMENTAUX, tenus par
// ClientDaily.tsx (buildMethodVoteWrite, une transaction par vote). Doctrine maison : tout
// compteur incrémental a une réconciliation contre sa source de vérité — ici les votes
// eux-mêmes, `client_boulder_results/{uid}_{boulderId}.methods` (un tableau par grimpeur).
//
// Attendu, pour chaque bloc :
//   methodCounts[m] = nombre de résultats de ce bloc dont `methods` contient m
//   methodVotes     = nombre de résultats de ce bloc dont `methods` est non vide
// (un vote reste compté même sur une réussite annulée : c'est ce que fait l'écriture, et ce
//  que contrôle isValidMethodVoteUpdate dans firestore.rules, ancrée sur le document du votant).
// Une clé à 0 et une clé absente sont équivalentes (summarizeMethodVotes les omet toutes deux).
//
//   node scripts/reconcile-method-counts.js                → simulation, n'écrit rien
//   node scripts/reconcile-method-counts.js --fix          → corrige les blocs en écart
//   node scripts/reconcile-method-counts.js --fix --force  → corrige même au-delà du garde-fou
//
// Garde-fou (même doctrine que reconcile-classement-profiles.js) : si plus de 30 % des blocs
// portant des votes sont en écart ET au moins 3, --fix s'interrompt sans rien écrire (code de
// sortie non nul) — une dérive massive trahit plus probablement un bug de ce script qu'une vraie
// dérive, et un cron ne doit pas la propager partout. --force confirme explicitement.
//
// Le résultat n'est journalisé que dans la sortie console (journal du run CI), comme
// compute-classement-saison.js : aucun fichier d'état suivi par git, donc rien à protéger de
// l'émulateur.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const DRIFT_GUARD_RATIO = 0.3;
const DRIFT_GUARD_ABSOLUTE_MIN = 3;

const FIX = process.argv.includes('--fix');
const FORCE = process.argv.includes('--force');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');
const IS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
if (IS_EMULATOR) {
  console.warn('⚠️  FIRESTORE_EMULATOR_HOST détecté — ÉMULATEUR, pas la prod.');
}

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

const app = initializeApp(IS_EMULATOR ? { projectId: 'blocabrac' } : { credential: cert(readServiceAccount()) });
const db = getFirestore(app);

// Normalise un compteur : sans les clés à 0 (ou négatives, signe d'une dérive), clés triées.
const normalizeCounts = (counts) => {
  const out = {};
  Object.keys(counts || {}).sort().forEach((k) => {
    if ((counts[k] || 0) > 0) out[k] = counts[k];
  });
  return out;
};

// Exporté pour le test sur émulateur : calcule l'attendu à partir des résultats.
function expectedFromResults(resultDocs) {
  const byBoulder = new Map();
  resultDocs.forEach((data) => {
    const methods = Array.isArray(data.methods) ? data.methods : [];
    if (!data.boulderId || methods.length === 0) return;
    const entry = byBoulder.get(data.boulderId) || { methodCounts: {}, methodVotes: 0 };
    new Set(methods).forEach((m) => { entry.methodCounts[m] = (entry.methodCounts[m] || 0) + 1; });
    entry.methodVotes += 1;
    byBoulder.set(data.boulderId, entry);
  });
  return byBoulder;
}

async function main() {
  const [bouldersSnap, resultsSnap] = await Promise.all([
    db.collection('boulders').get(),
    db.collection('client_boulder_results').get(),
  ]);
  const expectedByBoulder = expectedFromResults(resultsSnap.docs.map((d) => d.data()));

  const drifts = [];
  let withVotes = 0;
  bouldersSnap.docs.forEach((b) => {
    const data = b.data();
    const stored = { methodCounts: normalizeCounts(data.methodCounts), methodVotes: data.methodVotes || 0 };
    const exp = expectedByBoulder.get(b.id) || { methodCounts: {}, methodVotes: 0 };
    const expected = { methodCounts: normalizeCounts(exp.methodCounts), methodVotes: exp.methodVotes };
    if (stored.methodVotes > 0 || expected.methodVotes > 0) withVotes += 1;
    if (JSON.stringify(stored) !== JSON.stringify(expected)) {
      drifts.push({ id: b.id, label: `${data.color || '?'} n°${data.number ?? '?'} - ${data.wall || '?'}`, stored, expected, ref: b.ref });
    }
  });

  // Votes sur un bloc absent de la collection (ne devrait jamais arriver : un bloc n'est jamais supprimé).
  const boulderIds = new Set(bouldersSnap.docs.map((b) => b.id));
  const orphanVotes = [...expectedByBoulder.keys()].filter((id) => !boulderIds.has(id));

  console.log(`${bouldersSnap.size} bloc(s), ${withVotes} avec des votes, ${resultsSnap.size} résultat(s) lus.`);
  drifts.forEach((d) => {
    console.log(`  ✗ ${d.label} (${d.id}) : stocké ${JSON.stringify(d.stored)} ≠ attendu ${JSON.stringify(d.expected)}`);
  });
  orphanVotes.forEach((id) => console.log(`  ⚠️ votes sur un bloc inexistant : ${id} (non corrigeable ici)`));
  console.log(`${drifts.length} bloc(s) en écart.`);

  if (!FIX || drifts.length === 0) {
    if (!FIX && drifts.length > 0) console.log('Simulation : relancer avec --fix pour corriger.');
    return;
  }

  const ratio = withVotes > 0 ? drifts.length / withVotes : 0;
  if (!FORCE && ratio > DRIFT_GUARD_RATIO && drifts.length >= DRIFT_GUARD_ABSOLUTE_MIN) {
    console.error(`🛑 ${drifts.length}/${withVotes} blocs en écart (> ${DRIFT_GUARD_RATIO * 100} %) : aucune écriture. Vérifier, puis --force si la dérive est réelle.`);
    process.exitCode = 1;
    return;
  }

  // `update` d'un champ map le REMPLACE entièrement (pas de fusion) : aucune clé orpheline.
  for (const d of drifts) {
    await d.ref.update({ methodCounts: d.expected.methodCounts, methodVotes: d.expected.methodVotes });
  }
  console.log(`✅ ${drifts.length} bloc(s) corrigé(s).`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('RECONCILE_FAILED', err);
    process.exit(2);
  });
}

module.exports = { expectedFromResults, normalizeCounts };
