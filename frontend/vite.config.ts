import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Le manifest PWA est généré côté Node avant que l'app ne tourne dans le
// navigateur : on lit donc les mêmes variables VITE_* via loadEnv plutôt que
// import.meta.env (qui n'existe qu'à l'intérieur du bundle applicatif).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
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
