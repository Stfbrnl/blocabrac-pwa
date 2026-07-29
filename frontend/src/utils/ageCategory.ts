import { ageBands, openCategoryLabel, unknownCategoryLabel, type AgeBand } from '../config/gymConfig';

// Réexports conservés tels quels (nom historique "FFME") pour ne pas casser les
// nombreux imports existants — la donnée elle-même vit maintenant dans gymConfig.ts.
export type FfmeAgeBand = AgeBand;
export const OPEN_CATEGORY = openCategoryLabel;
export const UNKNOWN_CATEGORY = unknownCategoryLabel;
export const FFME_AGE_BANDS: FfmeAgeBand[] = ageBands;

// Âge atteint au 31 décembre de l'année de `referenceDate`, calculé depuis une date de
// naissance (format ISO "YYYY-MM-DD"). Repli sur `legacyAge` (nombre saisi manuellement,
// non lié à une date) si aucune date de naissance n'est renseignée — comportement non
// régressif pour les comptes existants tant qu'ils n'ont pas de date de naissance.
export const getSeasonAge = (
  dateOfBirth?: string,
  legacyAge?: number,
  referenceDate: Date = new Date()
): number | undefined => {
  if (dateOfBirth) {
    // Extraction directe de l'année plutôt que new Date(dateOfBirth).getFullYear(),
    // pour éviter un décalage d'un jour près du 1er janvier selon le fuseau horaire.
    const birthYear = parseInt(dateOfBirth.slice(0, 4), 10);
    if (!Number.isNaN(birthYear)) {
      return referenceDate.getFullYear() - birthYear;
    }
  }
  return legacyAge;
};

export const getFfmeCategory = (seasonAge?: number): string => {
  if (seasonAge === undefined || seasonAge === null || Number.isNaN(seasonAge)) {
    return UNKNOWN_CATEGORY;
  }
  const band = FFME_AGE_BANDS.find(
    (b) => seasonAge >= b.minAge && (b.maxAge === undefined || seasonAge <= b.maxAge)
  );
  return band?.label ?? UNKNOWN_CATEGORY;
};
