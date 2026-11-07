// CE QUI S'EST RÉELLEMENT PASSÉ LE 6 NOVEMBRE 2026 — lecture seule.
//
// DEUX QUESTIONS, et aucune ne se déduit du code :
//   ① La monitrice parle d'une « mini-compétition d'hier », mais `client_course_results` ne
//      porte AUCUN `miniCompetitionId` et son document le plus récent date du 20 juin. Par
//      quel chemin ses élèves ont-ils donc validé ? L'hypothèse à vérifier : les blocs DU
//      JOUR (`client_boulder_results`), qui est le chemin normal de cette salle.
//   ② La sonde Cloud Monitoring donne **44 219 lectures** le 06/11, contre 3 731 le jour du
//      contest. ⚠️ Un nombre sans attribution n'est pas interprétable : il faut savoir si ce
//      sont des grimpeurs ou MES scripts de maintenance. On mesure donc la TAILLE des
//      collections que ces scripts balaient, pour pouvoir comparer.
//
// ⚠️ Les comptes de collections utilisent `count()` (agrégation) : 1 lecture facturée par
// tranche de 1000 documents, au lieu d'une lecture par document. Cela pollue la journée
// COURANTE, ce qui est sans conséquence puisqu'on ne lit que des journées CLOSES.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '..', 'firestore-migration');
const app = initializeApp({ credential: cert(require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'))) });
const db = getFirestore(app);

const JOUR = process.env.JOUR || '2026-11-06';

const horodatage = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v.seconds) return new Date(v.seconds * 1000);
  if (typeof v === 'string') { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  return null;
};

(async () => {
  // ── ① Les validations de blocs du jour, le 6 novembre ──
  const debut = new Date(`${JOUR}T00:00:00.000Z`);
  const fin = new Date(`${JOUR}T23:59:59.999Z`);
  const snap = await db.collection('client_boulder_results').get();
  console.log(`\n══ client_boulder_results ══  ${snap.size} document(s) au total`);

  const duJour = snap.docs
    .map((d) => ({ id: d.id, ...d.data(), _at: horodatage(d.data().createdAt) }))
    .filter((r) => r._at && r._at >= debut && r._at <= fin)
    .sort((a, b) => a._at - b._at);

  const usersSnap = await db.collection('users').get();
  const users = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
  const nom = (uid) => {
    const d = users.get(uid);
    if (!d) return `(inconnu ${String(uid).slice(0, 6)})`;
    return [d.first_name, d.last_name].filter(Boolean).join(' ').trim() || d.displayName || d.email || uid.slice(0, 6);
  };

  console.log(`\n══ VALIDATIONS DU ${JOUR} ══  ${duJour.length} document(s)`);
  const parGrimpeur = new Map();
  duJour.forEach((r) => {
    if (!parGrimpeur.has(r.userId)) parGrimpeur.set(r.userId, []);
    parGrimpeur.get(r.userId).push(r);
  });
  console.log(`   ${parGrimpeur.size} grimpeur(s) distinct(s)`);
  const lignes = [...parGrimpeur.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([uid, liste]) => {
      const reussis = liste.filter((r) => r.success === true).length;
      const premier = liste[0]._at.toISOString().slice(11, 16);
      const dernier = liste[liste.length - 1]._at.toISOString().slice(11, 16);
      return `   ${nom(uid).padEnd(26)} ${String(liste.length).padStart(3)} saisie(s), ${String(reussis).padStart(3)} réussie(s)   ${premier}–${dernier} UTC`;
    });
  lignes.forEach((l) => console.log(l));
  if (duJour.length === 0) console.log('   → AUCUNE validation de bloc du jour ce jour-là.');

  // ── ② La taille des collections que les scripts de maintenance balaient ──
  console.log('\n══ TAILLE DES COLLECTIONS (pour attribuer les 44 219 lectures) ══');
  const collections = [
    'users', 'boulders', 'client_boulder_results', 'classement_profiles',
    'client_badges', 'badges', 'competitions', 'competition_results',
    'competition_participants', 'user_ludic_state', 'challenges',
    'client_course_results', 'courses', 'mini_competitions', 'competition_rankings',
  ];
  let total = 0;
  for (const nomColl of collections) {
    const agg = await db.collection(nomColl).count().get();
    const n = agg.data().count;
    total += n;
    console.log(`   ${nomColl.padEnd(28)} ${String(n).padStart(6)}`);
  }
  console.log(`   ${'TOTAL'.padEnd(28)} ${String(total).padStart(6)}`);

  console.log('\n(lecture seule : aucune écriture effectuée)');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC :', e); process.exit(1); });
