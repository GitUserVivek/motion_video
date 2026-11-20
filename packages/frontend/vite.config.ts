import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendUrl = process.env['VITE_BACKEND_URL'] ?? 'http://localhost:3001';

// Consume the shared package from source, not dist/. A stale or partially built
// dist/index.mjs would otherwise be served as-is and fail with errors like
// "does not provide an export named 'ASPECT_RATIOS'".
const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      // Static mount of the backend's output directory (videos, thumbnails, …)
      '/output': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      '@edumotion/shared': sharedSrc,
    },
  },
});
