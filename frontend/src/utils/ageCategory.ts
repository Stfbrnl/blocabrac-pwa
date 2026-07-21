export interface FfmeAgeBand {
  key: string;
  label: string;
  minAge: number;
  maxAge?: number; // undefined = pas de borne supérieure
}

// Libellé utilisé pour le regroupement "toutes catégories confondues".
export const OPEN_CATEGORY = 'Open';

export const UNKNOWN_CATEGORY = 'Inconnu';

// Tranches d'âge officielles FFME, par âge atteint au 31 décembre de la saison
// (peu importe le mois de naissance dans l'année).
export const FFME_AGE_BANDS: FfmeAgeBand[] = [
  { key: 'U8', label: 'U8 (6-7 ans)', minAge: 6, maxAge: 7 },
  { key: 'U10', label: 'U10 (8-9 ans)', minAge: 8, maxAge: 9 },
  { key: 'U12', label: 'U12 (10-11 ans)', minAge: 10, maxAge: 11 },
  { key: 'U14', label: 'U14 (12-13 ans)', minAge: 12, maxAge: 13 },
  { key: 'U16', label: 'U16 (14-15 ans)', minAge: 14, maxAge: 15 },
  { key: 'U18', label: 'U18 (16-17 ans)', minAge: 16, maxAge: 17 },
  { key: 'U20', label: 'U20 (18-19 ans)', minAge: 18, maxAge: 19 },
  { key: 'seniors', label: 'Séniors (20-39 ans)', minAge: 20, maxAge: 39 },
  { key: 'veterans1', label: 'Vétérans 1 (40-49 ans)', minAge: 40, maxAge: 49 },
  { key: 'veterans2', label: 'Vétérans 2 (50 ans et +)', minAge: 50 },
];

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
