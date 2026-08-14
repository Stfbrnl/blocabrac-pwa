import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// ✅ Numéro de version affiché dans "Mon espace personnel" (ClientScreen.tsx),
// pour que l'utilisateur puisse voir en un coup d'œil si la PWA a bien chargé
// le dernier déploiement plutôt qu'une version mise en cache par le service
// worker. Source unique de vérité : le champ "version" de package.json, à
// faire suivre le numéro donné en commit (convention "Application Sociale
// Blocabrac V2.XX" déjà utilisée dans l'historique git).
const pkgVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
).version as string;

// Le manifest PWA est généré côté Node avant que l'app ne tourne dans le
// navigateur : on lit donc les mêmes variables VITE_* via loadEnv plutôt que
// import.meta.env (qui n'existe qu'à l'intérieur du bundle applicatif).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkgVersion),
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: env.VITE_APP_TITLE,
          short_name: env.VITE_GYM_NAME,
          description: env.VITE_APP_DESCRIPTION,
          theme_color: env.VITE_THEME_COLOR,
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          lang: 'fr',
          icons: [
            {
              src: '/icons/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icons/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/icons/maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // ✅ L'app shell (HTML/JS/CSS) reste utilisable même avec un wifi capricieux ;
          // les données Firestore, elles, dépendent toujours du réseau.
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        },
      }),
    ],
  };
});
