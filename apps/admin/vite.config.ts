import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/admin/',
  // @vitejs/plugin-react@6 needs vite>=7 (imports 'vite/internal'); with vite 6 we use esbuild's automatic JSX runtime from tsconfig.
  esbuild: { jsx: 'automatic' },
  plugins: [tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
