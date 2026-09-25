import { describe, expect, it } from 'vitest';
import { changelogEntriesToShow, compareVersions } from './changelogDisplay';
import type { ChangelogEntry } from '../data/changelog';

const entry = (version: string): ChangelogEntry => ({ version, date: '2026-09-25', title: `v${version}`, items: [] });
const log = ['2.71', '2.70', '2.69', '2.68', '2.67'].map(entry);
const versions = (list: ChangelogEntry[]) => list.map((e) => e.version);

describe('compareVersions', () => {
  it('compare numériquement, segment par segment', () => {
    expect(compareVersions('2.71', '2.70')).toBeGreaterThan(0);
    expect(compareVersions('2.10', '2.9')).toBeGreaterThan(0);
    expect(compareVersions('2.71.1', '2.71')).toBeGreaterThan(0);
    expect(compareVersions('2.71', '2.71.0')).toBe(0);
  });
});

describe('changelogEntriesToShow (V2.71.2)', () => {
  it('jamais vu : seulement la dernière entrée', () => {
    expect(versions(changelogEntriesToShow(log, null))).toEqual(['2.71']);
  });

  it('à jour : rien', () => {
    expect(changelogEntriesToShow(log, '2.71')).toEqual([]);
  });

  it('en retard : toutes les entrées non vues, la plus récente en tête', () => {
    expect(versions(changelogEntriesToShow(log, '2.69'))).toEqual(['2.71', '2.70']);
  });

  it('très en retard : plafonné à 3', () => {
    expect(versions(changelogEntriesToShow(log, '2.60'))).toEqual(['2.71', '2.70', '2.69']);
  });

  it('une version vue entre deux entrées (bump sans annonce) ne réaffiche pas l\'entrée déjà vue', () => {
    expect(versions(changelogEntriesToShow(log, '2.70.2'))).toEqual(['2.71']);
  });
});
