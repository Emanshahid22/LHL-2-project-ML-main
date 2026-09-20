/**
 * Release-01: the ONE seam for "act as user X" in API-level checks — now
 * riding the REAL session boundary. global-setup.ts logged every fixture
 * user in through the PKCE flow and captured session + CSRF; asUser()
 * returns per-call headers carrying exactly that pair. Per-call headers
 * override the request context's defaults wholesale, so acting as the
 * colleague replaces BOTH the cookie and the CSRF header (never a mix).
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEMO_EMAIL = 'demo.solicitor@example.co.uk';
export const COLLEAGUE_EMAIL = 'second.solicitor@example.co.uk';
export const PARALEGAL_EMAIL = 'paralegal.e2e@example.co.uk';
export const READONLY_EMAIL = 'readonly.e2e@example.co.uk';
export const ADMIN_EMAIL = 'admin.e2e@example.co.uk';

let state: Record<string, { sid: string; csrf: string }> | null = null;

function authState(): Record<string, { sid: string; csrf: string }> {
  if (!state) {
    state = JSON.parse(
      readFileSync(join(__dirname, '.auth-state.json'), 'utf8'),
    ) as Record<string, { sid: string; csrf: string }>;
  }
  return state;
}

/** Per-call headers that act as the given fixture user's live session. */
export function asUser(email: string): Record<string, string> {
  const entry = authState()[email];
  if (!entry) throw new Error(`no auth state for ${email} — is it in global-setup's list?`);
  return { cookie: `mgs_sid=${entry.sid}`, 'x-xsrf-token': entry.csrf };
}

/**
 * Swap a PAGE's identity to the given fixture user. Header-based acting
 * (asUser) works only for request contexts: a browser's own cookie jar
 * (the demo storageState session) takes precedence over a manually set
 * Cookie header, so page.setExtraHTTPHeaders() silently leaves the page
 * signed in as demo. The jar itself is the only seam a page honours —
 * replace both cookies there (never a mix), matching global-setup's shape.
 */
export async function pageAs(page: Page, email: string): Promise<void> {
  const entry = authState()[email];
  if (!entry) throw new Error(`no auth state for ${email} — is it in global-setup's list?`);
  const storage = JSON.parse(
    readFileSync(join(__dirname, '.storage-state.json'), 'utf8'),
  ) as { cookies: Array<{ domain: string }> };
  const domain = storage.cookies[0].domain;
  const base = { domain, path: '/', expires: -1, secure: false, sameSite: 'Lax' as const };
  const context = page.context();
  await context.clearCookies();
  await context.addCookies([
    { name: 'mgs_sid', value: entry.sid, httpOnly: true, ...base },
    { name: 'XSRF-TOKEN', value: entry.csrf, httpOnly: false, ...base },
  ]);
}

/** The second seeded solicitor — the suites' standing second actor. Lazy:
 *  resolved on first use, after global-setup has written the state file. */
export const COLLEAGUE: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, prop: string) => asUser(COLLEAGUE_EMAIL)[prop],
  ownKeys: () => Reflect.ownKeys(asUser(COLLEAGUE_EMAIL)),
  getOwnPropertyDescriptor: (_t, prop: string) => ({
    enumerable: true,
    configurable: true,
    value: asUser(COLLEAGUE_EMAIL)[prop],
  }),
});
