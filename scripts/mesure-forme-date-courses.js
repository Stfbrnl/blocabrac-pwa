// LA FORME RÉELLE DE `courses.date` EN PRODUCTION — lecture seule.
//
// 🔴 POURQUOI, ET C'EST URGENT. `utils/courseSessionStatus.ts` type ce champ `date: string`
// ("YYYY-MM-DD"), `CLAUDE.md` l'écrit aussi, et le voyant d'activité livré en V2.81
// (`components/AdminActivityIndicator.tsx`) interroge `where('date', '==', '2026-11-07')`,
// c'est-à-dire une ÉGALITÉ DE CHAÎNE. Mais la mesure du 07/11 a imprimé `[object Object]`
// pour la date d'une séance de production : le champ n'est donc pas une chaîne partout.
//
// ⚠️ Si la forme diverge, le voyant ne trouve AUCUNE séance et affiche « aucune activité
// détectée » — c'est-à-dire **l'inverse de la vérité, sans rien signaler**. Un voyant qui dit
// « calme » pendant qu'une séance tourne est pire que pas de voyant : c'est sur sa foi qu'on
// déploierait les règles. Même famille que « un repli rend aveugle au défaut qu'il compense ».
//
// Ce script imprime le TYPE de chaque valeur, pas sa représentation : c'est le type qui décide
// si l'égalité Firestore peut correspondre.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '..', 'firestore-migration');
const app = initializeApp({ credential: cert(require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'))) });
const db = getFirestore(app);

const decrire = (v) => {
  if (v === undefined) return 'ABSENT';
  if (v === null) return 'null';
  if (v instanceof Timestamp) return `Timestamp(${v.toDate().toISOString()})`;
  if (typeof v === 'string') return `string "${v}"`;
  if (typeof v === 'object') return `object ${JSON.stringify(v).slice(0, 80)}`;
  return `${typeof v} ${String(v)}`;
};

(async () => {
  const snap = await db.collection('courses').get();
  console.log(`\n══ courses : ${snap.size} document(s) ══`);
  const formes = new Map();
  snap.docs.forEach((d) => {
    const x = d.data();
    const forme = x.date instanceof Timestamp ? 'Timestamp'
      : typeof x.date === 'string' ? 'string'
        : x.date === undefined ? 'ABSENT' : typeof x.date;
    formes.set(forme, (formes.get(forme) || 0) + 1);
    console.log(`\n   ${d.id}`);
    console.log(`      date        : ${decrire(x.date)}`);
    console.log(`      activatedAt : ${decrire(x.activatedAt)}`);
    console.log(`      archivedAt  : ${decrire(x.archivedAt)}`);
    console.log(`      createdAt   : ${decrire(x.createdAt)}`);
  });

  console.log('\n══ RÉPARTITION DES FORMES DE `date` ══');
  for (const [forme, n] of formes) console.log(`   ${forme.padEnd(12)} ${n} document(s)`);

  // Le contrôle qui tranche : la requête que le voyant fait réellement.
  const maintenant = new Date();
  const aujourdHui = [
    maintenant.getFullYear(),
    String(maintenant.getMonth() + 1).padStart(2, '0'),
    String(maintenant.getDate()).padStart(2, '0'),
  ].join('-');
  const parChaine = await db.collection('courses').where('date', '==', aujourdHui).get();
  console.log(`\n══ LA REQUÊTE DU VOYANT ══  where('date','==','${aujourdHui}') → ${parChaine.size} résultat(s)`);
  if (formes.has('string') && formes.size === 1) {
    console.log('   ✔️ Toutes les dates sont des chaînes : la requête du voyant est de la bonne forme.');
  } else {
    console.log('   🔴 DES FORMES AUTRES QUE `string` EXISTENT : la requête du voyant ne les verra');
    console.log('      JAMAIS, et il affichera « aucune activité détectée » à tort.');
  }

  // Et les 3 résultats de séance, pour savoir ce qui a réellement été enregistré.
  const res = await db.collection('client_course_results').get();
  console.log(`\n══ client_course_results : ${res.size} document(s) ══`);
  res.docs.forEach((d) => {
    const x = d.data();
    console.log(`\n   ${d.id}`);
    console.log(`      userId            : ${x.userId || '(absent)'}`);
    console.log(`      exerciseId        : ${x.exerciseId || '(absent)'}`);
    console.log(`      miniCompetitionId : ${x.miniCompetitionId || '(absent)'}`);
    console.log(`      boulderId         : ${x.boulderId || '(absent)'}`);
    console.log(`      boulderColor      : ${x.boulderColor || '(absent)'}`);
    console.log(`      success / attempts: ${x.success} / ${x.attempts ?? '-'}`);
    console.log(`      createdAt         : ${decrire(x.createdAt)}`);
  });

  console.log('\n(lecture seule : aucune écriture effectuée)');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC :', e); process.exit(1); });
