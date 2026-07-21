import { describe, expect, it } from 'vitest';
import { getSessionStatus, canActivate } from './courseSessionStatus';

describe('getSessionStatus', () => {
  it('est "scheduled" avant la date, sans activation', () => {
    const now = new Date(2026, 6, 10, 12, 0); // 10 juillet 2026, midi
    expect(getSessionStatus({ date: '2026-07-15' }, now)).toBe('scheduled');
  });

  it('devient "active" une fois activatedAt posé, le jour J', () => {
    const now = new Date(2026, 6, 15, 18, 30);
    expect(getSessionStatus({ date: '2026-07-15', activatedAt: '2026-07-15T18:00:00.000Z' }, now)).toBe('active');
  });

  it('reste "scheduled" tant que activatedAt n\'est pas posé, même le jour J', () => {
    const now = new Date(2026, 6, 15, 23, 59);
    expect(getSessionStatus({ date: '2026-07-15' }, now)).toBe('scheduled');
  });

  it('bascule automatiquement en "archived" à partir de minuit le lendemain', () => {
    const justBeforeMidnight = new Date(2026, 6, 15, 23, 59, 59);
    const justAfterMidnight = new Date(2026, 6, 16, 0, 0, 0);
    expect(getSessionStatus({ date: '2026-07-15', activatedAt: '2026-07-15T18:00:00.000Z' }, justBeforeMidnight)).toBe('active');
    expect(getSessionStatus({ date: '2026-07-15', activatedAt: '2026-07-15T18:00:00.000Z' }, justAfterMidnight)).toBe('archived');
  });

  it('l\'archivage manuel (archivedAt) prime sur tout, même avant la date', () => {
    const beforeSessionDate = new Date(2026, 6, 10);
    expect(getSessionStatus({ date: '2026-07-15', archivedAt: '2026-07-12T10:00:00.000Z' }, beforeSessionDate)).toBe('archived');
  });

  it('une séance jamais activée finit quand même par être "archived" après le délai', () => {
    const wellAfter = new Date(2026, 6, 20);
    expect(getSessionStatus({ date: '2026-07-15' }, wellAfter)).toBe('archived');
  });
});

describe('canActivate', () => {
  it('refuse l\'activation avant le jour de la séance', () => {
    const beforeDay = new Date(2026, 6, 14, 23, 59);
    expect(canActivate({ date: '2026-07-15' }, beforeDay)).toBe(false);
  });

  it('autorise l\'activation à partir du jour de la séance', () => {
    const onDay = new Date(2026, 6, 15, 0, 0);
    expect(canActivate({ date: '2026-07-15' }, onDay)).toBe(true);
  });

  it('refuse si déjà active', () => {
    const onDay = new Date(2026, 6, 15, 10, 0);
    expect(canActivate({ date: '2026-07-15', activatedAt: '2026-07-15T09:00:00.000Z' }, onDay)).toBe(false);
  });

  it('refuse si déjà archivée', () => {
    const onDay = new Date(2026, 6, 15, 10, 0);
    expect(canActivate({ date: '2026-07-15', archivedAt: '2026-07-15T09:00:00.000Z' }, onDay)).toBe(false);
  });
});
