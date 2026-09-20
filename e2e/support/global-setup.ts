/**
 * Release-01: logs in every fixture user through the REAL PKCE flow before
 * any test runs, capturing each session cookie + CSRF secret to
 * .auth-state.json (gitignored) and a browser storageState for the default
 * (demo) user. The webServer is already up when this runs.
 */
import { request as playwrightRequest, type FullConfig } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEV_PASSWORD = 'mgs-dev-password-2026!';
export const AUTH_STATE_PATH = join(__dirname, '.auth-state.json');
export const STORAGE_STATE_PATH = join(__dirname, '.storage-state.json');

const FIXTURE_EMAILS = [
  'demo.solicitor@example.co.uk',
  'second.solicitor@example.co.uk',
  'paralegal.e2e@example.co.uk',
  'readonly.e2e@example.co.uk',
  'admin.e2e@example.co.uk',
];

async function loginFor(baseURL: string, email: string): Promise<{ sid: string; csrf: string }> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  try {
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const login = await ctx.post('/api/auth/login', {
      data: { email, password: DEV_PASSWORD, codeChallenge: challenge },
    });
    if (!login.ok()) throw new Error(`login failed for ${email}: ${login.status()}`);
    const { code } = await login.json();
    const token = await ctx.post('/api/auth/token', { data: { code, codeVerifier: verifier } });
    if (!token.ok()) throw new Error(`token exchange failed for ${email}: ${token.status()}`);
    let sid = '';
    let csrf = '';
    for (const h of token.headersArray()) {
      if (h.name.toLowerCase() !== 'set-cookie') continue;
      const m = /^([^=]+)=([^;]+)/.exec(h.value);
      if (!m) continue;
      if (m[1] === 'mgs_sid') sid = decodeURIComponent(m[2]);
      if (m[1] === 'XSRF-TOKEN') csrf = decodeURIComponent(m[2]);
    }
    if (!sid || !csrf) throw new Error(`cookies missing for ${email}`);
    return { sid, csrf };
  } finally {
    await ctx.dispose();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:4200';
  const state: Record<string, { sid: string; csrf: string }> = {};
  for (const email of FIXTURE_EMAILS) {
    state[email] = await loginFor(baseURL, email);
  }
  writeFileSync(AUTH_STATE_PATH, JSON.stringify(state, null, 1));

  // Browser storageState for the default (demo) user: pages arrive signed in,
  // and Angular's XSRF support reads the readable cookie exactly as in prod.
  const demo = state['demo.solicitor@example.co.uk'];
  const url = new URL(baseURL);
  const cookie = (name: string, value: string, httpOnly: boolean) => ({
    name,
    value,
    domain: url.hostname,
    path: '/',
    expires: -1,
    httpOnly,
    secure: false,
    sameSite: 'Lax' as const,
  });
  writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify({
      cookies: [cookie('mgs_sid', demo.sid, true), cookie('XSRF-TOKEN', demo.csrf, false)],
      origins: [],
    }),
  );
}
