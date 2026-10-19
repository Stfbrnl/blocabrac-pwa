// Mesure du TAUX DE FLASH en production — lecture seule, aucun mode --fix, aucune écriture.
//
// POURQUOI. Le coût en écritures d'une soirée de compétition dépend d'une grandeur de la salle
// et pas du code : sur l'écran compétition, `defaultValidationResult.attempts` vaut 1, donc un
// bloc réussi au premier essai est déjà dans l'état que « Réussi » vient de persister et la
// sélection « 1 essai » n'écrit RIEN (dédoublonnage `lastPersistedRef`, V2.75). Tout autre
// nombre écrit une seconde fois. Voir `frontend/test/measure-competition-writes-browser.mjs`,
// qui mesure les deux bornes : 23 écritures par grimpeur si tout passe au premier essai, 43 si
// rien n'y passe.
//
// Ce script situe le curseur entre les deux, à partir de ce que la base contient déjà
// (ClaudeNav, `docs/handoffs/2026-10-19-CN-apres-le-nombre.md` §1).
//
// ⚠️ ET LE BIAIS EST ANNONCÉ, PAS CORRIGÉ. Ce taux est mesuré sur `client_boulder_results`,
// c'est-à-dire sur des blocs DU JOUR : le grimpeur les voit, les connaît, les répète. Les blocs
// d'une grosse compétition sont découverts à vue et cotés « Mystère ». **Le taux de flash en
// compétition sera donc plus BAS que celui du quotidien** — on ne sait pas de combien, on sait
// dans quel sens. Ce chiffre n'est donc pas une prédiction : il ÉLAGUE LA MOITIÉ BASSE de
// l'intervalle d'écritures, puisqu'il surestime le flash. La borne haute, elle, tient.
//
// ⚠️ Et il ne faut pas confondre les deux populations : `competition_results` serait plus juste
// en nature et inutilisable en volume (une compétition, deux participations). Sa TAILLE est
// imprimée quand même, parce qu'il faut savoir qu'elle est trop petite plutôt que le supposer —
// mais aucun taux n'en est tiré.
//
// 🔴 ET LE PIÈGE PRINCIPAL EST DANS LA DONNÉE ELLE-MÊME, PAS DANS LE BIAIS CI-DESSUS.
// Jusqu'à V2.69 (déployée le 25/09/2026), l'écran des blocs du jour avait une VALEUR PAR
// DÉFAUT à 1 essai — son propre changelog l'annonce : « Le nombre d'essais se choisit avant
// de valider Réussi : plus de valeur par défaut à 1 essai. » Tout résultat antérieur dont le
// grimpeur n'a pas touché le Select porte donc `attempts: 1` SANS avoir été flashé.
//
// Un taux calculé sur toute la collection n'est donc pas un taux de flash : c'est un mélange
// de flashs et de valeurs par défaut, et il penche fortement du mauvais côté. D'où le
// découpage sur `createdAt` (immuable, donc date bien la première saisie) : seule la
// population POSTÉRIEURE au 25/09/2026 porte un choix délibéré.
//
//   node scripts/mesure-taux-de-flash.js
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

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)} %`);

// Date de déploiement de V2.69, qui a supprimé la valeur par défaut à 1 essai.
const BASCULE_V269 = '2026-09-25';

async function main() {
  console.log('════ TAUX DE FLASH EN PRODUCTION (lecture seule) ════\n');

  // ─── Les blocs du jour : la population utilisable ────────────────────────────────
  const snap = await db.collection('client_boulder_results').get();
  const distribution = new Map();
  const distributionApres = new Map();
  let reussites = 0;
  let echecs = 0;
  let reussitesSansEssais = 0;
  let sansDate = 0;
  let avecEssaisApres = 0;

  for (const d of snap.docs) {
    const x = d.data();
    if (!x.success) { echecs += 1; continue; }
    reussites += 1;
    // ⚠️ `attempts: null` sur une réussite est un état légal (note seule, saisie ancienne) et
    // n'est PAS un flash : le compter comme 1 gonflerait le taux dans le sens du minorant,
    // c'est-à-dire dans le mauvais sens. Compté à part.
    if (typeof x.attempts !== 'number') { reussitesSansEssais += 1; continue; }
    distribution.set(x.attempts, (distribution.get(x.attempts) || 0) + 1);
    // Population POSTÉRIEURE à V2.69 : la seule où 1 essai est un choix et non un défaut.
    // ⚠️ Une saisie sans `createdAt` est comptée comme ANCIENNE (donc exclue), jamais comme
    // récente : un repli dans le sens permissif gonflerait le taux.
    if (typeof x.createdAt !== 'string') { sansDate += 1; continue; }
    if (x.createdAt.slice(0, 10) >= BASCULE_V269) {
      distributionApres.set(x.attempts, (distributionApres.get(x.attempts) || 0) + 1);
      avecEssaisApres += 1;
    }
  }

  const avecEssais = reussites - reussitesSansEssais;
  const flashs = distribution.get(1) || 0;
  const flashsApres = distributionApres.get(1) || 0;

  console.log(`client_boulder_results : ${snap.size} document(s)`);
  console.log(`  dont réussites : ${reussites}  (échecs : ${echecs})`);
  console.log(`  réussites avec un nombre d'essais : ${avecEssais}`);
  console.log(`  réussites sans nombre d'essais (non comptées) : ${reussitesSansEssais}`);
  console.log('\n  distribution du nombre d\'essais sur les réussites :');
  for (const n of [...distribution.keys()].sort((a, b) => a - b)) {
    const c = distribution.get(n);
    const barre = '█'.repeat(Math.max(1, Math.round((c / avecEssais) * 40)));
    console.log(`    ${String(n).padStart(3)} essai(s) : ${String(c).padStart(4)}  ${pct(c, avecEssais).padStart(7)}  ${barre}`);
  }

  console.log(`\n  ➜ Taux de 1 essai sur TOUTE la collection : ${flashs}/${avecEssais} = `
    + `${pct(flashs, avecEssais)}  🔴 CONTAMINÉ, ne pas utiliser`);
  console.log('     (mélange de flashs et de la valeur par défaut d\'avant V2.69)');

  console.log(`\n  ── Seule population exploitable : créée depuis le ${BASCULE_V269} ──`);
  console.log(`  ${avecEssaisApres} réussite(s) avec essais, sur ${avecEssais} au total`
    + `${sansDate > 0 ? ` (${sansDate} sans createdAt, comptée(s) comme anciennes)` : ''}`);
  for (const n of [...distributionApres.keys()].sort((a, b) => a - b)) {
    const c = distributionApres.get(n);
    console.log(`    ${String(n).padStart(3)} essai(s) : ${String(c).padStart(4)}  ${pct(c, avecEssaisApres).padStart(7)}`);
  }
  if (avecEssaisApres < 50) {
    console.log(`\n  ⚠️  POPULATION TROP PETITE (${avecEssaisApres}) pour un taux : affichée pour`);
    console.log('      qu\'on sache qu\'elle est trop petite, pas pour qu\'on l\'utilise.');
  }
  console.log(`\n  ➜ TAUX DE FLASH RETENU : ${flashsApres}/${avecEssaisApres} = `
    + `${pct(flashsApres, avecEssaisApres)}`);

  // ─── Les blocs de compétition : la taille, pas un taux ───────────────────────────
  const comp = await db.collection('competition_results').get();
  let compReussites = 0;
  let compFlashs = 0;
  for (const d of comp.docs) {
    const x = d.data();
    if (!x.success) continue;
    compReussites += 1;
    if (x.attempts === 1) compFlashs += 1;
  }
  console.log(`\ncompetition_results : ${comp.size} document(s), dont ${compReussites} réussite(s).`);
  if (compReussites < 100) {
    console.log(`  ⚠️  TROP PEU pour en tirer un taux (${compFlashs} à 1 essai) — population affichée`);
    console.log('      pour qu\'on sache qu\'elle est trop petite, pas pour qu\'on l\'utilise.');
  } else {
    console.log(`  ➜ taux de flash en compétition : ${compFlashs}/${compReussites} = ${pct(compFlashs, compReussites)}`);
    console.log('      (population désormais suffisante : c\'est CE taux qu\'il faut utiliser.)');
  }

  // ─── Ce que ça fait aux bornes d'écritures ───────────────────────────────────────
  // ⚠️ Arithmétique explicite, et chaque part étiquetée : 1 écriture par bloc réussi au
  // premier essai, 2 sinon, plus 2 (inscription) + 1 (verrouillage) par grimpeur. Les deux
  // nombres de blocs et de participants sont des SUPPOSITIONS, pas des mesures.
  const BLOCS = Number(process.env.FLASH_BLOCS || 20);
  const PARTICIPANTS = Number(process.env.FLASH_PARTICIPANTS || 80);
  const PLAFOND = 20000;
  const taux = avecEssaisApres > 0 ? flashsApres / avecEssaisApres : 0;
  const parGrimpeur = 2 + 1 + BLOCS * (1 * taux + 2 * (1 - taux));
  const total = Math.round(parGrimpeur * PARTICIPANTS);

  console.log('\n──── Ce que ce taux fait aux bornes mesurées ────');
  console.log(`  MESURÉ   : taux de flash ${pct(flashsApres, avecEssaisApres)} sur ${avecEssaisApres} réussite(s) `
    + `depuis V2.69 (blocs du jour, biais connu : surestime le contest)`);
  console.log(`  SUPPOSÉ  : ${BLOCS} blocs × ${PARTICIPANTS} participants`);
  console.log(`  ➜ ${parGrimpeur.toFixed(1)} écritures/grimpeur → ${total} au total, `
    + `${(total / PLAFOND * 100).toFixed(1)} % du plafond`);
  console.log('\n  ⚠️  CE CHIFFRE EST UN MINORANT, pas une prédiction : il surestime le flash,');
  console.log('      puisqu\'un bloc du jour se répète et qu\'un bloc de contest se découvre.');
  console.log(`      La borne haute mesurée (aucun flash) reste la valeur de dimensionnement :`);
  console.log(`      ${(2 + 1 + BLOCS * 2) * PARTICIPANTS} écritures, `
    + `${((2 + 1 + BLOCS * 2) * PARTICIPANTS / PLAFOND * 100).toFixed(1)} % du plafond.`);
  console.log('\n  ⚠️  Et aucun de ces pourcentages ne tient compte de ce qu\'une journée de salle');
  console.log('      ordinaire a déjà consommé : ils sont calculés contre le plafond ENTIER.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('MESURE_ECHEC', err); process.exit(1); });
