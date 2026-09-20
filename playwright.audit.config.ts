import { defineConfig } from '@playwright/test';

/**
 * Phase 6 audit walkthrough — a real user journey per use case, with visible
 * evidence. Separate from playwright.config.ts so the normal suite is untouched.
 *
 * Assumes the app is ALREADY running (npm run dev) and that the API's MG11
 * declaration integrity line has been seen, which is what proves the API booted
 * against the current libs/shared rather than a stale build.
 */
export default defineConfig({
  testDir: './e2e/audit',
  outputDir: './e2e/audit-artifacts/test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'e2e/audit-artifacts/report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    viewport: { width: 1366, height: 768 },
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },
});
