// LE BLOC COTÉ « mystere » EN COULEUR PUBLIQUE : où est-il, et a-t-il été validé ? — lecture seule.
//
// POURQUOI. `mystere` n'est PAS une cotation : `config/gymConfig.ts` le tient délibérément
// HORS de `colorGrades` (donc hors de `levelOrder`, l'échelle qui ordonne les huit couleurs).
// C'est une cotation MASQUÉE, l'état d'un bloc dont la difficulté réelle est cachée pendant
// une épreuve — pas un niveau.
//
// 🔴 LA CONSÉQUENCE, qu'aucun écran n'annonce : `calculatePoints` et `plancherPoints` lisent
// `basePoints[difficulty] || 0`. Une couleur absente de la table rend donc **0 point, en
// silence**. Un bloc PUBLIC (`type: 'daily'`) portant `color: 'mystere'` est un bloc qui ne
// rapporte rien à personne, sans que rien ne le dise — ni à l'ouvreur, ni au grimpeur.
//
// La question de Stéphane (« il existe les blocs mystères, mais est-ce considéré comme une
// difficulté ? ») porte exactement là. Avant de décider ce que le module de clôture doit faire
// d'une `difficulty` hors échelle, il faut savoir si ce cas est vivant ou dormant.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const CREDENTIALS_DIR = path.join(__dirname, '..', 'firestore-migration');
const app = initializeApp({ credential: cert(require(path.join(CREDENTIALS_DIR, 'serviceAccountKey.json'))) });
const db = getFirestore(app);

// ⚠️ LA LISTE EST LUE, PAS RECOPIÉE. Une première version de la mesure voisine avait tapé les
// huit couleurs à la main et OUBLIÉ `violet` — 38 blocs déclarés fautifs à tort. Un instrument
// fait maison mesure ses propres défauts en silence ; ici la source de vérité est le fichier.
const gymConfig = require('fs').readFileSync(
  path.join(__dirname, '..', 'frontend', 'src', 'config', 'gymConfig.ts'), 'utf8'
);
const bloc = gymConfig.slice(gymConfig.indexOf('export const colorGrades'), gymConfig.indexOf('firstAscentColors'));
const CANONIQUES = [...bloc.matchAll(/value:\s*'([a-zéè]+)'/g)].map((m) => m[1]);

(async () => {
  console.log(`couleurs canoniques LUES dans gymConfig.ts : ${CANONIQUES.join(', ')} (${CANONIQUES.length})`);
  if (CANONIQUES.length !== 8) {
    console.error('🔴 ARRÊT : la lecture de colorGrades n\'a pas rendu 8 couleurs — ne pas conclure sur une liste douteuse.');
    process.exit(1);
  }
  console.log('');

  const bouldersSnap = await db.collection('boulders').get();
  const horsEchelle = bouldersSnap.docs.filter((d) => {
    const b = d.data();
    const valeur = b.type === 'competition' ? b.difficulty : b.color;
    return !CANONIQUES.includes(valeur);
  });

  console.log(`boulders : ${bouldersSnap.size} · ${horsEchelle.length} hors de l'échelle des 8 couleurs`);
  console.log('');

  for (const d of horsEchelle) {
    const b = d.data();
    const resultats = await db.collection('client_boulder_results').where('boulderId', '==', d.id).get();
    const reussies = resultats.docs.filter((r) => r.data().success === true).length;
    console.log(`boulders/${d.id}`);
    console.log(`   n°${b.number ?? '?'} ${b.wall || '?'} · type=${b.type} · is_active=${b.is_active === true}`);
    console.log(`   color=${JSON.stringify(b.color)} · difficulty=${JSON.stringify(b.difficulty)}`);
    console.log(`   competition_id=${b.competition_id || '(aucune)'} · competition_active=${b.competition_active === true}`);
    console.log(`   client_boulder_results : ${resultats.size} saisie(s), dont ${reussies} réussie(s)`);
    console.log(`   → ${b.is_active === true && b.type === 'daily'
      ? '🔴 AU MUR ET PUBLIC : chaque réussite y vaut 0 point, en silence'
      : 'dormant (désactivé ou non public)'}`);
    console.log('');
  }

  // Et le compteur de classement : une couleur hors échelle crée-t-elle un seau dans
  // `colorCounts` ? C'est la grandeur qui décide si le dommage est seulement « 0 point » ou
  // aussi « un compteur pollué ».
  const profilsSnap = await db.collection('classement_profiles').get();
  const seauxVus = new Set();
  profilsSnap.forEach((p) => {
    Object.keys(p.data().colorCounts || {}).forEach((k) => seauxVus.add(k));
    Object.keys((p.data().season || {}).colorCounts || {}).forEach((k) => seauxVus.add(`season.${k}`));
  });
  const pollues = [...seauxVus].filter((k) => !CANONIQUES.includes(k.replace('season.', '')));
  console.log(`classement_profiles : ${profilsSnap.size} profil(s) · seaux de colorCounts vus : ${[...seauxVus].sort().join(', ')}`);
  console.log(pollues.length === 0
    ? '✔ Aucun seau hors échelle dans les compteurs de classement.'
    : `🔴 Seaux hors échelle dans les compteurs : ${pollues.join(', ')}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
