import { describe, expect, it } from 'vitest';
import { shortParticipantName, NOM_PARTICIPANT_INCONNU } from './participantDisplayName';

describe('shortParticipantName', () => {
  it('prénom + initiale du nom, point compris', () => {
    expect(shortParticipantName({ first_name: 'Stéphane', last_name: 'Brunel' })).toBe('Stéphane B.');
  });

  it('met l\'initiale en majuscule même si le nom est saisi en minuscules', () => {
    expect(shortParticipantName({ first_name: 'kylian', last_name: 'joly' })).toBe('kylian J.');
  });

  it('ne produit pas « Prénom . » quand le nom de famille manque', () => {
    // Le cas réel du compte rattrapé le 03/10/2026, qui n'a ni nom ni date de naissance.
    expect(shortParticipantName({ first_name: 'Stéphane', last_name: null })).toBe('Stéphane');
    expect(shortParticipantName({ first_name: 'Stéphane', last_name: '' })).toBe('Stéphane');
    expect(shortParticipantName({ first_name: 'Stéphane', last_name: '   ' })).toBe('Stéphane');
    expect(shortParticipantName({ first_name: 'Stéphane' })).toBe('Stéphane');
  });

  it('n\'affiche JAMAIS le nom de famille seul', () => {
    // Ce serait l'inverse exact de l'intention : on cache le patronyme, on montre le prénom.
    expect(shortParticipantName({ first_name: '', last_name: 'Brunel' })).toBe(NOM_PARTICIPANT_INCONNU);
    expect(shortParticipantName({ last_name: 'Brunel' })).toBe(NOM_PARTICIPANT_INCONNU);
  });

  it('dit explicitement qu\'il n\'y a pas de nom, plutôt que de rendre du vide', () => {
    // Une ligne vide est illisible sur un écran projeté, et inquiétante dans un palmarès.
    expect(shortParticipantName({})).toBe(NOM_PARTICIPANT_INCONNU);
    expect(shortParticipantName({ first_name: null, last_name: null })).toBe(NOM_PARTICIPANT_INCONNU);
    expect(shortParticipantName({ first_name: '  ', last_name: '  ' })).toBe(NOM_PARTICIPANT_INCONNU);
  });

  it('ne laisse passer aucun nom de famille complet, sur un jeu de noms longs', () => {
    // ⚠️ Noms assez longs pour que la troncature soit DÉTECTABLE (§3.2 du plan : « Dupont-
    // Lachaise, pas Li »). Avec un nom d'une lettre, tronqué et non tronqué se confondent et
    // l'assertion ne vérifierait rien.
    const noms = ['Dupont-Lachaise', 'Vandenberghe', 'Tartanpion'];
    noms.forEach((nom) => {
      const affiche = shortParticipantName({ first_name: 'Camille', last_name: nom });
      expect(affiche).not.toContain(nom);
      expect(affiche).toBe(`Camille ${nom.charAt(0)}.`);
    });
  });
});
