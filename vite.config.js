import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  // podścieżka wdrożenia za reverse proxy (np. "/planner/") — puste/domyślne
  // "/" dla lokalnego dev servera i bezpośredniego dostępu
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
