// /workspaces/blocabrac-pwa/frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/blocabrac-pwa/', // ✅ Chemin exact de votre dépôt GitHub (ex: https://Stfbrnl.github.io/blocabrac-pwa/)
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  plugins: [react()],
});