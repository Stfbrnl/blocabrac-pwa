import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // ✅ Processus "erreurs avalées" (PROCESSUS-erreurs-avalees.md §1, V2.46) : détecte un
      // `catch (err)` dont `err` n'est jamais lu — presque toujours le signe d'une erreur
      // rattrapée puis ignorée. Mode RAPPORT (warn, pas error) tant que l'inventoire existant
      // n'a pas été trié/traité (§1 du document) — passer en "error" ferait échouer le build
      // avant ce tri, et la règle serait désactivée plutôt que respectée.
      '@typescript-eslint/no-unused-vars': ['warn', { caughtErrors: 'all' }],
      // ✅ Même processus : un `catch {}` vide est une erreur avalée sans même un log.
      'no-empty': ['warn', { allowEmptyCatch: false }],
    },
  },
])
