// docs/handoffs/RETOUR-v2681-v269-v270.md §4.1 : contrôle en LECTURE SEULE que les documents de
// catalogue/configuration dont le CODE suppose l'existence sont bien présents en production.
//
// Origine : le badge `type: 'mission'` (V2.68) était prêt côté code et côté règles, annoncé dans
// un handoff, mais n'a jamais existé en prod — le test de règles fabriquait lui-même le badge
// qu'il était censé couvrir. Un test ne doit jamais créer la donnée dont l'existence est l'objet
// du test : cette vérification lit la prod, là où la donnée vit.
//
// Le code n'écrit aucun identifiant de badge en dur : il parcourt le catalogue et attribue PAR
// TYPE (ClientStats.tsx). On vérifie donc des CONTRATS, pas des identifiants :
//   - badges `type: 'mission'`         : au moins un, et SANS couleur (une couleur le mettrait en
//                                        veille via computeBadgeActive) ;
//   - badges `type: 'automatic'`       : une couleur de niveau valide, et un badge « réussir un
//                                        bloc <couleur> » pour chaque couleur de violet à rose (la
//                                        synchro du niveau par les badges ne peut pas atteindre une
//                                        couleur sans badge), plus le « Master » (rose, count "all") ;
//   - `client_badges`                  : aucun lien vers un badge absent du catalogue (l'écran
//                                        « Mes stats » l'ignorerait sans rien dire) ;
//   - `app_config/classement_saison`   : présent ou non, et son état (le code tolère l'absence,
//                                        mais le classement de saison reste alors vide).
//   - RÉFÉRENCES MORTES entre collections (02/10/2026, RETOUR-v2714-et-comptes-test.md §3.2) :
//                                        `client_boulder_results.boulderId` → `boulders`,
//                                        `challenges.participants`/`created_by`/`boulder_id`,
//                                        `classement_profiles/{uid}` → `users`. Détecter un
//                                        défaut demande d'interroger l'état ACCUMULÉ de la
//                                        prod ; un compte de test, jeune et propre, n'en porte
//                                        aucun (voir la note « Comptes de test » de CLAUDE.md).
//
//   node scripts/audit-prod-catalog.js   → n'écrit jamais rien, aucun mode --fix
//
// Code de sortie non nul s'il existe au moins une ERREUR (pas pour un simple avertissement) —
// utilisable tel quel comme étape de vérification d'un déploiement.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');
const IS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
if (IS_EMULATOR) {
  console.warn('⚠️  FIRESTORE_EMULATOR_HOST détecté — lecture de l\'ÉMULATEUR, pas de la prod.');
}

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

const app = initializeApp(IS_EMULATOR ? { projectId: 'blocabrac' } : { credential: cert(readServiceAccount()) });
const db = getFirestore(app);

// Miroir de `levelOrder` (frontend/src/utils/competitionEligibility.ts) — à tenir à jour à la main.
// RETOUR-v2701-v2702.md §5 : un avertissement permanent apprend à ignorer les avertissements.
// Les écarts CONNUS et ACCEPTÉS sont listés ici, avec la raison et la date de la décision : ils
// sont rappelés sur une ligne, sans compter comme avertissements — une nouvelle ligne ⚠️ saute
// alors aux yeux. N'ajouter une entrée que sur décision explicite de l'utilisateur.
const KNOWN_EXCEPTIONS = {
  'client_badges/HGtxU7N6cCU00WCFtjcv':
    'ancien format (client_id/badge_id), badge-expert remis en mai 2026 au compte de test « Maurice Tartanpion », conservé volontairement (décision du 25/09/2026)',
};

const LEVEL_ORDER =['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];
const BADGE_COLORS = ['violet', 'rouge', 'noir', 'blanc', 'rose'];

async function main() {
  const errors = [];
  const warnings = [];

  const [badgesSnap, linksSnap, seasonSnap, bouldersSnap] = await Promise.all([
    db.collection('badges').get(),
    db.collection('client_badges').get(),
    db.collection('app_config').doc('classement_saison').get(),
    db.collection('boulders').get(),
  ]);

  const badges = badgesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const byType = (t) => badges.filter((b) => b.type === t);
  console.log(`Catalogue badges : ${badges.length} (automatic ${byType('automatic').length}, mission ${byType('mission').length}, autres ${badges.filter((b) => b.type !== 'automatic' && b.type !== 'mission').length})`);

  // Badges de mission.
  const mission = byType('mission');
  if (mission.length === 0) errors.push('Aucun badge type "mission" : la grille complétée ne rapporte rien.');
  for (const b of mission) {
    if (b.color || (b.criteria && b.criteria.color)) {
      errors.push(`Badge mission ${b.id} porte une couleur (${b.color || b.criteria.color}) : il serait mis en veille.`);
    }
    if (!b.name) warnings.push(`Badge mission ${b.id} sans nom.`);
  }

  // Badges automatiques de couleur.
  const automatic = byType('automatic');
  for (const b of automatic) {
    const color = (b.criteria && b.criteria.color) || b.color;
    if (!color || !LEVEL_ORDER.includes(color)) {
      errors.push(`Badge automatique ${b.id} : couleur "${color}" absente de levelOrder — jamais attribuable correctement.`);
    }
  }
  const isAll = (b) => String(b.criteria && b.criteria.count).toLowerCase() === 'all';
  for (const c of BADGE_COLORS) {
    const one = automatic.find((b) => ((b.criteria && b.criteria.color) || b.color) === c && !isAll(b));
    if (!one) errors.push(`Aucun badge automatique « réussir un bloc ${c} » : le niveau synchronisé ne peut pas atteindre ${c}.`);
  }
  if (!automatic.some((b) => ((b.criteria && b.criteria.color) || b.color) === 'rose' && isAll(b))) {
    warnings.push('Aucun badge « Master » (rose, count "all").');
  }

  // Liens orphelins.
  // Un document à l'ANCIEN format (`client_id`/`badge_id`, 2026-05) n'est lu par aucun écran
  // (tous interrogent `userId`) : signalé à part, en avertissement — rien ne le casse.
  const catalogIds = new Set(badges.map((b) => b.id));
  const legacy = linksSnap.docs.filter((d) => d.data().badgeId === undefined && d.data().badge_id !== undefined);
  const orphans = linksSnap.docs.filter((d) => d.data().badgeId !== undefined && !catalogIds.has(d.data().badgeId));
  const malformed = linksSnap.docs.filter((d) => d.data().badgeId === undefined && d.data().badge_id === undefined);
  console.log(`client_badges : ${linksSnap.size} lien(s), ${orphans.length} orphelin(s), ${legacy.length} à l'ancien format`);
  for (const d of orphans) errors.push(`client_badges/${d.id} pointe vers un badge absent : "${d.data().badgeId}".`);
  for (const d of malformed) errors.push(`client_badges/${d.id} sans badgeId.`);
  const known = [];
  for (const d of legacy) {
    const key = `client_badges/${d.id}`;
    if (KNOWN_EXCEPTIONS[key]) known.push(`${key} : ${KNOWN_EXCEPTIONS[key]}`);
    else warnings.push(`${key} à l'ancien format (badge_id "${d.data().badge_id}") : ignoré par l'application.`);
  }

  // ========== Références mortes entre collections ==========
  // RETOUR-v2714-et-comptes-test.md §3.2 : un compte de test ne détecte rien (il est jeune et
  // propre, or les défauts de ce projet naissent de l'état ACCUMULÉ). L'instrument de
  // détection, c'est l'audit de production — et en particulier : qu'est-ce qui pointe vers
  // quelque chose qui n'existe plus ?
  //
  // ⚠️ Une ligne du tableau de ce §3.2 n'est PAS auditable ici, et c'est important de le
  // dire plutôt que de laisser croire le contraire : « le défi actif d'un grimpeur » n'est
  // stocké NULLE PART côté serveur. ClientDaily.tsx le reconstruit par une requête
  // cache-first, et c'est le cache IndexedDB du navigateur qui garde la référence morte.
  // Aucun script serveur ne peut la voir. Ce qui protège de ce défaut-là, c'est la règle
  // (`resource == null ||`) et le découpage de la transaction, pas cet audit.
  const [resultsSnap, challengesSnap, usersSnap, profilesSnap] = await Promise.all([
    db.collection('client_boulder_results').get(),
    db.collection('challenges').get(),
    db.collection('users').get(),
    db.collection('classement_profiles').get(),
  ]);
  const boulderIds = new Set(bouldersSnap.docs.map((d) => d.id));
  const userIds = new Set(usersSnap.docs.map((d) => d.id));

  console.log(`Références : ${resultsSnap.size} résultat(s) de bloc, ${challengesSnap.size} défi(s), `
    + `${profilesSnap.size} profil(s) de classement, ${usersSnap.size} compte(s), ${boulderIds.size} bloc(s)`);

  // client_boulder_results -> boulders. C'est LA référence qui porte le classement : la
  // réconciliation recalcule le score attendu en joignant chaque résultat au bloc. Un bloc
  // disparu ferait silencieusement chuter le score recalculé — d'où l'invariant « ne jamais
  // supprimer un document boulders » (CLAUDE.md). Cet audit le vérifie au lieu de l'espérer.
  const resultatsMorts = resultsSnap.docs.filter((d) => !boulderIds.has(d.data().boulderId));
  for (const d of resultatsMorts.slice(0, 10)) {
    errors.push(`client_boulder_results/${d.id} pointe vers un bloc absent : "${d.data().boulderId}".`);
  }
  if (resultatsMorts.length > 10) {
    errors.push(`… et ${resultatsMorts.length - 10} autre(s) résultat(s) pointant vers un bloc absent.`);
  }

  // client_boulder_results -> users (compte supprimé mais résultats conservés).
  const resultatsSansCompte = new Set(
    resultsSnap.docs.map((d) => d.data().userId).filter((uid) => uid && !userIds.has(uid))
  );
  for (const uid of resultatsSansCompte) {
    warnings.push(`Des résultats de bloc appartiennent à un compte absent de "users" : ${uid}.`);
  }

  // classement_profiles -> users : un profil orphelin apparaîtrait au classement sans nom.
  for (const d of profilesSnap.docs) {
    if (!userIds.has(d.id)) warnings.push(`classement_profiles/${d.id} sans compte "users" correspondant.`);
  }

  // challenges -> users / boulders.
  for (const d of challengesSnap.docs) {
    const c = d.data();
    for (const uid of c.participants || []) {
      if (!userIds.has(uid)) errors.push(`challenges/${d.id} a un participant absent de "users" : ${uid}.`);
    }
    if (c.created_by && !userIds.has(c.created_by)) {
      errors.push(`challenges/${d.id} créé par un compte absent de "users" : ${c.created_by}.`);
    }
    // Structure "bloc_designe" : le défi désigne un bloc précis. Si ce bloc n'existe plus,
    // le défi ne peut plus jamais avancer.
    if (c.boulder_id && !boulderIds.has(c.boulder_id)) {
      errors.push(`challenges/${d.id} (${c.structure}) désigne un bloc absent : "${c.boulder_id}".`);
    }
  }

  // Fenêtre de saison.
  if (!seasonSnap.exists) {
    warnings.push('app_config/classement_saison absent : le classement de saison reste vide tant que l\'admin ne l\'a pas réglé.');
  } else {
    const s = seasonSnap.data();
    console.log(`Saison : ${s.debut} → ${s.fin}, cloturee=${!!s.cloturee}`);
    if (!s.debut || !s.fin) errors.push('app_config/classement_saison sans debut/fin.');
    if (s.cloturee) warnings.push('Saison clôturée : la prochaine fenêtre n\'est pas encore réglée.');
  }

  console.log('');
  known.forEach((k) => console.log(`ℹ️  exception connue — ${k}`));
  warnings.forEach((w) => console.log(`⚠️  ${w}`));
  errors.forEach((e) => console.log(`❌ ${e}`));
  console.log(`\n${errors.length} erreur(s), ${warnings.length} avertissement(s).`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('AUDIT_FAILED', err);
  process.exit(2);
});
