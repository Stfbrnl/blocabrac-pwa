// Contrat de CYCLE DE VIE de `boulders.points_multiplier`, vérifié SUR LES SOURCES.
//
// POURQUOI UN TEST QUI LIT DU CODE PLUTÔT QUE QUI L'EXÉCUTE. Le contrat de ce champ est une
// asymétrie à trois temps (2026-11-03-CN-plan-multiplicateur-v2.md §0), et deux de ses trois
// clauses sont des ABSENCES — or une absence ne s'observe pas en exécutant un geste :
//
//   | moment                                          | points_value | points_multiplier |
//   |-------------------------------------------------|--------------|-------------------|
//   | rattachement  (handleConfirmAddExisting)        | —            | EFFACER           |
//   | retrait       (handleConfirmRemove)             | effacé       | EFFACER           |
//   | clôture       (handleConfirmMigrate)            | effacé       | CONSERVER         |
//
// La clause qui compte le plus est la troisième, et c'est celle qu'aucun test d'exécution
// n'attrape : `competition_results` ne stocke QUE des faits bruts (succès, essais, note,
// cotation proposée) et jamais de points — les points sont recalculés à chaque affichage
// depuis le bloc et le mode. Effacer le multiplicateur à la clôture rendrait donc au simple,
// pour toujours, les blocs doublés d'une épreuve terminée. Le défaut n'apparaîtrait qu'à la
// consultation d'un classement passé, des semaines plus tard, et il ressemblerait trait pour
// trait à un classement normal : rien ne crie, aucun écran n'affiche « ×1 » là où il y avait
// « ×2 ». La première version de ce plan prescrivait justement cet effacement.
//
// ⚠️ Et la symétrie : CONSERVER à la clôture ouvre le défaut inverse (un bloc quotidien
// réutilisé plus tard hériterait du ×2), que la remise à zéro AU RATTACHEMENT ferme. Les deux
// clauses se tiennent ; en vérifier une seule laisserait l'autre se perdre à la réécriture
// suivante. Elles sont donc gardées ensemble, et chacune a été vue rouge séparément.
//
// ⚠️ CE QUE CE FILET NE COUVRE PAS. Il lit le corps de trois fonctions désignées PAR LEUR NOM
// dans un fichier désigné par son chemin : un renommage, un déplacement vers un autre module,
// ou un QUATRIÈME site d'écriture qui changerait un bloc de compétition lui échappent — comme
// le contrat de `registered_count`, c'est un filet contre le retour en arrière, pas une preuve
// d'exhaustivité. Il échoue bruyamment si l'un des trois noms disparaît, ce qui est
// précisément le signal qu'il faut relire ce fichier.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const FICHIER = join(
  __dirname, '..', '..', 'src', 'pages', 'Ouvreur', 'CompetitionBoulders', 'CompetitionBouldersList.tsx'
);
const CHAMP = 'points_multiplier';
const source = readFileSync(FICHIER, 'utf8');

/**
 * Le CORPS d'un `const <nom> = async (...)` : de sa déclaration à la déclaration suivante au
 * même niveau d'indentation (`\n  const `) ou à la fin du fichier.
 *
 * ⚠️ Volontairement grossier, et dans le sens sûr : trop long plutôt que trop court. Un corps
 * étendu trop loin rend le filet plus PERMISSIF sur les absences attendues (il verrait un
 * `points_multiplier` voisin et crierait)... donc il produirait un faux ROUGE, pas un faux
 * vert. C'est l'inverse du compromis de `registreredCount` : ici, se tromper fait du bruit, et
 * du bruit se corrige. Les commentaires sont retirés AVANT toute recherche — sans quoi le
 * commentaire qui explique pourquoi le champ est absent de handleConfirmMigrate satisferait
 * à lui seul le test qui vérifie qu'il y est présent ailleurs, et contredirait celui qui
 * vérifie son absence ici.
 */
const corpsDeFonction = (nom: string): string => {
  const debut = source.indexOf(`const ${nom} = `);
  expect(debut, `la fonction ${nom} n'existe plus dans ${FICHIER} — relire ce fichier de contrat`).toBeGreaterThan(-1);
  const apres = source.indexOf('\n  const ', debut + 1);
  const brut = source.slice(debut, apres === -1 ? source.length : apres);
  return brut
    .split(/\r?\n/)
    .filter((ligne) => !/^\s*\/\//.test(ligne))
    .join('\n');
};

describe('Contrat : cycle de vie de boulders.points_multiplier', () => {
  it('le RATTACHEMENT efface le multiplicateur — sinon une compétition hérite du ×2 de la précédente', () => {
    const corps = corpsDeFonction('handleConfirmAddExisting');
    expect(corps).toContain(`${CHAMP}: deleteField()`);
  });

  it('le RETRAIT de l\'épreuve efface le multiplicateur — une correction d\'ajout ne laisse pas de trace', () => {
    const corps = corpsDeFonction('handleConfirmRemove');
    expect(corps).toContain(`${CHAMP}: deleteField()`);
  });

  it('la CLÔTURE ne touche PAS au multiplicateur — c\'est lui seul qui permet de recalculer juste une épreuve terminée', () => {
    const corps = corpsDeFonction('handleConfirmMigrate');
    // La clause centrale du §0, et une absence : aucune écriture de ce champ, sous aucune
    // forme — ni `deleteField()`, ni une valeur, ni un `undefined`.
    expect(corps).not.toContain(CHAMP);
    // ⚠️ Nomme ce qui doit DIFFÉRER : sans cette ligne, le test passerait tout aussi vert si
    // handleConfirmMigrate avait cessé d'écrire quoi que ce soit (ou si `corpsDeFonction`
    // rendait du vide). `points_value`, lui, DOIT y être effacé — c'est le champ dont
    // `points_multiplier` se distingue, et c'est le seul moyen de prouver qu'on a bien lu un
    // corps de fonction qui écrit.
    expect(corps).toContain('points_value: deleteField()');
  });
});
