// LE RELEVÉ DE V2.81 EST-IL RÉTROACTIF, ET POUR QUI ? — lecture seule, aucune écriture.
//
// LA QUESTION, posée par Stéphane le 07/11/2026 : sa collègue monitrice peut-elle voir le
// nouveau relevé sur la mini-compétition qu'elle a fait tourner hier ?
//
// ⚠️ POURQUOI ÇA NE SE DÉDUIT PAS DU CODE SEUL. Le relevé est rétroactif par nature — il lit
// `client_course_results`, qui est un historique, et ne stocke rien de neuf. Mais il a besoin
// de DEUX choses que le code ne garantit pas :
//   ① que la mini-compétition apparaisse dans le sélecteur (`selectableMiniCompetitions` :
//      `createdBy == elle` OU au moins un résultat existe) ;
//   ② que la SÉANCE soit lisible par elle, car les lignes viennent de ses participants — et
//      `firestore.rules` n'autorise un `courses` qu'à son `createdBy`, à un élève du groupe,
//      ou à un admin. Le `moniteurId` du groupe n'ouvre que l'ÉCRITURE.
// La réponse dépend donc de QUI a créé la séance, et ça se mesure.
//
// ⚠️ ET UN CHIFFRE REPRIS D'UN DOCUMENT EST UN FAIT DATÉ : le 06/11 à midi, la mesure disait
// « 1 mini-compétition créée, 0 document portant un miniCompetitionId ». Si une séance a tourné
// hier soir, ce n'est plus vrai. On re-mesure, on ne reprend pas.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '..', 'firestore-migration');
const app = initializeApp({ credential: cert(require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'))) });
const db = getFirestore(app);

const roles = (d) => {
  const r = new Set(Array.isArray(d.roles) ? d.roles : []);
  if (typeof d.role === 'string' && d.role) r.add(d.role);
  return r;
};

const nom = (d, uid) => {
  if (!d) return `(compte introuvable ${uid.slice(0, 6)})`;
  const complet = [d.first_name, d.last_name].filter(Boolean).join(' ').trim();
  return complet || d.displayName || d.email || uid.slice(0, 6);
};

const quand = (v) => {
  if (!v) return '(sans date)';
  if (typeof v.toDate === 'function') return v.toDate().toISOString().slice(0, 16).replace('T', ' ');
  if (v.seconds) return new Date(v.seconds * 1000).toISOString().slice(0, 16).replace('T', ' ');
  return String(v).slice(0, 16);
};

(async () => {
  // ── Les comptes, pour nommer et pour savoir qui est moniteur ou admin ──
  const usersSnap = await db.collection('users').get();
  const users = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
  const staff = [...users.entries()].filter(([, d]) => roles(d).has('moniteur') || roles(d).has('admin'));
  console.log(`\n══ COMPTES ══  ${usersSnap.size} au total, ${staff.length} moniteur/admin :`);
  staff.forEach(([uid, d]) => {
    console.log(`   ${uid}  ${nom(d, uid).padEnd(26)} ${[...roles(d)].sort().join(',')}`);
  });

  // ── Les mini-compétitions ──
  const minisSnap = await db.collection('mini_competitions').get();
  console.log(`\n══ MINI-COMPÉTITIONS ══  ${minisSnap.size} document(s) :`);
  const minis = new Map();
  minisSnap.docs.forEach((d) => {
    const x = d.data();
    minis.set(d.id, x);
    console.log(`   ${d.id}`);
    console.log(`      nom          : ${x.name || '(sans nom)'}`);
    console.log(`      créée par    : ${x.createdBy ? `${nom(users.get(x.createdBy), x.createdBy)} (${x.createdBy})` : '(champ absent)'}`);
    console.log(`      blocs        : ${(x.boulderIds || []).length}`);
  });

  // ── LES RÉSULTATS : c'est LE nombre qui décide si quoi que ce soit est visible ──
  // On lit toute la collection et on compte, plutôt qu'une requête sur `miniCompetitionId`
  // (qui ne distinguerait pas « champ absent » de « collection vide »).
  const resSnap = await db.collection('client_course_results').get();
  const avecMini = resSnap.docs.filter((d) => d.data().miniCompetitionId);
  console.log(`\n══ client_course_results ══  ${resSnap.size} document(s) au total`);
  console.log(`   dont portant un miniCompetitionId : ${avecMini.length}`);

  const parMini = new Map();
  avecMini.forEach((d) => {
    const x = d.data();
    if (!parMini.has(x.miniCompetitionId)) parMini.set(x.miniCompetitionId, []);
    parMini.get(x.miniCompetitionId).push({ id: d.id, ...x });
  });
  for (const [miniId, liste] of parMini) {
    const def = minis.get(miniId);
    console.log(`\n   ── ${miniId} « ${def ? def.name : 'DÉFINITION ABSENTE'} » : ${liste.length} résultat(s)`);
    const grimpeurs = new Set(liste.map((r) => r.userId));
    const blocs = new Set(liste.map((r) => r.boulderId));
    console.log(`      ${grimpeurs.size} grimpeur(s), ${blocs.size} bloc(s) distinct(s)`);
    liste
      .sort((a, b) => quand(a.createdAt).localeCompare(quand(b.createdAt)))
      .forEach((r) => {
        console.log(
          `      ${quand(r.createdAt)}  ${nom(users.get(r.userId), r.userId).padEnd(22)}`
          + ` bloc=${String(r.boulderId || '?').slice(0, 10).padEnd(10)}`
          + ` couleur=${String(r.boulderColor || '(aucune)').padEnd(9)}`
          + ` essais=${r.attempts ?? '-'}  ${r.success === true ? 'RÉUSSI' : 'échoué'}`
        );
      });
  }
  if (parMini.size === 0) {
    console.log('   → AUCUN résultat de mini-compétition en production.');
  }

  // ── LES SÉANCES qui rattachent une mini-compétition : c'est le `createdBy` qui décide ──
  const coursesSnap = await db.collection('courses').get();
  const avecMinis = coursesSnap.docs.filter((d) => (d.data().miniCompetitions || []).length > 0);
  console.log(`\n══ courses ══  ${coursesSnap.size} séance(s) au total, ${avecMinis.length} rattachant une mini-compétition :`);
  avecMinis.forEach((d) => {
    const x = d.data();
    const createur = x.createdBy ? `${nom(users.get(x.createdBy), x.createdBy)} (${x.createdBy})` : '(champ absent)';
    console.log(`\n   ${d.id}`);
    console.log(`      nom            : ${x.name || '(sans nom)'}`);
    console.log(`      date           : ${x.date || '(sans date)'}`);
    console.log(`      createdBy      : ${createure(createur)}`);
    console.log(`      mini-compét.   : ${(x.miniCompetitions || []).join(', ')}`);
    console.log(`      Participants   : ${(x.Participants || []).length}`
      + ((x.Participants || []).length
        ? ` → ${(x.Participants || []).map((u) => nom(users.get(u), u)).join(', ')}`
        : ''));
    console.log(`      optedOut       : ${(x.optedOut || []).length}`);
    console.log(`      activatedAt    : ${x.activatedAt || '(jamais activée)'}`);
    console.log(`      archivedAt     : ${x.archivedAt || '(non archivée)'}`);
  });

  // ── LE VERDICT, par moniteur : pour quelle mini-compétition verra-t-il un relevé ? ──
  // ⚠️ On reproduit ici les DEUX conditions du code, pas une impression générale.
  console.log('\n══ VERDICT PAR COMPTE DE STAFF ══');
  const jouees = new Set(parMini.keys());
  for (const [uid, d] of staff) {
    const estAdmin = roles(d).has('admin');
    const sesSeances = coursesSnap.docs.filter((c) => c.data().createdBy === uid);
    const proposables = [...minis.entries()].filter(([id, m]) => m.createdBy === uid || jouees.has(id));
    console.log(`\n   ${nom(d, uid)}${estAdmin ? '  [admin : lit TOUTES les séances]' : ''}`);
    console.log(`      séances dont il/elle est createdBy : ${sesSeances.length}`);
    console.log(`      mini-compétitions proposées au sélecteur : ${proposables.length}`
      + (proposables.length ? ` (${proposables.map(([, m]) => m.name || '?').join(', ')})` : ''));
    for (const [miniId, m] of proposables) {
      // La requête que l'écran fait réellement : ses propres séances, filtrées côté client.
      const lisibles = (estAdmin ? coursesSnap.docs : sesSeances)
        .filter((c) => (c.data().miniCompetitions || []).includes(miniId));
      const nbResultats = (parMini.get(miniId) || []).length;
      if (lisibles.length === 0) {
        console.log(`      ✘ « ${m.name || miniId} » : relevé INDISPONIBLE`
          + ' (aucune séance lisible par ce compte ne la rattache) — l\'écran le dit explicitement.');
      } else {
        lisibles.forEach((c) => {
          const x = c.data();
          console.log(`      ✔ « ${m.name || miniId} » : relevé DISPONIBLE sur la séance du ${x.date}`
            + ` « ${x.name || 'sans nom'} » — ${(x.Participants || []).length} ligne(s),`
            + ` ${(minis.get(miniId).boulderIds || []).length} colonne(s), ${nbResultats} résultat(s) à placer.`);
        });
      }
    }
  }

  console.log('\n(lecture seule : aucune écriture effectuée)');
  process.exit(0);
})().catch((e) => { console.error('ÉCHEC :', e); process.exit(1); });

// Petite aide d'affichage déclarée après usage volontairement (hoisting de fonction) : garde la
// boucle ci-dessus lisible.
function createure(s) { return s; }
