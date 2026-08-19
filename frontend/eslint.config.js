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
      // ✅ Processus "erreurs avalées" (PROCESSUS-erreurs-avalees.md §1/§6, V2.46 → V2.49) :
      // détecte un `catch (err)` dont `err` n'est jamais lu — presque toujours le signe d'une
      // erreur rattrapée puis ignorée. Passé de "warn" (mode rapport) à "error" une fois
      // l'inventaire existant confirmé vide (0 résultat, voir §1) — désormais bloquant : tout
      // futur `catch` qui n'utilise pas son erreur fait échouer le build plutôt que d'être
      // simplement signalé et oublié.
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'all' }],
      // ✅ Même processus : un `catch {}` vide est une erreur avalée sans même un log.
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
])
