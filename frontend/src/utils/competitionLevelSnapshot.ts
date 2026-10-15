/**
 * Figeage du niveau des participants au coup d'envoi d'une compétition.
 *
 * ─── POURQUOI CE CHAMP EXISTE ───────────────────────────────────────────────────────────
 *
 * Le classement par niveau max (§1 de docs/plans/PLAN-classements-competition-5-novembre.md)
 * range chaque grimpeur dans le paquet `max(niveau au début de l'épreuve, plus haute couleur
 * réussie pendant l'épreuve)`. Encore faut-il savoir ce que valait son niveau au début.
 *
 * Or rien ne le disait. `competition_participants.level` est copié au moment de
 * l'INSCRIPTION, et l'inscription est ouverte dès qu'une compétition est « à venir » — donc
 * possiblement trois semaines avant. Et `users.level` n'est historisé nulle part : il bouge
 * avec les badges (V2.54), si bien qu'on ne peut pas reconstituer après coup ce qu'il valait
 * le jour de l'épreuve. Un palmarès gelé ne doit dépendre que de faits datés (§2.2) : il faut
 * donc poser le fait au bon moment, et c'est ce que fait ce module.
 *
 * ─── CE QU'IL ÉCRIT, ET CE QU'IL N'ÉCRIT PAS ───────────────────────────────────────────
 *
 * ⚠️ UN CHAMP ABSENT UNIQUEMENT. Une participation qui porte déjà `level_at_start` n'est
 * jamais réécrite : le niveau au début est un fait, il se pose une fois. C'est ce qui rend
 * l'opération idempotente et rejouable — un aller-retour « en cours » → « à venir » → « en
 * cours » ne redate rien.
 *
 * ⚠️ Et c'est le SEUL champ que ce chemin écrit. `competition_participants` est composé par
 * `buildCompetitionParticipant` et nulle part ailleurs : ce module n'est pas un quatrième
 * écrivain concurrent de ce contrat, pour la même raison que le verrouillage
 * (`submitted`/`submitted_at`) n'y passe pas non plus — ce n'est pas une création, et il ne
 * touche à aucun champ d'identité. Le projet a déjà payé trois fois « un document, plusieurs
 * écrivains, des contrats divergents » ; la ligne qui l'évite est celle-ci, pas une exception
 * de plus.
 *
 * Un inscrit TARDIF (inscrit alors que l'épreuve avait commencé) n'a pas de `level_at_start`,
 * et c'est correct : son niveau d'inscription EST son niveau de départ. C'est
 * `resolveClassementLevel` qui s'en replie, pas ce module qui invente une valeur.
 */

export interface ParticipationForSnapshot {
  /** Identifiant du document `competition_participants` (`${uid}_${competitionId}`). */
  id: string;
  user_id: string;
  /** Niveau figé à l'inscription. */
  level?: string | null;
  /** Déjà figé au coup d'envoi ? Alors on n'y touche pas. */
  level_at_start?: string | null;
}

export interface SnapshotSourceUser {
  level?: string | null;
}

export interface LevelAtStartWrite {
  participationId: string;
  level_at_start: string;
}

const estRenseigne = (v?: string | null): v is string =>
  typeof v === 'string' && v.trim() !== '';

/**
 * Les écritures à appliquer au passage en « en cours ».
 *
 * Pure, sans import Firestore : l'appelant lit, applique, et c'est ici que se décide QUI est
 * concerné et avec QUELLE valeur — la partie qui se teste sans émulateur.
 *
 * Valeur retenue : `users.level` courant, c'est-à-dire le niveau à cet instant précis ; repli
 * sur le niveau d'inscription si le compte n'est pas lisible (compte supprimé, lecture
 * partielle). Aucune écriture quand ni l'un ni l'autre n'est renseigné : mieux vaut un champ
 * absent, dont `resolveClassementLevel` sait quoi faire, qu'une chaîne vide qui prétend
 * porter une valeur.
 */
export const buildLevelAtStartSnapshot = (
  participations: ParticipationForSnapshot[],
  usersById: Map<string, SnapshotSourceUser>
): LevelAtStartWrite[] => {
  const writes: LevelAtStartWrite[] = [];
  participations.forEach((p) => {
    if (estRenseigne(p.level_at_start)) return;
    const niveauCourant = usersById.get(p.user_id)?.level;
    const valeur = estRenseigne(niveauCourant) ? niveauCourant : p.level;
    if (!estRenseigne(valeur)) return;
    writes.push({ participationId: p.id, level_at_start: valeur });
  });
  return writes;
};
