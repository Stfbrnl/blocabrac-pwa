import { describe, it, expect } from 'vitest';
import {
  buildMiniCompetitionRanking,
  selectableMiniCompetitions,
  type MiniCompetitionParticipantInput,
} from './miniCompetitionRanking';

const MC = 'mc-1';
const AUTRE = 'mc-2';

const participant = (
  id: string,
  displayName: string,
  results: { miniCompetitionId?: string; boulderColor?: string; attempts?: number; success?: boolean }[]
): MiniCompetitionParticipantInput => ({ id, displayName, results });

describe('buildMiniCompetitionRanking', () => {
  it('somme les points du barème sur les seuls blocs de CETTE mini-compétition', () => {
    const classement = buildMiniCompetitionRanking([
      participant('u1', 'Alice', [
        // bleu 1er essai = 100 ; rouge 2e essai = 380 ; et un bloc d'une AUTRE mini-compét.
        { miniCompetitionId: MC, boulderColor: 'bleu', attempts: 1, success: true },
        { miniCompetitionId: MC, boulderColor: 'rouge', attempts: 2, success: true },
        { miniCompetitionId: AUTRE, boulderColor: 'rose', attempts: 1, success: true },
      ]),
    ], MC);

    expect(classement).toHaveLength(1);
    expect(classement[0].score).toBe(480);
    expect(classement[0].bouldersValidated).toBe(2);
  });

  it('un échec ne rapporte rien et ne compte pas comme bloc réussi', () => {
    const classement = buildMiniCompetitionRanking([
      participant('u1', 'Alice', [{ miniCompetitionId: MC, boulderColor: 'rouge', attempts: 4, success: false }]),
    ], MC);
    expect(classement[0]).toMatchObject({ score: 0, bouldersValidated: 0, rank: 1 });
  });

  it('écarte les participants qui n\'ont aucun résultat sur cette mini-compétition', () => {
    const classement = buildMiniCompetitionRanking([
      participant('u1', 'Alice', [{ miniCompetitionId: MC, boulderColor: 'bleu', attempts: 1, success: true }]),
      participant('u2', 'Bruno', [{ miniCompetitionId: AUTRE, boulderColor: 'bleu', attempts: 1, success: true }]),
      participant('u3', 'Chloe', []),
    ], MC);
    expect(classement.map((e) => e.userId)).toEqual(['u1']);
  });

  // ⚠️ LE DÉFAUT CORRIGÉ. Avant, le rang valait `index + 1` : deux élèves au même score
  // recevaient 1 et 2, départagés par l'ordre des documents Firestore.
  it('deux ex æquo PARTAGENT leur rang, et le suivant saute la place occupée', () => {
    const classement = buildMiniCompetitionRanking([
      participant('u1', 'Alice', [{ miniCompetitionId: MC, boulderColor: 'bleu', attempts: 1, success: true }]),
      participant('u2', 'Bruno', [{ miniCompetitionId: MC, boulderColor: 'bleu', attempts: 1, success: true }]),
      participant('u3', 'Chloe', [{ miniCompetitionId: MC, boulderColor: 'jaune', attempts: 1, success: true }]),
    ], MC);

    expect(classement.map((e) => e.rank)).toEqual([1, 1, 3]);
    expect(classement.map((e) => e.score)).toEqual([100, 100, 25]);
  });

  it('tout le monde à zéro en début de séance : un seul et même rang 1', () => {
    // Le cas NORMAL d'un cours, pas un cas limite : personne n'a encore réussi un bloc.
    const classement = buildMiniCompetitionRanking([
      participant('u1', 'Alice', [{ miniCompetitionId: MC, boulderColor: 'rouge', attempts: 2, success: false }]),
      participant('u2', 'Bruno', [{ miniCompetitionId: MC, boulderColor: 'bleu', attempts: 1, success: false }]),
      participant('u3', 'Chloe', [{ miniCompetitionId: MC, boulderColor: 'noir', attempts: 5, success: false }]),
    ], MC);
    expect(classement.map((e) => e.rank)).toEqual([1, 1, 1]);
  });

  it('trois ex æquo puis un quatrième : 1, 1, 1, 4', () => {
    const egal = [{ miniCompetitionId: MC, boulderColor: 'bleu', attempts: 1, success: true }];
    const classement = buildMiniCompetitionRanking([
      participant('u1', 'Alice', egal),
      participant('u2', 'Bruno', egal),
      participant('u3', 'Chloe', egal),
      participant('u4', 'David', [{ miniCompetitionId: MC, boulderColor: 'jaune', attempts: 1, success: true }]),
    ], MC);
    expect(classement.map((e) => e.rank)).toEqual([1, 1, 1, 4]);
  });

  // ⚠️ L'ordre d'affichage ne doit plus dépendre de l'ordre d'arrivée des documents : à score
  // égal il suit le nom. Le rang, lui, reste partagé — ce second critère ne départage rien.
  it('l\'ordre des ex æquo est déterministe, quel que soit l\'ordre d\'entrée', () => {
    const egal = [{ miniCompetitionId: MC, boulderColor: 'bleu', attempts: 1, success: true }];
    const entree = [
      participant('u3', 'Chloe', egal),
      participant('u1', 'Alice', egal),
      participant('u2', 'Bruno', egal),
    ];
    const attendu = ['Alice', 'Bruno', 'Chloe'];

    expect(buildMiniCompetitionRanking(entree, MC).map((e) => e.participant)).toEqual(attendu);
    expect(buildMiniCompetitionRanking([...entree].reverse(), MC).map((e) => e.participant)).toEqual(attendu);
  });

  it('porte l\'uid : deux homonymes restent deux lignes distinctes', () => {
    // `key={entry.participant}` provoquait une collision de clés React sur deux homonymes.
    const classement = buildMiniCompetitionRanking([
      participant('u1', 'Jean Martin', [{ miniCompetitionId: MC, boulderColor: 'bleu', attempts: 1, success: true }]),
      participant('u2', 'Jean Martin', [{ miniCompetitionId: MC, boulderColor: 'bleu', attempts: 1, success: true }]),
    ], MC);
    expect(classement).toHaveLength(2);
    expect(new Set(classement.map((e) => e.userId)).size).toBe(2);
  });

  it('une couleur manquante ne fait pas planter : elle ne rapporte rien', () => {
    const classement = buildMiniCompetitionRanking([
      participant('u1', 'Alice', [{ miniCompetitionId: MC, attempts: 1, success: true }]),
    ], MC);
    expect(classement[0].score).toBe(0);
    expect(classement[0].bouldersValidated).toBe(1);
  });
});

describe('selectableMiniCompetitions', () => {
  const mine = { id: 'mc-1', name: 'La mienne', createdBy: 'moi' };
  const autrui = { id: 'mc-2', name: 'Celle du collègue', createdBy: 'quelqu-un-dautre' };
  const autruiJamaisJouee = { id: 'mc-3', name: 'Jamais jouée', createdBy: 'quelqu-un-dautre' };

  it('propose les miennes, même sans aucun résultat', () => {
    expect(selectableMiniCompetitions([mine], [], 'moi').map((m) => m.id)).toEqual(['mc-1']);
  });

  // ⚠️ LE DÉFAUT CORRIGÉ : une mini-compétition créée par quelqu'un d'autre, jouée dans MA
  // séance, n'apparaissait pas — le bloc « Classement » restait entièrement absent.
  it('propose aussi celle d\'un collègue dès qu\'elle a été jouée', () => {
    const joueurs = [{
      id: 'u1', displayName: 'Alice',
      results: [{ miniCompetitionId: 'mc-2', boulderColor: 'bleu', attempts: 1, success: true }],
    }];
    expect(selectableMiniCompetitions([mine, autrui], joueurs, 'moi').map((m) => m.id))
      .toEqual(['mc-1', 'mc-2']);
  });

  it('n\'inonde pas la liste : celle d\'un collègue jamais jouée reste dehors', () => {
    expect(selectableMiniCompetitions([mine, autruiJamaisJouee], [], 'moi').map((m) => m.id))
      .toEqual(['mc-1']);
  });

  it('ignore les résultats d\'exercice, qui ne portent pas de miniCompetitionId', () => {
    const joueurs = [{ id: 'u1', displayName: 'Alice', results: [{ success: true, attempts: 1 }] }];
    expect(selectableMiniCompetitions([mine, autrui], joueurs, 'moi').map((m) => m.id)).toEqual(['mc-1']);
  });
});
