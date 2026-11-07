import { defineConfig, devices } from '@playwright/test';
import { ADMIN_PORT, ADMIN_URL, API_PORT, API_URL, E2E_DATABASE_URL, OWNER_EMAIL, OWNER_PASSWORD, STOREFRONT_PORT, STOREFRONT_URL } from './support/env';

const root = '..';
const apiEnv = {
  API_PORT: String(API_PORT),
  DATABASE_URL: E2E_DATABASE_URL,
  PAYMENTS_MODE: 'mock',
  STOREFRONT_URL,
  ADMIN_URL,
  PUBLIC_API_URL: API_URL,
  LOGIN_RATE_LIMIT: '100000',
  CHECKOUT_RATE_LIMIT: '100000',
  LOOKUP_RATE_LIMIT: '100000',
  SEED_OWNER_EMAIL: OWNER_EMAIL,
  SEED_OWNER_PASSWORD: OWNER_PASSWORD,
};

/**
 * Isolated stack: API :4100 + storefront :5273 + admin :5274 against database dantes_e2e.
 * The storefront and admin are production builds served by `vite preview`, proxied to :4100.
 * All specs share one database and mutate settings, so they run serially (workers: 1); every
 * mutating spec restores what it changed.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: STOREFRONT_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: 'chrome',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      cwd: root,
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: apiEnv,
    },
    {
      command: `pnpm --filter @dantes/storefront exec vite build && pnpm --filter @dantes/storefront exec vite preview --port ${STOREFRONT_PORT} --strictPort`,
      cwd: root,
      url: STOREFRONT_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_PROXY_TARGET: API_URL },
    },
    {
      command: `pnpm --filter @dantes/admin exec vite build && pnpm --filter @dantes/admin exec vite preview --port ${ADMIN_PORT} --strictPort`,
      cwd: root,
      url: `${ADMIN_URL}/admin/`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_PROXY_TARGET: API_URL },
    },
  ],
});
