// Contrat d'écriture sur `competitions.registered_count`, vérifié SUR LES SOURCES.
//
// POURQUOI UN TEST QUI LIT DU CODE PLUTÔT QUE QUI L'EXÉCUTE. `registered_count` est le seul
// document de l'application qu'un grand nombre de comptes écrivent en même temps. Jusqu'au
// 19/10/2026, deux de ses trois rédacteurs relisaient le compteur AU MONTAGE de l'écran puis le
// réécrivaient (`selectedCompetition.registered_count + 1`), écrasant toute inscription arrivée
// entre-temps : mesuré sur l'émulateur, 5 inscriptions perdues sur 6 dans le scénario du soir
// d'un contest — l'admin inscrit un retardataire au comptoir pendant que d'autres s'inscrivent
// sur leur téléphone.
//
// ⚠️ `audit-prod-catalog.js` surveille désormais la CONSÉQUENCE (un compteur faux en base), mais
// rien ne surveillait le RETOUR EN ARRIÈRE : un `registered_count: x + 1` réintroduit dans un
// composant ne se verrait qu'après une soirée de concurrence réelle, c'est-à-dire après les
// dégâts. Et un test qui exécute le code ne peut pas l'attraper non plus : la mise à jour perdue
// n'apparaît QUE sous concurrence, et aucun test du dépôt n'en fabrique.
//
// Le contrat, lui, est statique. Il se garde donc statiquement, et il échoue à `npm test` —
// pendant qu'on écrit le code (ClaudeNav, `docs/handoffs/2026-10-19-CN-apres-le-nombre.md` §2).
//
// LA RÈGLE, et sa seule exception : dans tout appel d'écriture Firestore de `frontend/src` qui
// pose `registered_count`, la valeur doit être `increment(…)` — ou le littéral `0`, à la
// création d'une compétition, où il n'y a encore aucun inscrit et où un incrément n'aurait aucun
// sens.
//
// ⚠️ CE QUE CE FILET NE COUVRE PAS. Il reconnaît les appels d'écriture par leur NOM
// (`setDoc`/`updateDoc`/`addDoc`/`.update(`/`.set(`) : une écriture passant par un alias, un
// `writeBatch` dont la méthode serait appelée autrement, ou du code hors de `frontend/src`
// (scripts d'administration) lui échappent. Il attrape la régression décrite, grossièrement et
// exhaustivement, pas toutes les façons imaginables d'écrire ce champ.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RACINE = join(__dirname, '..', '..', 'src');
const CHAMP = 'registered_count';
const OUVERTURES = ['setDoc(', 'updateDoc(', 'addDoc(', '.update(', '.set('];

const fichiersSources = (dossier: string): string[] => {
  const sorties: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      sorties.push(...fichiersSources(chemin));
    } else if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) {
      sorties.push(chemin);
    }
  }
  return sorties;
};

/**
 * Le texte d'un appel, de sa parenthèse ouvrante à sa fermante équilibrée.
 *
 * ⚠️ Volontairement naïf : il ne sait pas qu'une parenthèse peut vivre dans une chaîne de
 * caractères. Le risque est d'étendre un appel trop loin, donc de rendre le filet plus
 * PERMISSIF — jamais de fabriquer un faux rouge. Un filet grossier qui ne crie pas à tort est
 * un filet qu'on garde.
 */
const appelEquilibre = (source: string, indexParenthese: number): string => {
  let profondeur = 0;
  for (let i = indexParenthese; i < source.length; i++) {
    if (source[i] === '(') profondeur += 1;
    else if (source[i] === ')') {
      profondeur -= 1;
      if (profondeur === 0) return source.slice(indexParenthese, i + 1);
    }
  }
  return source.slice(indexParenthese);
};

interface Ecriture {
  fichier: string;
  ligne: number;
  texte: string;
}

const ecrituresDuChamp = (): Ecriture[] => {
  const trouvees: Ecriture[] = [];
  for (const chemin of fichiersSources(RACINE)) {
    const source = readFileSync(chemin, 'utf8');
    if (!source.includes(CHAMP)) continue;
    for (const ouverture of OUVERTURES) {
      let depuis = 0;
      for (;;) {
        const i = source.indexOf(ouverture, depuis);
        if (i < 0) break;
        depuis = i + ouverture.length;
        const texte = appelEquilibre(source, i + ouverture.length - 1);
        if (!texte.includes(`${CHAMP}:`)) continue;
        trouvees.push({
          fichier: chemin.slice(RACINE.length + 1).replace(/\\/g, '/'),
          ligne: source.slice(0, i).split('\n').length,
          texte,
        });
      }
    }
  }
  return trouvees;
};

/** La valeur posée sur `registered_count` dans un texte d'appel, normalisée. */
const valeurPosee = (texte: string): string => {
  const m = texte.match(new RegExp(`${CHAMP}\\s*:\\s*([^,}\\n]+)`));
  return (m ? m[1] : '').trim();
};

describe('contrat : competitions.registered_count ne s\'écrit que par increment()', () => {
  const ecritures = ecrituresDuChamp();

  // ⚠️ AFFIRMER LA TAILLE AVANT D'AFFIRMER SUR L'ENSEMBLE. Sans ce pas, le jour où un
  // changement de nommage fait que plus aucun appel n'est reconnu, la boucle ci-dessous
  // parcourrait zéro élément et le test resterait VERT — il mesurerait alors sa propre cécité.
  // Trois rédacteurs au 19/10/2026 : l'auto-inscription du grimpeur, l'ajout au comptoir, le
  // retrait au comptoir, « Générer le roster », et la création d'une compétition.
  it('trouve bien les écritures de ce champ dans les sources', () => {
    expect(ecritures.length).toBeGreaterThanOrEqual(5);
  });

  it('chacune pose increment(), ou le littéral 0 à la création', () => {
    const fautives = ecritures
      .map((e) => ({ ...e, valeur: valeurPosee(e.texte) }))
      .filter((e) => !e.valeur.startsWith('increment(') && e.valeur !== '0');

    expect(
      fautives.map((e) => `${e.fichier}:${e.ligne} → registered_count: ${e.valeur}`),
      'Une valeur calculée depuis l\'état React écrase les inscriptions concurrentes : '
      + 'utiliser increment(), résolu côté serveur.'
    ).toEqual([]);
  });
});
