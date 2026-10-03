import { describe, it, expect } from 'vitest';
import {
  buildCompetitionParticipant,
  competitionParticipantId,
  PARTICIPANT_FIELDS,
  type ParticipantSourceUser,
} from './competitionParticipant';

describe('competitionParticipantId', () => {
  it('compose l\'identifiant déterministe attendu par firestore.rules', () => {
    expect(competitionParticipantId('uid1', 'comp1')).toBe('uid1_comp1');
  });
});

describe('buildCompetitionParticipant', () => {
  const complet: ParticipantSourceUser = {
    uid: 'uid1',
    email: 'a@b.c',
    first_name: 'Alice',
    last_name: 'Aubert',
    dateOfBirth: '1990-01-02',
    legacyAge: 34,
    gender: 'Femme',
    level: 'rouge',
    roles: ['client'],
  };

  it('recopie chaque champ du compte', () => {
    expect(buildCompetitionParticipant(complet, 'comp1', { registeredAt: 'T' })).toEqual({
      user_id: 'uid1',
      competition_id: 'comp1',
      email: 'a@b.c',
      first_name: 'Alice',
      last_name: 'Aubert',
      age: 34,
      dateOfBirth: '1990-01-02',
      gender: 'Femme',
      level: 'rouge',
      registered_at: 'T',
      is_client: true,
    });
  });

  it('écrit le champ Firestore `age` depuis `legacyAge`', () => {
    // Le champ stocké s'appelle `age` ; toute interface qui le lit le nomme `legacyAge`,
    // parce qu'aucun chemin d'écriture ne l'alimente plus (voir CLAUDE.md).
    const doc = buildCompetitionParticipant({ uid: 'u', legacyAge: 12 }, 'c');
    expect(doc.age).toBe(12);
    expect('legacyAge' in doc).toBe(false);
  });

  it('fusionne `roles` et le `role` scalaire legacy pour déduire is_client', () => {
    expect(buildCompetitionParticipant({ uid: 'u', roles: ['ouvreur'] }, 'c').is_client).toBe(false);
    expect(buildCompetitionParticipant({ uid: 'u', role: 'client' }, 'c').is_client).toBe(true);
    expect(buildCompetitionParticipant({ uid: 'u', roles: ['ouvreur'], role: 'client' }, 'c').is_client).toBe(true);
  });

  it('se replie sur is_client vrai quand aucun rôle n\'est lisible', () => {
    // Tout compte porte `client` par convention du projet ; sans rôle lisible, l'ancien
    // comportement des deux chemins d'administration était déjà ce repli.
    expect(buildCompetitionParticipant({ uid: 'u' }, 'c').is_client).toBe(true);
    expect(buildCompetitionParticipant({ uid: 'u', roles: [] }, 'c').is_client).toBe(true);
  });

  it('horodate à maintenant quand l\'appelant ne fournit rien', () => {
    const avant = Date.now();
    const doc = buildCompetitionParticipant({ uid: 'u' }, 'c');
    expect(typeof doc.registered_at).toBe('string');
    expect(new Date(doc.registered_at as string).getTime()).toBeGreaterThanOrEqual(avant - 1000);
  });

  // ════════════════════════════════════════════════════════════════════════════════════════
  // LE TEST DE PROPRIÉTÉ — demandé par ClaudeNav (RETOUR-auto-inscription-reponses.md §1).
  //
  // ⚠️ Pourquoi une propriété et non trois tests de cas : les trois chemins d'inscription
  // doivent produire LE MÊME ENSEMBLE DE CHAMPS. Trois tests séparés, un par chemin,
  // resteraient tous verts le jour où quelqu'un ajoute un quatrième chemin, ou ajoute un
  // champ à un seul appelant. Celui-ci échoue tout seul. Même forme que le test des 1024
  // combinaisons de `classementFlushWrites.test.ts`.
  // ════════════════════════════════════════════════════════════════════════════════════════
  const OPTIONNELS = ['email', 'first_name', 'last_name', 'dateOfBirth', 'legacyAge', 'gender', 'level', 'roles'] as const;

  it('⚠️ produit toujours exactement les mêmes clés, sur les 256 combinaisons de champs présents', () => {
    const attendu = [...PARTICIPANT_FIELDS].sort();
    for (let masque = 0; masque < 2 ** OPTIONNELS.length; masque += 1) {
      const user: ParticipantSourceUser = { uid: 'u' };
      OPTIONNELS.forEach((champ, i) => {
        if ((masque & (1 << i)) === 0) return;
        if (champ === 'legacyAge') user.legacyAge = 30;
        else if (champ === 'roles') user.roles = ['client'];
        else user[champ] = 'x';
      });
      const doc = buildCompetitionParticipant(user, 'c');
      expect(Object.keys(doc).sort(), `combinaison ${masque} : jeu de clés différent`).toEqual(attendu);
    }
  });

  it('⚠️ ne produit JAMAIS undefined — Firestore le refuse dans un setDoc', () => {
    // Le défaut se manifesterait au moment d'inscrire quelqu'un, en salle, devant la
    // personne. Vérifié sur les mêmes 256 combinaisons.
    for (let masque = 0; masque < 2 ** OPTIONNELS.length; masque += 1) {
      const user: ParticipantSourceUser = { uid: 'u' };
      OPTIONNELS.forEach((champ, i) => {
        if ((masque & (1 << i)) === 0) return;
        if (champ === 'legacyAge') user.legacyAge = 30;
        else if (champ === 'roles') user.roles = ['client'];
        else user[champ] = 'x';
      });
      const doc = buildCompetitionParticipant(user, 'c');
      Object.entries(doc).forEach(([cle, valeur]) => {
        expect(valeur, `combinaison ${masque} : ${cle} vaut undefined`).not.toBeUndefined();
      });
    }
  });

  it('⚠️ n\'invente aucun champ d\'identité : un compte vide donne des null, pas des chaînes vides', () => {
    // Une chaîne vide est ce qu'écrivait l'ancienne auto-inscription (découpage d'un
    // `displayName` inexistant), et c'est exactement ce qui faisait des lignes sans nom sur
    // l'écran live : `null` dit « absent » et laisse le repli sur `users` jouer, `''` prétend
    // porter une valeur.
    const doc = buildCompetitionParticipant({ uid: 'u' }, 'c');
    expect(doc.first_name).toBeNull();
    expect(doc.last_name).toBeNull();
    expect(doc.dateOfBirth).toBeNull();
    expect(doc.gender).toBeNull();
  });
});
