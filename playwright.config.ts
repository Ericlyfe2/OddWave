import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Specs share two real, persistent demo accounts against one live database
  // (no per-worker DB isolation) — several tests assert exact session counts
  // or rotate the shared password, so concurrent workers would race each
  // other's state. Single-worker, sequential is required, not just faster.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // The product is mobile-first, so the bulk of the suite runs at phone width.
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
      testIgnore: /desktop\.spec\.ts/,
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
      testMatch: /desktop\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npm run dev --workspace=server',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
