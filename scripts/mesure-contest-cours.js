// LE « CONTEST COURS » DU 6 NOVEMBRE — lecture seule.
//
// ⚠️ POURQUOI UN SECOND SCRIPT. Le premier a groupé les 264 résultats sous un seul grimpeur
// « (sans userId) » : il cherchait `userId` ou `uid`, et `competition_results` ne porte ni l'un
// ni l'autre. **Un script qui ne trouve pas son champ rend un chiffre FAUX, pas une erreur** —
// « 1 grimpeur » au lieu de 11, et le nombre avait l'air plausible. On commence donc par
// IMPRIMER LES CLÉS d'un document au lieu de supposer leur nom.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '..', 'firestore-migration');
const app = initializeApp({ credential: cert(require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'))) });
const db = getFirestore(app);

const COMP = process.env.COMP || 'Ua1eJIlPxEIv8oHEOHTH';

const dt = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v.seconds) return new Date(v.seconds * 1000);
  if (typeof v === 'string') { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  return null;
};

(async () => {
  const usersSnap = await db.collection('users').get();
  const users = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
  const nom = (uid) => {
    const d = users.get(uid);
    if (!d) return `(hors users ${String(uid).slice(0, 10)})`;
    return [d.first_name, d.last_name].filter(Boolean).join(' ').trim() || d.displayName || d.email || uid.slice(0, 10);
  };

  const snap = await db.collection('competition_results').get();
  const tous = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));

  // ① LES CLÉS RÉELLES, observées et non supposées.
  console.log('\n══ ① LES CHAMPS RÉELS d\'un document de competition_results ══');
  const exemple = tous[0];
  console.log(`   identifiant du document : ${exemple._id}`);
  Object.keys(exemple).filter((k) => k !== '_id').sort().forEach((k) => {
    const v = exemple[k];
    const t = v === null ? 'null' : (typeof v.toDate === 'function' ? 'Timestamp' : typeof v);
    console.log(`      ${k.padEnd(22)} ${t.padEnd(10)} ${JSON.stringify(v)?.slice(0, 50) ?? ''}`);
  });
  // Et l'union des clés sur toute la collection : un champ peut manquer sur certains documents.
  const toutesCles = new Set();
  tous.forEach((r) => Object.keys(r).forEach((k) => toutesCles.add(k)));
  console.log(`\n   union des clés sur les ${tous.length} documents : ${[...toutesCles].sort().join(', ')}`);

  // ② LE GRIMPEUR SE DÉDUIT DE L'IDENTIFIANT DU DOCUMENT si aucun champ ne le porte.
  // L'identifiant déterministe de cette collection est `${uid}_${boulderId}` (ClientCompetitions).
  const uidDepuisId = (id) => {
    const u = id.split('_')[0];
    return users.has(u) ? u : null;
  };
  const champUser = ['userId', 'uid', 'user_id', 'clientId', 'participantId']
    .find((c) => toutesCles.has(c)) || null;
  console.log(`\n   champ portant le grimpeur : ${champUser || 'AUCUN → déduit de l\'identifiant du document'}`);

  // ③ LE RELEVÉ DE CETTE COMPÉTITION, par grimpeur.
  const liste = tous.filter((r) => (r.competitionId || r.competition_id) === COMP);
  console.log(`\n══ ② « Contest cours » (${COMP}) : ${liste.length} résultat(s) ══`);
  const parUser = new Map();
  let orphelins = 0;
  liste.forEach((r) => {
    const uid = (champUser && r[champUser]) || uidDepuisId(r._id);
    if (!uid) { orphelins += 1; return; }
    if (!parUser.has(uid)) parUser.set(uid, []);
    parUser.get(uid).push(r);
  });
  // ⚠️ Affirmer la TAILLE : le total par grimpeur doit égaler le nombre de résultats.
  const somme = [...parUser.values()].reduce((t, l) => t + l.length, 0);
  console.log(`   ${parUser.size} grimpeur(s) identifié(s), ${orphelins} non rattaché(s)`);
  console.log(`   contrôle : ${somme} + ${orphelins} = ${somme + orphelins} (attendu ${liste.length})`
    + `${somme + orphelins === liste.length ? ' ✔' : ' 🔴 ÉCART'}`);

  console.log('');
  [...parUser.entries()]
    .map(([uid, rs]) => {
      const reussis = rs.filter((r) => r.success === true).length;
      const dates = rs.map((r) => dt(r.createdAt || r.updatedAt)).filter(Boolean).sort((a, b) => a - b);
      return { uid, total: rs.length, reussis, dates, submitted: rs.some((r) => r.submitted === true) };
    })
    .sort((a, b) => b.reussis - a.reussis)
    .forEach((e) => {
      const creneau = e.dates.length
        ? `${e.dates[0].toISOString().slice(11, 16)}–${e.dates[e.dates.length - 1].toISOString().slice(11, 16)} UTC`
        : '(sans date)';
      console.log(`   ${nom(e.uid).padEnd(26)} ${String(e.reussis).padStart(3)} bloc(s) réussi(s)`
        + ` / ${String(e.total).padStart(3)} saisie(s)   ${creneau}`
        + `   ${e.submitted ? 'SOUMIS' : 'non soumis'}`);
    });

  // ④ LA CHRONOLOGIE, à la minute : c'est elle qui situe le déploiement de V2.80.
  const dates = liste.map((r) => dt(r.createdAt || r.updatedAt)).filter(Boolean).sort((a, b) => a - b);
  if (dates.length) {
    console.log(`\n══ ③ CHRONOLOGIE (UTC ; heure locale = UTC+1 en novembre) ══`);
    console.log(`   première écriture : ${dates[0].toISOString().slice(0, 16).replace('T', ' ')}`
      + ` (soit ${new Date(dates[0].getTime() + 3600000).toISOString().slice(11, 16)} locale)`);
    console.log(`   dernière écriture : ${dates[dates.length - 1].toISOString().slice(0, 16).replace('T', ' ')}`
      + ` (soit ${new Date(dates[dates.length - 1].getTime() + 3600000).toISOString().slice(11, 16)} locale)`);
    // Densité par tranche de 10 minutes : un trou dit quelque chose.
    const paquets = new Map();
    dates.forEach((d) => {
      const k = `${d.toISOString().slice(11, 15)}0`;
      paquets.set(k, (paquets.get(k) || 0) + 1);
    });
    console.log('\n   écritures par tranche de 10 min (UTC) :');
    [...paquets.entries()].sort().forEach(([k, n]) => {
      console.log(`      ${k}  ${'█'.repeat(Math.min(60, n))} ${n}`);
    });
  }

  // ⑤ LES INSCRITS, pour comparer au nombre de grimpeurs ayant réellement validé.
  const partSnap = await db.collection('competition_participants').get();
  const inscrits = partSnap.docs
    .map((d) => ({ _id: d.id, ...d.data() }))
    .filter((p) => (p.competitionId || p.competition_id) === COMP);
  console.log(`\n══ ④ INSCRITS à cette compétition : ${inscrits.length} ══`);
  inscrits.forEach((p) => {
    const uid = p.uid || p.userId || p._id.split('_')[0];
    const aValide = parUser.has(uid);
    console.log(`   ${aValide ? '✔' : '✘'} ${nom(uid).padEnd(26)}`
      + `${aValide ? `${parUser.get(uid).filter((r) => r.success === true).length} réussi(s)` : 'AUCUNE validation'}`);
  });

  console.log('\n(lecture seule : aucune écriture effectuée)');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC :', e); process.exit(1); });
