// Combien d'écritures Firestore l'application émet-elle RÉELLEMENT pour un parcours de
// grimpeur sur l'écran compétition ? Mesuré dans le navigateur, à la frontière du SDK.
//
// ⚠️ POURQUOI CE SCRIPT EXISTE À CÔTÉ DE `measure-competition-writes-after.mjs`, ET NE LE
// REMPLACE PAS SANS LE DIRE. Celui-là ne fait pas tourner `ClientCompetitions.tsx` : il le
// RECOPIE à la main, et totalise des constantes littérales (`record('Validation', 1)`, une
// boucle sur `N_BOULDERS = 35`). Il émet de vraies écritures vers un vrai émulateur — c'est
// ce qui lui donne son autorité — mais personne n'y compte ce que l'application émet : on
// compte ce que son auteur a cru qu'elle émettait, en août 2026. Relancé le 19/10/2026 au
// code de V2.75, quarante-cinq versions plus tard, il rend 7 470 au chiffre près. Un tel
// instrument **ne peut pas vieillir**, donc ne peut pas non plus être rafraîchi.
//
// ⚠️ LE TEST QUI SÉPARE LES DEUX, ET QUI VAUT POUR TOUT INSTRUMENT DU DÉPÔT (ClaudeNav,
// docs/handoffs/2026-10-19-CN-harnais-et-compteur.md §1) : **ce nombre vient-il d'une
// observation du système, ou d'un littéral dans le script ?** `snap.size` → observation.
// `record('Validation', 1)` → littéral. C'est la famille d'instrument la plus dangereuse,
// parce qu'elle ne se trahit ni par un silence ni par un verdict faux : elle PRODUIT UNE
// VALEUR, et une valeur est dans ce projet la forme de preuve la plus forte.
//
// CE QUE CELUI-CI COMPTE, et d'où ça vient : chaque entrée `writes` des corps de requête
// `Write/channel` partant du navigateur. Rien n'est supposé du code de l'application ; on lit
// ce qui sort.
//
// ⚠️ ET L'UNITÉ COMPTÉE EST LE DOCUMENT, PAS LA REQUÊTE HTTP. WebChannel groupe plusieurs
// opérations dans un seul POST (observé : `count=4&ofs=2&req0___data__=…&req3___data__=…`),
// et Firestore facture au document écrit. Compter les requêtes aurait rendu un chiffre
// plausible et faux — du bon ordre de grandeur, donc invisible.
//
// ⚠️ ON MESURE L'UNITÉ, ON MODÉLISE LE MULTIPLICATEUR, ET ON DIT LEQUEL EST LEQUEL. La sortie
// sépare les deux explicitement. « 7 470 » présentait un produit de deux modèles comme une
// mesure ; « N observées × 80 participants supposés » est honnête ET révisable — le jour où le
// nombre de participants change, on ne refait pas la mesure, on change le multiplicateur.
//
// PRÉREQUIS : émulateurs auth+firestore, `node test/seed-repetition-generale.mjs`, la
// compétition passée « en cours », un compte grimpeur NEUF (sans aucun résultat — le
// dédoublonnage `lastPersistedRef` n'écrit pas une valeur déjà persistée, donc mesurer sur un
// des 80 comptes semés sous-compterait le parcours), et le serveur de dev sur 5174 avec
// VITE_USE_EMULATOR=true.
//
//   node test/measure-competition-writes-browser.mjs
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5174';
const EMAIL = process.env.MESURE_EMAIL || 'mesure.ecritures@blocabrac.test';
const PASSWORD = 'TestPassword123!';
const COMPETITION_NAME = process.env.MESURE_COMPETITION || 'Répétition générale';

// Multiplicateur SUPPOSÉ, jamais mesuré : c'est la part modélisée du résultat, et elle est
// annoncée comme telle. 80 est le dimensionnement de la répétition générale.
const PARTICIPANTS_SUPPOSES = Number(process.env.MESURE_PARTICIPANTS || 80);
const PLAFOND_ECRITURES = 20000;

// Combien de blocs le parcours mesuré valide. Le reste des blocs de l'épreuve n'est pas
// touché : un grimpeur qui ne valide rien n'écrit rien.
const BLOCS_A_VALIDER = Number(process.env.MESURE_BLOCS || 20);

// ⚠️ LE RÉSULTAT DÉPEND DE CE DÉLAI, ET C'EST LA PROPRIÉTÉ LA PLUS IMPORTANTE DE CETTE MESURE.
// « Réussi » écrit tout de suite ; le nombre d'essais est débouncé à 2 500 ms et fusionné par
// remplacement. Un grimpeur qui choisit ses essais AVANT que le débounce n'expire fait partir
// UNE écriture portant les deux champs ; un grimpeur qui laisse passer le délai en fait partir
// DEUX. Le coût réel de la soirée dépend donc de la vitesse de saisie des grimpeurs, pas
// seulement de leur nombre — et un seul passage de ce script ne mesure pas « l'unité », il en
// échantillonne une valeur. Lancer les DEUX bornes, jamais une seule :
//   MESURE_PAUSE_MS=0    → grimpeur décidé   (borne basse)
//   MESURE_PAUSE_MS=3000 → grimpeur hésitant (borne haute, au-delà du débounce)
const PAUSE_MS = Number(process.env.MESURE_PAUSE_MS ?? 400);

// ⚠️ ET LE VRAI LEVIER N'EST PAS LA MINUTERIE, C'EST LE NOMBRE D'ESSAIS SAISI. Mesuré :
// PAUSE_MS n'a AUCUN effet, même placé entre les deux gestes du même bloc (38 à 0 ms comme
// à 3 000 ms, cinq passages). Ce qui décide, c'est le dédoublonnage :
// defaultValidationResult.attempts vaut **1** sur cet écran, donc un bloc réussi au premier
// essai est déjà dans l'état que « Réussi » vient de persister — sélectionner « 1 essai »
// n'écrit RIEN. Tout autre nombre écrit une seconde fois.
//
// Le coût par grimpeur dépend donc de son TAUX DE FLASH, qui est une grandeur de la salle et
// pas du code. D'où deux bornes à mesurer, jamais un nombre :
//   MESURE_ESSAIS=flash → tous les blocs au 1er essai   (borne BASSE)
//   MESURE_ESSAIS=varie → aucun bloc au 1er essai       (borne HAUTE)
//   MESURE_ESSAIS=mixte → 1 bloc sur 4 au 1er essai     (hypothèse, PAS une mesure)
const ESSAIS = process.env.MESURE_ESSAIS || 'mixte';
const essaisPourBloc = (i) => {
  if (ESSAIS === 'flash') return 1;
  if (ESSAIS === 'varie') return (i % 4) + 2; // jamais 1
  return (i % 4) + 1;                        // 1 un bloc sur 4
};

const compteur = { documents: 0, requetes: 0, parCollection: new Map() };

const compteLesEcritures = (req) => {
  const url = req.url();
  if (!url.includes('/Write/channel')) return;
  const corps = req.postData();
  if (!corps) return;
  // Corps form-encodé : `count=N&ofs=M&req0___data__={json}&req1___data__={json}…`
  const champs = new URLSearchParams(corps);
  let vuDansCetteRequete = 0;
  for (const [cle, valeur] of champs) {
    if (!/^req\d+___data__$/.test(cle)) continue;
    let charge;
    try {
      charge = JSON.parse(valeur);
    } catch {
      continue; // un cadre de contrôle (handshake, jeton) n'est pas une écriture
    }
    for (const w of charge.writes || []) {
      const chemin = w.update?.name || w.delete || '';
      const collection = chemin.split('/documents/')[1]?.split('/')[0] || '(inconnue)';
      compteur.parCollection.set(collection, (compteur.parCollection.get(collection) || 0) + 1);
      compteur.documents += 1;
      vuDansCetteRequete += 1;
    }
  }
  if (vuDansCetteRequete > 0) compteur.requetes += 1;
};

const jalons = [];
const jalon = (libelle) => jalons.push({ libelle, documents: compteur.documents });

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('request', compteLesEcritures);

  await page.goto(`${BASE_URL}/login`);
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await page.waitForURL(/client/, { timeout: 20000 });

  // La connexion elle-même n'appartient pas au parcours compétition.
  compteur.documents = 0;
  compteur.requetes = 0;
  compteur.parCollection.clear();

  await page.goto(`${BASE_URL}/client/competitions`);
  await page.getByText('Mes Compétitions').waitFor({ timeout: 20000 });
  const carte = page.locator('.MuiCard-root', { hasText: COMPETITION_NAME });
  await carte.first().waitFor({ timeout: 20000 });
  jalon('Ouverture de l\'écran (aucune écriture attendue)');

  // ─── Inscription ───────────────────────────────────────────────────────────────────
  await carte.getByRole('button', { name: "S'inscrire" }).click();
  await page.getByRole('button', { name: "Confirmer l'inscription" }).click();
  await page.getByText('Inscription réussie', { exact: false }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  jalon('Inscription');

  // ─── Validation des blocs ──────────────────────────────────────────────────────────
  await page.waitForTimeout(3500); // laisser le message de succès se refermer
  await carte.getByRole('button', { name: 'Valider mes blocs' }).click();
  await page.getByText('Validation des blocs', { exact: false }).waitFor({ timeout: 20000 });

  const boutonsReussi = page.getByRole('button', { name: '✅ Réussi' });
  const nBlocs = Math.min(await boutonsReussi.count(), BLOCS_A_VALIDER);
  if (nBlocs === 0) throw new Error('Aucun bloc à valider : la compétition est-elle « en cours » ?');

  for (let i = 0; i < nBlocs; i++) {
    await boutonsReussi.nth(i).click();
    // ⚠️ LE DÉLAI SE PLACE ICI, ENTRE LES DEUX GESTES DU MÊME BLOC — pas en fin de boucle.
    // Première version de ce script : la pause était après la saisie des essais, c'est-à-dire
    // là où elle ne pouvait rien changer. Elle rendait 38 à 0 ms comme à 3 000 ms, et j'en
    // aurais conclu que le chiffre était insensible à la vitesse de saisie. Un paramètre qui
    // ne fait pas varier le résultat ne prouve l'insensibilité que s'il agit au bon endroit.
    await page.waitForTimeout(PAUSE_MS);
    // Le nombre d'essais : un vrai geste de grimpeur, et le second champ que l'écran
    // persiste (débouncé, voir DEBOUNCE_MS = 2500).
    const selectEssais = page.getByRole('combobox', { name: "Nombre d'essais (top)" }).nth(i);
    await selectEssais.click();
    const nEssais = essaisPourBloc(i);
    await page.getByRole('option', { name: `${nEssais} essai${nEssais > 1 ? 's' : ''}`, exact: true })
      .first().click();
    await page.waitForTimeout(120); // le temps que la modale se referme, pas un délai de saisie
  }
  // ⚠️ Attendre plus que le débounce : une écriture encore en file ne serait pas comptée, et
  // le manque serait silencieux.
  await page.waitForTimeout(5000);
  jalon(`Validation de ${nBlocs} bloc(s) (réussite + nombre d'essais)`);

  // ─── Verrouillage ──────────────────────────────────────────────────────────────────
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Soumettre les résultats' }).click();
  await page.getByText('Résultats verrouillés', { exact: false }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(2000);
  jalon('Verrouillage (« Soumettre »)');

  await browser.close();

  // ─── Résultat, en deux parties explicitement séparées ──────────────────────────────
  console.log('\n═══ MESURÉ (observé à la frontière du SDK, essais=' + ESSAIS + ', pause=' + PAUSE_MS + 'ms) ═══');
  let precedent = 0;
  for (const j of jalons) {
    console.log(`  ${String(j.documents - precedent).padStart(3)} document(s)  ${j.libelle}`);
    precedent = j.documents;
  }
  console.log(`  ${String(compteur.documents).padStart(3)} AU TOTAL pour 1 parcours complet `
    + `(${nBlocs} blocs), en ${compteur.requetes} requête(s) HTTP`);
  console.log('  par collection :');
  for (const [c, n] of [...compteur.parCollection].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(3)}  ${c}`);
  }

  console.log('\n═══ MODÉLISÉ (supposé, jamais mesuré) ═══');
  const total = compteur.documents * PARTICIPANTS_SUPPOSES;
  console.log(`  × ${PARTICIPANTS_SUPPOSES} participants supposés  →  ${total} écritures`);
  console.log(`  soit ${(total / PLAFOND_ECRITURES * 100).toFixed(1)} % du plafond Spark `
    + `(${PLAFOND_ECRITURES}/jour)`);

  console.log('\n⚠️  CE QUE CE CHIFFRE NE DIT PAS :');
  console.log('  — la part du quota déjà consommée par une journée de salle ordinaire : la');
  console.log('    marge ci-dessus est calculée contre le plafond ENTIER, et le contest');
  console.log('    s\'ajoute à cette journée. Seul un relevé en console de la Firebase le dira.');
  console.log('  — les écritures de l\'ADMIN (verrouillage groupé des niveaux, level_at_start au');
  console.log('    coup d\'envoi, palmarès) : ce parcours est celui d\'un grimpeur.');
  console.log('  — les écritures d\'un grimpeur qui, le même soir, valide aussi des blocs du');
  console.log('    jour : cet écran-là écrit classement_profiles, user_ludic_state et challenges.');
}

main().catch((err) => {
  console.error('MEASURE_FAILED', err);
  process.exit(1);
});
