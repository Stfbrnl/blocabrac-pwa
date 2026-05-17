// /workspaces/blocabrac-pwa/frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    host: true, // ✅ Écoute sur toutes les interfaces (0.0.0.0)
    port: 5173,
    strictPort: true, // ✅ Force le port 5173
  },
  plugins: [react()],
});