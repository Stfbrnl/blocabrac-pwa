import { describe, it, expect } from 'vitest';
import {
  buildPointsAnnouncement,
  buildOfficialAnnouncement,
  announcementTitle,
} from './competitionAnnouncement';
import {
  getClassementByCategory,
  getOfficialParticipantTotals,
  rankedEntries,
  rankedOfficialEntries,
  type CompetitionResultInput,
  type BoulderInput,
} from './competitionClassement';

const participant = (uid: string, prenom: string, dateOfBirth: string, gender: string) =>
  ({ user_id: uid, first_name: prenom, last_name: 'Nom', dateOfBirth, gender });

// Deux grimpeurs strictement à égalité (même bloc, même nombre d'essais) et un troisième
// derrière. C'est le jeu minimal capable d'exprimer un rang PARTAGÉ — avec des scores tous
// distincts, 1, 2, 3 et 1, 1, 3 seraient indiscernables et ces tests ne vérifieraient rien.
const participants = [
  participant('u1', 'Alice', '1990-01-01', 'Femme'),
  participant('u2', 'Bob', '1990-01-01', 'Homme'),
  participant('u3', 'Carol', '1990-01-01', 'Femme'),
];
const blocs: BoulderInput[] = [
  { id: 'b1', difficulty: 'rouge', color: 'rouge' },
  { id: 'b2', difficulty: 'bleu', color: 'bleu' },
];
const resultats: CompetitionResultInput[] = [
  { user_id: 'u1', boulder_id: 'b1', success: true, attempts: 1 },
  { user_id: 'u2', boulder_id: 'b1', success: true, attempts: 1 },
  { user_id: 'u3', boulder_id: 'b2', success: true, attempts: 1 },
];

describe('announcementTitle', () => {
  it('reprend le nom de la compétition', () => {
    expect(announcementTitle('Contest du mois')).toBe('Classement - Contest du mois');
  });
});

describe('buildPointsAnnouncement', () => {
  const entree = {
    competitionName: 'Contest du mois',
    openLabel: 'Open',
    global: getClassementByCategory(resultats, participants, blocs, 'global'),
    byAge: getClassementByCategory(resultats, participants, blocs, 'age'),
    byGender: getClassementByCategory(resultats, participants, blocs, 'gender'),
  };

  it('ouvre sur l\'en-tête attendu', () => {
    expect(buildPointsAnnouncement(entree).startsWith('🏆 Classement Open - Contest du mois 🏆\n\n')).toBe(true);
  });

  it('comporte les trois sections', () => {
    const message = buildPointsAnnouncement(entree);
    expect(message).toContain('📊 Classement par âge :');
    expect(message).toContain('📊 Classement par genre :');
  });

  it('⚠️ partage le rang des grimpeurs à égalité, et saute le rang suivant', () => {
    // C'est LE défaut que ce module existe pour empêcher : une annonce qui numéroterait
    // 1, 2, 3 là où l'écran affiche 1, 1, 3.
    const lignes = buildPointsAnnouncement(entree).split('\n');
    expect(lignes[2]).toMatch(/^1\. (Alice|Bob) Nom - 400 pts \(1 blocs validés\)$/);
    expect(lignes[3]).toMatch(/^1\. (Alice|Bob) Nom - 400 pts \(1 blocs validés\)$/);
    expect(lignes[4]).toBe('3. Carol Nom - 100 pts (1 blocs validés)');
  });

  it('⚠️ numérote EXACTEMENT comme l\'écran, section par section', () => {
    // La propriété qui compte, et la seule qui résiste à une évolution du format : les rangs
    // du message sont ceux de `rankedEntries`, le calcul que les tableaux utilisent. Vérifier
    // le texte ne protège que du texte ; vérifier l'égalité des rangs protège l'invariant.
    const message = buildPointsAnnouncement(entree);
    const rangsDuMessage = message.split('\n')
      .filter((l) => /^\d+\. /.test(l))
      .map((l) => Number(l.split('.')[0]));
    const rangsDeLEcran = [
      ...rankedEntries(entree.global).map((r) => r.rank),
      ...entree.byAge.flatMap((g) => rankedEntries(g.participants).map((r) => r.rank)),
      ...entree.byGender.flatMap((g) => rankedEntries(g.participants).map((r) => r.rank)),
    ];
    expect(rangsDuMessage).toEqual(rangsDeLEcran);
  });

  it('n\'écrit pas de markdown : le bandeau d\'annonces affiche du texte brut', () => {
    expect(buildPointsAnnouncement(entree)).not.toContain('**');
  });

  it('tolère un nom absent sans laisser traîner d\'espace', () => {
    const sansNom = [{ user_id: 'u1', dateOfBirth: '1990-01-01', gender: 'Femme' }];
    const message = buildPointsAnnouncement({
      competitionName: 'C', openLabel: 'Open',
      global: getClassementByCategory(
        [{ user_id: 'u1', boulder_id: 'b1', success: true, attempts: 1 }], sansNom, blocs, 'global'
      ),
      byAge: [], byGender: [],
    });
    expect(message).toContain('1. - 400 pts');
    // ⚠️ Restreint aux LIGNES DE CLASSEMENT : un `not.toMatch(/\s{2}/)` sur tout le message
    // échouait sur les `\n\n` de l'en-tête, c'est-à-dire sur du texte parfaitement correct.
    const lignes = message.split('\n').filter((l) => /^\d+\. /.test(l));
    expect(lignes.length).toBeGreaterThan(0);
    lignes.forEach((l) => expect(l, `espace double dans « ${l} »`).not.toMatch(/ {2}/));
  });
});

describe('buildOfficialAnnouncement', () => {
  // Alice et Bob strictement identiques (même top, même nombre d'essais), Carol sans rien.
  const resultatsOfficiels: CompetitionResultInput[] = [
    { user_id: 'u1', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'u2', boulder_id: 'b1', success: true, attempts: 1, zone: true, attempts_to_zone: 1 },
    { user_id: 'u3', boulder_id: 'b1', success: false, attempts: 4, zone: true, attempts_to_zone: 2 },
  ];
  const global = getOfficialParticipantTotals(resultatsOfficiels, participants);
  const entree = { competitionName: 'Finale', openLabel: 'Open', global, byAge: [], byGender: [] };

  it('écrit une ligne tops/zones/essais, sans points', () => {
    const message = buildOfficialAnnouncement(entree);
    expect(message).toContain('tops');
    expect(message).toContain('essais zone');
    expect(message).not.toContain(' pts');
  });

  it('🔴 partage le rang — c\'est la branche qui numérotait 1, 2, 3 jusqu\'au 03/10/2026', () => {
    // Dans le mode de la Finale, une égalité parfaite au rang 1 est un cas PRÉVU : c'est
    // elle qui déclenche la super-finale. Une annonce qui la masquerait serait un démenti
    // de l'écran à l'endroit le plus sensible.
    const lignes = buildOfficialAnnouncement(entree).split('\n').filter((l) => /^\d+\. /.test(l));
    expect(lignes[0].startsWith('1. ')).toBe(true);
    expect(lignes[1].startsWith('1. ')).toBe(true);
    expect(lignes[2].startsWith('3. ')).toBe(true);
  });

  it('⚠️ numérote EXACTEMENT comme l\'écran', () => {
    const rangsDuMessage = buildOfficialAnnouncement(entree).split('\n')
      .filter((l) => /^\d+\. /.test(l))
      .map((l) => Number(l.split('.')[0]));
    expect(rangsDuMessage).toEqual(rankedOfficialEntries(global).map((r) => r.rank));
  });
});
