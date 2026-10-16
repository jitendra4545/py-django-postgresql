import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [path.resolve(import.meta.dirname, '..')] },
    proxy: {
      '/api': 'http://localhost:3000',
      '/openapi.json': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
