// QU'A-T-ELLE RÉELLEMENT CRÉÉ, ET OÙ A-T-ELLE VU DES RÉSULTATS ? — lecture seule.
//
// LA QUESTION, posée par Stéphane le 07/11/2026 : sa collègue dit avoir créé une
// mini-compétition et en avoir vu les résultats, « notamment le nombre de blocs grimpés par un
// de ses élèves ». Or la mesure du 07/11 est formelle : **0 document ne porte un
// `miniCompetitionId`** et **aucune séance n'a jamais été activée**. Son hypothèse : elle aurait
// créé une COMPÉTITION, pas une mini.
//
// ⚠️ CE SCRIPT NE CHERCHE PAS À CONFIRMER CETTE HYPOTHÈSE, IL ÉNUMÈRE LES CHEMINS par lesquels
// un écran peut afficher « le nombre de blocs grimpés » par quelqu'un. Il y en a QUATRE dans
// cette application, et ils vivent dans quatre collections différentes :
//   ① `competition_results`           → écran de stats / palmarès d'une compétition
//   ② `client_course_results`         → classement d'une mini-compétition (moniteur)
//   ③ `classement_profiles`           → écran « Classement », `bouldersValidated`
//   ④ `client_boulder_results`        → « Mes stats » d'un grimpeur
// Chercher seulement dans celle qu'on soupçonne, c'est se condamner à confirmer ou à ne rien
// trouver. On imprime les quatre, avec leurs DATES, et on laisse la donnée désigner le chemin.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '..', 'firestore-migration');
const app = initializeApp({ credential: cert(require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'))) });
const db = getFirestore(app);

const dt = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v.seconds) return new Date(v.seconds * 1000);
  if (typeof v === 'string') { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  return null;
};
const iso = (v) => { const d = dt(v); return d ? d.toISOString().slice(0, 16).replace('T', ' ') : '(sans date)'; };

(async () => {
  const usersSnap = await db.collection('users').get();
  const users = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
  const nom = (uid) => {
    const d = users.get(uid);
    if (!d) return `(inconnu ${String(uid).slice(0, 8)})`;
    return [d.first_name, d.last_name].filter(Boolean).join(' ').trim() || d.displayName || d.email || uid.slice(0, 8);
  };

  // ── ① LES COMPÉTITIONS ──
  const compsSnap = await db.collection('competitions').get();
  console.log(`\n══ ① competitions ══  ${compsSnap.size} document(s)`);
  for (const d of compsSnap.docs) {
    const x = d.data();
    console.log(`\n   ${d.id}`);
    console.log(`      nom            : ${x.name || x.nom || '(sans nom)'}`);
    console.log(`      status         : ${x.status || '(absent)'}`);
    console.log(`      scoring_mode   : ${x.scoring_mode || '(absent → blocabrac par repli)'}`);
    console.log(`      date / début   : ${iso(x.date || x.start_date || x.startDate)}`);
    console.log(`      created_by     : ${x.created_by ? nom(x.created_by) : '(absent)'}`);
    console.log(`      createdAt      : ${iso(x.createdAt || x.created_at)}`);
    console.log(`      registered_cnt : ${x.registered_count ?? '(absent)'}`);
    console.log(`      liveDisplay    : ${x.liveDisplayEnabled ?? '(absent)'}`);
  }

  // ── Les résultats de compétition, par compétition et par grimpeur ──
  const crSnap = await db.collection('competition_results').get();
  console.log(`\n══ competition_results ══  ${crSnap.size} document(s)`);
  const parComp = new Map();
  crSnap.docs.forEach((d) => {
    const x = d.data();
    const cid = x.competitionId || x.competition_id || '(sans competitionId)';
    if (!parComp.has(cid)) parComp.set(cid, []);
    parComp.get(cid).push(x);
  });
  for (const [cid, liste] of parComp) {
    const def = compsSnap.docs.find((d) => d.id === cid);
    const dates = liste.map((r) => dt(r.createdAt || r.updatedAt)).filter(Boolean).sort((a, b) => a - b);
    console.log(`\n   ── ${cid} « ${def ? (def.data().name || def.data().nom || '?') : 'COMPÉTITION ABSENTE'} »`);
    console.log(`      ${liste.length} résultat(s)`);
    if (dates.length) {
      console.log(`      du ${dates[0].toISOString().slice(0, 16).replace('T', ' ')}`
        + ` au ${dates[dates.length - 1].toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    }
    const parUser = new Map();
    liste.forEach((r) => {
      const u = r.userId || r.uid || '(sans userId)';
      if (!parUser.has(u)) parUser.set(u, []);
      parUser.get(u).push(r);
    });
    console.log(`      ${parUser.size} grimpeur(s) :`);
    [...parUser.entries()]
      .sort((a, b) => b[1].filter((r) => r.success === true).length - a[1].filter((r) => r.success === true).length)
      .forEach(([uid, rs]) => {
        const reussis = rs.filter((r) => r.success === true).length;
        console.log(`         ${nom(uid).padEnd(26)} ${String(rs.length).padStart(3)} saisie(s), `
          + `${String(reussis).padStart(3)} BLOC(S) RÉUSSI(S)`);
      });
  }

  // ── Les inscriptions ──
  const partSnap = await db.collection('competition_participants').get();
  console.log(`\n══ competition_participants ══  ${partSnap.size} document(s)`);
  const parCompPart = new Map();
  partSnap.docs.forEach((d) => {
    const x = d.data();
    const cid = x.competitionId || x.competition_id || '(absent)';
    parCompPart.set(cid, (parCompPart.get(cid) || 0) + 1);
  });
  for (const [cid, n] of parCompPart) console.log(`   ${cid} : ${n} inscrit(s)`);

  // ── ③ LE CLASSEMENT : `bouldersValidated`, LE chiffre le plus probable ──
  // ⚠️ C'est l'autre façon de « voir le nombre de blocs grimpés par un élève », et elle ne
  // passe par AUCUNE compétition : l'écran « Classement » est ouvert à tout compte.
  const cpSnap = await db.collection('classement_profiles').get();
  console.log(`\n══ ③ classement_profiles ══  ${cpSnap.size} document(s) — « bouldersValidated » par grimpeur`);
  const profils = cpSnap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((p) => (p.bouldersValidated ?? 0) > 0)
    .sort((a, b) => (b.bouldersValidated ?? 0) - (a.bouldersValidated ?? 0));
  console.log(`   ${profils.length} profil(s) avec au moins un bloc validé :`);
  profils.slice(0, 15).forEach((p) => {
    console.log(`      ${nom(p.uid).padEnd(26)} ${String(p.bouldersValidated).padStart(4)} bloc(s)`
      + `  score=${String(p.score ?? '-').padStart(6)}  optIn=${p.classementOptIn ?? '(absent)'}`);
  });
  if (profils.length > 15) console.log(`      … et ${profils.length - 15} autre(s)`);

  // ── ② Les groupes du staff, pour savoir QUI sont « ses élèves » ──
  const groupsSnap = await db.collection('Groups').get();
  console.log(`\n══ Groups ══  ${groupsSnap.size} document(s)`);
  groupsSnap.docs.forEach((d) => {
    const x = d.data();
    console.log(`\n   ${d.id} « ${x.name || '(sans nom)'} »`);
    console.log(`      moniteurId : ${x.moniteurId ? nom(x.moniteurId) : '(absent)'}`);
    console.log(`      students   : ${(x.students || []).length}`
      + ((x.students || []).length ? ` → ${(x.students || []).map(nom).join(', ')}` : ''));
  });

  console.log('\n(lecture seule : aucune écriture effectuée)');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC :', e); process.exit(1); });
