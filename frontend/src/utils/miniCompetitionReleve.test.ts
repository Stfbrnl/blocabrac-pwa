import { describe, it, expect } from 'vitest';
import {
  buildMiniCompetitionReleve,
  type ReleveBlocInput,
  type ReleveParticipantInput,
  type ReleveResultatInput,
} from './miniCompetitionReleve';

// Deux murs dans l'ordre de gymConfig.walls : 'Dalle' (index 6) vient AVANT 'Dévers 15°' (7).
const BLOCS: ReleveBlocInput[] = [
  { id: 'b-devers-2', wall: 'Dévers 15°', number: 2 },
  { id: 'b-dalle-3', wall: 'Dalle', number: 3 },
  { id: 'b-dalle-1', wall: 'Dalle', number: 1 },
];

const ELEVES: ReleveParticipantInput[] = [
  { id: 'u-lea', displayName: 'Léa' },
  { id: 'u-tom', displayName: 'Tom' },
  { id: 'u-jade', displayName: 'Jade' },
];

const resultat = (p: Partial<ReleveResultatInput> & { userId: string }): ReleveResultatInput => ({
  success: true,
  attempts: 1,
  boulderColor: 'bleu',
  ...p,
});

describe('buildMiniCompetitionReleve — la taille avant le contenu', () => {
  it('🔴 N élèves × M blocs, et le total des cellules remplies ÉGALE le nombre de résultats', () => {
    // ⚠️ Affirmer la TAILLE avant le contenu : sans cela une validation se perdrait entre les
    // deux représentations (la liste de résultats et la grille) sans que rien ne le dise.
    const resultats = [
      resultat({ userId: 'u-lea', boulderId: 'b-dalle-1', attempts: 1 }),
      resultat({ userId: 'u-lea', boulderId: 'b-devers-2', attempts: 3 }),
      resultat({ userId: 'u-tom', boulderId: 'b-dalle-1', attempts: 1 }),
      resultat({ userId: 'u-tom', boulderId: 'b-dalle-3', success: false, attempts: undefined }),
    ];
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, resultats);
    expect(r.lignes).toHaveLength(3);
    expect(r.colonnes).toHaveLength(3);
    expect(r.lignes.every((l) => l.cellules.length === 3)).toBe(true);
    expect(r.cellulesRemplies).toBe(resultats.length);
    expect(r.resultatsHorsTableau).toHaveLength(0);
  });

  it('un résultat dont l’élève n’est PAS de la séance est compté à part, jamais ignoré', () => {
    const r = buildMiniCompetitionReleve(
      ELEVES,
      BLOCS,
      [resultat({ userId: 'u-inconnu', boulderId: 'b-dalle-1' })]
    );
    expect(r.cellulesRemplies).toBe(0);
    expect(r.resultatsHorsTableau).toHaveLength(1);
    expect(r.resultatsHorsTableau[0].raison).toBe('eleve-hors-seance');
  });

  it('un résultat sur un bloc hors de l’épreuve est compté à part, jamais ignoré', () => {
    const r = buildMiniCompetitionReleve(
      ELEVES,
      BLOCS,
      [
        resultat({ userId: 'u-lea', boulderId: 'b-pas-dans-lepreuve' }),
        resultat({ userId: 'u-lea' }), // sans boulderId du tout
      ]
    );
    expect(r.cellulesRemplies).toBe(0);
    expect(r.resultatsHorsTableau.map((x) => x.raison)).toEqual(['bloc-hors-epreuve', 'bloc-hors-epreuve']);
  });
});

describe('les lignes — l’absence est une information', () => {
  it('🔴 un élève SANS AUCUNE validation apparaît quand même, ligne vide', () => {
    // C'est exactement le cas qu'un `map` sur les résultats ferait disparaître sans bruit,
    // et c'est pédagogiquement l'information la plus utile du tableau.
    const r = buildMiniCompetitionReleve(
      ELEVES,
      BLOCS,
      [resultat({ userId: 'u-lea', boulderId: 'b-dalle-1' })]
    );
    const jade = r.lignes.find((l) => l.userId === 'u-jade');
    expect(jade).toBeDefined();
    expect(jade!.cellules).toEqual([null, null, null]);
    expect(jade!.blocsReussis).toBe(0);
    expect(jade!.blocsTentes).toBe(0);
  });

  it('un bloc que PERSONNE n’a touché garde sa colonne, entièrement vide', () => {
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, []);
    expect(r.colonnes).toHaveLength(3);
    expect(r.colonnes.every((c) => c.reussis === 0 && c.tentes === 0)).toBe(true);
    expect(r.colonnes.every((c) => c.essaisMoyensReussites === null)).toBe(true);
  });

  it('l’ordre des lignes est celui des participants fournis, et la clé est l’uid', () => {
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, []);
    expect(r.lignes.map((l) => l.userId)).toEqual(['u-lea', 'u-tom', 'u-jade']);
  });

  it('un élève désisté est signalé, mais présent', () => {
    const r = buildMiniCompetitionReleve(
      [...ELEVES, { id: 'u-noe', displayName: 'Noé', desiste: true }],
      BLOCS,
      []
    );
    expect(r.lignes).toHaveLength(4);
    expect(r.lignes[3].desiste).toBe(true);
    expect(r.lignes[0].desiste).toBe(false);
  });

  it('compte séparément les blocs RÉUSSIS et les blocs TENTÉS', () => {
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, [
      resultat({ userId: 'u-lea', boulderId: 'b-dalle-1' }),
      resultat({ userId: 'u-lea', boulderId: 'b-dalle-3', success: false }),
    ]);
    const lea = r.lignes[0];
    expect(lea.blocsReussis).toBe(1);
    expect(lea.blocsTentes).toBe(2);
  });
});

describe('les colonnes — l’ordre du circuit physique, pas l’alphabet', () => {
  it('ordonne par mur (ordre de gymConfig.walls) puis par numéro', () => {
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, []);
    expect(r.colonnes.map((c) => c.boulderId)).toEqual(['b-dalle-1', 'b-dalle-3', 'b-devers-2']);
    expect(r.colonnes.map((c) => c.etiquette)).toEqual(['Dalle n°1', 'Dalle n°3', 'Dévers 15° n°2']);
  });

  it('les cellules d’une ligne suivent l’ordre des colonnes, pas celui des blocs fournis', () => {
    // Si les deux ordres divergeaient, chaque cellule s'afficherait sous le mauvais bloc —
    // un défaut invisible à l'œil, puisque le tableau aurait l'air parfaitement rempli.
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, [
      resultat({ userId: 'u-lea', boulderId: 'b-devers-2', attempts: 7 }),
    ]);
    expect(r.colonnes[2].boulderId).toBe('b-devers-2');
    expect(r.lignes[0].cellules[2]?.attempts).toBe(7);
    expect(r.lignes[0].cellules[0]).toBeNull();
    expect(r.lignes[0].cellules[1]).toBeNull();
  });

  it('un bloc sans mur ni numéro reste identifiable', () => {
    const r = buildMiniCompetitionReleve(ELEVES, [{ id: 'abcdef123456' }], []);
    expect(r.colonnes[0].etiquette).toBe('Bloc abcdef');
    expect(r.colonnes[0].wall).toBeNull();
    expect(r.colonnes[0].number).toBeNull();
  });

  it('un mur vide ou blanc ne produit pas une étiquette vide', () => {
    const r = buildMiniCompetitionReleve(ELEVES, [{ id: 'x1', wall: '   ', number: 4 }], []);
    expect(r.colonnes[0].etiquette).toBe('n°4');
  });
});

describe('les marges — un taux qui annonce son dénominateur', () => {
  it('🔴 trois nombres, jamais un pourcentage nu', () => {
    // ⚠️ « 50 % » confond « un seul a essayé et il a échoué » (ne dit rien du bloc) et
    // « la moitié du groupe a échoué » (dit que le bloc était trop dur). D'où réussis,
    // tentés, ET l'effectif.
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, [
      resultat({ userId: 'u-lea', boulderId: 'b-dalle-1' }),
      resultat({ userId: 'u-tom', boulderId: 'b-dalle-1', success: false }),
    ]);
    const dalle1 = r.colonnes[0];
    expect(dalle1.reussis).toBe(1);
    expect(dalle1.tentes).toBe(2);
    expect(r.effectif).toBe(3);
  });

  it('les essais moyens ne portent QUE sur les réussites', () => {
    // Moyenner les échecs mélangerait « a réussi en 4 essais » et « a essayé 4 fois en vain » :
    // deux faits opposés sur la difficulté du bloc.
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, [
      resultat({ userId: 'u-lea', boulderId: 'b-dalle-1', attempts: 2 }),
      resultat({ userId: 'u-tom', boulderId: 'b-dalle-1', attempts: 5 }),
      resultat({ userId: 'u-jade', boulderId: 'b-dalle-1', success: false, attempts: 9 }),
    ]);
    expect(r.colonnes[0].essaisMoyensReussites).toBe(3.5);
    expect(r.colonnes[0].reussis).toBe(2);
    expect(r.colonnes[0].tentes).toBe(3);
  });

  it('arrondit la moyenne au dixième', () => {
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, [
      resultat({ userId: 'u-lea', boulderId: 'b-dalle-1', attempts: 1 }),
      resultat({ userId: 'u-tom', boulderId: 'b-dalle-1', attempts: 1 }),
      resultat({ userId: 'u-jade', boulderId: 'b-dalle-1', attempts: 2 }),
    ]);
    expect(r.colonnes[0].essaisMoyensReussites).toBe(1.3);
  });

  it('une réussite sans nombre d’essais saisi n’entre pas dans la moyenne', () => {
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, [
      resultat({ userId: 'u-lea', boulderId: 'b-dalle-1', attempts: undefined }),
      resultat({ userId: 'u-tom', boulderId: 'b-dalle-1', attempts: 4 }),
    ]);
    expect(r.colonnes[0].reussis).toBe(2);
    expect(r.colonnes[0].essaisMoyensReussites).toBe(4);
  });
});

describe('🔴 la couleur affichée est celle FIGÉE à la validation', () => {
  it('ne peut pas lire la couleur courante du bloc : les blocs n’en portent pas', () => {
    // ⚠️ LE TEST QUI DISTINGUE RÉELLEMENT LES DEUX LECTURES : le bloc est « recoté » en rose
    // après coup, et c'est `bleu` — la couleur du RÉSULTAT — qui doit sortir. C'est le défaut
    // mesuré le 18/10/2026 (80 points chez la monitrice contre 900 chez l'élève), et un écran
    // neuf qui relirait la couleur courante le ferait revenir dans l'écran même où il avait
    // été corrigé.
    //
    // La forme de la garantie est plus forte qu'une assertion : `ReleveBlocInput` n'a PAS de
    // champ de couleur, donc ce module ne peut structurellement pas lire la couleur courante.
    // Ici on vérifie le comportement observable.
    const blocRecote = [{ id: 'b-dalle-1', wall: 'Dalle', number: 1, color: 'rose' }];
    const r = buildMiniCompetitionReleve(
      ELEVES,
      blocRecote as ReleveBlocInput[],
      [resultat({ userId: 'u-lea', boulderId: 'b-dalle-1', boulderColor: 'bleu', attempts: 2 })]
    );
    expect(r.lignes[0].cellules[0]?.couleurFigee).toBe('bleu');
    expect(JSON.stringify(r)).not.toContain('rose');
  });

  it('un résultat sans couleur figée rend null, jamais une couleur de repli', () => {
    const r = buildMiniCompetitionReleve(
      ELEVES,
      BLOCS,
      [resultat({ userId: 'u-lea', boulderId: 'b-dalle-1', boulderColor: undefined })]
    );
    expect(r.lignes[0].cellules[0]?.couleurFigee).toBeNull();
  });

  it('un échec garde attempts à null — c’est un état légal, pas une donnée manquante', () => {
    const r = buildMiniCompetitionReleve(
      ELEVES,
      BLOCS,
      [resultat({ userId: 'u-lea', boulderId: 'b-dalle-1', success: false, attempts: undefined })]
    );
    expect(r.lignes[0].cellules[0]).toEqual({ success: false, attempts: null, couleurFigee: 'bleu' });
  });

  it('une réussite sans essais saisis n’est PAS affichée comme un flash', () => {
    // Un défaut de 1 par défaut inventerait un flash sur chaque réussite mal saisie.
    const r = buildMiniCompetitionReleve(
      ELEVES,
      BLOCS,
      [resultat({ userId: 'u-lea', boulderId: 'b-dalle-1', attempts: undefined })]
    );
    expect(r.lignes[0].cellules[0]?.attempts).toBeNull();
  });
});

describe('robustesse', () => {
  it('🔴 ne mute pas le tableau de blocs reçu', () => {
    // ⚠️ CE TEST ÉTAIT INCAPABLE D’ÉCHOUER, et la cause est le DÉCOR, pas l’assertion :
    // il partait d’une copie de la constante BLOCS, partagée par tout le fichier. Avec un
    // tri en place, le PREMIER test du fichier à passer BLOCS directement l’avait déjà
    // trié — si bien qu’ici retrier ne changeait plus rien et le test restait VERT.
    // Constaté le 07/11/2026 en exerçant chaque propriété séparément.
    // Le jeu de données est donc construit SUR PLACE, dans un ordre que le tri doit
    // nécessairement changer, et l’ordre est affirmé explicitement.
    const blocs: ReleveBlocInput[] = [
      { id: 'z', wall: 'Dévers 15°', number: 9 },
      { id: 'a', wall: 'Dalle', number: 1 },
    ];
    const r = buildMiniCompetitionReleve(ELEVES, blocs, []);
    // Le tri a bien eu lieu dans le résultat…
    expect(r.colonnes.map((c) => c.boulderId)).toEqual(['a', 'z']);
    // …et pas dans l’entrée.
    expect(blocs.map((b) => b.id)).toEqual(['z', 'a']);
  });

  it('une séance sans participants rend un relevé vide mais bien formé', () => {
    const r = buildMiniCompetitionReleve([], BLOCS, [resultat({ userId: 'u-lea', boulderId: 'b-dalle-1' })]);
    expect(r.lignes).toHaveLength(0);
    expect(r.colonnes).toHaveLength(3);
    expect(r.effectif).toBe(0);
    expect(r.resultatsHorsTableau).toHaveLength(1);
  });

  it('une mini-compétition sans blocs rend des lignes sans cellules', () => {
    const r = buildMiniCompetitionReleve(ELEVES, [], []);
    expect(r.lignes).toHaveLength(3);
    expect(r.lignes.every((l) => l.cellules.length === 0)).toBe(true);
    expect(r.colonnes).toHaveLength(0);
  });

  it('deux résultats du même élève sur le même bloc : le dernier gagne, et on ne compte qu’une cellule', () => {
    const r = buildMiniCompetitionReleve(ELEVES, BLOCS, [
      resultat({ userId: 'u-lea', boulderId: 'b-dalle-1', attempts: 5 }),
      resultat({ userId: 'u-lea', boulderId: 'b-dalle-1', attempts: 2 }),
    ]);
    expect(r.cellulesRemplies).toBe(1);
    expect(r.lignes[0].cellules[0]?.attempts).toBe(2);
    // ⚠️ Et le contrôle de taille doit alors signaler l'écart plutôt que de le masquer :
    // 2 résultats pour 1 cellule, 0 hors tableau — c'est un doublon, pas une perte.
    expect(r.resultatsHorsTableau).toHaveLength(0);
  });
});
