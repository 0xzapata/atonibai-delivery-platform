import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
  preview: {
    port: 4173,
  },
});
