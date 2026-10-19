import { defineConfig } from 'vitest/config';

// Config séparée pour les tests de règles Firestore (npm run test:rules) :
// nécessitent l'émulateur Firestore + Java, donc volontairement exclus de
// `npm test` (vitest.config.ts) qui doit rester rapide et sans dépendance.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // `test/contrats/` n'a pas besoin de l'émulateur et tourne déjà dans `npm test` : l'y
    // rejouer ne couvrirait rien de plus, et attacherait un test rapide à une suite lente.
    exclude: ['test/contrats/**'],
    testTimeout: 20000,
  },
});
