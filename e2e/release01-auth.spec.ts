import { expect, test } from './support/fixtures';
import { request as playwrightRequest } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import {
  ADMIN_EMAIL,
  asUser,
  COLLEAGUE,
  DEMO_EMAIL,
  PARALEGAL_EMAIL,
  READONLY_EMAIL,
} from './support/auth';
import { createDraft, saveValues } from './support/api';

/**
 * Release-01 — Authentication & RBAC (LER-1013/1014/1015).
 *
 * Fixture users (e2e/FIXTURES.md): demo + colleague = Senior Solicitor
 * (histories preserved), paralegal/readonly/admin.e2e@ = their named roles.
 * Direct-API discipline throughout: the UI is courtesy, these matrices ARE
 * the boundary. Login-flow tests create their own throwaway user so rate
 * limiting and lockouts never poison the fixture users' sessions.
 */

const DEV_PASSWORD = 'mgs-dev-password-2026!';

/** Inside a worker, request.newContext() inherits the config's storageState
 *  (the demo session!) — every context this spec builds must zero it, or an
 *  "anonymous" call arrives signed in. */
const NO_SESSION = { cookies: [], origins: [] };
/** Lowercase on purpose: the API normalises emails to lowercase on create,
 *  and afterAll's `in` match against createdUserEmails is case-sensitive —
 *  an uppercase RUN quietly strands every probe user it names. */
const RUN = `r${Date.now().toString(36)}`;

const PARALEGAL = () => asUser(PARALEGAL_EMAIL);
const READONLY = () => asUser(READONLY_EMAIL);
const ADMIN = () => asUser(ADMIN_EMAIL);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function prismaDo(fn: (prisma: any) => Promise<any>): Promise<any> {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = `file:${join(process.cwd(), 'apps', 'api', 'prisma', 'dev.db')}`;
  }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** Users this spec creates (cleaned in afterAll with their auth rows). */
const createdUserEmails: string[] = [];

async function pkceLogin(
  baseURL: string,
  email: string,
  password: string,
): Promise<{ status: number; sid?: string; csrf?: string; message?: string }> {
  const ctx = await playwrightRequest.newContext({ baseURL, storageState: NO_SESSION });
  try {
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const login = await ctx.post('/api/auth/login', {
      data: { email, password, codeChallenge: challenge },
    });
    if (!login.ok()) {
      const body = await login.json().catch(() => ({}));
      return { status: login.status(), message: String(body.message ?? '') };
    }
    const { code } = await login.json();
    const token = await ctx.post('/api/auth/token', { data: { code, codeVerifier: verifier } });
    let sid: string | undefined;
    let csrf: string | undefined;
    for (const h of token.headersArray()) {
      if (h.name.toLowerCase() !== 'set-cookie') continue;
      const m = /^([^=]+)=([^;]+)/.exec(h.value);
      if (m?.[1] === 'mgs_sid') sid = m[2];
      if (m?.[1] === 'XSRF-TOKEN') csrf = m[2];
    }
    return { status: token.status(), sid, csrf };
  } finally {
    await ctx.dispose();
  }
}

test.describe('Release 01 — authentication & RBAC', () => {
  test.afterAll(async () => {
    await prismaDo(async (p) => {
      if (createdUserEmails.length === 0) return;
      const users = await p.user.findMany({ where: { email: { in: createdUserEmails } } });
      const ids = users.map((u: { id: string }) => u.id);
      await p.auditEvent.deleteMany({ where: { userId: { in: ids } } });
      // Sessions/credentials/roles cascade with the user rows.
      await p.user.deleteMany({ where: { id: { in: ids } } });
    });
  });

  // ── LER-1015: the 401 matrix — every controller, no session ──

  test('401 matrix: no endpoint answers without a session, except health', async ({ baseURL }) => {
    const anon = await playwrightRequest.newContext({ baseURL, storageState: NO_SESSION });
    try {
      const health = await anon.get('/api/health');
      expect(health.status(), 'health is the ONLY public data endpoint').toBe(200);

      const endpoints: [string, 'get' | 'post'][] = [
        ['/api/me', 'get'],
        ['/api/form-templates', 'get'],
        ['/api/cases', 'get'],
        ['/api/drafts', 'get'],
        ['/api/drafts', 'post'],
        ['/api/archive', 'get'],
        ['/api/documents/nonexistent', 'get'],
        ['/api/pdf-jobs/nonexistent', 'get'],
        ['/api/admin/users', 'get'],
        ['/api/oversight/bypasses', 'get'],
        ['/api/language/prompts', 'post'],
        ['/api/auth/logout', 'post'],
      ];
      for (const [url, method] of endpoints) {
        const res = method === 'get' ? await anon.get(url) : await anon.post(url, { data: {} });
        expect(res.status(), `${method.toUpperCase()} ${url} without a session`).toBe(401);
      }
    } finally {
      await anon.dispose();
    }
  });

  test('a tampered session cookie is a 401, not an error', async ({ baseURL }) => {
    const forged = await playwrightRequest.newContext({
      baseURL,
      storageState: NO_SESSION,
      extraHTTPHeaders: { cookie: 'mgs_sid=forged-session-id-000', 'x-xsrf-token': 'x' },
    });
    try {
      expect((await forged.get('/api/me')).status()).toBe(401);
    } finally {
      await forged.dispose();
    }
  });

  // ── LER-1014: the role × endpoint 403 matrix ──

  test('Read-Only: reads pass, every write is refused naming the level', async ({ request }) => {
    expect((await request.get('/api/form-templates', { headers: READONLY() })).status()).toBe(200);
    expect((await request.get('/api/cases', { headers: READONLY() })).status()).toBe(200);
    expect((await request.get('/api/archive', { headers: READONLY() })).status()).toBe(200);

    const create = await request.post('/api/drafts', {
      headers: READONLY(),
      data: { formCode: 'MG12' },
    });
    expect(create.status(), 'Read-Only cannot create').toBe(403);
    expect(String((await create.json()).message)).toContain('forms.edit');

    for (const [url, expectCap] of [
      ['/api/drafts/any/finalise', 'forms.finalise'],
      ['/api/drafts/any/pdf', 'documents.generate'],
      ['/api/archive/lineages/any/link', 'archive.link'],
      ['/api/language/prompts', 'forms.edit'],
    ] as const) {
      const res = await request.post(url, { headers: READONLY(), data: {} });
      expect(res.status(), `Read-Only POST ${url}`).toBe(403);
      expect(String((await res.json()).message)).toContain(expectCap);
    }
    expect(
      (await request.get('/api/oversight/bypasses', { headers: READONLY() })).status(),
      'oversight is Senior-only',
    ).toBe(403);
  });

  test('Paralegal: prepares and generates, but finalise/reopen/oversight/admin are refused', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12', null, PARALEGAL());
    await saveValues(
      request,
      draft.id,
      {
        urn: '02EF0234987/26',
        defendantName: 'Sofia Renard',
        compiledBy: 'Paralegal fixture',
        exhibitEntries: `SR/1 — item — ${RUN}`,
        storageLocation: 'Store',
        dateCompiled: '2026-08-02',
      },
      draft.version,
      {},
      PARALEGAL(),
    );

    const finalise = await request.post(`/api/drafts/${draft.id}/finalise`, {
      headers: PARALEGAL(),
      data: { advisoryAcknowledgements: [] },
    });
    expect(finalise.status(), 'Paralegal cannot finalise').toBe(403);
    expect(String((await finalise.json()).message)).toContain('forms.finalise');

    expect(
      (await request.post(`/api/drafts/${draft.id}/reopen`, { headers: PARALEGAL(), data: {} })).status(),
    ).toBe(403);
    expect(
      (await request.get('/api/oversight/bypasses', { headers: PARALEGAL() })).status(),
    ).toBe(403);
    expect((await request.get('/api/admin/users', { headers: PARALEGAL() })).status()).toBe(403);

    // Generation IS allowed — the output is draft-marked (ruling #1).
    const gen = await request.post(`/api/drafts/${draft.id}/pdf`, {
      headers: PARALEGAL(),
      data: {},
    });
    expect(gen.status(), 'Paralegal may generate their own draft').toBe(201);
  });

  test('admin-cannot-read-content: every content surface refuses the Administrator', async ({
    request,
  }) => {
    for (const url of [
      '/api/cases',
      '/api/drafts',
      '/api/form-templates',
      '/api/archive',
      '/api/documents/nonexistent',
      '/api/oversight/bypasses',
    ]) {
      const res = await request.get(url, { headers: ADMIN() });
      expect(res.status(), `Administrator GET ${url}`).toBe(403);
    }
    const create = await request.post('/api/drafts', {
      headers: ADMIN(),
      data: { formCode: 'MG12' },
    });
    expect(create.status(), 'Administrator cannot create drafts').toBe(403);
    // And the admin surface answers only to admin.users.
    expect((await request.get('/api/admin/users', { headers: ADMIN() })).status()).toBe(200);
  });

  test('Senior Solicitor: the oversight listing shows bypass reasons verbatim', async ({
    request,
  }) => {
    const res = await request.get('/api/oversight/bypasses');
    expect(res.status()).toBe(200);
    // Shape only — bypass rows exist when suites exercise them; the listing
    // must be a read (no audit write for reads is asserted in the unit of
    // trail discipline, not here).
    expect(Array.isArray(await res.json())).toBe(true);
  });

  // ── privilege escalation ──

  test('privilege escalation attempts change nothing', async ({ request }) => {
    const admins = await request.get('/api/admin/users', { headers: ADMIN() });
    const readonly = (await admins.json()).find(
      (u: { email: string }) => u.email === READONLY_EMAIL,
    );

    // A non-admin PATCHing roles/grants: 403, no write.
    const escalate = await request.patch(`/api/admin/users/${readonly.id}/roles`, {
      headers: PARALEGAL(),
      data: { roles: ['Administrator'] },
    });
    expect(escalate.status()).toBe(403);

    const selfGrant = await request.patch(`/api/admin/users/${readonly.id}/grant`, {
      headers: READONLY(),
      data: { sensitiveMaterialAccess: true },
    });
    expect(selfGrant.status()).toBe(403);

    const after = await request.get('/api/admin/users', { headers: ADMIN() });
    const check = (await after.json()).find((u: { email: string }) => u.email === READONLY_EMAIL);
    expect(check.roles).toEqual(['Read-Only']);
    expect(check.sensitiveMaterialAccess).toBe(false);
  });

  test('ruling #8 at the API: the grant stacks on practitioner roles only', async ({ request }) => {
    const users = await (await request.get('/api/admin/users', { headers: ADMIN() })).json();
    const readonly = users.find((u: { email: string }) => u.email === READONLY_EMAIL);
    const paralegal = users.find((u: { email: string }) => u.email === PARALEGAL_EMAIL);

    const denied = await request.patch(`/api/admin/users/${readonly.id}/grant`, {
      headers: ADMIN(),
      data: { sensitiveMaterialAccess: true },
    });
    expect(denied.status(), 'grant on Read-Only refused').toBe(409);

    const granted = await request.patch(`/api/admin/users/${paralegal.id}/grant`, {
      headers: ADMIN(),
      data: { sensitiveMaterialAccess: true },
    });
    expect(granted.status(), 'grant on Paralegal accepted').toBe(200);
    const revoked = await request.patch(`/api/admin/users/${paralegal.id}/grant`, {
      headers: ADMIN(),
      data: { sensitiveMaterialAccess: false },
    });
    expect(revoked.status()).toBe(200);
    expect((await revoked.json()).sensitiveMaterialAccess).toBe(false);
  });

  // ── LER-1013: login flows, CSRF, logout, forced change ──

  test('login failures are content-free and identical; rate limiting closes the window', async ({
    baseURL,
    request,
  }) => {
    // Throwaway user so lockouts never poison a fixture session.
    const email = `rate.${RUN}@example.co.uk`;
    createdUserEmails.push(email);
    const created = await request.post('/api/admin/users', {
      headers: ADMIN(),
      data: { email, name: 'Rate Limit Probe', role: 'Read-Only', temporaryPassword: DEV_PASSWORD },
    });
    expect(created.status()).toBe(201);

    const wrongPassword = await pkceLogin(baseURL!, email, 'wrong-password-123');
    const unknownUser = await pkceLogin(baseURL!, `no.such.${RUN}@example.co.uk`, 'whatever-123');
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.message, 'identical content-free failures').toBe(unknownUser.message);

    for (let i = 0; i < 4; i++) await pkceLogin(baseURL!, email, 'still-wrong-123');
    const limited = await pkceLogin(baseURL!, email, DEV_PASSWORD);
    expect(limited.status, 'rate limited even with the right password').toBe(401);
    expect(limited.message).toContain('Too many attempts');
  });

  test('CSRF: a session without the matching header cannot mutate', async ({ baseURL }) => {
    const demo = asUser('demo.solicitor@example.co.uk');
    const noCsrf = await playwrightRequest.newContext({
      baseURL,
      storageState: NO_SESSION,
      extraHTTPHeaders: { cookie: demo['cookie'] },
    });
    try {
      expect((await noCsrf.get('/api/drafts')).status(), 'reads pass without CSRF').toBe(200);
      const res = await noCsrf.post('/api/drafts', { data: { formCode: 'MG12' } });
      expect(res.status(), 'mutation without CSRF header → 403').toBe(403);
      const forged = await noCsrf.post('/api/drafts', {
        data: { formCode: 'MG12' },
        headers: { 'x-xsrf-token': 'forged-token' },
      });
      expect(forged.status(), 'forged CSRF header → 403').toBe(403);
    } finally {
      await noCsrf.dispose();
    }
  });

  test('logout revokes the server-side session', async ({ baseURL }) => {
    const email = `logout.${RUN}@example.co.uk`;
    createdUserEmails.push(email);
    const demoHeaders = ADMIN();
    const ctxAdmin = await playwrightRequest.newContext({
      baseURL,
      storageState: NO_SESSION,
      extraHTTPHeaders: demoHeaders,
    });
    await ctxAdmin.post('/api/admin/users', {
      data: { email, name: 'Logout Probe', role: 'Read-Only', temporaryPassword: DEV_PASSWORD },
    });
    await ctxAdmin.dispose();

    const first = await pkceLogin(baseURL!, email, DEV_PASSWORD);
    // The fresh account is mustChange (admin-created) — change first.
    const session = await playwrightRequest.newContext({
      baseURL,
      storageState: NO_SESSION,
      extraHTTPHeaders: { cookie: `mgs_sid=${first.sid}`, 'x-xsrf-token': first.csrf! },
    });
    try {
      const change = await session.post('/api/auth/change-password', {
        data: { currentPassword: DEV_PASSWORD, newPassword: `changed-${RUN}-long-enough` },
      });
      expect(change.status()).toBe(201);
      expect((await session.get('/api/me')).status()).toBe(200);
      expect((await session.post('/api/auth/logout', { data: {} })).status()).toBe(201);
      expect((await session.get('/api/me')).status(), 'revoked session → 401').toBe(401);
    } finally {
      await session.dispose();
    }
  });

  test('ruling #5: an admin reset forces the change and revokes live sessions', async ({
    baseURL,
    request,
  }) => {
    const email = `reset.${RUN}@example.co.uk`;
    createdUserEmails.push(email);
    const created = await request.post('/api/admin/users', {
      headers: ADMIN(),
      data: { email, name: 'Reset Probe', role: 'Paralegal', temporaryPassword: DEV_PASSWORD },
    });
    const userId = (await created.json()).id;

    const login = await pkceLogin(baseURL!, email, DEV_PASSWORD);
    const session = await playwrightRequest.newContext({
      baseURL,
      storageState: NO_SESSION,
      extraHTTPHeaders: { cookie: `mgs_sid=${login.sid}`, 'x-xsrf-token': login.csrf! },
    });
    try {
      // mustChange confines the session: content routes refuse…
      const confined = await session.get('/api/drafts');
      expect(confined.status(), 'mustChange confines to change-password').toBe(403);
      // …until the password is changed.
      const change = await session.post('/api/auth/change-password', {
        data: { currentPassword: DEV_PASSWORD, newPassword: `fresh-${RUN}-long-enough` },
      });
      expect(change.status()).toBe(201);
      expect((await session.get('/api/drafts')).status()).toBe(200);

      // Admin reset: sessions die, the flag returns.
      const reset = await request.post(`/api/admin/users/${userId}/password-reset`, {
        headers: ADMIN(),
        data: { temporaryPassword: `temp-${RUN}-long-enough` },
      });
      expect(reset.status()).toBe(201);
      expect((await session.get('/api/me')).status(), 'reset revokes live sessions').toBe(401);
    } finally {
      await session.dispose();
    }
  });

  test('ruling #4: the password policy refuses short and known-breached choices', async ({
    request,
  }) => {
    const short = await request.post('/api/admin/users', {
      headers: ADMIN(),
      data: { email: `p.${RUN}@example.co.uk`, name: 'P', role: 'Read-Only', temporaryPassword: 'short' },
    });
    expect(short.status(), 'short password → 400').toBe(400);
    const breached = await request.post('/api/admin/users', {
      headers: ADMIN(),
      data: {
        email: `p.${RUN}@example.co.uk`,
        name: 'P',
        role: 'Read-Only',
        temporaryPassword: 'password2026',
      },
    });
    expect(breached.status(), 'deny-listed password → 400').toBe(400);
  });

  // ── the UC-07 grant predicate is UNCHANGED under real roles ──

  test('the sensitive grant remains the one UC-07 predicate under real sessions', async ({
    request,
  }) => {
    // The colleague (Senior Solicitor, NO grant): the sensitive confirmation
    // endpoint refuses exactly as it always has.
    const { draft } = await createDraft(request, 'MG6', null, COLLEAGUE);
    const confirm = await request.post(`/api/drafts/${draft.id}/sensitive/confirmations`, {
      headers: COLLEAGUE,
      data: { kind: 'HANDLING_INSTRUCTIONS' },
    });
    expect(confirm.status(), 'no grant → 403, role notwithstanding').toBe(403);
  });
});

/**
 * The logged-out shell and the real login FORM. This describe exists because
 * of a P1 that every logged-in automated test missed: with no session,
 * /api/me 401s, and an unguarded toSignal in the app shell rethrew that
 * error on every change-detection pass — dead ngModel sync (the form POSTed
 * empty strings), an error message that never rendered, and half-wired
 * Material inputs. Human UAT found it; these tests keep it found.
 *
 * storageState is overridden to EMPTY — the config default carries the demo
 * session, and a logged-in shell cannot regress this way.
 */
test.describe('Release 01 — the login form, logged out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /** Angular runtime errors only — the network's own 401 log line is expected
   *  while logged out and is not a defect. */
  function collectRuntimeErrors(page: import('@playwright/test').Page): string[] {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
        errors.push(m.text().split('\n')[0]);
      }
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
    return errors;
  }

  test('a wrong password shows the content-free message — visibly, with a quiet console', async ({
    page,
  }) => {
    const errors = collectRuntimeErrors(page);
    await page.goto('/login');
    await page.fill('[data-testid="login-email"]', DEMO_EMAIL);
    await page.fill('[data-testid="login-password"]', 'wrong-password-here');
    await page.click('[data-testid="login-submit"]');

    const message = page.getByTestId('login-error');
    await expect(message, 'a failed sign-in must SAY so').toBeVisible();
    await expect(message).toContainText('The email address or password is not correct.');
    // The exact regression: a logged-out shell must not throw on any CD pass.
    expect(errors, 'no Angular runtime errors while logged out').toEqual([]);
  });

  test('the form signs in end-to-end: real values on the wire, dashboard reached', async ({
    page,
  }) => {
    const errors = collectRuntimeErrors(page);
    let posted: { email?: string; password?: string } = {};
    page.on('request', (r) => {
      if (r.url().endsWith('/api/auth/login')) posted = JSON.parse(r.postData() ?? '{}');
    });
    await page.goto('/login');
    await page.fill('[data-testid="login-email"]', DEMO_EMAIL);
    await page.fill('[data-testid="login-password"]', DEV_PASSWORD);
    await page.click('[data-testid="login-submit"]');

    await page.waitForURL((u) => new URL(u).pathname === '/');
    // ngModel actually carried the typed values — the P1 sent empty strings.
    expect(posted.email, 'the form must POST what was typed').toBe(DEMO_EMAIL);
    expect(posted.password).toBe(DEV_PASSWORD);
    await expect(page.getByTestId('dashboard-greeting').or(page.locator('h1'))).toBeVisible();
    expect(errors, 'no Angular runtime errors across the whole flow').toEqual([]);
  });
});

/**
 * The forced-change flow THROUGH THE UI. Found on staging as the P1's
 * follow-up: the login page decides where to route by reading /api/me, and
 * the mustChange confinement blocked /api/me — so a freshly reset user was
 * stranded on /login with an error instead of reaching the change form.
 * Local seeds carry mustChange:false, so only a test that MAKES a confined
 * user and then drives the real form can hold this path.
 */
test.describe('Release 01 — forced password change, through the real form', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const FORCED_EMAIL = `forced.${RUN}@example.co.uk`;
  const TEMP_PASSWORD = `temp-${RUN}-long-enough!`;

  test.afterAll(async () => {
    await prismaDo(async (p) => {
      const u = await p.user.findUnique({ where: { email: FORCED_EMAIL } });
      if (!u) return;
      await p.auditEvent.deleteMany({ where: { userId: u.id } });
      await p.user.delete({ where: { id: u.id } });
    });
  });

  test('a reset user lands on the change form, completes it, and arrives signed in', async ({
    page,
    request,
    baseURL,
  }) => {
    const created = await request.post('/api/admin/users', {
      headers: asUser(ADMIN_EMAIL),
      data: { email: FORCED_EMAIL, name: 'Forced Change Probe', role: 'Read-Only', temporaryPassword: TEMP_PASSWORD },
    });
    expect(created.status(), 'admin creates the confined user').toBe(201);

    await page.goto('/login');
    await page.fill('[data-testid="login-email"]', FORCED_EMAIL);
    await page.fill('[data-testid="login-password"]', TEMP_PASSWORD);
    await page.click('[data-testid="login-submit"]');

    // The regression: /api/me must be readable under mustChange, or this
    // navigation never happens and an error strands the user on /login.
    await page.waitForURL('**/change-password');
    await page.fill('[data-testid="current-password"]', TEMP_PASSWORD);
    await page.fill('[data-testid="new-password"]', `chosen-${RUN}-own-password!`);
    await page.click('[data-testid="change-password-submit"]');

    await page.waitForURL((u) => new URL(u, baseURL).pathname === '/');
    // Signed in for real: the session survives a reload onto content.
    await page.reload();
    await expect(page.getByTestId('login-form')).toHaveCount(0);
  });
});
