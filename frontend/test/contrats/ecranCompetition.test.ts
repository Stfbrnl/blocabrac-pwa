// CONTRAT DE L'ÉCRAN DE VALIDATION D'UNE COMPÉTITION — §B.1 du plan du 06/11/2026.
//
// 🔴 LE SIGNAL D'ALARME DE LA PARTIE B : « Replier une section démonte ses lignes. Une écriture
// débouncée en attente doit survivre. » Le debounce est à 2 500 ms : un grimpeur règle son
// nombre d'essais, replie la section dans la foulée, et la validation peut être perdue — sans
// message, sur l'écran où l'on ne perd jamais une validation.
//
// CE QUI A ÉTÉ VÉRIFIÉ, ET POURQUOI ÇA NE SE TESTE PAS À L'EXÉCUTION. La file
// (`useDebouncedFlushQueue`) et l'état des saisies (`validationResults`) vivent dans le
// composant `ClientCompetitions`, et les cartes de blocs sont du **JSX inline** dans un
// `.map()`, pas un composant par ligne. Il n'existe donc rien à démonter qui porterait une
// écriture : `<Collapse unmountOnExit>` retire du JSX, pas un propriétaire de file. La
// propriété est STRUCTURELLE, et une propriété structurelle ne s'observe pas en exécutant un
// geste — elle s'observe en lisant qui possède quoi.
//
// Ce que ce fichier garde, c'est donc le jour où quelqu'un extraira « proprement » une carte ou
// une section en composant et y emmènera la file avec elle. Ce jour-là le défaut sera invisible
// : l'écran marchera, et seules les validations suivies d'un repli dans les 2,5 s manqueront.
//
// ⚠️ CE QUE CE FILET NE COUVRE PAS : il lit un fichier désigné par son chemin. Un déplacement
// de l'écran, ou une file introduite dans un AUTRE fichier qui rendrait ces cartes, lui
// échappent. Il est un garde contre le retour en arrière, pas une preuve d'absence.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, '../../src/pages/Client/Competitions/ClientCompetitions.tsx'),
  'utf8',
);

describe('contrat §B.1 — une écriture débouncée survit au repli d’une section', () => {
  it('il y a EXACTEMENT UNE file débouncée dans cet écran', () => {
    expect((source.match(/useDebouncedFlushQueue</g) ?? []).length).toBe(1);
  });

  it("l'écran ne définit QU'UN SEUL composant : aucune carte ni section n'a de cycle de vie propre", () => {
    // ⚠️ C'est la clause qui porte tout le reste. Un second composant dans ce fichier serait
    // le candidat évident pour y déplacer la file — et le repli le démonterait.
    expect((source.match(/:\s*React\.FC/g) ?? []).length).toBe(1);
    expect(source).toMatch(/const ClientCompetitions: React\.FC/);
  });

  it('et le repli DÉMONTE bien : sans ça, les deux clauses ci-dessus ne garderaient rien', () => {
    // ⚠️ La grandeur qui rend les deux premières utiles. Si le `Collapse` gardait ses enfants
    // montés, il n'y aurait aucun risque à garder — et un filet qui ne garde rien est pire
    // qu'un filet absent, parce qu'il rassure.
    expect(source).toMatch(/<Collapse in=\{ouvert\} unmountOnExit>/);
  });
});

describe('contrat §B.2 — le filtre et le tri, au point de câblage', () => {
  it("le filtre masque l'INSTANTANÉ, jamais l'ensemble vivant des réussis", () => {
    // ⚠️ `competitionBoulderGroups.ts` sépare `validatedIds` (compter) de `hiddenIds`
    // (masquer), et ses tests le vérifient. Mais la séparation ne vaut que si l'écran branche
    // le bon état sur le bon paramètre : passer `reussisIds` en `hiddenIds` ferait disparaître
    // la ligne sous le doigt, et aucun test du module pur ne le verrait.
    expect(source).toMatch(/hiddenIds: masquerReussis \? idsMasques : undefined/);
    expect(source).not.toMatch(/hiddenIds: reussisIds/);
  });

  it("l'instantané ne se reprend QUE sur un geste délibéré, jamais sur une validation", () => {
    // Deux appels, et seulement deux : le basculement du filtre, et l'ouverture d'un mur.
    expect((source.match(/rafraichirInstantane\(\)/g) ?? []).length).toBe(2);
    expect(source).toMatch(/if \(ouvre && masquerReussis\) rafraichirInstantane\(\);/);
  });

  it('🔴 le tri par couleur est conjoint à la condition dérivée de la donnée', () => {
    // La fuite : en format mixte, la position d'un bloc à cotation cachée dans une liste triée
    // par couleur révélerait sa cotation. Le module refuse déjà de trier dans ce cas (défense
    // en profondeur), mais l'écran ne doit pas non plus le DEMANDER.
    expect(source).toMatch(/sortByColor: triParCouleur && triCouleurPossible/);
    expect(source).toMatch(/const triCouleurPossible = peutTrierParCouleur\(boulders\)/);
  });

  it("l'interrupteur de tri n'est pas rendu quand la donnée l'interdit", () => {
    expect(source).toMatch(/\{triCouleurPossible && \(/);
  });

  it("CLAUSE D'ABSENCE : plus aucun tri global par numéro ne reste dans cet écran", () => {
    // ⚠️ C'était LE défaut d'origine : `a.number - b.number` sur toute la salle entrelaçait
    // les sept murs, en mettant tous les n°1 ensemble.
    expect(source).not.toMatch(/\.sort\(\(a, b\) => a\.number - b\.number\)/);
  });
});

// ============================================================================
// §B.3 — LE NUMÉRO ÉCRIT SUR LA PRISE, côté ouvreur.
//
// 🔴 « Réorganiser les numéros » écrit UNE OPÉRATION PAR BLOC. Avant le 06/11/2026 son
// périmètre était `boulders`, c'est-à-dire TOUS les blocs rattachés — blocs quotidiens
// réutilisés compris, dont le `number` est le numéro écrit sur la prise dans la salle. Un clic
// désynchronisait l'application du physique, et le geste ne le disait pas.
//
// ⚠️ C'est la même leçon que V2.79, dans le même fichier : un périmètre d'OPÉRATION DE DONNÉE
// ne doit jamais dériver de ce qui est affiché. D'où un module pur (`competitionRenumbering`)
// et non un `filter` en ligne — et d'où ce contrat, qui vérifie que l'écran l'utilise bien.
// ============================================================================
describe('contrat §B.3 — la renumérotation ne touche que les blocs créés pour l’épreuve', () => {
  const ouvreur = readFileSync(
    resolve(__dirname, '../../src/pages/Ouvreur/CompetitionBoulders/CompetitionBouldersList.tsx'),
    'utf8',
  );

  it('le périmètre du writeBatch est la partition, jamais la liste entière', () => {
    expect(ouvreur).toMatch(/const \{ renumerotables, proteges \} = partitionnerRenumerotables\(boulders\)/);
    expect(ouvreur).toMatch(/for \(const lot of decouperEnLots\(renumerotables\)\)/);
  });

  it("CLAUSE D'ABSENCE : plus aucun découpage sur `boulders` entier dans la renumérotation", () => {
    // ⚠️ L'ancienne ligne, mot pour mot. Sans cette clause, quelqu'un pourrait rajouter le
    // bon filtre ET laisser l'ancien appel : les deux boucles coexisteraient, la seconde
    // défaisant la protection de la première.
    expect(ouvreur).not.toMatch(/decouperEnLots\(boulders\)/);
  });

  it('le champ du numéro est désactivé pour un bloc protégé', () => {
    expect(ouvreur).toMatch(/disabled=\{!estRenumerotable\(boulder\)\}/);
  });

  it('les deux messages ANNONCENT le périmètre, succès comme no-op', () => {
    // ⚠️ Un succès silencieux sur un sous-ensemble est indiscernable d'un succès sur
    // l'ensemble : l'ouvreur repartirait en croyant toute la liste renumérotée. Les deux
    // branches citent donc `proteges.length`.
    expect((ouvreur.match(/proteges\.length === 0/g) ?? []).length).toBe(2);
    expect((ouvreur.match(/proteges\.length \+ ' bloc\(s\)/g) ?? []).length).toBe(2);
  });
});
