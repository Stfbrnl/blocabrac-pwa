import { defineConfig } from 'vitest/config';

// Config séparée pour les tests de règles Firestore (npm run test:rules) :
// nécessitent l'émulateur Firestore + Java, donc volontairement exclus de
// `npm test` (vitest.config.ts) qui doit rester rapide et sans dépendance.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 20000,
  },
});
