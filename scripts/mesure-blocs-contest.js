// MESURE EN LECTURE SEULE — aucun write, aucune modification. Demande de ClaudeNav (03/11/2026).
//
//   node mesure-blocs-contest.js            → toutes les competitions non terminees
//   node mesure-blocs-contest.js <id|nom>   → une seule, par id ou par fragment de nom
//
// CE QU'IL MESURE : le poids du PREMIER chargement cote grimpeur, c'est-a-dire exactement ce
// que descend `loadBoulders` de ClientCompetitions.tsx. Les deux requetes sont recopiees
// a l'identique depuis ce fichier (competition_id + is_active + type, et competition_active
// pour les blocs quotidiens reutilises) : le SDK client n'a AUCUNE projection de champs, donc
// le document ENTIER descend, `image_base64` compris. C'est tout l'objet de la mesure.
//
// ⚠️ PROVENANCE DES CHIFFRES, a lire avant de les citer :
//   - le NOMBRE de documents et de `image_base64` est une OBSERVATION exacte ;
//   - le POIDS est serialise en JSON et compte ses octets UTF-8. Firestore transporte du
//     protobuf, pas du JSON, et le SDK ajoute ses en-tetes : le chiffre absolu est un ORDRE
//     DE GRANDEUR, pas le volume reseau. Ce qui est fiable, c'est la PART de chaque champ et
//     le RAPPORT entre les lignes. Pour le volume reel, l'onglet Reseau du navigateur reste
//     le seul instrument. (Meme reserve que scripts/measure-users-collection.js, dont ce
//     script reprend la forme.)
//   - un base64 est ~4/3 de l'octet binaire d'origine : une image de 150 Ko pese ~200 Ko ici.
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}

const db = getFirestore(initializeApp({ credential: cert(readServiceAccount()) }));

const octets = (v) => Buffer.byteLength(JSON.stringify(v === undefined ? null : v) || '', 'utf8');
const fmt = (n) => {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' Mo';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' Ko';
  return Math.round(n) + ' o';
};

const cible = process.argv[2] || null;

// Plafonds Firestore / du code, pour l'analyse de marge demandee par ClaudeNav.
const PLAFOND_FIRESTORE = 500;
const SEUIL_DECOUPAGE = 450; // utils/firestoreBatchChunks.ts (commit e13e74d)

async function mesurer(comp) {
  // ⚠️ Les deux requetes ci-dessous sont la RECOPIE de loadBoulders. Si ce fichier change,
  // cette mesure devient une transcription perimee : la relire avant de la rejouer.
  const [classiques, reutilises] = await Promise.all([
    db.collection('boulders')
      .where('competition_id', '==', comp.id)
      .where('is_active', '==', true)
      .where('type', '==', 'competition').get(),
    db.collection('boulders')
      .where('competition_id', '==', comp.id)
      .where('is_active', '==', true)
      .where('type', '==', 'daily')
      .where('competition_active', '==', true).get(),
  ]);

  const docs = [...classiques.docs, ...reutilises.docs];

  console.log('');
  console.log('='.repeat(78));
  console.log(`COMPETITION « ${comp.name} »  (${comp.id})`);
  console.log(`  statut : ${comp.status}   mode : ${comp.scoring_mode || 'blocabrac (defaut)'}   date : ${comp.date}`);
  console.log('='.repeat(78));

  // ⚠️ Affirmer la TAILLE avant d'affirmer quoi que ce soit sur l'ensemble.
  console.log(`Blocs rattaches ET actifs : ${docs.length}`);
  console.log(`   dont type 'competition' (crees pour l'epreuve) : ${classiques.size}`);
  console.log(`   dont type 'daily' reutilises (competition_active) : ${reutilises.size}`);

  if (docs.length === 0) {
    console.log('Aucun bloc rattache : rien a mesurer.');
    return;
  }

  let total = 0;
  let avecB64 = 0, poidsB64 = 0, maxB64 = 0;
  let avecCloudinary = 0;
  let avecMultiplicateur = 0;
  const parChamp = {};
  const lourds = [];

  for (const d of docs) {
    const data = d.data();
    const poids = octets(data);
    total += poids;
    lourds.push({ id: d.id, num: data.number, mur: data.wall, poids, b64: !!data.image_base64 });

    if (data.image_base64) {
      avecB64 += 1;
      const p = octets(data.image_base64);
      poidsB64 += p;
      if (p > maxB64) maxB64 = p;
    }
    if (data.image_public_id) avecCloudinary += 1;
    if (data.points_multiplier !== undefined && data.points_multiplier !== null) avecMultiplicateur += 1;

    for (const champ of Object.keys(data)) {
      parChamp[champ] = (parChamp[champ] || 0) + octets(data[champ]) + octets(champ);
    }
  }

  console.log('');
  console.log('--- LA REPONSE AUX DEUX QUESTIONS DE CLAUDENAV ---');
  console.log(`1. Blocs portant image_base64 : ${avecB64} sur ${docs.length}`);
  console.log(`   poids cumule de ces seuls champs : ${fmt(poidsB64)}`);
  console.log(`   la plus lourde a elle seule     : ${fmt(maxB64)}`);
  console.log(`   (pour comparaison, blocs servis par Cloudinary : ${avecCloudinary})`);
  console.log(`2. PREMIER CHARGEMENT COTE GRIMPEUR : ${fmt(total)}  (${total} octets)`);
  console.log(`   soit ${fmt(total / docs.length)} en moyenne par bloc`);
  console.log(`   part des image_base64 dans ce total : ${((poidsB64 / total) * 100).toFixed(1)} %`);
  console.log(`   poids si image_base64 n'existait pas : ${fmt(total - poidsB64)}`);

  console.log('');
  console.log('--- POIDS PAR CHAMP (les 12 plus lourds, tous blocs confondus) ---');
  Object.entries(parChamp).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([c, p]) => console.log(`   ${String(c).padEnd(24)} ${fmt(p).padStart(10)}  ${((p / total) * 100).toFixed(1).padStart(5)} %`));

  const top = lourds.sort((a, b) => b.poids - a.poids).slice(0, 8);
  if (top[0].poids > 20 * 1024) {
    console.log('');
    console.log('--- LES BLOCS LES PLUS LOURDS ---');
    top.forEach(b => console.log(`   n°${String(b.num).padEnd(5)} ${String(b.mur || '?').padEnd(22)} ${fmt(b.poids).padStart(10)}${b.b64 ? '   <- image_base64' : ''}`));
  }

  console.log('');
  console.log('--- LE PLAFOND DE 500 OPERATIONS (handleConfirmMigrate) ---');
  // La liste de l'ouvreur applique le meme filtre is_active, mais COTE CLIENT
  // (CompetitionBouldersList.tsx ligne 141) : l'ensemble parcouru par la cloture est donc
  // exactement celui mesure ci-dessus. UNE operation par bloc, dans les deux branches.
  console.log(`   « Terminer la competition » ecrira ${docs.length} operation(s) : 1 par bloc actif.`);
  console.log(`   Plafond Firestore ${PLAFOND_FIRESTORE} -> marge ${PLAFOND_FIRESTORE - docs.length}. Seuil de decoupage ${SEUIL_DECOUPAGE} -> ${docs.length > SEUIL_DECOUPAGE ? 'DEPASSE, plusieurs lots' : 'un seul lot, geste inchange'}.`);
  console.log(`   Blocs portant deja un points_multiplier : ${avecMultiplicateur}`);
}

async function main() {
  const snap = await db.collection('competitions').get();
  const toutes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Collection "competitions" : ${toutes.length} document(s) au total.`);

  let retenues = toutes.filter(c => c.status !== 'terminée' && c.status !== 'annulée');
  if (cible) {
    retenues = toutes.filter(c => c.id === cible || (c.name || '').toLowerCase().includes(cible.toLowerCase()));
  }

  console.log(`Retenues pour la mesure : ${retenues.length}`);
  retenues.forEach(c => console.log(`   - « ${c.name} » (${c.status})`));
  if (retenues.length === 0) {
    console.log('Rien a mesurer. Statuts presents : ' + [...new Set(toutes.map(c => c.status))].join(', '));
    return;
  }

  for (const c of retenues) await mesurer(c);

  console.log('');
  console.log('⚠️  Poids = JSON/UTF-8, un ORDRE DE GRANDEUR (Firestore transporte du protobuf).');
  console.log('⚠️  Les NOMBRES de documents, eux, sont des observations exactes.');
  console.log('✔️  Aucune ecriture effectuee : ce script ne fait que des .get().');
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE VIVIER — ce que PESERA le premier chargement une fois les blocs rattaches.
//
// Pourquoi ce mode existe : la mesure sur « les blocs rattaches au Contest » a rendu ZERO
// (03/11/2026). La question de decision n'est donc pas « combien pesent-ils » mais « combien
// peseront-ils », et la reponse se lit sur le VIVIER : les blocs quotidiens actifs, qui sont
// exactement ce que « Ajouter des blocs quotidiens existants » propose de rattacher
// (CompetitionBouldersList.tsx ligne 161 : type == 'daily' && is_active == true).
//
// ⚠️ C'est une PROJECTION, pas une observation de l'etat final : elle suppose que tout le
// vivier hors murs enfants sera rattache. Le nombre de documents, leur poids et leur
// repartition par mur, eux, sont observes.
const { wallCategories } = (() => {
  // Les murs « enfants » sont declares dans frontend/src/config/gymConfig.ts (kidsOnly).
  // On les relit depuis la SOURCE plutot que de recopier la liste ici : une liste recopiee
  // vieillit en silence le jour ou un mur change de categorie.
  const src = fs.readFileSync(path.join(__dirname, '../frontend/src/config/gymConfig.ts'), 'utf8');
  const bloc = src.slice(src.indexOf('export const wallCategories'));
  const corps = bloc.slice(bloc.indexOf('{'), bloc.indexOf('};') + 1);
  const out = {};
  for (const m of corps.matchAll(/'([^']+)'\s*:\s*\{[^}]*kidsOnly:\s*(true|false)/g)) {
    out[m[1]] = { kidsOnly: m[2] === 'true' };
  }
  for (const m of corps.matchAll(/"([^"]+)"\s*:\s*\{[^}]*kidsOnly:\s*(true|false)/g)) {
    out[m[1]] = { kidsOnly: m[2] === 'true' };
  }
  return { wallCategories: out };
})();

async function vivier() {
  const snap = await db.collection('boulders')
    .where('type', '==', 'daily')
    .where('is_active', '==', true).get();

  console.log('');
  console.log('='.repeat(78));
  console.log('VIVIER — blocs quotidiens ACTIFS (ce que le rattachement propose)');
  console.log('='.repeat(78));
  console.log(`Total : ${snap.size} bloc(s)`);

  const murs = {};
  let totalTous = 0;
  let b64Tous = 0, poidsB64Tous = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const mur = data.wall || '(sans mur)';
    const poids = octets(data);
    const pb64 = data.image_base64 ? octets(data.image_base64) : 0;
    murs[mur] = murs[mur] || { n: 0, poids: 0, b64: 0, poidsB64: 0, mult: 0, compActive: 0 };
    murs[mur].n += 1;
    murs[mur].poids += poids;
    if (pb64) { murs[mur].b64 += 1; murs[mur].poidsB64 += pb64; b64Tous += 1; poidsB64Tous += pb64; }
    if (data.points_multiplier !== undefined && data.points_multiplier !== null) murs[mur].mult += 1;
    if (data.competition_active) murs[mur].compActive += 1;
    totalTous += poids;
  }

  console.log('');
  console.log('--- PAR MUR ---');
  console.log('   ' + 'mur'.padEnd(24) + 'blocs'.padStart(6) + 'poids'.padStart(11) + 'img_b64'.padStart(9) + 'poids b64'.padStart(11) + '  enfants');
  const lignes = Object.entries(murs).sort((a, b) => b[1].n - a[1].n);
  for (const [mur, m] of lignes) {
    const kids = wallCategories[mur] ? (wallCategories[mur].kidsOnly ? 'OUI' : '') : '?inconnu';
    console.log('   ' + mur.padEnd(24) + String(m.n).padStart(6) + fmt(m.poids).padStart(11) + String(m.b64).padStart(9) + fmt(m.poidsB64).padStart(11) + '  ' + kids);
  }

  // La projection demandee : tout le vivier SAUF les murs enfants.
  const retenus = lignes.filter(([mur]) => !(wallCategories[mur] && wallCategories[mur].kidsOnly));
  const exclus = lignes.filter(([mur]) => wallCategories[mur] && wallCategories[mur].kidsOnly);
  const nRetenus = retenus.reduce((s, [, m]) => s + m.n, 0);
  const poidsRetenus = retenus.reduce((s, [, m]) => s + m.poids, 0);
  const b64Retenus = retenus.reduce((s, [, m]) => s + m.b64, 0);
  const poidsB64Retenus = retenus.reduce((s, [, m]) => s + m.poidsB64, 0);

  console.log('');
  console.log('--- PROJECTION : toute la salle SAUF les murs enfants ---');
  console.log(`   murs exclus (kidsOnly) : ${exclus.map(([m]) => m).join(', ') || 'aucun'}  → ${exclus.reduce((s, [, m]) => s + m.n, 0)} bloc(s) ecartes`);
  console.log(`   blocs rattaches : ${nRetenus}`);
  console.log(`   PREMIER CHARGEMENT COTE GRIMPEUR : ${fmt(poidsRetenus)}  (${poidsRetenus} octets)`);
  console.log(`      moyenne par bloc : ${fmt(poidsRetenus / Math.max(nRetenus, 1))}`);
  console.log(`      blocs portant image_base64 : ${b64Retenus} sur ${nRetenus}`);
  console.log(`      poids de ces image_base64 : ${fmt(poidsB64Retenus)}  = ${((poidsB64Retenus / Math.max(poidsRetenus, 1)) * 100).toFixed(1)} % du total`);
  console.log(`      poids sans les image_base64 : ${fmt(poidsRetenus - poidsB64Retenus)}`);

  console.log('');
  console.log('--- LE PLAFOND DE 500 OPERATIONS, sur cette projection ---');
  console.log(`   rattachement : ${nRetenus} operation(s)  | cloture : ${nRetenus} operation(s)  | 1 par bloc`);
  console.log(`   plafond Firestore ${PLAFOND_FIRESTORE} → marge ${PLAFOND_FIRESTORE - nRetenus}`);
  console.log(`   seuil de decoupage ${SEUIL_DECOUPAGE} → ${nRetenus > SEUIL_DECOUPAGE ? 'DEPASSE : plusieurs lots' : 'un seul lot, geste identique a avant'}`);
  console.log(`   blocs portant deja un points_multiplier : ${lignes.reduce((s, [, m]) => s + m.mult, 0)}`);
  console.log(`   blocs portant deja competition_active : ${lignes.reduce((s, [, m]) => s + m.compActive, 0)}`);
}

main()
  .then(() => vivier())
  .then(() => {
    console.log('');
    console.log('⚠️  Le mode VIVIER est une PROJECTION (suppose tout rattache sauf murs enfants).');
    console.log('✔️  Aucune ecriture : uniquement des .get().');
    process.exit(0);
  })
  .catch(e => { console.error('ECHEC :', e.message); process.exit(1); });
