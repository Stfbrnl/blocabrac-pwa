import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // ✅ Obligatoire pour Codespaces
    port: 5173, // ✅ Port par défaut
    strictPort: true, // ✅ Évite les changements de port
  },
});