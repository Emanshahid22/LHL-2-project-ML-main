import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';

export default defineConfig({
  testDir: './e2e',
  // Release-01: real auth. global-setup logs every fixture user in through
  // the PKCE flow (the webServer is already up when it runs); pages ride the
  // demo user's storageState, API contexts ride support/auth's per-user
  // session headers.
  globalSetup: './e2e/support/global-setup.ts',
  // The Phase 6 audit walkthrough lives under e2e/audit and is an EVIDENCE
  // harness, not product regression coverage: it assumes the app is already
  // running and it writes ~26 MB of screenshots, video and traces. It is run
  // deliberately via playwright.audit.config.ts, so keep it out of the suite CI
  // runs — otherwise every push dumps artefacts and the suite total drifts.
  testIgnore: '**/audit/**',
  // The suite shares one SQLite database and one "In progress" list, so the
  // specs run serially rather than fighting over the same drafts.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    storageState: './e2e/support/.storage-state.json',
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
  },
  // Both servers must be up before the first test: the web dev server proxies
  // /api to the API, so waiting only on :4200 races a cold-starting Nest.
  // Locally these reuse whatever is already running.
  webServer: [
    {
      command: 'npm run start:api',
      url: 'http://localhost:3000/api/me',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run start:web',
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
