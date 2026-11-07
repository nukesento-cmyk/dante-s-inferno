import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
const proxy = { '/api': API_TARGET, '/uploads': API_TARGET };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: '../../public',
  server: {
    port: 5173,
    proxy,
  },
  preview: { port: 5173, proxy },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vendor';
          if (/node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?(react|react-dom|scheduler|react-router|@tanstack|zustand|zod|@dantes)\//.test(id) || id.includes('/packages/shared/')) return 'vendor';
          // Only needed when an optional /models/pizza.glb exists: keep out of the main 3D chunk.
          if (/three-stdlib\/(loaders\/(GLTF|DRACO)Loader|libs\/MeshoptDecoder)|@react-three\/drei\/core\/Gltf/.test(id)) return 'glb';
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
