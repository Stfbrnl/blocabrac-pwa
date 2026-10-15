import { describe, expect, it } from 'vitest';
import {
  buildLevelAtStartSnapshot,
  type ParticipationForSnapshot,
  type SnapshotSourceUser,
} from './competitionLevelSnapshot';

const comptes = (entrees: [string, string | null | undefined][]): Map<string, SnapshotSourceUser> =>
  new Map(entrees.map(([uid, level]) => [uid, { level }]));

describe('buildLevelAtStartSnapshot', () => {
  it('fige le niveau courant du compte, pas celui de l\'inscription', () => {
    // Le cas qui motive tout le champ : inscrit en bleu trois semaines avant, passé violet
    // dans la salle entre-temps. C'est violet qui doit être figé au coup d'envoi.
    const participations: ParticipationForSnapshot[] = [
      { id: 'u1_c', user_id: 'u1', level: 'bleu' },
    ];
    expect(buildLevelAtStartSnapshot(participations, comptes([['u1', 'violet']]))).toEqual([
      { participationId: 'u1_c', level_at_start: 'violet' },
    ]);
  });

  it('ne réécrit JAMAIS une participation qui porte déjà le champ', () => {
    // L'idempotence : un aller-retour « en cours » → « à venir » → « en cours » ne redate
    // rien, et le niveau au début reste le fait qu'il était.
    const participations: ParticipationForSnapshot[] = [
      { id: 'u1_c', user_id: 'u1', level: 'bleu', level_at_start: 'bleu' },
    ];
    expect(buildLevelAtStartSnapshot(participations, comptes([['u1', 'rose']]))).toEqual([]);
  });

  it('se replie sur le niveau d\'inscription quand le compte n\'est pas lisible', () => {
    const participations: ParticipationForSnapshot[] = [
      { id: 'u1_c', user_id: 'u1', level: 'rouge' },
    ];
    expect(buildLevelAtStartSnapshot(participations, comptes([]))).toEqual([
      { participationId: 'u1_c', level_at_start: 'rouge' },
    ]);
  });

  it('n\'écrit rien quand aucun niveau n\'est connu — un champ absent, pas une chaîne vide', () => {
    // `resolveClassementLevel` sait traiter l'absence (paquet « non déterminé ») ; une chaîne
    // vide, elle, prétendrait porter une valeur. Même doctrine que `?? null` contre `''` dans
    // buildCompetitionParticipant.
    const participations: ParticipationForSnapshot[] = [
      { id: 'u1_c', user_id: 'u1' },
      { id: 'u2_c', user_id: 'u2', level: '' },
      { id: 'u3_c', user_id: 'u3', level: null },
    ];
    expect(buildLevelAtStartSnapshot(participations, comptes([['u2', ''], ['u3', null]]))).toEqual([]);
  });

  it('traite plusieurs participations d\'un coup, et n\'en retient que celles à écrire', () => {
    // ⚠️ Jeu à PLUSIEURS participations, et mélangé : avec une seule, aucun défaut de
    // sélection (tout écrire, ou n'écrire que la première) ne serait détectable.
    const participations: ParticipationForSnapshot[] = [
      { id: 'a_c', user_id: 'a', level: 'bleu' },                        // à écrire (noir)
      { id: 'b_c', user_id: 'b', level: 'rouge', level_at_start: 'rouge' }, // déjà figé
      { id: 'c_c', user_id: 'c' },                                        // rien de connu
      { id: 'd_c', user_id: 'd', level: 'violet' },                       // repli inscription
    ];
    const uid = comptes([['a', 'noir'], ['b', 'rose'], ['c', undefined]]);
    expect(buildLevelAtStartSnapshot(participations, uid)).toEqual([
      { participationId: 'a_c', level_at_start: 'noir' },
      { participationId: 'd_c', level_at_start: 'violet' },
    ]);
  });
});
