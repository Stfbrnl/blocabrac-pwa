// LECTURE SEULE : combien de comptes portent un `users.level` différent de son recalcul, et
// DANS QUEL SENS ? (2026-10-18-CN-niveau-perime.md §1.1, et son addendum §4.)
//
// ⚠️ Pourquoi le sens compte : un niveau trop HAUT est un badge qui n'est pas redescendu après
// une rotation ; un niveau trop BAS est une attribution de badge qui n'a jamais tourné, parce
// que `ClientStats.tsx` attribue les `client_badges` manquants au chargement de « Mes stats ».
// Si la majorité des écarts sont vers le bas, le défaut n'est pas « un badge qui ne retombe
// pas » mais « la chaîne entière n'avance que pour ceux qui consultent leurs statistiques ».
//
// ⚠️ CE SCRIPT NE RÉIMPLÉMENTE PAS `computeBadgeActive`, et il ne le peut pas : le calcul vit
// en TypeScript dans frontend/src/utils/ et le réimplémenter fabriquerait une divergence (la
// leçon du palmarès). Il calcule la grandeur DOMINANTE — la plus haute couleur dont le
// grimpeur a encore au moins un bloc validé ACTIF — qui coïncide avec le niveau attendu tant
// que chaque badge de couleur exige 1 bloc. Cette hypothèse n'est pas supposée : elle est
// VÉRIFIÉE contre le catalogue au démarrage, et le script s'arrête si elle est fausse.
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

if (process.env.FIRESTORE_EMULATOR_HOST) { console.error('Script de production.'); process.exit(1); }
initializeApp({ credential: cert(require(path.join(__dirname, '../firestore-migration/serviceAccountKey.json'))) });
const db = getFirestore();

const ORDRE = ['jaune', 'vert', 'bleu', 'violet', 'rouge', 'noir', 'blanc', 'rose'];
const AVEC_BADGE = ['violet', 'rouge', 'noir', 'blanc', 'rose']; // aucun badge sous violet
const rang = (c) => ORDRE.indexOf(c);

(async () => {
  const badges = await db.collection('badges').get();
  const couleurs = badges.docs.filter((d) => d.data().type === 'automatic' && d.data().criteria?.color);
  const suspects = couleurs.filter((d) => {
    const c = d.data().criteria;
    return c.color !== 'rose' && String(c.count ?? '1') !== '1';
  });
  if (suspects.length) {
    console.error('✘ Hypothèse fausse : un badge de couleur exige plus d\'un bloc —',
      suspects.map((d) => `${d.id}(${d.data().criteria.count})`).join(', '));
    console.error('  Le raccourci de ce script ne vaut plus. Mesurer depuis l\'application.');
    process.exit(1);
  }
  console.log(`✔ Hypothèse vérifiée : les ${couleurs.length} badges de couleur exigent 1 bloc (hors « master »).`);

  const blocs = await db.collection('boulders').get();
  const actifDaily = new Map();
  for (const b of blocs.docs) {
    const d = b.data();
    if (d.type === 'daily' && d.is_active === true) actifDaily.set(b.id, d.color);
  }

  const users = await db.collection('users').get();
  const resultats = await db.collection('client_boulder_results').get();
  const parUid = new Map();
  for (const r of resultats.docs) {
    const d = r.data();
    if (d.success !== true) continue;
    const couleur = actifDaily.get(d.boulderId);
    if (!couleur) continue; // bloc désactivé ou supprimé : ne compte plus pour un badge
    const m = parUid.get(d.userId) || new Set();
    m.add(couleur); parUid.set(d.userId, m);
  }

  const ecarts = { haut: [], bas: [] };
  let sansNiveau = 0;
  for (const u of users.docs) {
    const d = u.data();
    if (d.levelOverride) continue;        // niveau imposé : hors sujet
    if (!d.level) { sansNiveau += 1; continue; }
    const atteintes = [...(parUid.get(u.id) || [])].filter((c) => AVEC_BADGE.includes(c));
    const attendu = atteintes.length
      ? atteintes.sort((a, b) => rang(b) - rang(a))[0]
      : (rang(d.level) >= rang('violet') ? (d.baseLevel || 'bleu') : d.level);
    if (attendu === d.level) continue;
    const ligne = `${(`${d.first_name || ''} ${d.last_name || ''}`).trim() || u.id} : stocké ${d.level} -> attendu ${attendu}`;
    (rang(d.level) > rang(attendu) ? ecarts.haut : ecarts.bas).push(ligne);
  }

  console.log(`\n${users.size} comptes, ${sansNiveau} sans niveau (ignorés).`);
  console.log(`ÉCARTS : ${ecarts.haut.length + ecarts.bas.length}`);
  console.log(`  niveau trop HAUT (badge non redescendu) : ${ecarts.haut.length}`);
  ecarts.haut.forEach((l) => console.log(`    - ${l}`));
  console.log(`  niveau trop BAS (attribution jamais faite) : ${ecarts.bas.length}`);
  ecarts.bas.forEach((l) => console.log(`    - ${l}`));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
