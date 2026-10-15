// Filet contre la divulgation d'un nom de famille complet sur un écran public, à appeler
// depuis n'importe quel e2e Playwright : `await assertNoFullLastName(page, noms, 'écran')`.
//
// docs/plans/PLAN-classements-competition-5-novembre.md §3.
//
// ─── CE QUE CETTE DEMANDE EST VRAIMENT ─────────────────────────────────────────────────
//
// « Vérifier que le live display n'affiche bien que prénom et première lettre du nom » n'est
// pas une demande d'affichage, c'est une demande de **confidentialité** sur un écran projeté
// dans la salle. Les catégories FFME impliquent des mineurs : l'enjeu n'est pas l'esthétique
// de la ligne, c'est qu'un écran public ne publie pas leur identité complète.
//
// Et c'est pour cela que ce filet ne vérifie PAS « la fonction de troncature renvoie la bonne
// chaîne » (des tests unitaires le font déjà, `participantDisplayName.test.ts`) mais **qu'aucun
// nœud du DOM rendu ne contient de nom de famille complet**. La différence est celle qui a
// compté lors du chantier des libellés : la fonction peut être correcte et un site de rendu
// l'avoir oubliée. On regarde donc le résultat, pas le moyen.
//
// ─── TROIS PIÈGES, TOUS RENCONTRÉS ─────────────────────────────────────────────────────
//
// ⚠️ 1. LES NOMS DOIVENT ÊTRE LONGS ET DISTINCTIFS côté jeu d'essai. Un nom de deux lettres
// tronqué est indiscernable du même nom non tronqué : l'assertion serait verte sans rien
// vérifier. Pire, dans ce dépôt, les noms du seed étaient `Nom0`, `Nom1`… et le prénom
// `Prenom0` **contient** `nom0` — l'assertion aurait été à une différence de casse près de se
// tromper. Corrigé le 15/10/2026 dans `seed-competition-simulation.mjs`, commenté sur place.
//
// ⚠️ 2. ON LIT `textContent`, PAS LE TEXTE VISIBLE. Un nom caché par du CSS est quand même
// dans la page : il est dans la charge réseau, dans le DOM, et récupérable. `innerText` aurait
// laissé passer un nom complet rendu dans un nœud masqué.
//
// ⚠️ 3. LA RECHERCHE EST INSENSIBLE À LA CASSE ET AUX ESPACES MULTIPLES. Un nom réaffiché en
// majuscules par une règle CSS reste dans le `textContent` sous sa casse d'origine, mais un
// code applicatif qui le passerait en majuscules, lui, le changerait vraiment — autant ne pas
// dépendre de ça.
//
// ─── CE QU'IL NE COUVRE PAS, ET QU'IL NE PRÉTEND PAS COUVRIR ───────────────────────────
//
// Tronquer l'affichage ne protège pas la DONNÉE (§3.3 du plan) : si l'écran lit des documents
// de participation complets, le nom entier et la date de naissance sont dans la charge réseau
// et dans la mémoire du navigateur. Ce filet regarde le DOM, donc l'écran ; il ne dit rien du
// réseau. Pour l'écran live c'est sans conséquence pratique (route réservée à l'admin,
// vérifié : `ProtectedRoute role="admin"`), et la question des règles de lecture de
// `competition_participants` est un chantier à part, explicitement hors de ce lot.
//
// À l'inverse, le palmarès officiel gelé tronque **à l'écriture** (`competitionRankings.ts`) :
// là, la donnée elle-même est réduite, parce que le document est lisible par tout compte
// authentifié ET immuable.

/**
 * Cherche dans le DOM rendu toute occurrence d'un des noms de famille fournis.
 *
 * `noms` : les noms de famille COMPLETS du jeu d'essai, tels qu'ils sont en base. Les valeurs
 * vides/nulles sont ignorées (un participant sans nom de famille n'a rien à divulguer).
 *
 * Renvoie la liste des problèmes trouvés, chacun avec le nom en cause et un extrait du nœud,
 * pour que le message d'échec soit diagnostiquable sans relancer.
 */
export async function collectFullLastNames(page, noms) {
  const recherches = noms
    .filter((n) => typeof n === 'string' && n.trim().length >= 4)
    .map((n) => n.trim());
  if (recherches.length === 0) {
    throw new Error(
      'assertNoFullLastName : aucun nom de famille exploitable fourni (il en faut d\'au moins '
      + '4 caractères). Un jeu d\'essai qui ne porte que des noms courts ne peut pas exprimer '
      + 'le défaut — l\'assertion serait verte sans rien vérifier.'
    );
  }

  return page.evaluate((aChercher) => {
    const normaliser = (s) => (s || '').replace(/\s+/g, ' ').toLowerCase();
    const problemes = [];
    // On parcourt les nœuds TEXTE : c'est le plus fin, et cela évite de signaler dix fois le
    // même nom pour chaque ancêtre qui le contient aussi.
    const marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let noeud = marcheur.nextNode();
    while (noeud) {
      const contenu = normaliser(noeud.textContent);
      if (contenu) {
        for (const nom of aChercher) {
          if (contenu.includes(normaliser(nom))) {
            problemes.push({
              nom,
              extrait: (noeud.textContent || '').trim().slice(0, 120),
              parent: noeud.parentElement ? noeud.parentElement.tagName.toLowerCase() : '?',
            });
          }
        }
      }
      noeud = marcheur.nextNode();
    }
    return problemes;
  }, recherches);
}

/**
 * Échoue si un nom de famille complet apparaît dans le DOM, et vérifie d'abord que la page
 * contient bien quelque chose à inspecter.
 *
 * ⚠️ `minNoeuds` : une page vide ne contient aucun nom de famille — et cette assertion serait
 * donc verte sur un écran qui n'a pas fini de charger, ou qui a planté. On exige donc une
 * TAILLE avant d'affirmer quoi que ce soit sur l'ensemble (règle du 03/10/2026 : affirmer la
 * taille d'un ensemble avant d'affirmer une propriété de ses éléments).
 */
export async function assertNoFullLastName(page, noms, ecran, minNoeuds = 5) {
  const nbNoeudsTexte = await page.evaluate(() => {
    const marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n = 0;
    while (marcheur.nextNode()) n += 1;
    return n;
  });
  if (nbNoeudsTexte < minNoeuds) {
    throw new Error(
      `assertNoFullLastName (${ecran}) : la page ne contient que ${nbNoeudsTexte} nœud(s) texte, `
      + `moins que les ${minNoeuds} attendus. Une page vide ne divulgue aucun nom : l'assertion `
      + 'aurait été verte sans rien vérifier.'
    );
  }

  const problemes = await collectFullLastNames(page, noms);
  if (problemes.length > 0) {
    const detail = problemes
      .slice(0, 5)
      .map((p) => `  « ${p.nom} » dans <${p.parent}> : "${p.extrait}"`)
      .join('\n');
    throw new Error(
      `assertNoFullLastName (${ecran}) : ${problemes.length} nom(s) de famille complet(s) `
      + `affiché(s) sur un écran public.\n${detail}`
    );
  }
}
