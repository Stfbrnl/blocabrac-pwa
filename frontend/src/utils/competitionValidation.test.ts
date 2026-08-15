import { describe, expect, it } from 'vitest';
import { applyCompetitionValidationUpdate, type CompetitionValidationState } from './competitionValidation';

const base: CompetitionValidationState = { success: false, attempts: 1, zone: false, attemptsToZone: 1 };

describe('applyCompetitionValidationUpdate', () => {
  it('cocher "Réussi" coche automatiquement la zone', () => {
    const result = applyCompetitionValidationUpdate(base, { success: true });
    expect(result.success).toBe(true);
    expect(result.zone).toBe(true);
  });

  it('décocher la zone décoche un top déjà enregistré (un top sans zone est impossible)', () => {
    const withTop: CompetitionValidationState = { success: true, attempts: 3, zone: true, attemptsToZone: 3 };
    const result = applyCompetitionValidationUpdate(withTop, { zone: false });
    expect(result.zone).toBe(false);
    expect(result.success).toBe(false);
  });

  it('marquer "Échoué" ne décoche pas une zone déjà atteinte indépendamment', () => {
    const zoneOnly: CompetitionValidationState = { success: false, attempts: 4, zone: true, attemptsToZone: 2 };
    const result = applyCompetitionValidationUpdate(zoneOnly, { success: false });
    expect(result.zone).toBe(true);
  });

  it('pré-remplit les essais-zone avec les essais-top quand la zone passe non atteinte -> atteinte', () => {
    const attemptsSetFirst: CompetitionValidationState = { ...base, attempts: 5 };
    const result = applyCompetitionValidationUpdate(attemptsSetFirst, { success: true });
    expect(result.attemptsToZone).toBe(5);
  });

  it('ne pré-remplit pas si l\'appelant fixe explicitement attemptsToZone dans le même appel', () => {
    const attemptsSetFirst: CompetitionValidationState = { ...base, attempts: 5 };
    const result = applyCompetitionValidationUpdate(attemptsSetFirst, { zone: true, attemptsToZone: 2 });
    expect(result.attemptsToZone).toBe(2);
  });

  it('essais-zone ne dépasse jamais essais-top, même corrigé à la baisse après coup', () => {
    const zoneAtFive: CompetitionValidationState = { success: true, attempts: 5, zone: true, attemptsToZone: 5 };
    const result = applyCompetitionValidationUpdate(zoneAtFive, { attempts: 2 });
    expect(result.attemptsToZone).toBe(2);
  });

  it('essais-zone saisi au-delà des essais-top est ramené aux essais-top', () => {
    const result = applyCompetitionValidationUpdate({ ...base, attempts: 3, zone: true }, { attemptsToZone: 10 });
    expect(result.attemptsToZone).toBe(3);
  });

  it('un reclic sur "Réussi" déjà actif ne modifie pas les essais-zone déjà corrigés à la baisse', () => {
    const zoneCorrigee: CompetitionValidationState = { success: true, attempts: 5, zone: true, attemptsToZone: 2 };
    const result = applyCompetitionValidationUpdate(zoneCorrigee, { success: true });
    expect(result.attemptsToZone).toBe(2);
  });
});
