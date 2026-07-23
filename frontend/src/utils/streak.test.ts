import { describe, expect, it } from 'vitest';
import { computeStreakDays, getStartOfWeek } from './streak';

describe('computeStreakDays', () => {
  it('renvoie 0 sans aucune validation', () => {
    expect(computeStreakDays([], new Date('2026-07-23T12:00:00'))).toBe(0);
  });

  it('compte 1 pour une validation aujourd\'hui uniquement', () => {
    const now = new Date('2026-07-23T18:00:00');
    expect(computeStreakDays([new Date('2026-07-23T09:00:00')], now)).toBe(1);
  });

  it('compte les jours de validation, même non consécutifs, y compris aujourd\'hui', () => {
    const now = new Date('2026-07-23T18:00:00');
    const dates = [
      new Date('2026-07-21T09:00:00'),
      new Date('2026-07-22T09:00:00'),
      new Date('2026-07-23T09:00:00'),
    ];
    expect(computeStreakDays(dates, now)).toBe(3);
  });

  it('ne casse pas la série si aujourd\'hui n\'a pas encore de validation, tant que le dernier écart reste sous le seuil', () => {
    const now = new Date('2026-07-23T08:00:00');
    const dates = [
      new Date('2026-07-21T09:00:00'),
      new Date('2026-07-22T09:00:00'),
    ];
    expect(computeStreakDays(dates, now)).toBe(2);
  });

  it('ne casse pas la série pour un grimpeur qui vient 2-3 fois par semaine (écarts de quelques jours)', () => {
    const now = new Date('2026-07-23T18:00:00');
    const dates = [
      new Date('2026-07-13T09:00:00'), // lundi
      new Date('2026-07-15T09:00:00'), // mercredi
      new Date('2026-07-17T09:00:00'), // vendredi
      new Date('2026-07-20T09:00:00'), // lundi
      new Date('2026-07-23T09:00:00'), // jeudi (aujourd\'hui)
    ];
    expect(computeStreakDays(dates, now)).toBe(5);
  });

  it('ne casse pas la série pour un écart de 8 jours', () => {
    const now = new Date('2026-07-23T18:00:00');
    const dates = [
      new Date('2026-07-15T09:00:00'),
      new Date('2026-07-23T09:00:00'),
    ];
    expect(computeStreakDays(dates, now)).toBe(2);
  });

  it('casse la série si 9 jours ou plus se sont écoulés sans validation', () => {
    const now = new Date('2026-07-23T18:00:00');
    const dates = [
      new Date('2026-07-14T09:00:00'),
      new Date('2026-07-23T09:00:00'),
    ];
    expect(computeStreakDays(dates, now)).toBe(1);
  });

  it('ignore les doublons dans la même journée', () => {
    const now = new Date('2026-07-23T18:00:00');
    const dates = [
      new Date('2026-07-23T09:00:00'),
      new Date('2026-07-23T14:00:00'),
      new Date('2026-07-23T20:00:00'),
    ];
    expect(computeStreakDays(dates, now)).toBe(1);
  });
});

describe('getStartOfWeek', () => {
  it('renvoie le lundi 00:00 pour un jeudi', () => {
    const thursday = new Date('2026-07-23T15:30:00'); // jeudi
    const start = getStartOfWeek(thursday);
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(20);
    expect(start.getHours()).toBe(0);
  });

  it('renvoie le lundi précédent pour un dimanche', () => {
    const sunday = new Date('2026-07-26T15:30:00');
    const start = getStartOfWeek(sunday);
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(20);
  });

  it('renvoie le jour même pour un lundi', () => {
    const monday = new Date('2026-07-20T15:30:00');
    const start = getStartOfWeek(monday);
    expect(start.getDate()).toBe(20);
    expect(start.getHours()).toBe(0);
  });
});
