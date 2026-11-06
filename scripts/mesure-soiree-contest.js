// MESURE EN LECTURE SEULE de la soiree du 5 novembre 2026 — aucun write.
//
// LA QUESTION, et rien d'autre : sur les 696 ecritures Firestore du 5 novembre (Cloud
// Monitoring, journee CLOSE, `scripts/sonde-metriques-firestore.cjs`), quelle part revient aux
// GRIMPEURS et quelle part aux gestes d'administration faits le meme jour ? Sans cette
// separation, « 696 / 6 participants = 116 ecritures par grimpeur » serait un chiffre faux
// d'un facteur inconnu, et il aurait l'air d'une mesure.
//
// ⚠️ PROVENANCE, a lire avant de citer un seul de ces nombres :
//   - OBSERVE : tout ce qui vient d'un `snap.size` ou d'un champ de document.
//   - DEDUIT  : les lignes d'attribution d'ecritures, annoncees comme telles. Un document
//     `competition_results` est ecrit PLUSIEURS fois (saisie debouncee) : son nombre est donc
//     un MINORANT du nombre d'ecritures, jamais une mesure. Ce script dit lequel est lequel et
//     ne totalise jamais les deux natures sans le nommer.
//   - Le total 696 n'est PAS mesure ici : il vient de la sonde. Ce script mesure ce qui peut
//     l'expliquer, et laisse le reste explicitement « non attribue ».
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '../firestore-migration');
function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'));
}
const db = getFirestore(initializeApp({ credential: cert(readServiceAccount()) }));

const JOUR = process.env.JOUR || '2026-11-05';
const n = (x) => Number(x || 0).toLocaleString('fr-FR');

(async () => {
  console.log('════ SOIREE DU ' + JOUR + ' — mesure en lecture seule ════\n');

  // ── Les competitions, pour choisir la cible par OBSERVATION et non par supposition ──
  const comps = await db.collection('competitions').get();
  console.log('── Competitions en base (' + comps.size + ') ──');
  const candidates = [];
  comps.forEach((d) => {
    const c = d.data();
    console.log('  ' + d.id + '  | ' + (c.name || c.nom || '(sans nom)')
      + '  | statut=' + (c.status || '?')
      + '  | mode=' + (c.scoring_mode || 'blocabrac (defaut)')
      + '  | inscrits=' + (c.registered_count ?? '—')
      + '  | date=' + (c.date || c.start_date || '—'));
    candidates.push({ id: d.id, ...c });
  });

  const cibleId = process.env.COMP
    || (candidates.find((c) => (c.scoring_mode === 'blocabrac_plancher')) || {}).id;
  if (!cibleId) { console.log('\n⚠️  Aucune competition en blocabrac_plancher : passer COMP=<id>.'); process.exit(1); }
  const cible = candidates.find((c) => c.id === cibleId);
  console.log('\n🎯 Cible : ' + cibleId + ' (' + (cible.name || cible.nom) + ')\n');

  // ── OBSERVE : les participations ──
  const parts = await db.collection('competition_participants').where('competition_id', '==', cibleId).get();
  const uidsInscrits = new Set();
  parts.forEach((d) => uidsInscrits.add(d.data().user_id || d.data().uid));
  console.log('── OBSERVE : participations ──');
  console.log('  documents competition_participants : ' + parts.size);
  console.log('  uid distincts                      : ' + uidsInscrits.size);
  console.log('  registered_count (champ partage)   : ' + (cible.registered_count ?? '—'));

  // ── OBSERVE : les resultats ──
  const res = await db.collection('competition_results').where('competition_id', '==', cibleId).get();
  const parUid = new Map();
  let succes = 0, echecs = 0, reecrits = 0, sansUpdated = 0;
  const blocsTouches = new Set();
  const essais = [];
  res.forEach((d) => {
    const r = d.data();
    const u = r.user_id || '(?)';
    if (!parUid.has(u)) parUid.set(u, { docs: 0, succes: 0, blocs: new Set(), reecrits: 0 });
    const e = parUid.get(u);
    e.docs += 1;
    if (r.success) { e.succes += 1; succes += 1; essais.push(Number(r.attempts || 1)); } else echecs += 1;
    if (r.boulder_id) { e.blocs.add(r.boulder_id); blocsTouches.add(r.boulder_id); }
    if (r.createdAt && r.updated_at) {
      if (String(r.updated_at) > String(r.createdAt)) { reecrits += 1; e.reecrits += 1; }
    } else sansUpdated += 1;
  });
  console.log('\n── OBSERVE : resultats de competition ──');
  console.log('  documents competition_results : ' + res.size);
  console.log('  uid distincts ayant saisi     : ' + parUid.size);
  console.log('  blocs distincts touches       : ' + blocsTouches.size);
  console.log('  reussites / echecs            : ' + succes + ' / ' + echecs);
  console.log('  documents reecrits apres creation (updated_at > createdAt) : ' + reecrits
    + '  → chacun vaut AU MOINS 2 ecritures');
  if (sansUpdated) console.log('  ⚠️  documents sans les deux horodatages : ' + sansUpdated);
  if (essais.length) {
    const flash = essais.filter((a) => a === 1).length;
    console.log('  essais sur les reussites : moyenne ' + (essais.reduce((a, b) => a + b, 0) / essais.length).toFixed(2)
      + ', max ' + Math.max(...essais) + ', flashs ' + flash + '/' + essais.length
      + ' (' + (100 * flash / essais.length).toFixed(1) + ' %)');
  }
  console.log('\n  par grimpeur (documents / reussites / blocs distincts / reecrits) :');
  [...parUid.entries()].sort((a, b) => b[1].docs - a[1].docs).forEach(([u, e]) => {
    console.log('    ' + u.slice(0, 10) + '… : ' + e.docs + ' / ' + e.succes + ' / ' + e.blocs.size + ' / ' + e.reecrits);
  });

  // ── OBSERVE : les blocs rattaches, et les x2 ──
  const blocs = await db.collection('boulders').where('competition_id', '==', cibleId).get();
  let actifsRattaches = 0, doubles = 0, encoreActifCompet = 0, typeCompet = 0;
  blocs.forEach((d) => {
    const b = d.data();
    if (b.is_active) actifsRattaches += 1;
    if (Number(b.points_multiplier) === 2) doubles += 1;
    if (b.competition_active) encoreActifCompet += 1;
    if (b.type === 'competition') typeCompet += 1;
  });
  console.log('\n── OBSERVE : blocs portant competition_id = cible ──');
  console.log('  documents boulders            : ' + blocs.size);
  console.log('  dont is_active                : ' + actifsRattaches);
  console.log('  dont points_multiplier = 2    : ' + doubles);
  console.log('  dont competition_active (reliquat de cloture) : ' + encoreActifCompet);
  console.log('  dont type = competition (cotation encore cachee) : ' + typeCompet);

  // ── OBSERVE : le palmares ──
  const rk = await db.collection('competition_rankings').get();
  console.log('\n── OBSERVE : palmares geles ──');
  console.log('  documents competition_rankings : ' + rk.size);
  rk.forEach((d) => {
    const r = d.data();
    console.log('    ' + d.id + ' | comp=' + (r.competition_id || '?') + ' | mode=' + (r.scoring_mode || '?')
      + ' | publie=' + (r.published_at || '?')
      + ' | sections=' + (Array.isArray(r.sections) ? r.sections.length : '?'));
  });

  // ── OBSERVE : l'activite QUOTIDIENNE du meme jour (autre source d'ecritures) ──
  const cbr = await db.collection('client_boulder_results')
    .where('createdAt', '>=', JOUR).where('createdAt', '<', JOUR + 'T99').get();
  const uidsQuot = new Set();
  cbr.forEach((d) => uidsQuot.add(d.data().userId || d.data().user_id));
  console.log('\n── OBSERVE : validations QUOTIDIENNES creees le ' + JOUR + ' ──');
  console.log('  documents client_boulder_results : ' + cbr.size + '  (uid distincts : ' + uidsQuot.size + ')');
  console.log('  ⚠️  chacune entraine aussi une transaction classement_profiles (+ user_ludic_state)');

  // ── DEDUIT : l'attribution des 696 ecritures de la sonde ──
  const TOTAL_SONDE = Number(process.env.TOTAL_ECRITURES || 696);
  const admin = blocs.size + doubles + rk.size;
  console.log('\n════ DEDUIT (et non mesure) : attribution des ' + n(TOTAL_SONDE) + ' ecritures ════');
  console.log('  ⚠️  Chaque ligne ci-dessous est un ORDRE DE GRANDEUR a partir de comptes de');
  console.log('      documents. Une ecriture par document est un MINORANT.');
  console.log('  rattachement des blocs (1 ecriture/bloc, minorant)   ≈ ' + blocs.size);
  console.log('  pose des x2 (1 ecriture/bloc double, minorant)       ≈ ' + doubles);
  console.log('  publication du palmares                              ≈ ' + rk.size);
  console.log('  resultats de competition (documents, MINORANT)       ≈ ' + res.size);
  console.log('  validations quotidiennes + leurs transactions        ≈ ' + (cbr.size * 2));
  const explique = admin + res.size + cbr.size * 2;
  console.log('  ─────');
  console.log('  minorant total explique : ' + explique + ' / ' + TOTAL_SONDE
    + '  → NON ATTRIBUE : ' + (TOTAL_SONDE - explique));
  console.log('\n  Le NON ATTRIBUE est l\'interessant : il contient les re-ecritures debouncees,');
  console.log('  le verrouillage des niveaux, le passage « en cours », les inscriptions du soir,');
  console.log('  et les champs partages (registered_count). Il ne contient AUCUNE surprise');
  console.log('  seulement si on peut le nommer — sinon le modele n\'est pas valide.');
  if (parUid.size > 0) {
    console.log('\n  Unite par grimpeur AYANT SAISI (' + parUid.size + ') :');
    console.log('    minorant (documents seuls)      : ' + (res.size / parUid.size).toFixed(1) + ' ecritures');
    console.log('    si tout le NON ATTRIBUE leur revient : '
      + ((res.size + Math.max(0, TOTAL_SONDE - explique)) / parUid.size).toFixed(1) + ' ecritures');
    console.log('    ⚠️  La borne du navigateur etait 23 a 43 ecritures/grimpeur SUR 20 BLOCS.');
  }
  process.exit(0);
})().catch((e) => { console.error('ECHEC : ' + (e && e.message ? e.message : e)); process.exit(1); });
