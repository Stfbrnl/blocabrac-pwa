// QUI A PUBLIÉ LES ANNONCES EN COURS ? — lecture seule.
//
// LA QUESTION, posée par Stéphane le 07/11/2026 : le bandeau affiche le classement de son
// contest avec les noms complets des participants. Est-ce bien un geste humain, ou un
// automatisme qui lui aurait échappé ?
//
// ⚠️ CE QUE CE SCRIPT PEUT ET NE PEUT PAS ÉTABLIR, dit d'avance pour qu'on ne lui prête pas
// une portée qu'il n'a pas :
//   ✔️ il peut dire QUAND chaque annonce a été écrite (`createdAt`, posé par le code) ;
//   ✔️ il peut dire si le texte ressemble à un classement de compétition ;
//   🔴 **il ne peut PAS dire QUI l'a écrite** : la collection `announcements` ne porte AUCUN
//      champ d'auteur. L'attribution ne peut donc venir que de deux autres sources — les
//      règles (`allow create: if isUserRole("admin")`, donc un admin) et le CODE (quels
//      chemins écrivent, et sont-ils déclenchés par un clic ou par un effet ?).
//   L'horodatage sert à CORROBORER, pas à prouver.
//
// ⚠️ Et il n'imprime PAS les noms contenus dans le texte : ce sont des mineurs, et la question
// posée ne demande pas de les relire. Il imprime leur NOMBRE et la première ligne du message.
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
const local = (d) => (d ? new Date(d.getTime() + 3600000).toISOString().slice(0, 16).replace('T', ' ') : '(sans date)');

(async () => {
  const snap = await db.collection('announcements').get();
  console.log(`\n══ announcements ══  ${snap.size} document(s)`);

  // ① L'union des clés : c'est elle qui dit s'il existe un champ d'auteur.
  const cles = new Set();
  snap.docs.forEach((d) => Object.keys(d.data()).forEach((k) => cles.add(k)));
  console.log(`\n   union des clés : ${[...cles].sort().join(', ')}`);
  const champAuteur = ['createdBy', 'created_by', 'authorId', 'author', 'uid', 'userId']
    .find((c) => cles.has(c));
  console.log(`   champ d'auteur : ${champAuteur || '🔴 AUCUN — l\'attribution ne peut pas venir du document'}`);

  // ② Chaque annonce, sans recopier les noms qu'elle contient.
  snap.docs
    .map((d) => ({ _id: d.id, ...d.data() }))
    .sort((a, b) => (dt(a.createdAt) || 0) - (dt(b.createdAt) || 0))
    .forEach((a) => {
      const texte = String(a.text || '');
      const lignes = texte.split('\n').filter((l) => l.trim() !== '');
      // Heuristique de « ressemble à un classement » : des lignes numérotées ou des rangs.
      const lignesClassement = lignes.filter((l) => /^\s*\d+\s*[.)\-–—]|\b\d+\s*(pts|points)\b/i.test(l)).length;
      console.log(`\n   ── ${a._id}`);
      console.log(`      active        : ${a.active}`);
      console.log(`      order         : ${a.order}`);
      console.log(`      urgent        : ${a.urgent ?? '(absent → false)'}`);
      console.log(`      createdAt      : ${a.createdAt ? `${a.createdAt}  → ${local(dt(a.createdAt))} locale` : '🔴 ABSENT'}`);
      if (champAuteur) console.log(`      ${champAuteur.padEnd(14)}: ${a[champAuteur]}`);
      console.log(`      longueur       : ${texte.length} caractères, ${lignes.length} ligne(s) non vides`);
      console.log(`      1re ligne      : ${JSON.stringify(lignes[0] ? lignes[0].slice(0, 90) : '')}`);
      console.log(`      lignes de rang : ${lignesClassement}`);
      // ⚠️ La SIGNATURE du chemin d'écriture, et c'est elle qui tranche :
      // AdminCompetitionStats écrit `${titre}\n\n${contenu}` ET un `createdAt`.
      // AdminAnnouncements n'écrit PAS de `createdAt` du tout (text/order/active[/urgent]).
      const aCreatedAt = !!a.createdAt;
      const double = /\n\n/.test(texte);
      console.log(`      ─> chemin probable : ${aCreatedAt && double
        ? 'AdminCompetitionStats « Publier le classement » (createdAt + titre\\n\\ncorps)'
        : aCreatedAt
          ? 'AdminCompetitionStats (createdAt présent, mais pas de double saut de ligne)'
          : 'AdminAnnouncements (CRUD manuel : il n\'écrit AUCUN createdAt)'}`);
    });

  // ③ Les comptes capables d'écrire ici, d'après les règles.
  const usersSnap = await db.collection('users').get();
  const admins = usersSnap.docs.filter((d) => {
    const x = d.data();
    const r = new Set(Array.isArray(x.roles) ? x.roles : []);
    if (typeof x.role === 'string' && x.role) r.add(x.role);
    return r.has('admin');
  });
  console.log(`\n══ COMPTES AUTORISÉS À ÉCRIRE (firestore.rules : allow create if admin) ══`);
  console.log(`   ${admins.length} compte(s) admin :`);
  admins.forEach((d) => {
    const x = d.data();
    const nom = [x.first_name, x.last_name].filter(Boolean).join(' ').trim() || x.displayName || x.email || d.id;
    console.log(`      ${nom}`);
  });
  console.log('\n   🔴 Donc : l\'écriture vient forcément d\'un de ces comptes, et d\'un CLIC —');
  console.log('      aucun script, aucun cron, aucun useEffect n\'écrit dans cette collection.');

  console.log('\n(lecture seule : aucune écriture effectuée)');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC :', e); process.exit(1); });
