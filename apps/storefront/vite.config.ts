import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

// NOTE: @vitejs/plugin-react@6 needs vite>=7 (imports vite/internal); the installed vite is 6, so JSX goes through esbuild (react-jsx).
export default defineConfig({
  plugins: [tailwindcss()],
  publicDir: '../../public',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
  preview: { port: 5173, proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vendor';
          if (/node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?(react|react-dom|scheduler|react-router|@tanstack|zustand|zod|@dantes)\//.test(id) || id.includes('/packages/shared/')) return 'vendor';
          if (id.includes('node_modules/three/') || id.includes('@react-three') || id.includes('three-stdlib') || id.includes('troika')) return 'three';
          if (id.includes('node_modules/gsap') || id.includes('node_modules/lenis')) return 'motion';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
