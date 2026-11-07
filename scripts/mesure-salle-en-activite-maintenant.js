// LA SALLE EST-ELLE EN ACTIVITÉ MAINTENANT ? — lecture seule, avant un déploiement.
//
// Pendant serveur du voyant de `Admin.tsx` (`utils/salleEnActivite.ts`). ⚠️ `courses.date` est
// un **Timestamp** en production, pas une chaîne : c'est la confusion qui a rendu le voyant
// V2.81 aveugle, et c'est pourquoi on lit la collection ENTIÈRE sans requête bornée. Firestore
// ordonne par type — une chaîne et un Timestamp ne se comparent pas, donc une requête bornée
// exclurait silencieusement l'autre forme.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '..', 'firestore-migration');
const app = initializeApp({ credential: cert(require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'))) });
const db = getFirestore(app);

const jourISO = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (typeof v.toDate === 'function') return v.toDate().toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
};

(async () => {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  console.log(`maintenant : ${new Date().toISOString()} · jour UTC : ${aujourdhui}`);
  console.log('');

  const [coursesSnap, compsSnap] = await Promise.all([
    db.collection('courses').get(),
    db.collection('competitions').get(),
  ]);

  const duJour = coursesSnap.docs.filter((d) => jourISO(d.data().date) === aujourdhui);
  const actives = coursesSnap.docs.filter((d) => d.data().activatedAt && !d.data().archivedAt);
  console.log(`courses : ${coursesSnap.size} au total · ${duJour.length} datée(s) aujourd'hui · ${actives.length} ACTIVE(s) (activée, non archivée)`);
  for (const d of [...new Set([...duJour, ...actives])]) {
    const c = d.data();
    console.log(`   courses/${d.id} · date=${jourISO(c.date)} (${typeof c.date === 'string' ? 'chaîne' : 'Timestamp'})`
      + ` · activatedAt=${c.activatedAt ? 'oui' : 'non'} · archivedAt=${c.archivedAt ? 'oui' : 'non'}`);
  }
  console.log('');

  const enCours = compsSnap.docs.filter((d) => d.data().status === 'en cours');
  console.log(`competitions : ${compsSnap.size} au total · ${enCours.length} « en cours »`);
  compsSnap.forEach((d) => {
    const c = d.data();
    console.log(`   competitions/${d.id} · "${c.name}" · statut=${c.status} · date=${jourISO(c.date)}`);
  });
  console.log('');

  const enActivite = actives.length > 0 || enCours.length > 0;
  console.log(enActivite
    ? '🟠 ACTIVITÉ DÉTECTÉE — un déploiement de RÈGLES est à éviter (immédiat sur tous les clients).'
    : '✔ Aucune activité détectée : ni séance active, ni compétition en cours.');
  console.log('⚠️ Et ce verdict ne vaut que pour ce qu\'il mesure : il ne voit pas des grimpeurs');
  console.log('   qui valident des blocs du jour sans séance ni compétition.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
