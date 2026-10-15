import { describe, expect, it } from 'vitest';
import {
  getParticipantScores,
  getClassementByCategory,
  getOfficialParticipantTotals,
  getOfficialClassementByCategory,
  rankOfficialEntries,
  rankedOfficialEntries,
  rankPointEntries,
  compareTieBreak,
  resolveClassementLevel,
  LEVEL_MAX_UNKNOWN_CATEGORY,
  type ParticipantBase,
  type TieBreakBoulder,
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
    // totalAttempts (15/10/2026) : l'échec compte ses 3 essais, lui — c'est la différence
    // entre ce champ et tieBreak, et tout l'objet du critère de départage ultime.
    expect(scores).toEqual([
      {
        participant: alice, score: 100, boulders: 1,
        tieBreak: [{ hardness: 100, attempts: 1 }],
        totalAttempts: 4,
        bestColorSucceeded: 'bleu',
      },
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

  // ⚠️ CE TEST S'APPELAIT « utilise la couleur plutôt que sa cotation cachée quand les deux
  // diffèrent », alors que sa fixture a `color: undefined` — les deux ne différaient pas, l'une
  // était absente. Le titre promettait donc plus que le jeu de données ne pouvait exprimer,
  // exactement le travers que ce dépôt traque ailleurs. Renommé le 15/10/2026 pour dire ce
  // qu'il fait, et les deux cas qu'il ne couvrait pas sont ajoutés juste après.
  it('se replie sur la cotation cachée quand le bloc n\'a pas de couleur (bloc de compétition)', () => {
    // Forme réelle d'un bloc créé pour une compétition (7 blocs sur 180 en production au
    // 15/10/2026) : `difficulty` renseigné, `color` absent.
    const hiddenBoulders = [{ id: 'b1', color: undefined, difficulty: 'bleu' }];
    const results = [{ user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }];
    expect(getParticipantScores(results, participants, hiddenBoulders)).toEqual([
      {
        participant: alice, score: 100, boulders: 1,
        tieBreak: [{ hardness: 100, attempts: 1 }],
        totalAttempts: 1,
        // Même repli que le barème : sans `color`, c'est la cotation cachée qui donne la
        // couleur du paquet (boulderColorKey, une seule lecture pour les deux usages).
        bestColorSucceeded: 'bleu',
      },
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
        totalAttempts: 5,
        // ⚠️ Même en mode "blocs_valides", où la couleur ne porte plus la difficulté, le
        // paquet de niveau reste fondé sur la COULEUR — c'est le niveau du grimpeur dans les
        // couleurs de la salle qu'il désigne, pas la valeur en points de son bloc.
        bestColorSucceeded: 'rose',
      }]);
  });

  it('mode "personnalise" : applique le barème par couleur fourni pour cette compétition', () => {
    const results = [{ user_id: 'alice', boulder_id: 'b1', success: true, attempts: 1 }];
    const customScoring = { bleu: { base: 999, deduction: 0 } };
    expect(getParticipantScores(results, participants, boulders, 'personnalise', customScoring))
      .toEqual([{
        participant: alice, score: 999, boulders: 1,
        tieBreak: [{ hardness: 999, attempts: 1 }],
        totalAttempts: 1,
        bestColorSucceeded: 'bleu',
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

// ============================================================================================
// Classement par NIVEAU MAX et critère de départage ultime
// docs/plans/PLAN-classements-competition-5-novembre.md §1
// ============================================================================================
describe('resolveClassementLevel (§1.1 — la règle écrite comme un maximum)', () => {
  it('prend le niveau de départ quand aucun bloc n\'a été réussi', () => {
    expect(resolveClassementLevel({ user_id: 'x', level: 'rouge' }, undefined)).toBe('rouge');
  });

  it('prend la couleur réussie quand elle est plus haute — la règle anti-sandbagging', () => {
    // Un grimpeur déclaré bleu qui réussit un noir est classé parmi les noirs : c'est l'effet
    // utile de la règle, sans elle on aurait intérêt à sous-déclarer son niveau.
    expect(resolveClassementLevel({ user_id: 'x', level: 'bleu' }, 'noir')).toBe('noir');
  });

  it('ne descend JAMAIS : réussir en dessous de son niveau ne fait pas changer de paquet', () => {
    // La monotonie de la règle (V2.56 : on ne perd pas ce qui est acquis). C'est ce qui rend
    // l'ordre d'application indifférent.
    expect(resolveClassementLevel({ user_id: 'x', level: 'noir' }, 'bleu')).toBe('noir');
  });

  it('`level_at_start` a la priorité sur `level` : le niveau du DÉBUT, pas celui de l\'inscription', () => {
    // Un grimpeur inscrit trois semaines avant en bleu, passé violet entre-temps dans la
    // salle : c'est violet qui le range, parce que c'est son niveau au coup d'envoi.
    expect(resolveClassementLevel({ user_id: 'x', level: 'bleu', level_at_start: 'violet' }, undefined))
      .toBe('violet');
  });

  it('se replie sur `level` quand `level_at_start` est absent (inscrit tardif)', () => {
    expect(resolveClassementLevel({ user_id: 'x', level: 'bleu' }, undefined)).toBe('bleu');
  });

  it('renvoie null quand ni le niveau ni une réussite ne sont connus', () => {
    expect(resolveClassementLevel({ user_id: 'x' }, undefined)).toBeNull();
  });

  it('ignore un niveau de départ qui n\'est pas une couleur connue', () => {
    expect(resolveClassementLevel({ user_id: 'x', level: 'turquoise' }, 'bleu')).toBe('bleu');
    expect(resolveClassementLevel({ user_id: 'x', level: 'turquoise' }, undefined)).toBeNull();
  });
});

describe('Critère de départage ultime : le moins d\'essais au total, échecs compris', () => {
  interface G extends ParticipantBase { first_name: string }
  const blocs = [
    { id: 'r', color: 'rouge', difficulty: 'rouge' },
    { id: 'b', color: 'bleu', difficulty: 'bleu' },
    { id: 'v', color: 'violet', difficulty: 'violet' },
  ];

  it('sépare deux grimpeurs que tout le départage précédent laissait ex æquo', () => {
    const ima: G = { user_id: 'ima', first_name: 'Ima', level: 'rouge' };
    const jo: G = { user_id: 'jo', first_name: 'Jo', level: 'rouge' };
    // Mêmes points (380 + 100 = 480), même liste de blocs réussis avec les mêmes essais :
    // l'ancien départage s'épuisait ici. Seul l'échec les distingue.
    const resultats = [
      { user_id: 'jo', boulder_id: 'r', success: true, attempts: 2 },
      { user_id: 'jo', boulder_id: 'b', success: true, attempts: 1 },
      { user_id: 'jo', boulder_id: 'v', success: false, attempts: 5 },
      { user_id: 'ima', boulder_id: 'r', success: true, attempts: 2 },
      { user_id: 'ima', boulder_id: 'b', success: true, attempts: 1 },
      { user_id: 'ima', boulder_id: 'v', success: false, attempts: 1 },
    ];
    const open = getClassementByCategory(resultats, [ima, jo], blocs, 'global');

    expect(open.map(e => e.score)).toEqual([480, 480]);
    expect(open.map(e => e.totalAttempts)).toEqual([4, 8]);
    // Ima passe devant malgré un classement par points identique : 4 essais contre 8.
    expect(open.map(e => e.participant.user_id)).toEqual(['ima', 'jo']);
    expect(rankPointEntries(open)).toEqual([1, 2]);
  });

  it('laisse ex æquo deux grimpeurs dont même le total d\'essais est identique', () => {
    const kim: G = { user_id: 'kim', first_name: 'Kim', level: 'rouge' };
    const lou: G = { user_id: 'lou', first_name: 'Lou', level: 'rouge' };
    const resultats = [
      { user_id: 'kim', boulder_id: 'r', success: true, attempts: 2 },
      { user_id: 'kim', boulder_id: 'b', success: true, attempts: 1 },
      { user_id: 'lou', boulder_id: 'r', success: true, attempts: 2 },
      { user_id: 'lou', boulder_id: 'b', success: true, attempts: 1 },
    ];
    const open = getClassementByCategory(resultats, [kim, lou], blocs, 'global');

    expect(open.map(e => e.totalAttempts)).toEqual([3, 3]);
    // Le critère ne tranche pas, donc le rang est PARTAGÉ — un ex æquo annoncé est un
    // résultat, pas un échec du départage.
    expect(rankPointEntries(open)).toEqual([1, 1]);
  });

  it('un échec non déclaré avantage son auteur — limite connue et assumée', () => {
    // Ce test ne décrit pas un défaut à corriger : il FIXE la limite du critère, pour que
    // personne ne la découvre le jour de l'épreuve. Elle se traite par l'annonce de début de
    // contest (« déclarez vos échecs »), l'application ne pouvant pas constater un essai
    // qu'on ne lui dit pas.
    const mia: G = { user_id: 'mia', first_name: 'Mia', level: 'rouge' };
    const noa: G = { user_id: 'noa', first_name: 'Noa', level: 'rouge' };
    const resultats = [
      { user_id: 'mia', boulder_id: 'r', success: true, attempts: 2 },
      { user_id: 'mia', boulder_id: 'b', success: true, attempts: 1 },
      // Mia déclare honnêtement son échec, Noa ne saisit rien sur ce bloc.
      { user_id: 'mia', boulder_id: 'v', success: false, attempts: 4 },
      { user_id: 'noa', boulder_id: 'r', success: true, attempts: 2 },
      { user_id: 'noa', boulder_id: 'b', success: true, attempts: 1 },
    ];
    const open = getClassementByCategory(resultats, [mia, noa], blocs, 'global');

    expect(open.map(e => e.participant.user_id)).toEqual(['noa', 'mia']);
    expect(open.map(e => e.totalAttempts)).toEqual([3, 7]);
  });
});

// ⚠️ LE CAS QUE LE §1.6 DEMANDE, ET QU'AUCUN TEST N'EXERÇAIT.
//
// Le classement par niveau max partitionne par la plus haute couleur réussie — c'est-à-dire
// par la grandeur même dont le PREMIER critère de départage est fonction. À l'intérieur d'un
// paquet constitué par la performance, ce critère est donc constant par construction et ne
// discrimine plus rien. Aucun des trois classements existants n'avait cette propriété : open,
// genre et âge sont tous orthogonaux à la couleur.
//
// Ce que ce test établit :
//   1. le départage dégrade bien sur son critère suivant, et il en a un ;
//   2. ce critère suivant (les essais) n'est PAS fonction de la couleur, donc il tranche —
//      la règle n'est pas neutralisée, seulement affaiblie d'un cran ;
//   3. quand il ne tranche pas non plus, l'ex æquo est affiché honnêtement.
//
// ⚠️ Et une nuance que le plan surestimait : la clé de paquet est un MAXIMUM avec le niveau de
// départ, donc la couleur max réussie n'est constante dans un paquet que pour les grimpeurs
// qui y sont par leur performance. Un grimpeur rangé en rouge par son niveau déclaré, et qui
// n'a réussi qu'un bleu, est dans le même paquet avec une couleur max différente — le dernier
// cas du test.
describe('§1.6 — le départage à l\'intérieur d\'un paquet de niveau', () => {
  interface G extends ParticipantBase { first_name: string }
  const blocs = [
    { id: 'r', color: 'rouge', difficulty: 'rouge' },
    { id: 'b', color: 'bleu', difficulty: 'bleu' },
    { id: 'v', color: 'violet', difficulty: 'violet' },
  ];

  const ima: G = { user_id: 'ima', first_name: 'Ima', level: 'bleu' };
  const jo: G = { user_id: 'jo', first_name: 'Jo', level: 'bleu' };
  const kim: G = { user_id: 'kim', first_name: 'Kim', level: 'bleu' };
  const lou: G = { user_id: 'lou', first_name: 'Lou', level: 'bleu' };
  const paulo: G = { user_id: 'paulo', first_name: 'Paulo', level: 'rouge' };

  // Les quatre premiers sont dans le paquet « rouge » PAR LEUR PERFORMANCE (rouge réussi en
  // 2 essais, bleu en 1) : même plus haute couleur, même dureté, mêmes essais sur chaque bloc
  // réussi. Tout le départage historique est épuisé entre eux.
  const resultats = [
    { user_id: 'jo', boulder_id: 'r', success: true, attempts: 2 },
    { user_id: 'jo', boulder_id: 'b', success: true, attempts: 1 },
    { user_id: 'jo', boulder_id: 'v', success: false, attempts: 5 },
    { user_id: 'ima', boulder_id: 'r', success: true, attempts: 2 },
    { user_id: 'ima', boulder_id: 'b', success: true, attempts: 1 },
    { user_id: 'ima', boulder_id: 'v', success: false, attempts: 1 },
    { user_id: 'kim', boulder_id: 'r', success: true, attempts: 2 },
    { user_id: 'kim', boulder_id: 'b', success: true, attempts: 1 },
    { user_id: 'lou', boulder_id: 'r', success: true, attempts: 2 },
    { user_id: 'lou', boulder_id: 'b', success: true, attempts: 1 },
    // Paulo est rangé en rouge par son NIVEAU DÉCLARÉ, pas par sa performance : sa plus haute
    // couleur réussie est bleu. Il est donc dans le même paquet avec une couleur max
    // différente — la preuve que « constant par construction » ne vaut pas pour tout le paquet.
    { user_id: 'paulo', boulder_id: 'b', success: true, attempts: 1 },
  ];

  const paquets = getClassementByCategory(resultats, [ima, jo, kim, lou, paulo], blocs, 'level_max');

  it('les cinq grimpeurs forment un seul paquet « Niveau rouge »', () => {
    expect(paquets.map(g => g.category)).toEqual(['Niveau rouge']);
    expect(paquets[0].participants).toHaveLength(5);
  });

  it('le premier critère de départage est bien constant pour les quatre arrivés par la performance', () => {
    const parPerf = paquets[0].participants.filter(e => e.participant.user_id !== 'paulo');
    // Assertion de taille AVANT toute affirmation sur l'ensemble (règle du 03/10) : sans
    // elle, « tous ont la même dureté » serait vrai d'un ensemble vide ou d'un singleton.
    expect(parPerf).toHaveLength(4);
    const duretes = new Set(parPerf.map(e => e.tieBreak[0].hardness));
    expect(duretes.size).toBe(1);
    expect([...duretes]).toEqual([400]);
  });

  it('la règle dégrade sur les essais, qui ne sont pas fonction de la couleur, et tranche', () => {
    const ordre = paquets[0].participants.map(e => e.participant.user_id);
    const rangs = rankPointEntries(paquets[0].participants);

    // kim et lou (3 essais) devant ima (4), devant jo (8). Paulo, à 100 points, est dernier.
    expect(ordre).toEqual(['kim', 'lou', 'ima', 'jo', 'paulo']);
    // kim et lou restent réellement ex æquo : l'ex æquo est affiché, pas masqué par un
    // critère improvisé.
    expect(rangs).toEqual([1, 1, 3, 4, 5]);
  });
});

describe('Partition par niveau max : paquets, ordre et effectifs (§1.4)', () => {
  interface G extends ParticipantBase { first_name: string }
  const blocs = [
    { id: 'n', color: 'noir', difficulty: 'noir' },
    { id: 'b', color: 'bleu', difficulty: 'bleu' },
    { id: 'b2', color: 'bleu', difficulty: 'bleu' },
    { id: 'b3', color: 'bleu', difficulty: 'bleu' },
    { id: 'b4', color: 'bleu', difficulty: 'bleu' },
    { id: 'b5', color: 'bleu', difficulty: 'bleu' },
  ];

  const nino: G = { user_id: 'nino', first_name: 'Nino', level: 'bleu' };   // réussit noir -> noir
  const olga: G = { user_id: 'olga', first_name: 'Olga', level: 'noir' };   // réussit bleu  -> noir
  const tam: G = { user_id: 'tam', first_name: 'Tam', level: 'bleu' };      // 5 bleus       -> bleu
  const sam: G = { user_id: 'sam', first_name: 'Sam' };                     // aucun niveau, aucune réussite

  // ⚠️ Tam est le MEILLEUR SCORE du lot (500) tout en étant dans le paquet le plus BAS : cinq
  // bleus à vue valent plus qu'un noir arraché en dix essais (420). Sans ce déséquilibre,
  // l'ordre d'insertion des paquets (celui du classement open) coïnciderait avec l'ordre des
  // niveaux et le tri décroissant ne vérifierait RIEN — le jeu serait incapable d'exprimer le
  // défaut qu'on prétend garder. Vérifié : en retirant le tri, ce test rougit (avec trois
  // bleus au lieu de cinq, il restait vert).
  const resultats = [
    { user_id: 'tam', boulder_id: 'b', success: true, attempts: 1 },
    { user_id: 'tam', boulder_id: 'b2', success: true, attempts: 1 },
    { user_id: 'tam', boulder_id: 'b3', success: true, attempts: 1 },
    { user_id: 'tam', boulder_id: 'b4', success: true, attempts: 1 },
    { user_id: 'tam', boulder_id: 'b5', success: true, attempts: 1 },
    { user_id: 'nino', boulder_id: 'n', success: true, attempts: 10 },
    { user_id: 'olga', boulder_id: 'b', success: true, attempts: 1 },
    { user_id: 'sam', boulder_id: 'n', success: false, attempts: 3 },
  ];

  const paquets = getClassementByCategory(resultats, [nino, olga, tam, sam], blocs, 'level_max');

  it('ordonne les paquets du plus haut niveau au plus bas, « non déterminé » en dernier', () => {
    // Différence volontaire avec les partitions âge/genre, dont l'ordre suit la première
    // apparition au classement open : une suite de niveaux a un ordre naturel.
    expect(paquets.map(g => g.category)).toEqual(['Niveau noir', 'Niveau bleu', 'Niveau non déterminé']);
  });

  it('range un grimpeur monté par sa performance avec ceux de son nouveau niveau', () => {
    expect(paquets[0].participants.map(e => e.participant.user_id)).toEqual(['nino', 'olga']);
  });

  it('n\'écarte aucun paquet non vide, même à un seul grimpeur', () => {
    // §1.4 : un paquet à un participant est le cas NORMAL ici (8 niveaux, une vingtaine de
    // participants), pas le cas limite. Le masquer produirait la question à l'accueil que
    // l'affichage de l'effectif évite.
    expect(paquets[1].participants.map(e => e.participant.user_id)).toEqual(['tam']);
    expect(paquets[2].participants.map(e => e.participant.user_id)).toEqual(['sam']);
  });

  it('un grimpeur sans niveau ni réussite est affiché, pas perdu', () => {
    expect(paquets[2].category).toBe(LEVEL_MAX_UNKNOWN_CATEGORY);
    expect(paquets[2].participants[0].bestColorSucceeded).toBeUndefined();
  });

  it('pousse « non déterminé » en dernier même quand il arrive premier au classement', () => {
    // ⚠️ Cette propriété-là n'est exprimable QUE dans ce cas de figure. Un grimpeur sans
    // niveau n'a, par construction, aucune réussite — donc 0 point, donc la dernière place au
    // score : l'ordre d'insertion le met déjà en dernier et le tri ne prouve rien. Il faut
    // donc que TOUT LE MONDE soit à 0 et que lui soit saisi en premier, pour que l'ordre
    // d'insertion le place devant et que seul le tri puisse le renvoyer en queue.
    const sansNiveau: G = { user_id: 'sans', first_name: 'Sans' };
    const uma: G = { user_id: 'uma', first_name: 'Uma', level: 'bleu' };
    const quEchecs = [
      { user_id: 'sans', boulder_id: 'n', success: false, attempts: 1 },
      { user_id: 'uma', boulder_id: 'n', success: false, attempts: 1 },
    ];
    const ordre = getClassementByCategory(quEchecs, [sansNiveau, uma], blocs, 'level_max');

    expect(ordre.map(g => g.category)).toEqual(['Niveau bleu', LEVEL_MAX_UNKNOWN_CATEGORY]);
  });
});

// ⚠️ DÉFAUT RÉEL DE CE CHANTIER, trouvé le 15/10/2026 par un pas EXISTANT de
// e2e-live-display-flow.mjs qui a rougi — pas par un test écrit pour l'occasion.
//
// Le critère « le moins d'essais au total, échecs compris » comptait les essais des échecs
// même quand personne n'avait rien réussi. En début d'épreuve, où tout le monde est à 0 point,
// il classait donc les grimpeurs — et dans le pire sens possible : **celui qui n'avait rien
// tenté passait devant celui qui avait essayé et échoué**, sur l'écran projeté dans la salle.
//
// Le critère existe pour séparer deux grimpeurs dont les PERFORMANCES sont identiques. Sans
// performance, il n'y a rien à séparer.
describe('Début d\'épreuve : aucun bloc réussi, donc rien à départager', () => {
  interface G extends ParticipantBase { first_name: string }
  const blocs = [
    { id: 'r', color: 'rouge', difficulty: 'rouge' },
    { id: 'b', color: 'bleu', difficulty: 'bleu' },
  ];

  it('deux grimpeurs n\'ayant que des échecs partagent le rang 1, quels que soient leurs essais', () => {
    const prudent: G = { user_id: 'prudent', first_name: 'Prudent' };
    const acharne: G = { user_id: 'acharne', first_name: 'Acharne' };
    const resultats = [
      // Acharné a tenté beaucoup et échoué ; Prudent a à peine touché le mur.
      { user_id: 'acharne', boulder_id: 'r', success: false, attempts: 9 },
      { user_id: 'acharne', boulder_id: 'b', success: false, attempts: 7 },
      { user_id: 'prudent', boulder_id: 'r', success: false, attempts: 1 },
    ];
    const open = getClassementByCategory(resultats, [prudent, acharne], blocs, 'global');

    expect(open).toHaveLength(2);
    expect(open.map(e => e.score)).toEqual([0, 0]);
    // Les totaux d'essais DIFFÈRENT — c'est bien ce cas-là qu'on refuse d'exploiter.
    expect(new Set(open.map(e => e.totalAttempts)).size).toBe(2);
    expect(rankPointEntries(open)).toEqual([1, 1]);
  });

  it('tout le monde à zéro : un seul rang pour tous, pas une numérotation 1..N', () => {
    // Le cas de l'ouverture d'épreuve sur l'écran live, à dix grimpeurs.
    const dix = Array.from({ length: 10 }, (_, i) => ({ user_id: `g${i}`, first_name: `G${i}` }));
    const resultats = dix.map((g, i) => ({
      user_id: g.user_id, boulder_id: 'r', success: false, attempts: i + 1,
    }));
    const open = getClassementByCategory(resultats, dix, blocs, 'global');

    expect(open).toHaveLength(10);
    expect(rankPointEntries(open)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('mais dès qu\'UN SEUL a réussi quelque chose, il passe devant — sans l\'aide du critère', () => {
    // Ce cas ne descend jamais jusqu'au critère des essais : `compareTieBreak` fait déjà
    // passer devant celui qui a un bloc de plus. On le fixe pour que la garde ajoutée ne
    // soit pas élargie par erreur à ce cas-là.
    const reussi: G = { user_id: 'reussi', first_name: 'Reussi' };
    const echoue: G = { user_id: 'echoue', first_name: 'Echoue' };
    const resultats = [
      { user_id: 'echoue', boulder_id: 'r', success: false, attempts: 1 },
      { user_id: 'reussi', boulder_id: 'b', success: true, attempts: 8 },
    ];
    const open = getClassementByCategory(resultats, [reussi, echoue], blocs, 'global');
    expect(open.map(e => e.participant.user_id)).toEqual(['reussi', 'echoue']);
    expect(rankPointEntries(open)).toEqual([1, 2]);
  });

  it('et le critère s\'applique toujours quand les deux ont réussi la même chose', () => {
    // La garde ne doit pas désarmer le critère dans son cas d'usage : performances
    // identiques, échecs différents.
    const soigneux: G = { user_id: 'soigneux', first_name: 'Soigneux' };
    const brouillon: G = { user_id: 'brouillon', first_name: 'Brouillon' };
    const resultats = [
      { user_id: 'brouillon', boulder_id: 'b', success: true, attempts: 1 },
      { user_id: 'brouillon', boulder_id: 'r', success: false, attempts: 6 },
      { user_id: 'soigneux', boulder_id: 'b', success: true, attempts: 1 },
      { user_id: 'soigneux', boulder_id: 'r', success: false, attempts: 2 },
    ];
    const open = getClassementByCategory(resultats, [soigneux, brouillon], blocs, 'global');
    expect(open.map(e => e.participant.user_id)).toEqual(['soigneux', 'brouillon']);
    expect(rankPointEntries(open)).toEqual([1, 2]);
  });
});

// ⚠️ POURQUOI « LE MOINS D'ESSAIS SUR LES BLOCS RÉUSSIS » NE PEUT PAS ÊTRE LE CRITÈRE.
//
// Proposé par ClaudeNav le 15/10/2026 (RETOUR-classements-avant-deploiement.md §2) pour
// remplacer « le moins d'essais au total, échecs compris », dont l'objection est juste : dans
// une application qui ne vérifie rien, un critère dont la hausse nuit à celui qui le déclare ne
// sera pas déclaré.
//
// Mais la variante est un NO-OP, et ce test le prouve plutôt que de l'affirmer. Le critère
// secondaire n'est atteint que si `compareTieBreak` vaut 0 — c'est-à-dire si les deux listes
// de blocs réussis sont identiques, dureté ET essais, bloc par bloc. La somme des essais sur
// les réussites y est donc égale par construction : elle ne peut jamais trancher. Choisir
// cette variante équivaut exactement à n'avoir AUCUN critère secondaire, pas à en avoir un
// autre — sa dernière ligne de tableau (« ex æquo par construction ») est vraie de toutes les
// lignes, pas seulement de celle à 0 point.
//
// L'utilisateur a tranché le 15/10/2026 : on GARDE les essais totaux, échecs compris, et la
// limite se traite par l'annonce de début de contest. Ce test reste pour que la même variante
// ne soit pas reproposée comme si elle départageait quelque chose.

const sommeEssais = (l: TieBreakBoulder[]) => l.reduce((s, b) => s + b.attempts, 0);

const rng = (graine: number) => {
  let x = graine;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
};

describe('La variante « essais sur les réussites » peut-elle départager ?', () => {
  it('propriété : si compareTieBreak vaut 0, les essais sur les réussites sont EGAUX', () => {
    const alea = rng(20261015);
    const duretes = [100, 200, 400, 600, 800, 1000];
    let paquetsEgaux = 0;

    for (let t = 0; t < 20000; t += 1) {
      const faire = () => {
        const n = Math.floor(alea() * 4);
        const l: TieBreakBoulder[] = [];
        for (let i = 0; i < n; i += 1) {
          l.push({
            hardness: duretes[Math.floor(alea() * duretes.length)],
            attempts: 1 + Math.floor(alea() * 6),
          });
        }
        return l.sort((x, y) => (y.hardness !== x.hardness ? y.hardness - x.hardness : x.attempts - y.attempts));
      };
      const a = faire();
      const b = faire();
      if (compareTieBreak(a, b) === 0) {
        paquetsEgaux += 1;
        // LE POINT : à ex æquo réel, la somme des essais sur les réussites est forcément
        // identique. Un critère fondé sur elle ne peut donc JAMAIS trancher.
        expect(sommeEssais(a)).toBe(sommeEssais(b));
      }
    }

    // Assertion de TAILLE avant d'affirmer quoi que ce soit : sans égalités tirées, la
    // propriété serait vraie d'un ensemble vide.
    expect(paquetsEgaux).toBeGreaterThan(50);
    console.log(`   ex æquo tirés : ${paquetsEgaux} — somme des essais toujours identique`);
  });
});

// ============================================================================================
// COMPÉTITION HYBRIDE — les deux formes de bloc dans la même épreuve
// ============================================================================================
//
// Le Contest du 5 novembre met en jeu des blocs du jour DÉJÀ EN PLACE (couleur publique, elle
// est sur le mur) et les blocs d'un MUR NEUF (cotation non annoncée). Les deux formes sont
// disjointes en base, mesuré le 15/10/2026 sur les 180 blocs de production :
//
//   - bloc du jour         : `color` renseigné, `difficulty` ABSENT      → 173 blocs
//   - bloc de compétition  : `difficulty` renseigné, `color` ABSENT      →   7 blocs
//   - les deux renseignés  : ZÉRO bloc
//
// ⚠️ Et jusqu'au 15/10/2026 AUCUN jeu d'essai n'exerçait la première forme : les trois seeds
// et toutes les fixtures n'utilisaient que des blocs de compétition. La branche que
// l'événement allait faire tourner était donc la seule non testée — le code avait l'air juste
// (`boulderColorKey = color || difficulty`), ce qui n'est pas la même chose.
describe('Compétition hybride : bloc du jour réutilisé et bloc de compétition mêlés', () => {
  interface G extends ParticipantBase { first_name: string }

  // Un bloc du jour réutilisé : PAS de `difficulty`. C'est la forme réelle, et c'est ce que
  // `difficulty` optionnel permet enfin d'écrire.
  const blocDuJour = { id: 'jour-violet', color: 'violet' };
  // Un bloc créé pour l'épreuve : PAS de `color`, sa cotation est cachée.
  const blocDeCompet = { id: 'compet-rouge', difficulty: 'rouge' };
  const blocs = [blocDuJour, blocDeCompet];

  it('cote le bloc du jour sur sa COULEUR et le bloc de compétition sur sa cotation', () => {
    const ima: G = { user_id: 'ima', first_name: 'Ima', level: 'bleu' };
    const resultats = [
      // violet au 1er essai = 200 ; rouge au 1er essai = 400. Total 600.
      { user_id: 'ima', boulder_id: 'jour-violet', success: true, attempts: 1 },
      { user_id: 'ima', boulder_id: 'compet-rouge', success: true, attempts: 1 },
    ];
    const open = getClassementByCategory(resultats, [ima], blocs, 'global');

    expect(open).toHaveLength(1);
    // 600 et non 400 : si la couleur du bloc du jour n'était pas lue, il vaudrait 0.
    expect(open[0].score).toBe(600);
    expect(open[0].boulders).toBe(2);
    expect(open[0].tieBreak).toEqual([
      { hardness: 400, attempts: 1 },
      { hardness: 200, attempts: 1 },
    ]);
  });

  it('un bloc du jour fait monter de paquet comme un bloc de compétition', () => {
    // L'anti-sandbagging sur un bloc dont la couleur est PUBLIQUE : le grimpeur sait ce qu'il
    // risque en le tentant, et c'est le cas normal du 5 novembre.
    const jo: G = { user_id: 'jo', first_name: 'Jo', level: 'bleu' };
    const resultats = [{ user_id: 'jo', boulder_id: 'jour-violet', success: true, attempts: 1 }];
    const paquets = getClassementByCategory(resultats, [jo], blocs, 'level_max');

    expect(paquets.map(g => g.category)).toEqual(['Niveau violet']);
    expect(paquets[0].participants[0].bestColorSucceeded).toBe('violet');
  });

  it('`color` l\'emporte sur `difficulty` si les deux sont renseignés', () => {
    // ⚠️ Ce cas N'EXISTE PAS en production (zéro bloc sur 180) — c'est la précédence que
    // `boulderColorKey` établit, fixée ici pour qu'elle ne change pas par accident. C'est
    // aussi ce que l'ancien titre du test précédent prétendait vérifier sans le faire.
    const kim: G = { user_id: 'kim', first_name: 'Kim' };
    const divergent = [{ id: 'd1', color: 'violet', difficulty: 'rose' }];
    const resultats = [{ user_id: 'kim', boulder_id: 'd1', success: true, attempts: 1 }];
    const open = getClassementByCategory(resultats, [kim], divergent, 'global');
    // violet = 200, rose = 1000. C'est 200 qui doit sortir.
    expect(open[0].score).toBe(200);
  });

  it('un bloc sans couleur NI cotation vaut 0, sans faire planter le classement', () => {
    // Chemin rendu explicite le 15/10/2026 (`if (!colorKey) return 0`). Il existait déjà à
    // l'exécution, le typage le niait.
    const lou: G = { user_id: 'lou', first_name: 'Lou' };
    const muet = [{ id: 'muet' }];
    const resultats = [{ user_id: 'lou', boulder_id: 'muet', success: true, attempts: 1 }];
    const open = getClassementByCategory(resultats, [lou], muet, 'global');

    expect(open).toHaveLength(1);
    expect(open[0].score).toBe(0);
    // Le bloc compte comme réussi, mais sa couleur est inconnue : aucun paquet de niveau.
    expect(open[0].boulders).toBe(1);
    expect(open[0].bestColorSucceeded).toBeUndefined();
  });
});
