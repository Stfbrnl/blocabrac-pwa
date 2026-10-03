/**
 * Simulation d'une compétition réelle, demandée par l'utilisateur le 03/10/2026 avant
 * d'organiser la vraie : **3 murs en ouverture, 10 blocs chacun du bleu au blanc,
 * 10 participants**, réussites et nombres d'essais tirés au hasard.
 *
 * ⚠️ CE QUI FAIT LA VALEUR DE CE FICHIER : l'attendu est recalculé par un **oracle
 * indépendant** (`pointsAttendus` ci-dessous), écrit à la main depuis le barème, et NON en
 * rappelant les fonctions de production. Comparer `getParticipantScores` à lui-même ne
 * prouverait rien. Si quelqu'un modifie `basePoints`/`deductions` dans climbingPoints.ts,
 * ce test échoue — c'est voulu : le barème est un contrat, pas un détail d'implémentation.
 *
 * Le tirage est pseudo-aléatoire mais **déterministe** (générateur à graine) : on obtient de
 * vraies configurations variées — ex æquo, scores nuls, participants sans aucune réussite —
 * tout en gardant un échec reproductible. Le test boucle sur 60 graines, donc 60 compétitions
 * différentes à chaque exécution de `npm test`.
 */
import { describe, it, expect } from 'vitest';
import {
  getClassementByCategory,
  getParticipantScores,
  type CompetitionResultInput,
  type BoulderInput,
  type ParticipantBase,
} from './competitionClassement';
import { getFfmeCategory, getSeasonAge } from './ageCategory';

// ── Oracle indépendant ──────────────────────────────────────────────────────────────────
// Barème recopié à la main depuis la grille de la salle (bleu -> blanc), volontairement
// NON importé de climbingPoints.ts.
const BASE: Record<string, number> = { bleu: 100, violet: 200, rouge: 400, noir: 600, blanc: 800 };
const MALUS: Record<string, number> = { bleu: 10, violet: 10, rouge: 20, noir: 20, blanc: 50 };

const pointsAttendus = (couleur: string, essais: number, reussi: boolean): number => {
  if (!reussi) return 0;
  const perte = essais > 1 ? (essais - 1) * MALUS[couleur] : 0;
  return Math.max(0, BASE[couleur] - perte);
};

// ── Générateur déterministe (mulberry32) ────────────────────────────────────────────────
function rng(graine: number): () => number {
  let a = graine;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MURS = ['Grande Face', 'Dévers 30°', 'Dalle'];
const COULEURS = ['bleu', 'violet', 'rouge', 'noir', 'blanc'];
const ANNEE_REF = 2026;

interface Grimpeur extends ParticipantBase {
  user_id: string;
  nom: string;
}

/** 3 murs x 10 blocs = 30 blocs, deux de chaque couleur par mur (bleu -> blanc). */
function construireBlocs(): (BoulderInput & { wall: string })[] {
  const blocs: (BoulderInput & { wall: string })[] = [];
  MURS.forEach((mur, iMur) => {
    COULEURS.forEach((couleur) => {
      for (let n = 0; n < 2; n += 1) {
        const num = blocs.length + 1;
        blocs.push({
          id: `b${iMur}-${couleur}-${n}`,
          // En compétition la cotation réelle vit dans `difficulty` (cachée aux grimpeurs) ;
          // `color` reste absent, comme sur un vrai bloc de type "competition".
          difficulty: couleur,
          wall: mur,
          points_value: num * 10,
        });
      }
    });
  });
  return blocs;
}

/** 10 participants étalés sur plusieurs catégories FFME et les deux genres. */
function construireParticipants(): Grimpeur[] {
  const annees = [2019, 2017, 2015, 2013, 2011, 2008, 2004, 1995, 1982, 1970];
  return annees.map((annee, i) => ({
    user_id: `u${i}`,
    nom: `Grimpeur ${i}`,
    dateOfBirth: `${annee}-06-15`,
    gender: i % 2 === 0 ? 'Homme' : 'Femme',
  }));
}

interface Tirage {
  resultats: CompetitionResultInput[];
  /** Attendu par participant, calculé par l'oracle en même temps que le tirage. */
  attendu: Record<string, { score: number; blocs: number }>;
}

function tirer(graine: number, blocs: (BoulderInput & { wall: string })[], participants: Grimpeur[]): Tirage {
  const alea = rng(graine);
  const resultats: CompetitionResultInput[] = [];
  const attendu: Record<string, { score: number; blocs: number }> = {};

  participants.forEach((p) => {
    attendu[p.user_id] = { score: 0, blocs: 0 };
    blocs.forEach((bloc) => {
      // Tout le monde n'essaie pas tous les blocs : ~70 % de tentatives.
      if (alea() > 0.7) return;
      const reussi = alea() > 0.35;
      // 1 à 8 essais. Sur les couleurs dures, 8 essais peuvent amener le score à 0
      // (blanc : 800 - 7x50 = 450 ; noir : 600 - 7x20 = 460), et c'est un cas voulu.
      const essais = 1 + Math.floor(alea() * 8);
      resultats.push({
        user_id: p.user_id,
        boulder_id: bloc.id,
        success: reussi,
        attempts: essais,
      });
      attendu[p.user_id].score += pointsAttendus(bloc.difficulty, essais, reussi);
      if (reussi) attendu[p.user_id].blocs += 1;
    });
  });

  return { resultats, attendu };
}

describe('Simulation de compétition : 3 murs x 10 blocs (bleu -> blanc), 10 participants', () => {
  const blocs = construireBlocs();
  const participants = construireParticipants();
  const GRAINES = Array.from({ length: 60 }, (_, i) => i + 1);

  it('construit bien 30 blocs, 3 murs de 10, deux de chaque couleur par mur', () => {
    expect(blocs).toHaveLength(30);
    MURS.forEach((mur) => {
      const duMur = blocs.filter((b) => b.wall === mur);
      expect(duMur).toHaveLength(10);
      COULEURS.forEach((c) => {
        expect(duMur.filter((b) => b.difficulty === c)).toHaveLength(2);
      });
    });
    // Identifiants uniques : un doublon ferait silencieusement compter deux fois.
    expect(new Set(blocs.map((b) => b.id)).size).toBe(30);
  });

  it('le score et le nombre de blocs validés de chaque participant sont exacts', () => {
    GRAINES.forEach((graine) => {
      const { resultats, attendu } = tirer(graine, blocs, participants);
      const scores = getParticipantScores(resultats, participants, blocs);

      scores.forEach((entree) => {
        const att = attendu[entree.participant.user_id];
        expect(entree.score, `score, graine ${graine}, ${entree.participant.user_id}`).toBe(att.score);
        expect(entree.boulders, `blocs validés, graine ${graine}, ${entree.participant.user_id}`).toBe(att.blocs);
      });
    });
  });

  it('un échec ne rapporte aucun point et n\'incrémente pas le compte de blocs', () => {
    const resultats: CompetitionResultInput[] = blocs.map((b) => ({
      user_id: 'u0', boulder_id: b.id, success: false, attempts: 3,
    }));
    const [entree] = getParticipantScores(resultats, participants, blocs);
    expect(entree.score).toBe(0);
    expect(entree.boulders).toBe(0);
  });

  it('le barème dégressif est appliqué essai par essai, sur chaque couleur', () => {
    COULEURS.forEach((couleur) => {
      const bloc = blocs.find((b) => b.difficulty === couleur)!;
      for (let essais = 1; essais <= 8; essais += 1) {
        const [e] = getParticipantScores(
          [{ user_id: 'u0', boulder_id: bloc.id, success: true, attempts: essais }],
          participants, blocs
        );
        expect(e.score, `${couleur} en ${essais} essai(s)`).toBe(pointsAttendus(couleur, essais, true));
      }
    });
  });

  it('le classement Open est trié par score décroissant, et contient chaque participant au plus une fois', () => {
    GRAINES.forEach((graine) => {
      const { resultats } = tirer(graine, blocs, participants);
      const open = getClassementByCategory(resultats, participants, blocs, 'global');

      for (let i = 1; i < open.length; i += 1) {
        expect(open[i - 1].score, `ordre Open, graine ${graine}, position ${i}`)
          .toBeGreaterThanOrEqual(open[i].score);
      }
      const uids = open.map((e) => e.participant.user_id);
      expect(new Set(uids).size, `doublon au classement Open, graine ${graine}`).toBe(uids.length);
    });
  });

  it('le classement par catégories d\'âge place chacun dans sa bande FFME, sans perte ni doublon', () => {
    GRAINES.forEach((graine) => {
      const { resultats } = tirer(graine, blocs, participants);
      const open = getClassementByCategory(resultats, participants, blocs, 'global');
      const groupes = getClassementByCategory(resultats, participants, blocs, 'age');

      // Conservation : la somme des groupes redonne exactement le classement Open.
      const dansGroupes = groupes.flatMap((g) => g.participants.map((e) => e.participant.user_id));
      expect(new Set(dansGroupes).size, `doublon entre catégories, graine ${graine}`).toBe(dansGroupes.length);
      expect(dansGroupes.sort()).toEqual(open.map((e) => e.participant.user_id).sort());

      // Appartenance : chaque participant est dans la catégorie de son âge, recalculée ici.
      groupes.forEach((groupe) => {
        groupe.participants.forEach((entree) => {
          const attendue = getFfmeCategory(
            getSeasonAge(entree.participant.dateOfBirth, undefined, new Date(`${ANNEE_REF}-10-03`))
          );
          expect(groupe.category, `catégorie de ${entree.participant.user_id}`).toBe(attendue);
        });
        // Ordre interne préservé : décroissant comme le classement global.
        for (let i = 1; i < groupe.participants.length; i += 1) {
          expect(groupe.participants[i - 1].score).toBeGreaterThanOrEqual(groupe.participants[i].score);
        }
      });
    });
  });

  it('le classement par genre partitionne aussi sans perte ni doublon', () => {
    GRAINES.forEach((graine) => {
      const { resultats } = tirer(graine, blocs, participants);
      const open = getClassementByCategory(resultats, participants, blocs, 'global');
      const groupes = getClassementByCategory(resultats, participants, blocs, 'gender');

      const dedans = groupes.flatMap((g) => g.participants.map((e) => e.participant.user_id));
      expect(new Set(dedans).size).toBe(dedans.length);
      expect(dedans.sort()).toEqual(open.map((e) => e.participant.user_id).sort());
      groupes.forEach((g) => {
        g.participants.forEach((e) => expect(g.category).toBe(e.participant.gender));
      });
    });
  });

  it('un résultat qui référence un bloc ou un participant inconnu est ignoré, jamais compté', () => {
    const bloc = blocs[0];
    const resultats: CompetitionResultInput[] = [
      { user_id: 'u0', boulder_id: bloc.id, success: true, attempts: 1 },
      { user_id: 'u0', boulder_id: 'bloc-supprime', success: true, attempts: 1 },
      { user_id: 'fantome', boulder_id: bloc.id, success: true, attempts: 1 },
    ];
    const scores = getParticipantScores(resultats, participants, blocs);
    expect(scores).toHaveLength(1);
    expect(scores[0].participant.user_id).toBe('u0');
    expect(scores[0].score).toBe(pointsAttendus(bloc.difficulty, 1, true));
  });

  it('mode "blocs_valides" : la valeur du bloc est versée en entier, quel que soit le nombre d\'essais', () => {
    const bloc = blocs[7];
    [1, 4, 8].forEach((essais) => {
      const [e] = getParticipantScores(
        [{ user_id: 'u0', boulder_id: bloc.id, success: true, attempts: essais }],
        participants, blocs, 'blocs_valides'
      );
      expect(e.score, `${essais} essai(s)`).toBe(bloc.points_value);
    });
  });

  // ⚠️ ÉCART CONSTATÉ, documenté plutôt que corrigé en douce (03/10/2026) : dans les modes à
  // POINTS, les écrans de classement affichent la position comme `index + 1`, donc deux
  // grimpeurs à égalité reçoivent deux positions différentes (1 et 2), départagées par
  // l'ordre d'insertion du tri stable — c'est-à-dire par l'ordre dans lequel leurs résultats
  // ont été écrits. Le mode "officiel" utilise lui `rankOfficialEntries` (1, 1, 3). Ce test
  // CONSTATE la situation : à faire trancher par l'utilisateur, un changement d'affichage de
  // position étant une décision de produit, pas un correctif.
  it('⚠️ constat : les ex æquo existent bel et bien dans un tirage réaliste', () => {
    const avecExAequo = GRAINES.filter((graine) => {
      const { resultats } = tirer(graine, blocs, participants);
      const open = getClassementByCategory(resultats, participants, blocs, 'global');
      return open.some((e, i) => i > 0 && e.score === open[i - 1].score);
    });
    // On n'impose pas un nombre : on vérifie que le cas n'est pas théorique. S'il devenait
    // impossible, la remarque ci-dessus n'aurait plus d'objet et ce test le signalerait.
    expect(avecExAequo.length, 'aucun ex æquo sur 60 tirages : revoir la remarque ci-dessus')
      .toBeGreaterThan(0);
  });
});
