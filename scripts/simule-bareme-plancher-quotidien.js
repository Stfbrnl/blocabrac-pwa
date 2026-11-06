// SIMULATION EN LECTURE SEULE — aucun write, aucune modification. Demande de ClaudeNav (06/11/2026).
//
// LA QUESTION : si le classement QUOTIDIEN passait du bareme classique (`calculatePoints`) au
// bareme a plancher (`plancherPoints`, le mode plebiscite au contest du 5 novembre), que
// deviendrait le score de chaque grimpeur, et l'ORDRE du classement changerait-il ?
//
// ⚠️ POURQUOI CE SCRIPT N'EST PAS UN OUTIL DE MIGRATION : il ne recalcule rien qui serait
// ensuite ecrit. Le calcul de verite vit en TypeScript (`frontend/src/utils/climbingPoints.ts`)
// et ne doit pas etre reimplemente — c'est la doctrine du palmares gele. Les deux formules sont
// donc RECOPIEES ici, a l'identique et pour la seule duree de cette mesure, et ce script est
// JETABLE. S'il fallait vraiment migrer, l'outil serait `reconcile-classement-profiles.js
// --force` apres un changement du module TS, jamais ce fichier.
//
// ⚠️ PROVENANCE : les reussites, les essais et les couleurs sont OBSERVES en production. Les
// deux colonnes de points sont CALCULEES depuis ces observations. Aucun nombre n'est un
// litteral de scenario.
//
// 🔴 BIAIS CONNU DE LA DONNEE, a citer avec tout resultat : jusqu'a V2.69 (25/09/2026) l'ecran
// des blocs du jour proposait 1 essai PAR DEFAUT. Les `attempts` anciens sont donc tires vers
// 1, et comme les deux baremes coincident exactement a 1 essai, l'ecart mesure ici est un
// MINORANT de l'effet reel qu'aurait le nouveau bareme sur les saisies A VENIR.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore(initializeApp({
  credential: cert(require(path.join(__dirname, '../firestore-migration/serviceAccountKey.json'))),
}));

// ── Les deux baremes, recopies de frontend/src/utils/climbingPoints.ts ──
const basePoints = { jaune: 25, vert: 50, bleu: 100, violet: 200, rouge: 400, noir: 600, blanc: 800, rose: 1000 };
const deductions = { jaune: 10, vert: 10, bleu: 10, violet: 10, rouge: 20, noir: 20, blanc: 50, rose: 50 };
const classique = (c, a) => Math.max(0, (basePoints[c] || 0) - (a > 1 ? (a - 1) * (deductions[c] || 0) : 0));
const PLANCHER_RATIO = 0.25, PLANCHER_TAUX = 0.85;
const plancher = (c, a) => {
  const e = Number.isFinite(a) ? Math.max(1, a) : 1;
  return Math.round((basePoints[c] || 0) * (PLANCHER_RATIO + (1 - PLANCHER_RATIO) * Math.pow(PLANCHER_TAUX, e - 1)));
};
// ── VARIANTE C, proposee le 06/11 : « le classique, mais sans jamais zero » ──
// Ce que le contest a reellement plebiscite est le PRINCIPE (« un bloc reussi rapporte
// toujours quelque chose »), pas la courbe : a 93,7 % de flash, presque personne n'a vu de
// difference de chiffres. Cette variante retient donc le principe seul : le bareme classique,
// borne par le bas au quart de la base. Elle est par construction >= au classique partout,
// donc elle ne peut faire BAISSER aucun score — propriete verifiee au ④, pas supposee.
const plancherClassique = (c, a) =>
  Math.max(Math.round((basePoints[c] || 0) * PLANCHER_RATIO), classique(c, a));
const COULEURS = Object.keys(basePoints);
const n = (x) => Number(x || 0).toLocaleString('fr-FR');

(async () => {
  console.log('════ SIMULATION : bareme a plancher applique au classement QUOTIDIEN ════');
  console.log('   lecture seule — rien n\'est ecrit\n');

  // ── ① La table des deux baremes, cote a cote : la propriete structurante d'abord ──
  console.log('── ① Les TROIS baremes : classique | plancher(contest) | classique-borne(C) ──');
  console.log('   essais :              1              2              5             10             20');
  COULEURS.forEach((c) => {
    const l = [1, 2, 5, 10, 20].map((a) =>
      classique(c, a) + '|' + plancher(c, a) + '|' + plancherClassique(c, a));
    console.log('   ' + c.padEnd(8) + l.map((s) => s.padStart(15)).join(''));
  });
  console.log('\n   ⚠️  A 1 ESSAI les deux baremes sont IDENTIQUES, pour toutes les couleurs');
  console.log('       (facteur = 0,25 + 0,75 × 0,85⁰ = 1) : un flash ne bouge jamais.');
  console.log('   🔴 MAIS AU-DELA, LE PLANCHER N\'EST PAS « PLUS GENEREUX » : il est plus DUR');
  console.log('       d\'abord, plus doux ensuite. Au 2e essai il retire 11,25 % de la base,');
  console.log('       quand la deduction classique ne retire que 10 pts sur 100 (bleu), 20 sur');
  console.log('       400 (rouge) ou 50 sur 800 (blanc) — soit moins. Le croisement n\'arrive');
  console.log('       qu\'au 4e-5e essai sur les couleurs tendres, et APRES le 10e sur le blanc.');
  console.log('       J\'avais ecrit ici l\'inverse avant de mesurer : le ④ l\'a dementi.');

  // ── ② Les couleurs courantes des blocs ──
  // 🔴 AUCUN FILTRE `is_active` — recopie exacte de `loadDailyColorById` de
  // reconcile-classement-profiles.js. Depuis V2.56 les deux compteurs sont des compteurs
  // d'ACCUMULATION : un bloc valide puis retire a une rotation GARDE ses points, a sa
  // couleur derniere connue. Aucun document `boulders` n'est jamais supprime, donc cette
  // couleur reste lisible.
  //
  // ⚠️ La premiere version de ce script filtrait sur `is_active` et perdait 731 reussites
  // sur 982. Elle rendait un total de 43 930 points quand la somme REELLEMENT STOCKEE dans
  // `classement_profiles` est de 212 655 : un facteur 5 — un chiffre faux d'un ordre de
  // grandeur, et parfaitement plausible a la lecture. D'ou le ③ bis, qui RECOUPE le recalcul
  // classique avec le score stocke : un instrument fait maison mesure ses propres defauts en
  // silence, et seul un recoupement l'attrape.
  const blocs = await db.collection('boulders').where('type', '==', 'daily').get();
  const colorById = new Map();
  blocs.forEach((d) => {
    const b = d.data();
    colorById.set(d.id, b.color || b.difficulty || null);
  });
  console.log('\n── ② OBSERVE : ' + colorById.size
    + ' blocs `daily` (actifs ET retires — aucun filtre, comme la reconciliation)');

  // ── ③ Recalcul des deux scores par compte ──
  const res = await db.collection('client_boulder_results').get();
  const parUid = new Map();
  const tousUid = new Set();
  let horsBareme = 0, flashs = 0, total = 0;
  const distribEssais = new Map();
  res.forEach((d) => {
    const r = d.data();
    if (!r.success) return;
    const uid = r.userId || r.user_id;
    const color = colorById.get(r.boulderId || r.boulder_id);
    if (!color || !basePoints[color]) { horsBareme += 1; return; }
    const a = Math.max(1, Number(r.attempts) || 1);
    total += 1;
    tousUid.add(uid);
    if (a === 1) flashs += 1;
    distribEssais.set(a, (distribEssais.get(a) || 0) + 1);
    if (!parUid.has(uid)) parUid.set(uid, { k: 0, p: 0, c: 0, blocs: 0, nonFlash: 0 });
    const e = parUid.get(uid);
    e.k += classique(color, a);
    e.p += plancher(color, a);
    e.c += plancherClassique(color, a);
    e.blocs += 1;
    if (a > 1) e.nonFlash += 1;
  });
  console.log('\n── ③ OBSERVE : ' + res.size + ' resultats quotidiens, ' + total
    + ' reussites sur un bloc encore actif et cotable');
  console.log('   (' + horsBareme + ' reussites sur un bloc introuvable ou sans couleur cotable :');
  console.log('    ignorees, exactement comme la reconciliation les ignore)');
  console.log('   flashs : ' + flashs + '/' + total + ' (' + (100 * flashs / total).toFixed(1) + ' %)');
  console.log('   distribution des essais : ' + [...distribEssais.entries()].sort((a, b) => a[0] - b[0])
    .map(([a, c]) => a + ' essai' + (a > 1 ? 's' : '') + '×' + c).join(', '));

  // ── ③ bis RECOUPEMENT : le recalcul classique doit retrouver le score STOCKE ──
  // ⚠️ Sans ce pas, rien ne distingue un instrument juste d'un instrument faux du bon ordre
  // de grandeur. L'ecart attendu n'est PAS zero : le score stocke est un compteur
  // incremental qui peut avoir derive, et c'est precisement ce que la reconciliation
  // mensuelle corrige. Mais il doit etre PETIT. Un ecart massif accuse le script, pas la
  // donnee — et dans ce cas il ne faut rien lire de la suite.
  const profs = await db.collection('classement_profiles').get();
  const stocke = new Map();
  profs.forEach((d) => stocke.set(d.id, Number(d.data().score || 0)));
  let sommeStockee = 0, sommeRecalc = 0, ecarts = 0;
  tousUid.forEach((uid) => {
    const s = stocke.get(uid);
    if (s === undefined) return;
    const e = parUid.get(uid);
    sommeStockee += s;
    sommeRecalc += e ? e.k : 0;
    if (s !== (e ? e.k : 0)) ecarts += 1;
  });
  console.log('\n── ③ bis RECOUPEMENT du recalcul classique contre le score STOCKE ──');
  console.log('   somme stockee (classement_profiles) : ' + n(sommeStockee));
  console.log('   somme recalculee (bareme classique) : ' + n(sommeRecalc));
  const ecartRel = sommeStockee ? (100 * Math.abs(sommeRecalc - sommeStockee) / sommeStockee) : 0;
  console.log('   ecart : ' + n(sommeRecalc - sommeStockee) + '  (' + ecartRel.toFixed(2) + ' %)'
    + '  |  comptes en ecart : ' + ecarts + '/' + tousUid.size);
  console.log(ecartRel < 10
    ? '   ✔️  Ecart faible : ce script reproduit bien le calcul de la reconciliation.'
    : '   🔴 ECART MASSIF — NE RIEN CONCLURE DE LA SUITE : c\'est le script qui est en cause.');

  // ── ④ L'effet, compte par compte, POUR LES DEUX VARIANTES ──
  const lignes = [...parUid.entries()].map(([uid, e]) => ({
    uid, ...e, delta: e.p - e.k, deltaC: e.c - e.k,
  }));
  const sommeK = lignes.reduce((a, l) => a + l.k, 0);
  const effet = (cle, dcle, nom) => {
    const somme = lignes.reduce((a, l) => a + l[cle], 0);
    const bouge = lignes.filter((l) => l[dcle] !== 0).length;
    const baisse = lignes.filter((l) => l[dcle] < 0).length;
    const monte = lignes.filter((l) => l[dcle] > 0).length;
    console.log('\n   ' + nom);
    console.log('     somme des scores : ' + n(sommeK) + ' → ' + n(somme)
      + '   (' + (somme >= sommeK ? '+' : '') + n(somme - sommeK)
      + ', soit ' + (somme >= sommeK ? '+' : '') + (100 * (somme - sommeK) / sommeK).toFixed(2) + ' %)');
    console.log('     comptes qui BAISSENT : ' + baisse + '   |   qui MONTENT : ' + monte
      + '   |   inchanges : ' + (lignes.length - bouge));
    return somme;
  };
  console.log('\n── ④ L\'EFFET sur ' + lignes.length + ' comptes ayant au moins une reussite ──');
  effet('p', 'delta', 'B · bareme a plancher du contest (`blocabrac_plancher` tel quel) :');
  effet('c', 'deltaC', 'C · classique borne au quart de la base (le principe seul) :');
  console.log('\n   ⚠️  C ne peut faire baisser personne PAR CONSTRUCTION (max du classique et');
  console.log('       d\'un plancher) — la ligne « qui BAISSENT : 0 » le VERIFIE, elle ne le');
  console.log('       suppose pas. Si elle n\'etait pas a zero, la formule serait fausse.');

  // ── ⑤ L'ordre du classement change-t-il ? ──
  const rangs = (cle) => {
    const tri = [...lignes].sort((a, b) => b[cle] - a[cle]);
    const m = new Map();
    tri.forEach((l, i) => m.set(l.uid, i + 1));
    return m;
  };
  const rk = rangs('k'), rp = rangs('p'), rc = rangs('c');
  console.log('\n── ⑤ L\'ORDRE DU CLASSEMENT ──');
  [['B', rp], ['C', rc]].forEach(([nom, m]) => {
    const bouges = lignes.filter((l) => rk.get(l.uid) !== m.get(l.uid));
    console.log('\n   ' + nom + ' · comptes changeant de rang : ' + bouges.length + '/' + lignes.length);
    if (!bouges.length) { console.log('     AUCUN — le podium et tout l\'ordre sont inchanges.'); return; }
    bouges.sort((a, b) => rk.get(a.uid) - rk.get(b.uid)).forEach((l) => {
      console.log('     ' + l.uid.slice(0, 10) + '… : rang ' + rk.get(l.uid) + ' → ' + m.get(l.uid)
        + '   (' + l.nonFlash + ' bloc(s) hors flash)');
    });
  });
  console.log('\n   Les 10 premiers, score classique → B → C :');
  [...lignes].sort((a, b) => b.k - a.k).slice(0, 10).forEach((l, i) => {
    console.log('     ' + String(i + 1).padStart(2) + '. ' + l.uid.slice(0, 10) + '… '
      + String(n(l.k)).padStart(7) + ' → ' + String(n(l.p)).padStart(7)
      + ' → ' + String(n(l.c)).padStart(7)
      + '   (B ' + (l.delta >= 0 ? '+' : '') + n(l.delta)
      + ' | C ' + (l.deltaC >= 0 ? '+' : '') + n(l.deltaC) + ')  '
      + l.blocs + ' blocs, ' + l.nonFlash + ' hors flash');
  });

  // ── ⑥ La saison, qui est la SEULE chose que la question initiale bornait ──
  const cfg = await db.doc('app_config/classement_saison').get();
  const w = cfg.exists ? cfg.data() : {};
  console.log('\n── ⑥ LA SAISON (fenetre ' + (w.debut || '?') + ' → ' + (w.fin || '?') + ') ──');
  let sK = 0, sP = 0, sN = 0; const sUid = new Set(), sNonFlash = [];
  res.forEach((d) => {
    const r = d.data();
    if (!r.success) return;
    const jour = String(r.createdAt || '').slice(0, 10);
    if (!w.debut || jour < w.debut || jour > w.fin) return;
    const color = colorById.get(r.boulderId || r.boulder_id);
    if (!color || !basePoints[color]) return;
    const a = Math.max(1, Number(r.attempts) || 1);
    sK += classique(color, a); sP += plancher(color, a); sN += 1;
    sUid.add(r.userId || r.user_id);
    if (a > 1) sNonFlash.push(color + '@' + a);
  });
  console.log('   reussites dans la fenetre : ' + sN + '  |  grimpeurs concernes : ' + sUid.size);
  console.log('   points de saison : ' + n(sK) + ' → ' + n(sP) + '  (+' + n(sP - sK) + ')');
  console.log('   validations hors flash dans la fenetre : ' + sNonFlash.length
    + (sNonFlash.length ? ' (' + sNonFlash.join(', ') + ')' : ''));
  console.log('\n   ⚠️  CE CHIFFRE-LA est celui que bornait la question « combien de grimpeurs ont');
  console.log('       valide des points de saison depuis le 1er novembre ». Il est juste, et il');
  console.log('       ne borne QUE la saison : le compteur GENERAL, lui, porte ' + total
    + ' reussites');
  console.log('       sur ' + lignes.length + ' comptes, et il est cumulatif depuis l\'origine.');
  process.exit(0);
})().catch((e) => { console.error('ECHEC : ' + (e && e.message ? e.message : e)); process.exit(1); });
