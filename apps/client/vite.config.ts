import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@catanx/engine': path.resolve(__dirname, '../../packages/engine/src/index.ts'),
      '@catanx/protocol': path.resolve(__dirname, '../../packages/protocol/src/index.ts'),
    },
  },
  build: {
    // Pixi + moteur restent lourds ; le budget gzip est vérifié par scripts/check-bundle-budget.mjs
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (
            normalized.includes('node_modules/three') ||
            normalized.includes('node_modules/@react-three')
          ) {
            return 'three';
          }
          if (normalized.includes('node_modules/pixi.js') || normalized.includes('node_modules/@pixi')) {
            return 'pixi';
          }
          if (normalized.includes('node_modules/framer-motion')) {
            return 'motion';
          }
          if (
            normalized.includes('node_modules/socket.io-client') ||
            normalized.includes('node_modules/engine.io-client')
          ) {
            return 'socket';
          }
          if (normalized.includes('/packages/engine/src/')) {
            return 'engine';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
  },
});
