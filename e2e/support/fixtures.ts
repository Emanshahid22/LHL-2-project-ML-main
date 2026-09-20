/**
 * Release-01: the suite's test harness. The default `request` fixture is
 * replaced with a context that authenticates as the demo user (session
 * cookie + CSRF header from global-setup) — every bare request.get/post in
 * the suites keeps working, now through the real boundary. Pages ride the
 * config-level storageState instead.
 */
import { test as base, expect, request as playwrightRequest } from '@playwright/test';
import { asUser, DEMO_EMAIL } from './auth';

export const test = base.extend({
  request: async ({ baseURL }, use) => {
    const ctx = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: asUser(DEMO_EMAIL),
    });
    await use(ctx);
    await ctx.dispose();
  },
  // E2E_CPU_THROTTLE=<n> slows the browser's CPU n-fold via CDP — the local
  // stand-in for a loaded CI runner when chasing timing-sensitive failures.
  // Off (and free) unless the variable is set. Chromium-only, like the suite.
  page: async ({ page }, use) => {
    const rate = Number(process.env['E2E_CPU_THROTTLE'] ?? '0');
    if (rate > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    }
    await use(page);
  },
});

export { expect };
