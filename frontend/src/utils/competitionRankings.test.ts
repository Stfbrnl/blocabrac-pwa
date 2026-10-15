import { describe, expect, it } from 'vitest';
import { buildFrozenRankings, FROZEN_RANKINGS_VERSION, type RankingParticipant } from './competitionRankings';
import { getClassementByCategory, rankedEntries } from './competitionClassement';
import { NOM_PARTICIPANT_INCONNU } from './participantDisplayName';

// ⚠️ Ce que ce jeu de données est capable d'exprimer, délibérément :
//   - un EX ÆQUO RÉEL (vera / walid), pour que l'égalité des rangs entre le document et
//     l'écran porte sur le cas où les deux chemins peuvent justement diverger — c'est le
//     défaut réel du 03/10/2026 (message publié en 1, 2, 3 contre un écran en 1, 1, 3) ;
//   - un NON-CLIENT (yann), sans quoi « général open » et « client open » seraient la même
//     liste et le filtre ne vérifierait rien. ⚠️ En production ce cas n'existe pas encore :
//     les 61 comptes portent tous `client`. Le test l'exprime, la prod non ;
//   - des NOMS DE FAMILLE LONGS (Dupont-Lachaise, Vandenberghe), pour que la troncature soit
//     détectable — avec « Li », tronqué et non tronqué se confondent ;
//   - un participant SANS AUCUN NOM et SANS DATE DE NAISSANCE (zoe), le cas réel du compte
//     rattrapé le 03/10/2026 ;
//   - plusieurs genres, plusieurs catégories d'âge, plusieurs niveaux, dont des groupes à un
//     seul grimpeur.
const vera: RankingParticipant = {
  user_id: 'vera', first_name: 'Vera', last_name: 'Dupont-Lachaise',
  gender: 'Femme', legacyAge: 30, level: 'rouge', is_client: true,
};
const walid: RankingParticipant = {
  user_id: 'walid', first_name: 'Walid', last_name: 'Vandenberghe',
  gender: 'Homme', legacyAge: 30, level: 'rouge', is_client: true,
};
const xena: RankingParticipant = {
  user_id: 'xena', first_name: 'Xena', last_name: 'Tartanpion',
  gender: 'Femme', legacyAge: 14, level: 'bleu', is_client: true,
};
const yann: RankingParticipant = {
  user_id: 'yann', first_name: 'Yann', last_name: 'Visiteur',
  gender: 'Homme', legacyAge: 30, level: 'noir', is_client: false,
};
const zoe: RankingParticipant = {
  user_id: 'zoe', gender: 'Femme', level: 'violet', is_client: true,
};
// ⚠️ Obi existe pour UNE raison précise : sans lui, aucun groupe de GENRE ne contient
// d'égalité (Femme : 480/100/90, Homme : walid seul), et le test d'identité des rangs par
// genre resterait VERT même en numérotant les rangs en `index + 1` — c'est-à-dire qu'il ne
// vérifierait rien. Mesuré : avec cinq participants, la casse ne rougissait pas ce pas.
const obi: RankingParticipant = {
  user_id: 'obi', first_name: 'Obi', last_name: 'Kowalczyk',
  gender: 'Homme', legacyAge: 30, level: 'rouge', is_client: true,
};

const participants = [vera, walid, xena, yann, zoe, obi];
const clients = [vera, walid, xena, zoe, obi];

const boulders = [
  { id: 'r', color: 'rouge', difficulty: 'rouge' },
  { id: 'b', color: 'bleu', difficulty: 'bleu' },
];

const results = [
  { user_id: 'vera', boulder_id: 'r', success: true, attempts: 2 },
  { user_id: 'vera', boulder_id: 'b', success: true, attempts: 1 },
  { user_id: 'walid', boulder_id: 'r', success: true, attempts: 2 },
  { user_id: 'walid', boulder_id: 'b', success: true, attempts: 1 },
  { user_id: 'yann', boulder_id: 'r', success: true, attempts: 1 },
  { user_id: 'xena', boulder_id: 'b', success: true, attempts: 1 },
  { user_id: 'zoe', boulder_id: 'b', success: true, attempts: 2 },
  { user_id: 'obi', boulder_id: 'r', success: true, attempts: 2 },
  { user_id: 'obi', boulder_id: 'b', success: true, attempts: 1 },
];

const competition = { id: 'comp5nov', name: 'Contest Haloween', date: '2026-11-05' };
const PUBLIE_LE = '2026-11-05T21:30:00.000Z';

const gel = buildFrozenRankings({
  competition, participants, results, boulders, publishedAt: PUBLIE_LE,
});

/** Ce que l'écran affiche, pour le même classement : la référence de comparaison. */
const rangsEcran = (entries: ReturnType<typeof rankedEntries>) =>
  entries.map(({ entry, rank }) => ({ user_id: entry.participant.user_id, rank }));

const rangsGel = (entries: { user_id: string; rank: number }[]) =>
  entries.map((e) => ({ user_id: e.user_id, rank: e.rank }));

describe('buildFrozenRankings : en-tête et périmètre', () => {
  it('porte l\'identité de la compétition et la date de publication', () => {
    expect(gel.version).toBe(FROZEN_RANKINGS_VERSION);
    expect(gel.competition_id).toBe('comp5nov');
    expect(gel.competition_name).toBe('Contest Haloween');
    expect(gel.competition_date).toBe('2026-11-05');
    expect(gel.published_at).toBe(PUBLIE_LE);
    expect(gel.scoring_mode).toBe('blocabrac');
  });

  it('les cinq classements du §2.1 sont présents', () => {
    expect(gel.general_open).toHaveLength(6);
    expect(gel.client_open).toHaveLength(5);
    expect(gel.client_gender.length).toBeGreaterThan(0);
    expect(gel.client_age.length).toBeGreaterThan(0);
    expect(gel.client_level_max.length).toBeGreaterThan(0);
  });

  it('« général open » contient le non-client, les quatre classements clients ne l\'ont pas', () => {
    expect(gel.general_open.map((e) => e.user_id)).toContain('yann');
    expect(gel.client_open.map((e) => e.user_id)).not.toContain('yann');
    const tousLesClients = [
      ...gel.client_gender.flatMap((g) => g.entries),
      ...gel.client_age.flatMap((g) => g.entries),
      ...gel.client_level_max.flatMap((g) => g.entries),
    ].map((e) => e.user_id);
    // Assertion de TAILLE avant d'affirmer quoi que ce soit sur l'ensemble : sans elle,
    // « yann n'y est pas » serait vrai d'un ensemble vide.
    expect(tousLesClients.length).toBe(15);
    expect(tousLesClients).not.toContain('yann');
  });
});

// ═══ LE TEST DU §2.4 ═══════════════════════════════════════════════════════════════════
//
// Les deux origines du même affichage — calculé à la lecture, et gelé — doivent produire des
// classements IDENTIQUES. La propriété asserte les RANGS, pas le format : elle survit à un
// changement de forme du document, et c'est elle qui aurait attrapé le défaut du 03/10/2026.
describe('§2.4 — les rangs du palmarès gelé sont ceux de l\'écran, classement par classement', () => {
  it('général open', () => {
    const ecran = rankedEntries(getClassementByCategory(results, participants, boulders, 'global'));
    expect(rangsGel(gel.general_open)).toEqual(rangsEcran(ecran));
    // L'ex æquo est bien là, sinon ce test comparerait deux numérotations séquentielles qui
    // ne peuvent pas diverger.
    expect(gel.general_open.filter((e) => e.rank === 1)).toHaveLength(3);
  });

  it('client open', () => {
    const ecran = rankedEntries(getClassementByCategory(results, clients, boulders, 'global'));
    expect(rangsGel(gel.client_open)).toEqual(rangsEcran(ecran));
  });

  it('client par genre, groupe par groupe', () => {
    const ecran = getClassementByCategory(results, clients, boulders, 'gender');
    expect(gel.client_gender.map((g) => g.category)).toEqual(ecran.map((g) => g.category));
    expect(gel.client_gender).toHaveLength(2);
    gel.client_gender.forEach((groupe, i) => {
      expect(rangsGel(groupe.entries)).toEqual(rangsEcran(rankedEntries(ecran[i].participants)));
    });
  });

  it('client par catégorie d\'âge, groupe par groupe', () => {
    const ecran = getClassementByCategory(results, clients, boulders, 'age');
    expect(gel.client_age.map((g) => g.category)).toEqual(ecran.map((g) => g.category));
    expect(gel.client_age.length).toBeGreaterThanOrEqual(2);
    gel.client_age.forEach((groupe, i) => {
      expect(rangsGel(groupe.entries)).toEqual(rangsEcran(rankedEntries(ecran[i].participants)));
    });
  });

  it('client par niveau max, groupe par groupe', () => {
    const ecran = getClassementByCategory(results, clients, boulders, 'level_max');
    expect(gel.client_level_max.map((g) => g.category)).toEqual(ecran.map((g) => g.category));
    gel.client_level_max.forEach((groupe, i) => {
      expect(rangsGel(groupe.entries)).toEqual(rangsEcran(rankedEntries(ecran[i].participants)));
    });
  });

  it('les paquets de niveau sont ceux attendus, du plus haut au plus bas', () => {
    // vera et walid sont rouges (niveau ET performance), zoe est violette par son niveau
    // déclaré malgré un bleu réussi (le maximum ne descend pas), xena est bleue.
    expect(gel.client_level_max.map((g) => [g.category, g.entries.map((e) => e.user_id)])).toEqual([
      ['Niveau rouge', ['vera', 'walid', 'obi']],
      ['Niveau violet', ['zoe']],
      ['Niveau bleu', ['xena']],
    ]);
  });
});

// ═══ CE QUE LE DOCUMENT NE DOIT PAS PORTER ═════════════════════════════════════════════
//
// ⚠️ Le palmarès est lisible par TOUT compte authentifié et il est IMMUABLE : une donnée
// écrite par excès n'est pas corrigeable par une mise à jour, seulement par une suppression
// avec la clé de service. C'est la leçon de `classement_profiles`, qui avait recopié
// `dateOfBirth` « puisqu'il était là » (17/08/2026).
describe('Le palmarès gelé ne porte que ce que son lecteur consomme', () => {
  const serialise = JSON.stringify(gel);

  it('aucun nom de famille complet, nulle part dans le document', () => {
    // Assertion sur le document SÉRIALISÉ : indépendante de la forme, elle attrape un nom
    // recopié dans un champ auquel personne n'aurait pensé.
    ['Dupont-Lachaise', 'Vandenberghe', 'Tartanpion', 'Visiteur', 'Kowalczyk'].forEach((nom) => {
      expect(serialise).not.toContain(nom);
    });
  });

  it('les noms affichés sont tronqués en prénom + initiale', () => {
    const parId = Object.fromEntries(gel.general_open.map((e) => [e.user_id, e.display_name]));
    expect(parId.vera).toBe('Vera D.');
    expect(parId.walid).toBe('Walid V.');
    expect(parId.xena).toBe('Xena T.');
    expect(parId.yann).toBe('Yann V.');
    expect(parId.obi).toBe('Obi K.');
  });

  it('un participant sans aucun nom est nommé explicitement, pas laissé vide', () => {
    const zoeGelee = gel.general_open.find((e) => e.user_id === 'zoe');
    expect(zoeGelee?.display_name).toBe(NOM_PARTICIPANT_INCONNU);
  });

  it('aucune date de naissance, ni aucun champ d\'identité au-delà du nom affiché', () => {
    expect(serialise).not.toContain('dateOfBirth');
    expect(serialise).not.toContain('legacyAge');
    expect(serialise).not.toContain('last_name');
    expect(serialise).not.toContain('email');
    // La catégorie d'âge EST le libellé du groupe : le lecteur n'a besoin de rien d'autre.
    expect(gel.client_age.map((g) => g.category)).toContain('Séniors (20-39 ans)');
  });

  it('chaque entrée porte exactement les six champs prévus, et rien de plus', () => {
    // Le pendant du test de propriété de `buildCompetitionParticipant` : c'est cette
    // assertion qui échouera le jour où quelqu'un ajoutera un champ au gel sans y penser.
    const attendus = ['user_id', 'display_name', 'rank', 'score', 'boulders', 'total_attempts'];
    const toutes = [
      ...gel.general_open,
      ...gel.client_open,
      ...gel.client_gender.flatMap((g) => g.entries),
      ...gel.client_age.flatMap((g) => g.entries),
      ...gel.client_level_max.flatMap((g) => g.entries),
    ];
    expect(toutes.length).toBe(26);
    toutes.forEach((e) => {
      expect(Object.keys(e).sort()).toEqual([...attendus].sort());
    });
  });
});

// ═══ LE TEST DÉCISIF DU §6 ═════════════════════════════════════════════════════════════
//
// « Recoter un bloc après le gel, et vérifier que le palmarès ne bouge pas d'une ligne. »
//
// ⚠️ Et le plan insiste sur un point que ce test applique à la lettre : il doit prédire TOUTES
// les grandeurs observables, pas seulement celle qu'on espère. Un palmarès inchangé ne prouve
// rien à lui seul — il serait inchangé aussi si la recotation n'avait, en fait, aucun effet sur
// le classement. Il faut donc les deux moitiés :
//
//   1. le classement RECALCULÉ bouge, et on dit exactement comment ;
//   2. le palmarès GELÉ ne bouge pas, et il porte les valeurs d'avant.
//
// Une seule des deux ne suffirait pas. C'est la même exigence que la règle du 03/10 sur les
// critères de sortie : un compteur qui va dans le sens espéré mesure l'espoir.
//
// ⚠️ CE QUI N'EST PAS VÉRIFIÉ ICI, ET QUI DOIT L'ÊTRE AILLEURS : que l'écran du grimpeur LISE
// le document gelé au lieu de recalculer. C'est le vrai risque, et il n'est pas testable sans
// navigateur — il appartient à l'e2e de l'écran client. Ce test-ci établit la propriété du
// calcul ; il ne dit rien de la page.
describe('§6 — une recotation après le gel déplace le classement, pas le palmarès', () => {
  // Le bloc bleu est recoté ROSE. Le barème passe de 100/-10 à 1000/-50, ce qui déplace
  // réellement l'ordre : yann, qui n'avait réussi que le rouge, tombe derrière xena et zoe,
  // qui avaient le bleu. Un bloc recoté en noir, lui, aurait changé les scores sans changer
  // l'ordre — et le test aurait été vert sans rien prouver sur les rangs.
  const blocsRecotes = [
    { id: 'r', color: 'rouge', difficulty: 'rouge' },
    { id: 'b', color: 'rose', difficulty: 'rose' },
  ];

  const apresRecotation = rankedEntries(
    getClassementByCategory(results, participants, blocsRecotes, 'global')
  );

  it('1. le classement recalculé bouge, et exactement comme prévu', () => {
    // Avant : vera/walid/obi 480 (rang 1), yann 400 (4), xena 100 (5), zoe 90 (6).
    // Après  : vera/walid/obi 1380 (rang 1), xena 1000 (4), zoe 950 (5), yann 400 (6).
    expect(apresRecotation.map(({ entry, rank }) => [entry.participant.user_id, entry.score, rank]))
      .toEqual([
        ['vera', 1380, 1],
        ['walid', 1380, 1],
        ['obi', 1380, 1],
        ['xena', 1000, 4],
        ['zoe', 950, 5],
        ['yann', 400, 6],
      ]);
  });

  it('2. le palmarès gelé porte toujours les valeurs d\'avant, aux mêmes rangs', () => {
    expect(gel.general_open.map((e) => [e.user_id, e.score, e.rank])).toEqual([
      ['vera', 480, 1],
      ['walid', 480, 1],
      ['obi', 480, 1],
      ['yann', 400, 4],
      ['xena', 100, 5],
      ['zoe', 90, 6],
    ]);
  });

  it('3. et les deux se contredisent bien — c\'est tout l\'objet du gel', () => {
    // L'assertion qui donne son sens aux deux précédentes : si le gel et le recalcul
    // donnaient le même ordre, le test n°2 serait vert sans que le gel protège quoi que ce
    // soit. On exige donc explicitement que la recotation AIT changé le classement.
    const ordreGele = gel.general_open.map((e) => e.user_id);
    const ordreRecalcule = apresRecotation.map(({ entry }) => entry.participant.user_id);
    expect(ordreGele).not.toEqual(ordreRecalcule);
    // Et nommément : yann perd deux places au recalcul, aucune au palmarès.
    expect(gel.general_open.find((e) => e.user_id === 'yann')?.rank).toBe(4);
    expect(apresRecotation.find(({ entry }) => entry.participant.user_id === 'yann')?.rank).toBe(6);
  });
});
