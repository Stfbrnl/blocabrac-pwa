// Rattrapage ponctuel des documents `competition_participants` écrits par l'ancien code de
// l'auto-inscription (`ClientCompetitions.tsx`, corrigé en V2.72 le 03/10/2026) :
//
//   node backfill-competition-participants.js                 → simulation (par défaut, n'écrit rien)
//   node backfill-competition-participants.js --fix           → recopie réellement les champs
//   node backfill-competition-participants.js --competition <id>  → borne à une compétition
//
// ─── POURQUOI CE SCRIPT EXISTE ─────────────────────────────────────────────────────────
//
// Jusqu'en V2.72, l'auto-inscription du grimpeur écrivait un nom VIDE (elle découpait
// `user.displayName` de Firebase Auth, que ce projet ne renseigne jamais — le nom vit dans
// `users`) et n'écrivait ni `dateOfBirth`, ni `gender`, ni `level`. Or l'écran live de
// compétition lisait ces champs UNIQUEMENT là : tout grimpeur inscrit par lui-même
// apparaissait sans nom et dans la catégorie « Inconnu ». Détail dans
// docs/handoffs/RETOUR-auto-inscription.md.
//
// V2.72 a corrigé les deux côtés : l'inscription écrit désormais ces champs, et l'écran live
// se replie sur `users`. Mais **un correctif à l'écriture ne répare jamais le passé** : les
// participations déjà écrites restent incomplètes, et rien ne les rétroremplit.
//
// ⚠️ ET C'EST LE PRÉALABLE D'UN CONTRÔLE D'AUDIT, PAS UN NETTOYAGE DE CONFORT (retour
// ClaudeNav, docs/handoffs/RETOUR-auto-inscription-reponses.md §2). Ajouter à
// `audit-prod-catalog.js` la règle « une participation sans `dateOfBirth` alors que son
// `users` en a une » SANS ce rattrapage ferait naître ce contrôle ROUGE, de façon permanente,
// sur des cas qu'on ne compte pas corriger un par un — précisément le travers que
// `KNOWN_EXCEPTIONS` existe pour éviter : un avertissement permanent apprend à ignorer les
// avertissements. L'ordre est donc : rattraper d'abord, contrôler ensuite. Après quoi toute
// occurrence est une régression réelle, et c'est ce qui donne au contrôle sa valeur de signal.
//
// ⚠️ FENÊTRE DE TIR. Ce rattrapage réécrit des participations, donc modifie rétroactivement
// les catégories d'âge affichées pour les compétitions passées. C'est gratuit tant qu'aucune
// compétition réelle n'a eu lieu — seulement des tests. Après la première vraie épreuve, le
// même geste devient une réécriture de résultats publiés. Le script affiche donc toujours un
// inventaire des compétitions concernées AVANT d'écrire, pour que cette décision soit prise
// en connaissance de cause et non par habitude.
//
// ─── CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS ────────────────────────────────────────────
//
// STRICTEMENT ADDITIF : il ne remplit qu'un champ ABSENT, VIDE ou NUL sur la participation,
// et uniquement si le document `users` du grimpeur porte une valeur. Il n'écrase JAMAIS une
// valeur présente sur la participation, même différente de celle de `users` — même garde
// directionnelle que `backfill-ludic-state.js`, et pour la même raison : on ne peut pas
// distinguer « jamais écrit » de « délibérément autre », donc on ne tranche pas.
//
// Un grimpeur dont le compte n'a PAS de date de naissance n'est pas un défaut d'inscription
// mais une lacune du compte : compté à part, jamais signalé comme une anomalie à corriger ici
// (distinction demandée explicitement par ClaudeNav, §2 de son retour — sans elle, les comptes
// sans date de naissance viendraient polluer le rapport à chaque exécution).
//
// Usage occasionnel, à la demande : aucun cron. Il n'y a rien à corriger périodiquement — le
// chemin d'écriture est corrigé, ce script ne traite qu'un héritage fini.
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
const compArgIndex = process.argv.indexOf('--competition');
const TARGET_COMPETITION = compArgIndex !== -1 ? process.argv[compArgIndex + 1] : null;

// Les champs que l'écran live et les écrans de classement lisent sur une participation.
// `email` n'y est pas : aucun écran ne l'affiche, et le recopier serait propager une donnée
// personnelle sans lecteur (même doctrine que `classement_profiles`, qui ne doit porter que
// ce que son lecteur consomme — cf. l'épisode `dateOfBirth` du 17/08).
const FIELDS = ['first_name', 'last_name', 'dateOfBirth', 'age', 'gender', 'level'];

// Une valeur « à rattraper » : absente, nulle, ou chaîne vide (le cas du nom découpé depuis
// un `displayName` inexistant produisait littéralement '').
const estVide = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

async function main() {
  console.log(`\n=== Rattrapage des participations — mode ${FIX ? 'ÉCRITURE (--fix)' : 'SIMULATION'} ===\n`);

  const [participantsSnap, usersSnap, competitionsSnap] = await Promise.all([
    TARGET_COMPETITION
      ? db.collection('competition_participants').where('competition_id', '==', TARGET_COMPETITION).get()
      : db.collection('competition_participants').get(),
    db.collection('users').get(),
    db.collection('competitions').get(),
  ]);

  const usersById = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
  const competitionsById = new Map(competitionsSnap.docs.map((d) => [d.id, d.data()]));

  if (TARGET_COMPETITION && !competitionsById.has(TARGET_COMPETITION)) {
    // Échec bruyant plutôt qu'un rassurant « 0 participation » : la leçon de --uid sur
    // purge-legacy-ludic-fields.js, où un identifiant mal tapé affichait 0 candidat.
    console.error(`ÉCHEC : aucune compétition "${TARGET_COMPETITION}". Vérifier l'identifiant.`);
    process.exit(1);
  }

  // ─── Inventaire des compétitions concernées, TOUJOURS affiché avant d'écrire.
  // Voir « fenêtre de tir » en tête : ce rattrapage modifie rétroactivement les catégories
  // affichées, et cette décision doit être prise en regardant ce qu'elle touche.
  console.log(`${participantsSnap.size} participation(s), ${usersSnap.size} compte(s), ${competitionsSnap.size} compétition(s).\n`);

  const aCorriger = [];
  let dejaCompletes = 0;
  let lacunesDeCompte = 0;
  let sansCompte = 0;
  const parCompetition = new Map();

  participantsSnap.docs.forEach((docSnap) => {
    const part = docSnap.data();
    const uid = part.user_id;
    const compte = usersById.get(uid);

    if (!compte) {
      // Référence morte : le compte a disparu. Hors du périmètre de ce script — c'est le
      // sujet de l'audit des références mortes, qui n'en a trouvé aucune le 02/10.
      sansCompte += 1;
      console.warn(`⚠️  ${docSnap.id} : aucun compte "${uid}" — référence morte, PAS rattrapée ici.`);
      return;
    }

    const patch = {};
    const lacunes = [];
    FIELDS.forEach((champ) => {
      if (!estVide(part[champ])) return;          // déjà renseigné : on n'y touche jamais
      if (estVide(compte[champ])) { lacunes.push(champ); return; }  // rien à recopier
      patch[champ] = compte[champ];
    });

    if (Object.keys(patch).length === 0) {
      if (lacunes.length > 0) lacunesDeCompte += 1;
      else dejaCompletes += 1;
      return;
    }

    const compId = part.competition_id || '(sans competition_id)';
    const comp = competitionsById.get(compId);
    parCompetition.set(compId, (parCompetition.get(compId) || 0) + 1);
    aCorriger.push({ id: docSnap.id, ref: docSnap.ref, uid, compId, comp, patch, lacunes });
  });

  if (aCorriger.length === 0) {
    console.log('✅ Aucune participation à rattraper.');
    console.log(`   ${dejaCompletes} déjà complète(s), ${lacunesDeCompte} limitée(s) par une lacune du compte, ${sansCompte} sans compte.`);
    return;
  }

  console.log(`Compétitions touchées par le rattrapage (${parCompetition.size}) :`);
  parCompetition.forEach((n, compId) => {
    const comp = competitionsById.get(compId);
    const statut = comp ? comp.status : 'COMPÉTITION INTROUVABLE';
    const nom = comp ? comp.name : compId;
    console.log(`   [${String(statut).padEnd(10)}] ${nom} — ${n} participation(s)`);
  });
  console.log('');

  aCorriger.forEach((item) => {
    const champs = Object.keys(item.patch).join(', ');
    const nom = item.comp ? item.comp.name : item.compId;
    console.log(`${FIX ? '✏️ ' : '→ '} ${item.uid} / ${nom} : ${champs}`);
    if (item.lacunes.length > 0) {
      console.log(`      (non rattrapable, absent aussi du compte : ${item.lacunes.join(', ')})`);
    }
  });

  console.log(`\n${aCorriger.length} participation(s) à rattraper.`);
  console.log(`${dejaCompletes} déjà complète(s), ${lacunesDeCompte} limitée(s) par une lacune du compte, ${sansCompte} sans compte.`);

  if (!FIX) {
    console.log('\nSIMULATION — rien n\'a été écrit. Relancer avec --fix pour appliquer.');
    console.log('⚠️  Avant d\'écrire : vérifier dans la liste ci-dessus qu\'aucune compétition');
    console.log('    réelle déjà jouée et annoncée n\'est touchée (voir « fenêtre de tir » en tête).');
    return;
  }

  // Écriture par lots : `update` avec les seuls champs du patch, jamais un `set` qui
  // réécrirait le document (règle du dépôt : aucune écriture ne reconstruit un document
  // depuis un état en mémoire).
  let ecrits = 0;
  for (let i = 0; i < aCorriger.length; i += 400) {
    const lot = db.batch();
    aCorriger.slice(i, i + 400).forEach((item) => { lot.update(item.ref, item.patch); ecrits += 1; });
    await lot.commit();
  }
  console.log(`\n✅ ${ecrits} participation(s) rattrapée(s).`);
}

main().catch((err) => {
  console.error('ÉCHEC :', err);
  process.exit(1);
});
