/**
 * Composition du message de classement **publié aux grimpeurs** (bandeau d'annonces).
 *
 * ─── POURQUOI CE MODULE EXISTE ───────────────────────────────────────────────────────────
 *
 * Ce texte était composé en ligne dans `AdminCompetitionStats.tsx`. La couverture de tests du
 * dépôt s'arrête au bord des `.tsx` (pas de harnais React), donc il était **structurellement
 * invisible** — et c'est exactement là qu'un défaut est né : la branche du mode officiel
 * numérotait `1, 2, 3` alors que les tableaux à l'écran partageaient déjà les rangs
 * `1, 1, 3`. L'annonce démentait l'écran, et dans le seul mode où une égalité parfaite au
 * rang 1 est un cas prévu (elle déclenche la super-finale). Trouvé en lisant, pas en testant.
 *
 * Retour de ClaudeNav (`docs/handoffs/RETOUR-auto-inscription-reponses.md` §3), sous une forme
 * plus générale que la règle sur ce seul message, parce que c'était le **deuxième** artefact
 * publié hors de l'application à avoir dérivé de ce que montre l'écran — après l'image de
 * partage de progression :
 *
 *   ⚠️ **Tout artefact destiné à sortir de l'application se compose dans une fonction pure,
 *      jamais en ligne dans un composant.**
 *
 * ⚠️ Pas de markdown (`**gras**`) : `AnnouncementBanner.tsx` affiche du texte brut.
 */
import type { ParticipantBase, ScoreEntry, OfficialScoreEntry, CategoryGroup } from './competitionClassement';
import { rankedEntries, rankedOfficialEntries } from './competitionClassement';

export interface AnnouncementNamed extends ParticipantBase {
  first_name?: string | null;
  last_name?: string | null;
}

/** Les classements déjà calculés, tels que l'écran les a sous la main. */
export interface PointsAnnouncementInput<P extends AnnouncementNamed> {
  competitionName: string;
  openLabel: string;
  global: ScoreEntry<P>[];
  byAge: CategoryGroup<ScoreEntry<P>>[];
  byGender: CategoryGroup<ScoreEntry<P>>[];
}

export interface OfficialAnnouncementInput<P extends AnnouncementNamed> {
  competitionName: string;
  openLabel: string;
  global: OfficialScoreEntry<P>[];
  byAge: CategoryGroup<OfficialScoreEntry<P>>[];
  byGender: CategoryGroup<OfficialScoreEntry<P>>[];
}

/**
 * ⚠️ `|| ''` puis `trim()` : l'ancienne composition en ligne faisait
 * `${first_name} ${last_name}`, qui publiait littéralement « undefined undefined » sur un
 * participant sans nom — et un participant sans nom a réellement existé en production, c'est
 * tout le sujet de l'auto-inscription (voir RETOUR-auto-inscription.md).
 */
const nom = (p: AnnouncementNamed): string => `${p.first_name || ''} ${p.last_name || ''}`.trim();

/**
 * Assemble une ligne de classement sans jamais produire de double espace.
 *
 * Un nom vide ne devrait plus arriver (le rattrapage, la fonction partagée d'écriture et le
 * contrôle d'audit s'y emploient), mais cette fonction est le dernier maillon avant un texte
 * **publié** : elle dégrade proprement plutôt que de laisser une cicatrice visible dans une
 * annonce lue par toute la salle.
 */
const ligneClassement = (rank: number, nomAffiche: string, detail: string): string =>
  `${rank}. ${[nomAffiche, '-', detail].filter(Boolean).join(' ')}`.replace(/\s{2,}/g, ' ');

export const announcementTitle = (competitionName: string): string => `Classement - ${competitionName}`;

const entete = (openLabel: string, competitionName: string): string =>
  `🏆 Classement ${openLabel} - ${competitionName} 🏆\n\n`;

/**
 * Modes à points (`blocabrac`, `blocs_valides`, `personnalise`).
 *
 * ⚠️ Les rangs viennent de `rankedEntries`, donc du MÊME calcul que les tableaux à l'écran,
 * départage des ex æquo compris. Une annonce qui numéroterait autrement que l'écran serait la
 * pire incohérence possible sur ce sujet précis.
 */
export function buildPointsAnnouncement<P extends AnnouncementNamed>(
  input: PointsAnnouncementInput<P>
): string {
  let message = entete(input.openLabel, input.competitionName);

  rankedEntries(input.global).forEach(({ entry, rank }) => {
    message += `${ligneClassement(rank, nom(entry.participant), `${entry.score} pts (${entry.boulders} blocs validés)`)}\n`;
  });

  message += `\n📊 Classement par âge :\n`;
  input.byAge.forEach((groupe) => {
    message += `\n${groupe.category} :\n`;
    rankedEntries(groupe.participants).forEach(({ entry, rank }) => {
      message += `${ligneClassement(rank, nom(entry.participant), `${entry.score} pts`)}\n`;
    });
  });

  message += `\n📊 Classement par genre :\n`;
  input.byGender.forEach((groupe) => {
    message += `\n${groupe.category} :\n`;
    rankedEntries(groupe.participants).forEach(({ entry, rank }) => {
      message += `${ligneClassement(rank, nom(entry.participant), `${entry.score} pts`)}\n`;
    });
  });

  return message;
}

/**
 * Mode `officiel` (FFME) : pas de points, une ligne tops/zones/essais.
 *
 * ⚠️ Les rangs viennent de `rankedOfficialEntries`, donc du même calcul que les trois
 * tableaux à l'écran. C'est précisément cette branche qui numérotait `1, 2, 3` jusqu'au
 * 03/10/2026 — voir l'en-tête du module.
 */
export function buildOfficialAnnouncement<P extends AnnouncementNamed>(
  input: OfficialAnnouncementInput<P>
): string {
  const detail = (entry: OfficialScoreEntry<P>): string =>
    `${entry.totals.tops} tops, ${entry.totals.zones} zones `
    + `(${entry.totals.attemptsToTop} essais top, ${entry.totals.attemptsToZone} essais zone)`;

  let message = entete(input.openLabel, input.competitionName);

  rankedOfficialEntries(input.global).forEach(({ entry, rank }) => {
    message += `${ligneClassement(rank, nom(entry.participant), detail(entry))}\n`;
  });

  message += `\n📊 Classement par âge :\n`;
  input.byAge.forEach((groupe) => {
    message += `\n${groupe.category} :\n`;
    rankedOfficialEntries(groupe.participants).forEach(({ entry, rank }) => {
      message += `${ligneClassement(rank, nom(entry.participant), detail(entry))}\n`;
    });
  });

  message += `\n📊 Classement par genre :\n`;
  input.byGender.forEach((groupe) => {
    message += `\n${groupe.category} :\n`;
    rankedOfficialEntries(groupe.participants).forEach(({ entry, rank }) => {
      message += `${ligneClassement(rank, nom(entry.participant), detail(entry))}\n`;
    });
  });

  return message;
}
