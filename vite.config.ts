import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app proxies /api to the Express server (same-origin => httpOnly cookies just work).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: process.env.API_URL || 'http://localhost:4000', changeOrigin: false } } },
});
