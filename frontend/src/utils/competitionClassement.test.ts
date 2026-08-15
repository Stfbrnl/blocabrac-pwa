import { describe, expect, it } from 'vitest';
import {
  getParticipantScores,
  getClassementByCategory,
  getOfficialParticipantTotals,
  getOfficialClassementByCategory,
  rankOfficialEntries,
  type ParticipantBase,
} from './competitionClassement';

interface TestParticipant extends ParticipantBase {
  first_name: string;
}

const alice: TestParticipant = { user_id: 'alice', first_name: 'Alice', gender: 'F', age: 12 };
const bob: TestParticipant = { user_id: 'bob', first_name: 'Bob', gender: 'M', age: 30 };
const participants = [alice, bob];

const boulders = [
  { id: 'b1', color: 'bleu', difficulty: 'bleu' },
  { id: 'b2', color: 'rose', difficulty: 'rose' },
];

describe('getParticipantScores', () => {
  it('renvoie un tableau vide sans résultat', () => {
    expect(getParticipantScores([], participants, boulders)).toEqual([]);
  });

  it('ignore les résultats dont le participant ou le bloc est introuvable', () => {
    const results = [
      { user_id: 'inconnu', boulder_id: 'b1', success: true, attempts: 1 },
      { user_id: 'alice', boulder_id: 'bloc-inexistant', success: true, attempts: 1 },
    ];
    expect(getParticipantScores(results, participants, boulders)).toEqual([]);
  });

  it('additionne les points de chaque bloc réussi et compte les blocs validés', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }, // 100 pts
      { user_id: 'alice', boulder_id: 'b2', success: false, attempts: 3 }, // 0 pt, échec
    ];
    const scores = getParticipantScores(results, participants, boulders);
    expect(scores).toEqual([{ participant: alice, score: 100, boulders: 1 }]);
  });

  it('trie du meilleur score au plus faible', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }, // 100 pts
      { user_id: 'bob', boulder_id: 'b2', success: true, attempts: 1 }, // 1000 pts
    ];
    const scores = getParticipantScores(results, participants, boulders);
    expect(scores.map(s => s.participant.user_id)).toEqual(['bob', 'alice']);
  });

  it('utilise la couleur du bloc plutôt que sa cotation cachée quand les deux diffèrent', () => {
    // Cas "grosse compétition" : difficulty = cotation FFME cachée, color = valeur affichée
    // une fois la compétition terminée. Le barème doit suivre color en priorité.
    const hiddenBoulders = [{ id: 'b1', color: undefined, difficulty: 'bleu' }];
    const results = [{ user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }];
    expect(getParticipantScores(results, participants, hiddenBoulders)).toEqual([
      { participant: alice, score: 100, boulders: 1 },
    ]);
  });

  it('mode "blocs_valides" : additionne points_value sans tenir compte des essais', () => {
    const valBoulders = [
      { id: 'b1', difficulty: 'bleu', points_value: 150 },
      { id: 'b2', difficulty: 'rose', points_value: 900 },
    ];
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 4 },
      { user_id: 'alice', boulder_id: 'b2', success: true, attempts: 1 },
    ];
    expect(getParticipantScores(results, participants, valBoulders, 'blocs_valides'))
      .toEqual([{ participant: alice, score: 1050, boulders: 2 }]);
  });

  it('mode "personnalise" : applique le barème par couleur fourni pour cette compétition', () => {
    const results = [{ user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }];
    const customScoring = { bleu: { base: 999, deduction: 0 } };
    expect(getParticipantScores(results, participants, boulders, 'personnalise', customScoring))
      .toEqual([{ participant: alice, score: 999, boulders: 1 }]);
  });
});

describe('getClassementByCategory', () => {
  const results = [
    { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }, // 100 pts
    { user_id: 'bob', boulder_id: 'b2', success: true, attempts: 1 }, // 1000 pts
  ];

  it('"global" renvoie la même liste plate que getParticipantScores', () => {
    expect(getClassementByCategory(results, participants, boulders, 'global'))
      .toEqual(getParticipantScores(results, participants, boulders));
  });

  it('"gender" groupe les participants par genre', () => {
    const byGender = getClassementByCategory(results, participants, boulders, 'gender');
    expect(byGender).toHaveLength(2);
    const genders = byGender.map(g => g.category).sort();
    expect(genders).toEqual(['F', 'M']);
  });

  it('"gender" range les participants sans genre sous "Inconnu"', () => {
    const noGender: TestParticipant = { user_id: 'sam', first_name: 'Sam' };
    const sansGenreResults = [{ user_id: 'sam', boulder_id: 'b1', success: true, attempts: 1 }];
    const byGender = getClassementByCategory(sansGenreResults, [noGender], boulders, 'gender');
    expect(byGender).toEqual([{ category: 'Inconnu', participants: expect.any(Array) }]);
  });

  it('"age" groupe les participants par catégorie FFME', () => {
    const byAge = getClassementByCategory(results, participants, boulders, 'age');
    // Alice (12 ans) et Bob (30 ans, "Open") tombent dans des catégories FFME différentes
    expect(byAge.length).toBeGreaterThanOrEqual(2);
    const allParticipants = byAge.flatMap(g => g.participants.map(p => p.participant.user_id));
    expect(allParticipants.sort()).toEqual(['alice', 'bob']);
  });
});

describe('getOfficialParticipantTotals (mode "Officiel FFME/coupe du monde")', () => {
  it('renvoie un tableau vide sans résultat', () => {
    expect(getOfficialParticipantTotals([], participants)).toEqual([]);
  });

  it('compte les tops, zones et essais séparément', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 2, zone: true, attempts_to_zone: 1 },
      { user_id: 'alice', boulder_id: 'b2', success: false, attempts: 3, zone: true, attempts_to_zone: 2 },
    ];
    const totals = getOfficialParticipantTotals(results, participants);
    expect(totals).toEqual([{
      participant: alice,
      totals: { tops: 1, zones: 2, attemptsToTop: 2, attemptsToZone: 1 + 2 },
    }]);
  });

  it('un top compte comme zone même si "zone" n\'a pas été explicitement coché', () => {
    // ✅ Repli pour un résultat écrit par un ancien client / avant ce chantier.
    const results = [{ user_id: 'alice', boulder_id: 'b1', success: true, attempts: 3 }];
    const totals = getOfficialParticipantTotals(results, participants);
    expect(totals[0].totals).toEqual({ tops: 1, zones: 1, attemptsToTop: 3, attemptsToZone: 3 });
  });

  it('classe par tops (le plus), départage par zones (le plus)', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
      { user_id: 'bob', boulder_id: 'b1', success: false, attempts: 5, zone: true, attempts_to_zone: 1 },
      { user_id: 'bob', boulder_id: 'b2', success: false, attempts: 5, zone: true, attempts_to_zone: 1 },
    ];
    const totals = getOfficialParticipantTotals(results, participants);
    // Alice : 1 top, 1 zone. Bob : 0 top, 2 zones. Le top d'Alice prime toujours.
    expect(totals.map(t => t.participant.user_id)).toEqual(['alice', 'bob']);
  });

  it('à tops et zones égaux, départage par le moins d\'essais au top', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 4, zone: true, attempts_to_zone: 1 },
      { user_id: 'bob', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    ];
    const totals = getOfficialParticipantTotals(results, participants);
    expect(totals.map(t => t.participant.user_id)).toEqual(['bob', 'alice']); // Bob : moins d'essais
  });

  it('à tops/zones/essais-top égaux, départage final par le moins d\'essais à la zone', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 3, zone: true, attempts_to_zone: 3 },
      { user_id: 'bob', boulder_id: 'b1', success: true, attempts: 3, zone: true, attempts_to_zone: 1 },
    ];
    const totals = getOfficialParticipantTotals(results, participants);
    expect(totals.map(t => t.participant.user_id)).toEqual(['bob', 'alice']);
  });

  it('essais à la zone se replie sur "attempts" si "attempts_to_zone" est absent', () => {
    const results = [{ user_id: 'alice', boulder_id: 'b1', success: false, attempts: 4, zone: true }];
    const totals = getOfficialParticipantTotals(results, participants);
    expect(totals[0].totals.attemptsToZone).toBe(4);
  });
});

describe('getOfficialClassementByCategory', () => {
  const results = [
    { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'bob', boulder_id: 'b1', success: true, attempts: 2, zone: true, attempts_to_zone: 1 },
  ];

  it('"global" renvoie la même liste que getOfficialParticipantTotals', () => {
    expect(getOfficialClassementByCategory(results, participants, 'global'))
      .toEqual(getOfficialParticipantTotals(results, participants));
  });

  it('"gender" groupe les participants par genre', () => {
    const byGender = getOfficialClassementByCategory(results, participants, 'gender');
    expect(byGender.map(g => g.category).sort()).toEqual(['F', 'M']);
  });

  it('"age" groupe les participants par catégorie FFME', () => {
    const byAge = getOfficialClassementByCategory(results, participants, 'age');
    const allParticipants = byAge.flatMap(g => g.participants.map(p => p.participant.user_id));
    expect(allParticipants.sort()).toEqual(['alice', 'bob']);
  });
});

describe('rankOfficialEntries (§B.4 : égalités massives sur l\'écran live)', () => {
  const carol: TestParticipant = { user_id: 'carol', first_name: 'Carol', gender: 'F', age: 20 };

  it('renvoie un tableau vide sans entrée', () => {
    expect(rankOfficialEntries([])).toEqual([]);
  });

  it('classement 1..N sans aucune égalité', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
      { user_id: 'bob', boulder_id: 'b1', success: false, attempts: 3, zone: true, attempts_to_zone: 3 },
    ];
    const totals = getOfficialParticipantTotals(results, participants);
    expect(rankOfficialEntries(totals)).toEqual([1, 2]);
  });

  it('égalité parfaite en tête : rang de compétition (1, 1, 3), pas séquentiel (1, 2, 3)', () => {
    // Alice et Bob strictement à égalité (0 top, 0 zone chacun) ; Carol dernière.
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: false, attempts: 5, zone: false, attempts_to_zone: 0 },
      { user_id: 'bob', boulder_id: 'b1', success: false, attempts: 5, zone: false, attempts_to_zone: 0 },
      { user_id: 'carol', boulder_id: 'b1', success: false, attempts: 8, zone: false, attempts_to_zone: 0 },
    ];
    const totals = getOfficialParticipantTotals(results, [alice, bob, carol]);
    // Alice/Bob à égalité totale (0 tops/0 zones/0 essais comptés puisque ni top ni
    // zone) -> même rang 1 ; Carol, à égalité elle aussi (aucun résultat compté),
    // partage donc le même rang que les deux autres : cas "tous à zéro" du §B.4.
    expect(rankOfficialEntries(totals)).toEqual([1, 1, 1]);
  });

  it('ouverture d\'épreuve : "tous à zéro" produit un rang unique pour tout le monde', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: false, attempts: 1 },
      { user_id: 'bob', boulder_id: 'b1', success: false, attempts: 1 },
    ];
    const totals = getOfficialParticipantTotals(results, participants);
    expect(rankOfficialEntries(totals)).toEqual([1, 1]);
  });

  it('après le rang partagé, le suivant saute les positions occupées (1, 1, 3)', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
      { user_id: 'bob', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
      { user_id: 'carol', boulder_id: 'b1', success: false, attempts: 5, zone: true, attempts_to_zone: 3 },
    ];
    const totals = getOfficialParticipantTotals(results, [alice, bob, carol]);
    expect(rankOfficialEntries(totals)).toEqual([1, 1, 3]);
  });
});

// ✅ ADDENDUM-mode-ffme-finale-annee.md §2, "Vérifiabilité à la main — à exploiter" :
// jeu de test correspondant à une finale plausible (10 grimpeurs, 5 blocs), classement
// attendu calculé À LA MAIN puis figé ici — la meilleure garantie disponible à cette
// échelle contre un bug de comparateur, et bon marché puisque le classement complet se
// vérifie au crayon. Inclut délibérément un ex æquo parfait au sommet (Alice/Bob) :
// c'est l'issue probable à cette échelle (§2), pas un cas exceptionnel.
describe('Finale de l\'année — jeu de test calculé à la main (10 grimpeurs / 5 blocs)', () => {
  const finalists: TestParticipant[] = [
    { user_id: 'alice', first_name: 'Alice' },
    { user_id: 'bob', first_name: 'Bob' },
    { user_id: 'carol', first_name: 'Carol' },
    { user_id: 'dave', first_name: 'Dave' },
    { user_id: 'eve', first_name: 'Eve' },
    { user_id: 'frank', first_name: 'Frank' },
    { user_id: 'grace', first_name: 'Grace' },
    { user_id: 'heidi', first_name: 'Heidi' },
    { user_id: 'ivan', first_name: 'Ivan' },
    { user_id: 'judy', first_name: 'Judy' },
  ];

  // Chaque ligne : [user_id, boulder_id, success, attempts, zone, attempts_to_zone].
  // Calcul à la main par grimpeur (tops, zones, essais-top cumulés, essais-zone cumulés) :
  //   Alice (5,5,6,6)  Bob   (5,5,6,6) <- ex æquo parfait, volontaire
  //   Carol (4,5,7,11) Dave  (3,4,4,7)
  //   Eve   (3,3,6,6)  Frank (2,3,2,4)
  //   Grace (1,2,2,7)  Heidi (0,2,0,7)
  //   Ivan  (0,1,0,5)  Judy  (0,0,0,0) <- a tenté un bloc, sans zone ni top
  const finaleResults = [
    // Alice : top des 5 blocs, essais 1,1,2,1,1 -> tops=5 zones=5 top=6 zone=6
    { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'alice', boulder_id: 'b2', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'alice', boulder_id: 'b3', success: true, attempts: 2, zone: true, attempts_to_zone: 2 },
    { user_id: 'alice', boulder_id: 'b4', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'alice', boulder_id: 'b5', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    // Bob : top des 5 blocs, essais 1,1,1,1,2 -> tops=5 zones=5 top=6 zone=6 (ex æquo Alice)
    { user_id: 'bob', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'bob', boulder_id: 'b2', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'bob', boulder_id: 'b3', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'bob', boulder_id: 'b4', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'bob', boulder_id: 'b5', success: true, attempts: 2, zone: true, attempts_to_zone: 2 },
    // Carol : top de 4 blocs (1,2,1,3) + zone seule sur b5 (essai 4) -> tops=4 zones=5 top=7 zone=11
    { user_id: 'carol', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'carol', boulder_id: 'b2', success: true, attempts: 2, zone: true, attempts_to_zone: 2 },
    { user_id: 'carol', boulder_id: 'b3', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'carol', boulder_id: 'b4', success: true, attempts: 3, zone: true, attempts_to_zone: 3 },
    { user_id: 'carol', boulder_id: 'b5', success: false, attempts: 5, zone: true, attempts_to_zone: 4 },
    // Dave : top de 3 blocs (1,2,1) + zone seule sur b4 (essai 3), b5 jamais tenté -> tops=3 zones=4 top=4 zone=7
    { user_id: 'dave', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'dave', boulder_id: 'b2', success: true, attempts: 2, zone: true, attempts_to_zone: 2 },
    { user_id: 'dave', boulder_id: 'b3', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'dave', boulder_id: 'b4', success: false, attempts: 3, zone: true, attempts_to_zone: 3 },
    // Eve : top de 3 blocs, essais 3,1,2, aucune zone supplémentaire -> tops=3 zones=3 top=6 zone=6
    { user_id: 'eve', boulder_id: 'b1', success: true, attempts: 3, zone: true, attempts_to_zone: 3 },
    { user_id: 'eve', boulder_id: 'b2', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'eve', boulder_id: 'b3', success: true, attempts: 2, zone: true, attempts_to_zone: 2 },
    // Frank : top de 2 blocs (1,1) + zone seule sur b3 (essai 2) -> tops=2 zones=3 top=2 zone=4
    { user_id: 'frank', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'frank', boulder_id: 'b2', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'frank', boulder_id: 'b3', success: false, attempts: 2, zone: true, attempts_to_zone: 2 },
    // Grace : top de b1 (essai 2) + zone seule sur b2 (essai 5) -> tops=1 zones=2 top=2 zone=7
    { user_id: 'grace', boulder_id: 'b1', success: true, attempts: 2, zone: true, attempts_to_zone: 2 },
    { user_id: 'grace', boulder_id: 'b2', success: false, attempts: 5, zone: true, attempts_to_zone: 5 },
    // Heidi : zone seule sur b1 (essai 3) et b2 (essai 4), aucun top -> tops=0 zones=2 top=0 zone=7
    { user_id: 'heidi', boulder_id: 'b1', success: false, attempts: 3, zone: true, attempts_to_zone: 3 },
    { user_id: 'heidi', boulder_id: 'b2', success: false, attempts: 4, zone: true, attempts_to_zone: 4 },
    // Ivan : zone seule sur b1 (essai 5) -> tops=0 zones=1 top=0 zone=5
    { user_id: 'ivan', boulder_id: 'b1', success: false, attempts: 5, zone: true, attempts_to_zone: 5 },
    // Judy : a tenté b1 (3 essais) sans jamais atteindre la zone ni le top -> (0,0,0,0)
    { user_id: 'judy', boulder_id: 'b1', success: false, attempts: 3, zone: false },
  ];

  it('reproduit le classement calculé à la main, ex æquo parfait au sommet inclus', () => {
    const totals = getOfficialParticipantTotals(finaleResults, finalists);
    const byId = Object.fromEntries(totals.map(t => [t.participant.user_id, t.totals]));

    expect(byId.alice).toEqual({ tops: 5, zones: 5, attemptsToTop: 6, attemptsToZone: 6 });
    expect(byId.bob).toEqual({ tops: 5, zones: 5, attemptsToTop: 6, attemptsToZone: 6 });
    expect(byId.carol).toEqual({ tops: 4, zones: 5, attemptsToTop: 7, attemptsToZone: 11 });
    expect(byId.dave).toEqual({ tops: 3, zones: 4, attemptsToTop: 4, attemptsToZone: 7 });
    expect(byId.eve).toEqual({ tops: 3, zones: 3, attemptsToTop: 6, attemptsToZone: 6 });
    expect(byId.frank).toEqual({ tops: 2, zones: 3, attemptsToTop: 2, attemptsToZone: 4 });
    expect(byId.grace).toEqual({ tops: 1, zones: 2, attemptsToTop: 2, attemptsToZone: 7 });
    expect(byId.heidi).toEqual({ tops: 0, zones: 2, attemptsToTop: 0, attemptsToZone: 7 });
    expect(byId.ivan).toEqual({ tops: 0, zones: 1, attemptsToTop: 0, attemptsToZone: 5 });
    expect(byId.judy).toEqual({ tops: 0, zones: 0, attemptsToTop: 0, attemptsToZone: 0 });

    const orderedIds = totals.map(t => t.participant.user_id);
    const ranks = rankOfficialEntries(totals);
    const rankById = Object.fromEntries(orderedIds.map((id, i) => [id, ranks[i]]));

    // Alice et Bob partagent le rang 1 (ex æquo parfait) ; le suivant (Carol) saute
    // au rang 3, pas 2 — rang de compétition, pas un index séquentiel.
    expect(rankById.alice).toBe(1);
    expect(rankById.bob).toBe(1);
    expect(rankById.carol).toBe(3);
    expect(rankById.dave).toBe(4);
    expect(rankById.eve).toBe(5);
    expect(rankById.frank).toBe(6);
    expect(rankById.grace).toBe(7);
    expect(rankById.heidi).toBe(8);
    expect(rankById.ivan).toBe(9);
    expect(rankById.judy).toBe(10);
  });
});
