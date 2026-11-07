// LA CLÔTURE DU « CONTEST COURS » A-T-ELLE ÉTÉ FAITE ? — lecture seule.
//
// DEUX QUESTIONS DE STÉPHANE, et elles portent sur deux gestes DISTINCTS qu'on confond
// facilement parce que les deux se disent « terminer » :
//
//   ① **Le palmarès gelé** (`competition_rankings`) existe-t-il pour ce contest, et porte-t-il
//      le classement par niveau max ? C'est le SEUL artefact qui le contient : ni l'écran de
//      statistiques ni le message d'annonce ne le composent (vérifié dans les sources).
//
//   ② **Les blocs sont-ils rebasculés en quotidien ?** ⚠️ `CLAUDE.md` est formel : « Terminer
//      la compétition » convertit les blocs `type: 'competition'` en `daily` et retire
//      `competition_active` aux blocs du jour réutilisés — mais **le `status` de la compétition
//      est une action d'admin DISTINCTE, que ce bouton ne touche jamais.** Donc
//      `status: 'terminée'` NE PROUVE PAS que les blocs ont été convertis, et réciproquement.
//      Il faut regarder les blocs.
//
// ⚠️ Et on interroge `competition_id` SEUL, sans filtre sur `type` : c'est la règle du dépôt
// (« toute page de stats reconstruit une compétition en interrogeant `competition_id` seul »),
// et c'est précisément ce qui permet de voir les blocs restés en plan.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '..', 'firestore-migration');
const app = initializeApp({ credential: cert(require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'))) });
const db = getFirestore(app);

const COMP = process.env.COMP || 'Ua1eJIlPxEIv8oHEOHTH';

(async () => {
  // ── ① LE PALMARÈS GELÉ ──
  const palSnap = await db.collection('competition_rankings').get();
  console.log(`\n══ ① competition_rankings ══  ${palSnap.size} document(s)`);
  for (const d of palSnap.docs) {
    const x = d.data();
    console.log(`\n   ${d.id}`);
    console.log(`      competition_id   : ${x.competition_id || x.competitionId || '(absent)'}`);
    console.log(`      competition_name : ${x.competition_name || x.competitionName || '(absent)'}`);
    console.log(`      published_at     : ${x.published_at || x.publishedAt || '(absent)'}`);
    console.log(`      scoring_mode     : ${x.scoring_mode || '(absent)'}`);
    // Les sections réellement présentes, et leur taille.
    const sections = Object.keys(x).filter((k) => Array.isArray(x[k]));
    sections.forEach((k) => {
      const n = x[k].length;
      const detail = x[k].every((g) => g && Array.isArray(g.participants))
        ? ` (groupes ; ${x[k].reduce((t, g) => t + g.participants.length, 0)} entrée(s) au total)`
        : '';
      console.log(`      ${k.padEnd(18)}: ${n} élément(s)${detail}`);
    });
    const aNiveau = sections.includes('client_level_max');
    console.log(`      ─> classement par NIVEAU MAX : ${aNiveau ? '✔ PRÉSENT' : '✘ absent'}`);
  }
  const palDeCeContest = palSnap.docs.find(
    (d) => (d.data().competition_id || d.data().competitionId) === COMP
  );
  console.log(`\n   ─> palmarès gelé pour « Contest cours » : ${palDeCeContest ? '✔ OUI' : '🔴 NON — jamais publié'}`);

  // ── ② LES BLOCS ──
  const snap = await db.collection('boulders').where('competition_id', '==', COMP).get();
  console.log(`\n══ ② boulders portant competition_id = ${COMP} ══  ${snap.size} bloc(s)`);
  const parType = new Map();
  let actifsCompet = 0;
  let avecPointsValue = 0;
  let avecMultiplicateur = 0;
  const details = [];
  snap.docs.forEach((d) => {
    const x = d.data();
    const t = x.type || '(type absent)';
    parType.set(t, (parType.get(t) || 0) + 1);
    if (x.competition_active === true) actifsCompet += 1;
    if (x.points_value !== undefined && x.points_value !== null) avecPointsValue += 1;
    if (x.points_multiplier !== undefined && x.points_multiplier !== null) avecMultiplicateur += 1;
    details.push({
      id: d.id,
      type: t,
      wall: x.wall || '(mur absent)',
      number: x.number ?? '-',
      color: x.color ?? null,
      difficulty: x.difficulty ?? null,
      is_active: x.is_active,
      competition_active: x.competition_active,
      points_value: x.points_value ?? null,
      points_multiplier: x.points_multiplier ?? null,
    });
  });

  console.log('\n   répartition par `type` :');
  for (const [t, n] of parType) console.log(`      ${String(t).padEnd(16)} ${n}`);
  console.log(`\n   competition_active === true : ${actifsCompet}`);
  console.log(`   portant encore points_value  : ${avecPointsValue}`);
  console.log(`   portant un points_multiplier : ${avecMultiplicateur}`);

  // ⚠️ LE VERDICT se lit sur DEUX clauses, pas une : les blocs créés pour l'épreuve doivent
  // être passés en `daily` AVEC une `color` publique, et les blocs du jour réutilisés doivent
  // avoir PERDU `competition_active`.
  const encoreCompet = details.filter((b) => b.type === 'competition');
  const dailySansCouleur = details.filter((b) => b.type === 'daily' && !b.color);
  console.log('\n   ══ VERDICT ══');
  if (encoreCompet.length === 0 && actifsCompet === 0) {
    console.log('   ✔ LA CLÔTURE A ÉTÉ FAITE : aucun bloc en type `competition`, aucun');
    console.log('     `competition_active` restant. Les cotations sont redevenues publiques.');
  } else {
    console.log('   🔴 LA CLÔTURE N\'A PAS ÉTÉ FAITE (ou pas entièrement) :');
    if (encoreCompet.length) {
      console.log(`      • ${encoreCompet.length} bloc(s) encore en type \`competition\` :`);
      console.log('        leur cotation vit dans `difficulty` et reste CACHÉE aux grimpeurs.');
    }
    if (actifsCompet) {
      console.log(`      • ${actifsCompet} bloc(s) du jour réutilisé(s) portent encore`);
      console.log('        `competition_active: true` : ils se croient membres actifs de l\'épreuve.');
    }
  }
  if (dailySansCouleur.length) {
    console.log(`   ⚠️ ${dailySansCouleur.length} bloc(s) \`daily\` SANS \`color\` : ils sortiraient de`);
    console.log('      `colorById`, donc du barème et des compteurs, en silence.');
  }

  console.log('\n   détail :');
  details
    .sort((a, b) => String(a.wall).localeCompare(String(b.wall)) || (a.number - b.number))
    .forEach((b) => {
      console.log(`      ${String(b.type).padEnd(12)} ${String(b.wall).slice(0, 18).padEnd(18)}`
        + ` n°${String(b.number).padEnd(4)}`
        + ` color=${String(b.color ?? '—').padEnd(9)}`
        + ` difficulty=${String(b.difficulty ?? '—').padEnd(9)}`
        + ` actif=${b.is_active}`
        + ` compet_active=${b.competition_active ?? '—'}`
        + ` pv=${b.points_value ?? '—'}`
        + ` x${b.points_multiplier ?? 1}`);
    });

  console.log('\n(lecture seule : aucune écriture effectuée)');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC :', e); process.exit(1); });
