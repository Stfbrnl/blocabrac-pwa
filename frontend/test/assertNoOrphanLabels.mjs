// Filet contre les libellés non associés, à appeler depuis n'importe quel e2e Playwright,
// sur chaque écran visité : `await assertNoOrphanLabels(page, 'nom de l\'écran')`.
//
// docs/plans/PLAN-labels-non-associes.md §4.1, avec la spécification corrigée par
// docs/handoffs/RETOUR-labels-apres-dom.md §1.
//
// ⚠️ POURQUOI IL NE FAUT **PAS** EXIGER UN `for` SUR CHAQUE LIBELLÉ
//
// La tentation est d'écrire « tout <label> porte un for qui résout vers un champ ». Ce serait
// reproduire l'heuristique de Chrome — et donc être **rouge sur 73 libellés corrects** de ce
// dépôt. Un `Select` MUI rend une `div role="combobox"` plus un `<input>` caché ; l'`id` passé
// au `Select` atterrit sur la div, qui n'est pas un élément étiquetable. Le câblage correct
// d'un combobox n'est pas `for` mais `aria-labelledby`, que `labelId` pose déjà. Vérifié dans
// le DOM rendu le 03/10/2026 (docs/handoffs/RETOUR-labels-dom-lu.md), après qu'un `htmlFor`
// ajouté « pour bien faire » ait simplement fait remplacer un signalement Chrome par un autre.
//
// Cette assertion vérifie donc ce qui compte réellement pour un lecteur d'écran — **qu'un
// contrôle porte un nom accessible** — sans exiger le mécanisme particulier par lequel ce nom
// lui arrive. Elle est en cela meilleure que l'outil du navigateur.
//
// ⚠️ ET POURQUOI `aria-hidden` N'EST EXCLU QUE D'UNE DES TROIS VÉRIFICATIONS
//
// Les deux règles tirent sur le même attribut en sens inverse (RETOUR-labels-addendum-htmlfor.md §3) :
//   - un champ `aria-hidden` **n'est pas tenu** d'avoir un id/name : `TextareaAutosize` crée un
//     textarea fantôme pour mesurer la hauteur d'un champ multiligne, rendu par MUI, sans id,
//     hors de portée du dépôt (17 occurrences). L'exiger rendrait le filet rouge à vie.
//   - mais un champ `aria-hidden` **reste une cible valide** pour un libellé.
// L'exclusion porte donc sur la vérification n°2 seulement, jamais sur la résolution des n°1/n°3.

// Éléments auxquels un attribut `for` peut légalement se rapporter (spécification HTML).
const ETIQUETABLES = ['input', 'select', 'textarea', 'button', 'meter', 'output', 'progress'];

export async function collectLabelProblems(page) {
  return page.evaluate((etiquetables) => {
    const problemes = [];
    const decrire = (el) => {
      const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return txt || `<${el.tagName.toLowerCase()}>`;
    };

    // Tous les id référencés par un aria-labelledby, quel qu'en soit le porteur.
    const referencesAria = new Set();
    document.querySelectorAll('[aria-labelledby]').forEach((el) => {
      (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .forEach((id) => referencesAria.add(id));
    });

    // ── Vérification n°1 : tout libellé porte un nom accessible, par l'un des deux chemins.
    document.querySelectorAll('label').forEach((label) => {
      const pour = label.getAttribute('for');
      const propreId = label.getAttribute('id');

      // Chemin A : `for` résolvant vers un élément étiquetable.
      if (pour) {
        const cible = document.getElementById(pour);
        if (!cible) {
          problemes.push(`libellé "${decrire(label)}" : for="${pour}" ne résout vers aucun élément`);
          return;
        }
        if (!etiquetables.includes(cible.tagName.toLowerCase())) {
          problemes.push(
            `libellé "${decrire(label)}" : for="${pour}" désigne un <${cible.tagName.toLowerCase()}>, `
            + `qui n'est pas étiquetable — utiliser aria-labelledby pour ce contrôle`
          );
          return;
        }
        return; // associé
      }

      // Chemin B : son propre id est référencé par un aria-labelledby.
      if (propreId && referencesAria.has(propreId)) return; // associé

      // Chemin C : le champ est imbriqué dans le libellé (FormControlLabel, cases à cocher).
      if (label.control) return; // associé

      problemes.push(
        `libellé "${decrire(label)}" : ni for, ni id référencé par un aria-labelledby, `
        + `ni champ imbriqué — ce contrôle n'a aucun nom accessible`
      );
    });

    // ── Vérification n°2 : tout champ porte un id ou un name. `aria-hidden` exclu — et
    // seulement ici (voir l'en-tête).
    document.querySelectorAll('input, select, textarea').forEach((champ) => {
      if (champ.closest('[aria-hidden="true"]') || champ.getAttribute('aria-hidden') === 'true') return;
      // Un champ non remplissable automatiquement n'intéresse pas l'autofill, et Chrome ne le
      // signale pas non plus (vérifié : 4 champs sans id/name pour 2 signalements sur l'écran
      // des blocs quotidiens, fichier et case à cocher non retenus).
      const type = (champ.getAttribute('type') || '').toLowerCase();
      if (['file', 'checkbox', 'radio', 'submit', 'button', 'reset', 'hidden'].includes(type)) return;
      if (!champ.id && !champ.getAttribute('name')) {
        problemes.push(`champ <${champ.tagName.toLowerCase()}${type ? ' type=' + type : ''}> sans id ni name`);
      }
    });

    // ── Vérification n°3 : aucun id dupliqué parmi libellés et champs.
    // C'est le défaut que produit un identifiant codé en dur à l'intérieur d'une boucle de
    // rendu : N éléments partagent le même id, et aria-labelledby pointe vers le premier pour
    // toutes les lignes. Un défaut à la place d'un autre, invisible des deux signalements
    // Chrome. Les deux Select en boucle de ClientCourseSession.tsx dérivent pour cette raison
    // leur id de la donnée.
    const vus = new Map();
    document.querySelectorAll('label[id], input[id], select[id], textarea[id]').forEach((el) => {
      vus.set(el.id, (vus.get(el.id) || 0) + 1);
    });
    vus.forEach((n, id) => {
      if (n > 1) problemes.push(`id="${id}" présent ${n} fois (identifiant figé dans une boucle de rendu ?)`);
    });

    return problemes;
  }, ETIQUETABLES);
}

export async function assertNoOrphanLabels(page, ecran) {
  const problemes = await collectLabelProblems(page);
  if (problemes.length > 0) {
    throw new Error(
      `${problemes.length} libellé(s)/champ(s) non conforme(s) sur « ${ecran} » :\n`
      + problemes.map((p) => `      - ${p}`).join('\n')
    );
  }
}
