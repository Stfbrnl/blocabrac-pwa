// Test de régression (émulateur) du chemin d'ÉCRITURE de
// `scripts/backfill-competition-participants.js`.
//
// ⚠️ POURQUOI IL EXISTE : une simulation n'exerce que le chemin de lecture-et-comparaison.
// Ce script écrit en production sur des documents de participation ; son garde directionnel
// (« ne remplir qu'un champ vide, n'écraser jamais une valeur présente ») doit donc avoir été
// vu fonctionner avant, sur des données qu'on peut détruire. Même discipline que
// `reconcile-orphan-key-emulator.mjs` et que le durcissement de `backfill-ludic-state.js`.
//
// Quatre cas, choisis pour que le jeu d'essai puisse EXPRIMER chaque branche du garde — avec
// un seul cas « incomplet », rien ne distinguerait un script correct d'un script qui écrase
// tout :
//
//   A. participation incomplète, compte complet      → rattrapée
//   B. participation DÉJÀ renseignée, valeur AUTRE   → jamais écrasée (le garde)
//   C. participation incomplète, compte incomplet    → lacune du compte, pas une anomalie
//   D. participation dont le compte a disparu        → référence morte, non rattrapée
//
// Prérequis : émulateur Firestore. Usage : node test/backfill-participants-emulator.mjs
import { spawnSync } from 'child_process';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '../../scripts/backfill-competition-participants.js');

admin.initializeApp({ projectId: 'blocabrac' });
const db = admin.firestore();

let echecs = 0;
const verifier = (ok, message) => {
  console.log(`${ok ? '✔' : '✘'} ${message}`);
  if (!ok) echecs += 1;
};

// ─── Mise en place
const COMP = 'comp-backfill-test';
await db.collection('competitions').doc(COMP).set({ name: 'Compétition de test', status: 'terminée' });

await db.collection('users').doc('uid-A').set({
  first_name: 'Alice', last_name: 'Aubert', dateOfBirth: '1990-01-02', gender: 'Femme', level: 'rouge',
});
await db.collection('users').doc('uid-B').set({
  first_name: 'Bruno', last_name: 'Bernard', dateOfBirth: '1985-05-05', gender: 'Homme', level: 'noir',
});
await db.collection('users').doc('uid-C').set({ first_name: 'Chloé', last_name: 'Caron' }); // ni date ni genre
// uid-D : volontairement aucun document `users`.

// A : nom vide et aucune donnée d'âge — exactement ce qu'écrivait l'ancienne auto-inscription.
await db.collection('competition_participants').doc(`uid-A_${COMP}`).set({
  user_id: 'uid-A', competition_id: COMP, first_name: '', last_name: '', is_client: true,
});
// B : valeurs présentes et DIFFÉRENTES de celles du compte (inscription manuelle par l'admin,
// puis changement de nom sur le compte — on ne peut pas trancher, donc on n'y touche pas).
await db.collection('competition_participants').doc(`uid-B_${COMP}`).set({
  user_id: 'uid-B', competition_id: COMP,
  first_name: 'Bruno-Ancien', last_name: 'Bernard-Ancien',
  dateOfBirth: '1900-12-31', gender: 'Homme', level: 'bleu', is_client: true,
});
// C : participation incomplète, mais le compte n'a rien à donner pour date/genre.
await db.collection('competition_participants').doc(`uid-C_${COMP}`).set({
  user_id: 'uid-C', competition_id: COMP, first_name: '', last_name: '', is_client: true,
});
// D : référence morte.
await db.collection('competition_participants').doc(`uid-D_${COMP}`).set({
  user_id: 'uid-D', competition_id: COMP, first_name: '', last_name: '', is_client: true,
});

// ⚠️ `sortie` concatene stdout ET stderr : `console.warn` ecrit sur stderr, et une
// premiere version de ce test cherchait l'avertissement de reference morte dans le seul
// stdout. Il rougissait donc sur un script correct — un faux positif credible, du genre qui
// fait « corriger » du code qui marche.
const lancer = (args) => {
  const r = spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'localhost:8080' },
  });
  return { ...r, sortie: `${r.stdout || ''}
${r.stderr || ''}` };
};

// ─── 1. La simulation n'écrit rien. « Une simulation n'écrit rien, nulle part. »
const simu = lancer(['--competition', COMP]);
verifier(simu.status === 0, `la simulation se termine normalement (code ${simu.status})`);
verifier(/SIMULATION/.test(simu.sortie), 'la simulation annonce qu\'elle n\'écrit rien');
const apresSimu = await db.collection('competition_participants').doc(`uid-A_${COMP}`).get();
verifier(apresSimu.data().first_name === '', 'après simulation, A est toujours incomplète (rien écrit)');

// ─── 2. Un identifiant de compétition inconnu échoue BRUYAMMENT, au lieu d'un rassurant « 0 ».
const faux = lancer(['--competition', 'competition-qui-nexiste-pas']);
verifier(faux.status !== 0, `un identifiant inconnu fait échouer le script (code ${faux.status})`);

// ─── 3. L'écriture
const fix = lancer(['--competition', COMP, '--fix']);
verifier(fix.status === 0, `l'écriture se termine normalement (code ${fix.status})`);

const [a, b, c, d] = await Promise.all(['uid-A', 'uid-B', 'uid-C', 'uid-D'].map(
  (u) => db.collection('competition_participants').doc(`${u}_${COMP}`).get()
));

// A rattrapée entièrement.
verifier(a.data().first_name === 'Alice', 'A : le nom vide est rattrapé depuis le compte');
verifier(a.data().dateOfBirth === '1990-01-02', 'A : la date de naissance est rattrapée');
verifier(a.data().gender === 'Femme' && a.data().level === 'rouge', 'A : genre et niveau rattrapés');

// B JAMAIS écrasée — c'est le garde, et le cœur de ce test.
verifier(b.data().first_name === 'Bruno-Ancien', 'B : un prénom présent n\'est JAMAIS écrasé');
verifier(b.data().dateOfBirth === '1900-12-31', 'B : une date présente n\'est JAMAIS écrasée');
verifier(b.data().level === 'bleu', 'B : un niveau présent n\'est JAMAIS écrasé');

// C : ce que le compte peut donner, et rien de plus.
verifier(c.data().first_name === 'Chloé', 'C : le nom est rattrapé (le compte l\'a)');
verifier(c.data().dateOfBirth === undefined, 'C : la date reste absente (le compte ne l\'a pas)');
verifier(/lacune du compte/i.test(fix.sortie), 'C : la lacune du compte est signalée comme telle');

// D : référence morte, intacte et signalée.
verifier(d.data().first_name === '', 'D : une référence morte n\'est pas rattrapée');
verifier(/référence morte/i.test(fix.sortie), 'D : la référence morte est signalée');

// ─── 4. Idempotence : un second passage ne trouve plus rien.
const encore = lancer(['--competition', COMP]);
verifier(/Aucune participation à rattraper|1 participation/.test(encore.sortie),
  'un second passage ne retrouve que les cas non rattrapables');
verifier(!/✏️/.test(encore.sortie), 'un second passage n\'annonce aucune écriture');

console.log(`\n${echecs === 0 ? '✅ Tout est vert' : `❌ ${echecs} vérification(s) en échec`}`);
process.exit(echecs === 0 ? 0 : 1);
