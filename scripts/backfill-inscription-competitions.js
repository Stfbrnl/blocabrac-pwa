// Bascule de `users.inscritAuxCompetitions` à `true` sur les comptes clients qui ne l'ont pas :
//
//   node backfill-inscription-competitions.js                      → simulation (par défaut, n'écrit rien)
//   node backfill-inscription-competitions.js --fix --expected 53  → bascule réellement
//   node backfill-inscription-competitions.js --uid <uid>          → borne à un compte
//
// ─── POURQUOI CE SCRIPT EXISTE ─────────────────────────────────────────────────────────
//
// `ClientCompetitions.tsx` (`canUserRegister`, puis une seconde fois `handleRegister`) refuse
// l'auto-inscription dès que `users.inscritAuxCompetitions` n'est pas vrai. Or `Register.tsx`
// créait tout compte avec `false` — et l'auto-inscription est le chemin NORMAL de cette salle
// (les grimpeurs s'inscrivent eux-mêmes à toutes les compétitions, cf. CLAUDE.md).
//
// Mesuré en production le 15/10/2026, à trois semaines du « Contest Haloween » du 5 novembre :
// **53 comptes sur 61 à `false`**, 8 à `true`. Autrement dit 53 grimpeurs à qui l'application
// répondait « Vous n'êtes pas autorisé à participer aux compétitions », pour une épreuve
// ouverte à tous. Le défaut n'était visible nulle part : aucun écran d'administration ne
// compte les comptes bloqués, et le grimpeur ne découvre le refus qu'au moment de s'inscrire.
//
// Décision de l'utilisateur (15/10/2026) : le curseur devient un outil d'EXCLUSION (on retire
// quelqu'un qui ne doit pas concourir) et non d'inclusion (on autorise un par un). D'où cette
// bascule de l'existant + le passage de `Register.tsx` à `true` — les deux sont nécessaires,
// un correctif à l'écriture ne répare jamais le passé.
//
// ⚠️ `inscritAuxCours` n'est PAS touché : il reste à `false` par défaut, parce qu'une
// inscription aux cours est un acte commercial, pas une autorisation. Ne pas « harmoniser »
// les deux champs sous prétexte qu'ils se ressemblent.
//
// ─── GARDES ────────────────────────────────────────────────────────────────────────────
//
// `inscritAuxCompetitions` fait partie des CLÉS VERROUILLÉES de `firestore.rules` (avec
// `inscritAuxCours`, `role`, `roles`, `levelOverride`) : un client ne peut pas se l'accorder
// lui-même. Ce script écrit avec la clé de service, donc hors des règles — raison de plus pour
// qu'il soit en simulation par défaut.
//
// `--expected <n>` est OBLIGATOIRE avec `--fix` sur l'ensemble de la collection : le nombre de
// comptes à basculer doit être ÉCRIT D'AVANCE et vérifié, sinon le script s'arrête sans rien
// écrire. C'est la mécanisation de « prédire avant de mesurer » (docs/handoffs/
// HANDOFF-reprise-03-10-2026.md) : sans chiffre attendu, un écart de 53 à 61 — par exemple
// parce que la requête aurait silencieusement renvoyé plus que les clients — passerait pour
// normal. `--uid` en est dispensé : un compte seul n'a pas de proportion à évaluer.
//
// La valeur AVANT bascule de chaque compte touché est sauvegardée dans
// `firestore-migration/` (dossier gitignoré) avant la première écriture — un booléen se
// rétablit à la main, mais pas sans savoir lesquels étaient à `false`.
//
// ⚠️ Une simulation n'écrit rien, nulle part : la sauvegarde n'est produite que sous `--fix`
// (règle du 02/10/2026, après qu'une simulation ait réécrit le journal de production d'un
// cron). Elle est aussi suffixée `.emulator.json` si `FIRESTORE_EMULATOR_HOST` est posé.
//
// Usage ponctuel, à la demande : aucun cron. Une fois `Register.tsx` déployé, il n'y a plus
// d'héritage à rattraper — ce script ne traite qu'un stock fini.
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');
const IS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
if (IS_EMULATOR) {
  console.warn('⚠️  FIRESTORE_EMULATOR_HOST détecté — ce script va agir sur l\'ÉMULATEUR, pas sur la prod.');
}

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

const app = initializeApp(IS_EMULATOR ? { projectId: 'blocabrac' } : { credential: cert(readServiceAccount()) });
const db = getFirestore(app);

const FIX = process.argv.includes('--fix');
const uidArgIndex = process.argv.indexOf('--uid');
const TARGET_UID = uidArgIndex !== -1 ? process.argv[uidArgIndex + 1] : null;
const expectedArgIndex = process.argv.indexOf('--expected');
const EXPECTED = expectedArgIndex !== -1 ? Number(process.argv[expectedArgIndex + 1]) : null;

// Fusion `roles` + `role` scalaire legacy — la règle du projet, jamais le seul champ scalaire
// (voir `isUserRole()` dans firestore.rules et `buildCompetitionParticipant`). Le repli à
// « client » quand aucun rôle n'est lisible suit la même convention que partout ailleurs :
// tout compte porte ce rôle.
function estClient(u) {
  const roles = new Set([...(u.roles || []), ...(u.role ? [u.role] : [])]);
  return roles.size > 0 ? roles.has('client') : true;
}

async function main() {
  console.log(`Mode : ${FIX ? '⚠️  ÉCRITURE (--fix)' : 'simulation (aucune écriture)'}`);
  if (TARGET_UID) console.log(`Borné au compte : ${TARGET_UID}`);
  console.log('');

  const snap = TARGET_UID
    ? [await db.collection('users').doc(TARGET_UID).get()]
    : (await db.collection('users').get()).docs;

  if (TARGET_UID && !snap[0].exists) {
    // Un uid mal saisi doit échouer bruyamment, jamais afficher un rassurant « 0 candidat »
    // (leçon de purge-legacy-ludic-fields.js, 03/10/2026).
    console.error(`❌ Aucun compte "users/${TARGET_UID}". Vérifier l'identifiant.`);
    process.exit(1);
  }

  const candidats = [];
  let dejaOk = 0;
  let nonClients = 0;

  for (const d of snap) {
    const u = d.data();
    if (!estClient(u)) {
      nonClients += 1;
      continue;
    }
    if (u.inscritAuxCompetitions === true) {
      dejaOk += 1;
      continue;
    }
    candidats.push({
      uid: d.id,
      nom: `${u.first_name || '(sans prénom)'} ${u.last_name || ''}`.trim(),
      avant: u.inscritAuxCompetitions === undefined ? null : u.inscritAuxCompetitions,
    });
  }

  console.log(`Comptes lus            : ${snap.length}`);
  console.log(`Déjà autorisés (true)  : ${dejaOk}`);
  console.log(`Non clients (ignorés)  : ${nonClients}`);
  console.log(`À basculer             : ${candidats.length}`);
  console.log('');
  candidats.forEach((c) => {
    console.log(`  ${c.uid} | ${c.nom} | inscritAuxCompetitions=${JSON.stringify(c.avant)} → true`);
  });
  console.log('');

  if (candidats.length === 0) {
    console.log('✅ Rien à faire : tout compte client est déjà autorisé à s\'inscrire.');
    return;
  }

  if (!FIX) {
    console.log('Simulation terminée. Relancer avec :');
    console.log(`  node scripts/backfill-inscription-competitions.js --fix --expected ${candidats.length}`);
    return;
  }

  if (!TARGET_UID) {
    if (EXPECTED === null || Number.isNaN(EXPECTED)) {
      console.error(
        '❌ --fix exige --expected <n> : le nombre de comptes à basculer doit être écrit d\'avance '
        + `(ici ${candidats.length}). Sans chiffre attendu, un écart passerait pour normal.`
      );
      process.exit(1);
    }
    if (EXPECTED !== candidats.length) {
      console.error(
        `❌ Écart avec la prédiction : ${candidats.length} comptes à basculer, --expected ${EXPECTED}. `
        + 'Rien n\'a été écrit. Relire la simulation et comprendre l\'écart avant de réessayer.'
      );
      process.exit(1);
    }
  }

  const jour = new Date().toISOString().slice(0, 10);
  const sauvegarde = path.join(
    CREDENTIALS_DIR,
    IS_EMULATOR
      ? `dump-inscription-competitions-${jour}.emulator.json`
      : `dump-inscription-competitions-${jour}.json`
  );
  fs.writeFileSync(sauvegarde, JSON.stringify({ date: new Date().toISOString(), candidats }, null, 2));
  console.log(`Sauvegarde de l'état avant bascule : ${sauvegarde}`);

  // `update` et non `set(..., {merge:true})` : le document existe forcément (il vient d'être
  // lu), et `update` échoue bruyamment s'il a disparu entre-temps plutôt que de le recréer
  // avec ce seul champ.
  let batch = db.batch();
  let dansLeLot = 0;
  let ecrits = 0;
  for (const c of candidats) {
    batch.update(db.collection('users').doc(c.uid), { inscritAuxCompetitions: true });
    dansLeLot += 1;
    if (dansLeLot === 400) {
      await batch.commit();
      ecrits += dansLeLot;
      batch = db.batch();
      dansLeLot = 0;
    }
  }
  if (dansLeLot > 0) {
    await batch.commit();
    ecrits += dansLeLot;
  }

  console.log('');
  console.log(`✅ ${ecrits} compte(s) basculé(s) à inscritAuxCompetitions=true.`);
  if (ecrits !== candidats.length) {
    // Garde par étape : compter les écritures effectives, jamais conclure du seul « pas
    // d'exception levée » (feedback-garde-par-etape, 03/10/2026).
    console.error(`❌ ${candidats.length} attendues, ${ecrits} écrites. Relancer la simulation pour voir l'état réel.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
