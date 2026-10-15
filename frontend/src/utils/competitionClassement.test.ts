import { describe, expect, it } from 'vitest';
import {
  getParticipantScores,
  getClassementByCategory,
  getOfficialParticipantTotals,
  getOfficialClassementByCategory,
  rankOfficialEntries,
  rankedOfficialEntries,
  rankPointEntries,
  type ParticipantBase,
} from './competitionClassement';

interface TestParticipant extends ParticipantBase {
  first_name: string;
}

const alice: TestParticipant = { user_id: 'alice', first_name: 'Alice', gender: 'F', legacyAge: 12 };
const bob: TestParticipant = { user_id: 'bob', first_name: 'Bob', gender: 'M', legacyAge: 30 };
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
    // tieBreak (03/10/2026) : seul le bloc RÉUSSI y figure, avec sa valeur au 1er essai.
    expect(scores).toEqual([
      { participant: alice, score: 100, boulders: 1, tieBreak: [{ hardness: 100, attempts: 1 }] },
    ]);
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
      { participant: alice, score: 100, boulders: 1, tieBreak: [{ hardness: 100, attempts: 1 }] },
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
      .toEqual([{
        participant: alice, score: 1050, boulders: 2,
        // Trié du plus dur au moins dur : ici la « dureté » est le points_value du bloc,
        // la couleur ne reflétant plus la difficulté dans ce mode.
        tieBreak: [{ hardness: 900, attempts: 1 }, { hardness: 150, attempts: 4 }],
      }]);
  });

  it('mode "personnalise" : applique le barème par couleur fourni pour cette compétition', () => {
    const results = [{ user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }];
    const customScoring = { bleu: { base: 999, deduction: 0 } };
    expect(getParticipantScores(results, participants, boulders, 'personnalise', customScoring))
      .toEqual([{
        participant: alice, score: 999, boulders: 1,
        tieBreak: [{ hardness: 999, attempts: 1 }],
      }]);
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
  const carol: TestParticipant = { user_id: 'carol', first_name: 'Carol', gender: 'F', legacyAge: 20 };

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

  // ⚠️ Le message d'annonce publié aux grimpeurs numérotait le mode officiel en
  // `index + 1` jusqu'au 03/10/2026 : il annonçait donc 1, 2, 3 là où l'écran affichait
  // 1, 1, 3. Trouvé en vérifiant que le départage des modes à points couvrait bien les
  // quatre formats. `rankedOfficialEntries` est désormais la seule source des rangs
  // annoncés, et elle doit donner exactement ceux de `rankOfficialEntries`.
  it('rankedOfficialEntries apparie les mêmes rangs partagés que rankOfficialEntries', () => {
    const results = [
      { user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
      { user_id: 'bob', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
      { user_id: 'carol', boulder_id: 'b1', success: false, attempts: 5, zone: true, attempts_to_zone: 3 },
    ];
    const totals = getOfficialParticipantTotals(results, [alice, bob, carol]);
    const apparie = rankedOfficialEntries(totals);
    expect(apparie.map((r) => r.rank)).toEqual(rankOfficialEntries(totals));
    expect(apparie.map((r) => r.rank), 'un ex æquo annoncé 1, 2 serait un démenti de l\'écran')
      .toEqual([1, 1, 3]);
    expect(apparie.map((r) => r.entry.participant.user_id)).toEqual(['alice', 'bob', 'carol']);
  });
});

// ✅ docs/plans/ADDENDUM-mode-ffme-finale-annee.md §2, "Vérifiabilité à la main — à exploiter" :
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

// ============================================================================================
// ÉPINGLAGE des trois classements existants (open / genre / âge)
//
// docs/plans/PLAN-classements-competition-5-novembre.md §4.1 : avant d'ajouter un quatrième
// classement (par niveau max) et un critère de départage supplémentaire, ce test fixe l'ORDRE
// COMPLET, les RANGS et les EX ÆQUO des trois classements actuels sur un jeu figé. Il doit
// rester vert À L'IDENTIQUE après le chantier : s'il bouge, c'est qu'on a changé un résultat
// déjà visible par les grimpeurs, ce que la consigne interdit.
//
// ⚠️ Ce que ce jeu de données est capable d'exprimer, et c'est délibéré (règle du 03/10 :
// « quels défauts ce jeu est-il physiquement incapable d'exprimer ? ») :
//   - deux participants au moins dans chaque partition non singleton (genre Homme : 5,
//     Femme : 3 ; âge Séniors : 4, U14 : 2) — un groupe à un seul grimpeur ne peut exhiber
//     aucun défaut d'ordre ni de rang partagé ;
//   - un EX ÆQUO RÉEL (gus / hugo : mêmes points, même liste de blocs réussis, mêmes essais),
//     visible simultanément dans les trois classements, puisqu'ils partagent genre et
//     catégorie d'âge ;
//   - des groupes singletons (U16, Vétérans 1) à côté, pour que l'ordre des groupes soit lui
//     aussi épinglé ;
//   - des ÉCHECS avec des essais (eli, dan), que le barème doit ignorer.
//
// ⚠️ gus et hugo ont aussi le MÊME nombre total d'essais, échecs compris (3 sur le bloc
// échoué). C'est volontaire : le critère de départage secondaire ajouté par ce chantier
// (« le moins d'essais au total ») doit donc les laisser ex æquo, et ce test reste vrai mot
// pour mot avant et après. La capacité du nouveau critère à départager est prouvée ailleurs,
// sur une paire faite pour ça — sinon ce test-ci mélangerait l'épinglage et la nouveauté.
describe('Épinglage des classements existants (§4.1 — doit rester identique après le chantier)', () => {
  interface Grimpeur extends ParticipantBase {
    first_name: string;
  }

  const ana: Grimpeur = { user_id: 'ana', first_name: 'Ana', gender: 'Femme', legacyAge: 12 };
  const bea: Grimpeur = { user_id: 'bea', first_name: 'Bea', gender: 'Femme', legacyAge: 30 };
  const cleo: Grimpeur = { user_id: 'cleo', first_name: 'Cleo', gender: 'Femme', legacyAge: 14 };
  const dan: Grimpeur = { user_id: 'dan', first_name: 'Dan', gender: 'Homme', legacyAge: 30 };
  const eli: Grimpeur = { user_id: 'eli', first_name: 'Eli', gender: 'Homme', legacyAge: 12 };
  const fab: Grimpeur = { user_id: 'fab', first_name: 'Fab', gender: 'Homme', legacyAge: 45 };
  const gus: Grimpeur = { user_id: 'gus', first_name: 'Gus', gender: 'Homme', legacyAge: 30 };
  const hugo: Grimpeur = { user_id: 'hugo', first_name: 'Hugo', gender: 'Homme', legacyAge: 30 };
  const contestants = [ana, bea, cleo, dan, eli, fab, gus, hugo];

  // Barème "blocabrac" (celui du Contest Haloween du 5 novembre) :
  // bleu 100/-10, violet 200/-10, rouge 400/-20, noir 600/-20, blanc 800/-50.
  const blocs = [
    { id: 'c1', color: 'bleu', difficulty: 'bleu' },
    { id: 'c2', color: 'violet', difficulty: 'violet' },
    { id: 'c3', color: 'rouge', difficulty: 'rouge' },
    { id: 'c4', color: 'noir', difficulty: 'noir' },
    { id: 'c5', color: 'blanc', difficulty: 'blanc' },
  ];

  const resultats = [
    // fab : noir en 3 (560) + rouge en 5 (320) = 880
    { user_id: 'fab', boulder_id: 'c4', success: true, attempts: 3 },
    { user_id: 'fab', boulder_id: 'c3', success: true, attempts: 5 },
    // bea : blanc en 2 (750) = 750
    { user_id: 'bea', boulder_id: 'c5', success: true, attempts: 2 },
    // ana : noir en 1 (600) + bleu en 1 (100) = 700
    { user_id: 'ana', boulder_id: 'c4', success: true, attempts: 1 },
    { user_id: 'ana', boulder_id: 'c1', success: true, attempts: 1 },
    // dan : rouge en 1 (400) + violet en 1 (200) = 600, et un échec à 2 essais (0)
    { user_id: 'dan', boulder_id: 'c3', success: true, attempts: 1 },
    { user_id: 'dan', boulder_id: 'c2', success: true, attempts: 1 },
    { user_id: 'dan', boulder_id: 'c4', success: false, attempts: 2 },
    // gus et hugo : rouge en 2 (380) + bleu en 1 (100) = 480, et le MÊME échec à 3 essais
    { user_id: 'gus', boulder_id: 'c3', success: true, attempts: 2 },
    { user_id: 'gus', boulder_id: 'c1', success: true, attempts: 1 },
    { user_id: 'gus', boulder_id: 'c2', success: false, attempts: 3 },
    { user_id: 'hugo', boulder_id: 'c3', success: true, attempts: 2 },
    { user_id: 'hugo', boulder_id: 'c1', success: true, attempts: 1 },
    { user_id: 'hugo', boulder_id: 'c2', success: false, attempts: 3 },
    // cleo : violet en 1 (200) + bleu en 2 (90) = 290
    { user_id: 'cleo', boulder_id: 'c2', success: true, attempts: 1 },
    { user_id: 'cleo', boulder_id: 'c1', success: true, attempts: 2 },
    // eli : bleu en 3 (80) = 80, et un échec à 4 essais (0)
    { user_id: 'eli', boulder_id: 'c1', success: true, attempts: 3 },
    { user_id: 'eli', boulder_id: 'c2', success: false, attempts: 4 },
  ];

  const rangsParId = <T extends { participant: Grimpeur }>(
    entries: T[],
    ranks: number[]
  ): Record<string, number> =>
    Object.fromEntries(entries.map((e, i) => [e.participant.user_id, ranks[i]]));

  it('classement open : ordre, scores et rang partagé de l\'ex æquo', () => {
    const open = getClassementByCategory(resultats, contestants, blocs, 'global');

    expect(open.map(e => e.participant.user_id)).toEqual([
      'fab', 'bea', 'ana', 'dan', 'gus', 'hugo', 'cleo', 'eli',
    ]);
    expect(open.map(e => e.score)).toEqual([880, 750, 700, 600, 480, 480, 290, 80]);
    // Les échecs ne rapportent rien : dan reste à 600 malgré 2 essais sur le noir.
    expect(open.map(e => e.boulders)).toEqual([2, 1, 2, 2, 2, 2, 2, 1]);

    // Rang de compétition : gus et hugo partagent le 5, cleo saute au 7.
    expect(rangsParId(open, rankPointEntries(open))).toEqual({
      fab: 1, bea: 2, ana: 3, dan: 4, gus: 5, hugo: 5, cleo: 7, eli: 8,
    });
  });

  it('classement par genre : groupes, ordre interne et rangs', () => {
    const parGenre = getClassementByCategory(resultats, contestants, blocs, 'gender');

    // L'ordre des groupes suit la première apparition dans le classement open
    // (fab est Homme et premier, bea est Femme et deuxième).
    expect(parGenre.map(g => g.category)).toEqual(['Homme', 'Femme']);

    const hommes = parGenre[0].participants;
    expect(hommes.map(e => e.participant.user_id)).toEqual(['fab', 'dan', 'gus', 'hugo', 'eli']);
    expect(rangsParId(hommes, rankPointEntries(hommes))).toEqual({
      fab: 1, dan: 2, gus: 3, hugo: 3, eli: 5,
    });

    const femmes = parGenre[1].participants;
    expect(femmes.map(e => e.participant.user_id)).toEqual(['bea', 'ana', 'cleo']);
    expect(rangsParId(femmes, rankPointEntries(femmes))).toEqual({ bea: 1, ana: 2, cleo: 3 });
  });

  it('classement par catégorie d\'âge : groupes FFME, ordre interne et rangs', () => {
    const parAge = getClassementByCategory(resultats, contestants, blocs, 'age');

    expect(parAge.map(g => g.category)).toEqual([
      'Vétérans 1 (40-49 ans)', 'Séniors (20-39 ans)', 'U14 (12-13 ans)', 'U16 (14-15 ans)',
    ]);

    const seniors = parAge[1].participants;
    expect(seniors.map(e => e.participant.user_id)).toEqual(['bea', 'dan', 'gus', 'hugo']);
    expect(rangsParId(seniors, rankPointEntries(seniors))).toEqual({
      bea: 1, dan: 2, gus: 3, hugo: 3,
    });

    const u14 = parAge[2].participants;
    expect(u14.map(e => e.participant.user_id)).toEqual(['ana', 'eli']);
    expect(rangsParId(u14, rankPointEntries(u14))).toEqual({ ana: 1, eli: 2 });

    // Les groupes à un seul grimpeur existent et s'affichent (§1.4) : on les épingle aussi.
    expect(parAge[0].participants.map(e => e.participant.user_id)).toEqual(['fab']);
    expect(parAge[3].participants.map(e => e.participant.user_id)).toEqual(['cleo']);
  });
});
