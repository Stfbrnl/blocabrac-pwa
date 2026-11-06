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

  // ✅ V2.78 — LE NIVEAU ATTENDU EST CELUI DE `resolveLevelSync`, et plus l'ancienne
  // formule. La différence porte sur une seule branche, et c'est tout le correctif : sans
  // `baseLevel` LISIBLE, le niveau ne bouge pas, donc l'attendu est le niveau COURANT.
  // L'ancienne formule écrivait `(d.baseLevel || 'bleu')` et aurait dénoncé comme « écart »
  // exactement les 9 comptes que le plancher protège — un audit qui contredit le code qu'il
  // surveille apprend à ignorer l'audit.
  const attenduPour = (d, uid) => {
    const atteintes = [...(parUid.get(uid) || [])].filter((c) => AVEC_BADGE.includes(c));
    if (atteintes.length) return atteintes.sort((a, b) => rang(b) - rang(a))[0];
    if (rang(d.level) < rang('violet')) return d.level;
    const base = d.baseLevel;
    const baseLisible = base && ORDRE.includes(base) && rang(base) < rang(d.level);
    return baseLisible ? base : d.level; // 🔴 le plancher : pas de cible => on ne bouge pas
  };

  // 🔴 LES COMPTES VERROUILLÉS NE SONT PLUS SAUTÉS EN SILENCE, ILS SONT COMPTÉS À PART.
  // Le `continue` d'avant était un piège mesuré le 06/11/2026 : au lendemain du contest,
  // 68 comptes sur 71 portaient `levelOverride`, l'audit n'en évaluait donc plus que 3 et
  // annonçait « ÉCARTS : 1 ». Les 21 écarts latents étaient intacts — simplement invisibles.
  // Un verrou MASQUE un écart, il ne le résout pas, et c'est précisément au déverrouillage
  // qu'il se matérialise. L'audit doit donc dire les deux nombres, toujours.
  const ecarts = { haut: [], bas: [] };
  const latents = { haut: [], bas: [] };
  let sansNiveau = 0;
  let verrouilles = 0;
  let sansBase = 0;
  for (const u of users.docs) {
    const d = u.data();
    if (!d.level) { sansNiveau += 1; continue; }
    if (!d.baseLevel || !ORDRE.includes(d.baseLevel)) sansBase += 1;
    const attendu = attenduPour(d, u.id);
    const verrouille = !!d.levelOverride;
    if (verrouille) verrouilles += 1;
    if (attendu === d.level) continue;
    const ligne = `${(`${d.first_name || ''} ${d.last_name || ''}`).trim() || u.id} : stocké ${d.level} -> attendu ${attendu}`;
    const cible = verrouille ? latents : ecarts;
    (rang(d.level) > rang(attendu) ? cible.haut : cible.bas).push(ligne);
  }

  console.log(`\n${users.size} comptes, ${sansNiveau} sans niveau (ignorés), ${verrouilles} verrouillé(s).`);
  console.log(`Comptes sans baseLevel lisible : ${sansBase}`);
  console.log('  (le niveau déclaré n\'existe que depuis V2.54.1 ; sur ces comptes le plancher');
  console.log('   de levelSync.ts est la seule chose qui empêche une valeur inventée)');

  console.log(`\nÉCARTS ACTIFS (niveau libre, la synchro agira au prochain « Mes stats ») : ${ecarts.haut.length + ecarts.bas.length}`);
  console.log(`  niveau trop HAUT (badge non redescendu) : ${ecarts.haut.length}`);
  ecarts.haut.forEach((l) => console.log(`    - ${l}`));
  console.log(`  niveau trop BAS (attribution jamais faite) : ${ecarts.bas.length}`);
  ecarts.bas.forEach((l) => console.log(`    - ${l}`));

  console.log(`\n🔴 ÉCARTS LATENTS (niveau VERROUILLÉ — ce que le déverrouillage révélera) : ${latents.haut.length + latents.bas.length}`);
  console.log(`  niveau trop HAUT : ${latents.haut.length}`);
  latents.haut.forEach((l) => console.log(`    - ${l}`));
  console.log(`  niveau trop BAS  : ${latents.bas.length}`);
  latents.bas.forEach((l) => console.log(`    - ${l}`));
  console.log('\n⚠️  Un écart latent « trop HAUT » est un niveau réglé à la main qui sera ramené');
  console.log('    vers son baseLevel au déverrouillage. Si ce baseLevel est antérieur au');
  console.log('    réglage, le déverrouillage DÉFAIT le réglage. À trancher avant, pas après.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
