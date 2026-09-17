import { describe, it, expect } from 'vitest';
import { buildOuvreurOptions } from './staffAccounts';

describe('buildOuvreurOptions', () => {
  it('retourne une liste vide sans documents', () => {
    expect(buildOuvreurOptions([])).toEqual([]);
  });

  it('fusionne un doublon (présent dans les deux requêtes role/roles[])', () => {
    const options = buildOuvreurOptions([
      { id: 'u1', first_name: 'Sarah', last_name: 'Ouvreuse' },
      { id: 'u1', first_name: 'Sarah', last_name: 'Ouvreuse' },
    ]);
    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({ uid: 'u1', displayName: 'Sarah Ouvreuse' });
  });

  it('replie sur l\'email puis sur l\'uid quand le nom est absent', () => {
    const options = buildOuvreurOptions([
      { id: 'u2', email: 'u2@example.com' },
      { id: 'u3' },
    ]);
    expect(options.find((o) => o.uid === 'u2')?.displayName).toBe('u2@example.com');
    expect(options.find((o) => o.uid === 'u3')?.displayName).toBe('u3');
  });

  it('trie par nom affiché', () => {
    const options = buildOuvreurOptions([
      { id: 'u1', first_name: 'Zoé', last_name: 'Z' },
      { id: 'u2', first_name: 'Alex', last_name: 'A' },
    ]);
    expect(options.map((o) => o.uid)).toEqual(['u2', 'u1']);
  });
});
