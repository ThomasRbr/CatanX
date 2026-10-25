import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@catanx/engine': path.resolve(__dirname, 'packages/engine/src/index.ts'),
      '@catanx/protocol': path.resolve(__dirname, 'packages/protocol/src/index.ts'),
    },
  },
});
