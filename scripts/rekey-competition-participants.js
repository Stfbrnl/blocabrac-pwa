// Migration ponctuelle : chantier écritures (SUIVI-quota-ecritures.md point 2).
// `competition_participants` utilisait des ID auto-générés (addDoc). Le verrouillage
// (submitted/submitted_at) déménage de competition_results (35 documents/grimpeur,
// facturé par document) vers competition_participants (1 document) — pour que
// firestore.rules puisse vérifier ce verrou par un get() bon marché à chaque
// écriture, il faut un chemin PRÉVISIBLE : "${user_id}_${competition_id}".
//
// Ce script ré-écrit chaque document de participation existant sous ce nouvel ID
// (copie intégrale des champs), puis supprime l'ancien. Sans cette migration, une
// compétition déjà en cours au moment du déploiement du nouveau firestore.rules
// verrait sa vérification de verrou échouer silencieusement (get() sur un chemin
// inexistant) — un client pourrait continuer à modifier ses résultats après
// "verrouillage" côté client.
//
//   node rekey-competition-participants.js
//     Dry-run (par défaut) : affiche ce qui serait fait, n'écrit rien.
//
//   node rekey-competition-participants.js --execute
//     Exécute réellement la migration (create sous le nouvel ID + delete de l'ancien).
//
// Idempotent et relançable : un document déjà sous son ID cible est sauté.
//
// ✅ Vit dans scripts/ (suivi par git), pas dans firestore-migration/ (entièrement
// ignoré) : un Codespace est éphémère, et un script qui n'existe que là disparaît le
// jour où le Codespace est recréé. Réutilisable tel quel pour une deuxième salle dont
// les participations auraient été créées avant ce changement — voir
// cleanup-orphan-boulder-images.js pour le même choix et la même raison. Les
// identifiants, eux, restent dans firestore-migration/ (jamais commités).
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');

// ✅ Deux façons d'obtenir les identifiants : variable d'environnement en priorité
// (CI/exécution distante), sinon fichier local (exécution manuelle depuis le
// Codespace, jamais commité) — même pattern que cleanup-orphan-boulder-images.js.
function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

const app = initializeApp({ credential: cert(readServiceAccount()) });
const db = getFirestore(app);

const EXECUTE = process.argv.includes('--execute');

async function migrate() {
  const snapshot = await db.collection('competition_participants').get();
  console.log(`${snapshot.size} document(s) trouvé(s) dans competition_participants.`);

  const toMigrate = [];
  const targetIds = new Map(); // newId -> [docId, ...] pour détecter les collisions
  let alreadyMigrated = 0;

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    // ✅ "null"/"undefined" en toutes lettres (chaîne, pas la valeur JS) : vu en
    // production sur au moins un document — donnée de test résiduelle plutôt
    // qu'un vrai uid Firebase (toujours non-vide et jamais l'un de ces deux mots).
    const looksLikeRealId = (v) => typeof v === 'string' && v.length > 0 && v !== 'null' && v !== 'undefined';
    if (!looksLikeRealId(data.user_id) || !looksLikeRealId(data.competition_id)) {
      console.warn(`⚠️  ${docSnap.id} : user_id ("${data.user_id}") ou competition_id ("${data.competition_id}") absent ou invalide — ignoré (donnée résiduelle probable, à nettoyer manuellement).`);
      return;
    }
    const newId = `${data.user_id}_${data.competition_id}`;
    if (docSnap.id === newId) {
      alreadyMigrated += 1;
      return;
    }
    toMigrate.push({ oldId: docSnap.id, newId, data });
    if (!targetIds.has(newId)) targetIds.set(newId, []);
    targetIds.get(newId).push(docSnap.id);
  });

  const collisions = [...targetIds.entries()].filter(([, oldIds]) => oldIds.length > 1);
  if (collisions.length > 0) {
    console.warn(`⚠️  ${collisions.length} collision(s) détectée(s) — même grimpeur inscrit plusieurs fois à la même compétition (bug pré-existant). Ignorées, à traiter manuellement :`);
    collisions.forEach(([newId, oldIds]) => console.warn(`   -> ${newId} <- ${oldIds.join(', ')}`));
  }
  const collidingOldIds = new Set(collisions.flatMap(([, oldIds]) => oldIds));
  const safeToMigrate = toMigrate.filter((item) => !collidingOldIds.has(item.oldId));

  console.log(`${alreadyMigrated} déjà sous leur ID cible, ${safeToMigrate.length} à migrer, ${collidingOldIds.size} en collision (ignorés).`);

  if (safeToMigrate.length === 0) {
    console.log('Rien à faire.');
    return;
  }

  if (!EXECUTE) {
    console.log('\n--- DRY-RUN (aucune écriture) ---');
    safeToMigrate.forEach(({ oldId, newId }) => console.log(`  ${oldId}  ->  ${newId}`));
    console.log('\nRelancer avec --execute pour appliquer.');
    return;
  }

  console.log('\n--- EXÉCUTION ---');
  const CHUNK_SIZE = 200; // 2 opérations/item (set + delete), marge sous la limite de 500/batch
  for (let i = 0; i < safeToMigrate.length; i += CHUNK_SIZE) {
    const chunk = safeToMigrate.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    chunk.forEach(({ oldId, newId, data }) => {
      batch.set(db.collection('competition_participants').doc(newId), data);
      batch.delete(db.collection('competition_participants').doc(oldId));
    });
    await batch.commit();
    chunk.forEach(({ oldId, newId }) => console.log(`  ✅ ${oldId}  ->  ${newId}`));
  }
  console.log(`\n✅ Migration terminée : ${safeToMigrate.length} document(s) ré-écrit(s).`);
}

migrate().then(() => process.exit(0)).catch((err) => {
  console.error('❌ Migration échouée :', err);
  process.exit(1);
});
