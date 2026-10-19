import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // `test/contrats/` : des tests qui LISENT les sources au lieu de les exécuter (contrats
    // d'écriture Firestore). Ils n'ont besoin ni d'émulateur ni de navigateur, donc leur place
    // est dans `npm test` — tout leur intérêt est d'échouer pendant qu'on écrit le code. Ils
    // sont hors de `src/` parce que `tsc -b` compile `src` sans les types Node, et qu'un test
    // qui lit des fichiers en a besoin.
    include: ['src/**/*.test.ts', 'test/contrats/**/*.test.ts'],
  },
});
