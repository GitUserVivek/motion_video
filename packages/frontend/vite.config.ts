import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendUrl = process.env['VITE_BACKEND_URL'] ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: 'all',
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
