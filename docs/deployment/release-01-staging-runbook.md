# Release-01 staging redeploy — runbook (prepared 26 Aug 2026, NOT yet executed)

Redeploys Railway staging from `ali-zulqarnain/mgs-forms` HEAD (`582ba6c`, the PR #211 merge) —
taking the instance from its 22 Aug state (`19bc07a`, pre-UC-09) to the full build: PDF/DOCX
generation, archive, and real authentication. **Nothing here has touched Railway yet; Ali executes
or approves each step.** Environment identifiers are in `railway-staging.md` (project
`mg-forms-staging`, service `app`, volume `app-volume` at `/data`).

## 0 · Pre-flight (local, no Railway access needed)

- [ ] Base branch CI green at the deploy commit (`git ls-remote origin 'refs/ci/*'`).
- [ ] `railway.json` deprecation note stands (Config as Code sunset 2026-12-01) — no action today.
- [ ] Step 3's seed-safety change is **built and approved (D-I)** — confirm the deploy commit
      carries it (`seed.js` honours `SEED_USER_PASSWORD`).

## 1 · Environment variables (Railway → service `app` → Variables)

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | `file:/data/mgforms.db` | already set — unchanged |
| `DOCUMENT_MASTER_KEY` | **NEW** — generate with `openssl rand -base64 32` (exactly 44 chars ending `=`) | UC-09 AES-256-GCM at rest. Unset = ephemeral key (documents unreadable after restart); malformed = **refuses to boot** by design. Generate directly into Railway; never committed, never printed — same handling as the basic-auth password. |
| `DOCUMENT_STORE_DIR` | **NEW** — `/data/documents` | ciphertext must live on the volume; the fallback path is inside the container and vanishes on redeploy |
| `SEED_USER_PASSWORD` | **NEW** — generated value, Railway-only, shared out-of-band | D-I: seeded credentials use it with `mustChange: true`; the dev credential never works on staging (see step 3) |
| `NODE_ENV` | verify it is `production` at **runtime** (nixpacks sets it for builds; confirm the service sees it) | drives `Secure` on the session cookies — behind Railway TLS with `trust proxy 1` already in `main.ts` |
| `SESSION_SECRET` | **NOT NEEDED — do not set.** | Honest correction to the prep list: no code reads it. The session cookie is an opaque server-side row id (nothing signed), and CSRF secrets are per-session database rows. There is nothing to configure. |
| `RENDER_FONT_CSS` | leave unset | optional PDF font override; defaults are correct |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | **REMOVE** (see step 2) | it was set when no PDF path existed; it now guarantees generation fails |
| `STAGING_AUTH_USER` / `STAGING_AUTH_PASSWORD` | keep for now | retired in step 7, only after login is proven |

## 2 · Chromium on the Railway image

The PDF renderer (`chromium-pdf.ts`) resolves, in order: `CHROMIUM_EXECUTABLE` → playwright's
browser cache (`PLAYWRIGHT_BROWSERS_PATH` or `~/.cache/ms-playwright`). The current image has
**neither** (browser download was skipped on the 22 Aug deploy).

As executed (27 Aug 2026), nixpacks-native:

- Railway variable `NIXPACKS_PKGS` = **`chromium fontconfig dejavu_fonts`** — the font packages
  are NOT optional. The first deploy shipped `chromium` alone: Chromium launched, jobs completed,
  and every PDF was a *valid-looking but blank* ~1.3 KB file (no fonts → no glyphs), caught only
  because two versions that must differ hashed identically. A healthy MG12 PDF is ~30–34 KB.
- Railway variable `CHROMIUM_EXECUTABLE` = `/nix/var/nix/profiles/default/bin/chromium` (the
  stable profile symlink — resolved with `railway ssh -- which chromium` after the first build;
  do not pin a raw `/nix/store/...` hash path, it changes per build).
- **Post-deploy proof that fonts work**: generate a PDF and check the byte size (≳30 KB) and that
  two content-differing versions hash differently — not just `%PDF` magic.

Alternative (playwright-managed): remove `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` and add
`npx playwright install chromium --with-deps` to the build — heavier image, more moving parts on
apt deps; use only if the nix chromium misrenders.

**Memory caveat:** the free-trial plan is 1 GB shared. Chromium rendering inside that envelope is
untested — step 6 verifies a real PDF; if the container OOMs, that is a plan decision for Ali, not
a code defect.

## 3 · Seed safety — BUILT and ruled (D-I in the register)

`seed.js` honours `SEED_USER_PASSWORD` (env). When set: all seeded credentials use it **and
`mustChange: true`** — every account is forced to choose its own password at first sign-in, and
the documented dev credential never works in the environment. When unset: dev/e2e behaviour,
unchanged (proof for both paths recorded in D-I). Remaining action for this runbook:

- Staging sets `SEED_USER_PASSWORD` to a generated value stored only in Railway variables, shared
  with Ali out-of-band (add it to the step-1 variables when executing).
- The seeded **Administrator is `admin.e2e@example.co.uk` (Ashwin Rao)** — after first sign-in and
  forced change, Ali holds the admin account and uses the ruling-#6 admin surface (create user /
  assign role / reset password) to provision any real staging users. No content access exists on
  that account by construction.

The seed remains idempotent (upserts) — the two users already in the staging DB from 22 Aug gain
roles and credentials; the three new fixture users are created.

## 4 · Deploy

```bash
git checkout ali-zulqarnain/mgs-forms && git pull        # HEAD must be 582ba6c or later
railway up --service app -c
```

Boot order (from `railway.json`): `prisma migrate deploy` (applies every migration since 22 Aug —
UC-09 documents/jobs, UC-10 archive, release-01 auth tables; **all additive**) → idempotent seed →
serve. Boot itself is a gate: the MG11-declaration and UC-07-wording integrity asserts, the
document-key shape check, and `assertBoundaryComplete` (any undeclared route refuses to start) all
run before listen.

## 5 · Post-deploy verification (with basic-auth still on)

- [ ] Deployment status SUCCESS **and the new deployment id is the one serving** (zero-downtime
      overlap caught us on 22 Aug — check the id, not the clock).
- [ ] Boot log shows: migrations applied, both wording gates `verified`, no ephemeral-key warning.
- [ ] `GET /api/health` without any credentials → 200 (the only anonymous endpoint).
- [ ] `GET /api/me` with basic-auth but **no session cookie** → 401 (the real boundary answers,
      not the shim).
- [ ] Sign in via the UI as the admin → forced password change → admin page lists users.
- [ ] Sign in as a practitioner (after admin reset) → dashboard loads → templates served fresh
      (spot-check MG6 field count vs `libs/shared`).
- [ ] Generate a PDF on a finalised draft → downloads, opens, carries the draft banner;
      `railway ssh -- ls /data/documents` shows opaque ciphertext names only (DoD #11 posture).
- [ ] `railway ssh -- ls -la /data` — still only `mgforms.db`, `documents/`, `lost+found`.

## 6 · UAT

Run `docs/release/uat-script.md` (30–45 min, every UC end-to-end with login). *(The original plan
kept basic-auth ON during UAT; step 7 records why that changed.)*

## 7 · Basic-auth retirement — EXECUTED EARLY, 27 Aug 2026 (D-K)

The plan was to retire the shim only after UAT sign-off. In practice the shim **blocked UAT**: it
challenged every path except `/api/health`, and a real browser does not attach cached basic
credentials uniformly across navigations, `fetch()` calls and lazy-chunk imports — each
header-less request drew a fresh `WWW-Authenticate` challenge, looping the credential dialog with
a blank page body. Ali ruled retirement forward (register entry **D-K**).

As executed: both variables deleted → `railway redeploy` (variable *deletion* does NOT
auto-redeploy — trigger it explicitly) → verified: `/` serves the shell unchallenged; an
anonymous browser routes to a rendered `/login` with zero challenged responses; ten content
endpoints answer clean 401s (no challenge header) without a session; full login + forced change +
PDF generate/decrypt still green. **The session boundary is the sole gate; the login page and
static bundle are publicly reachable by design.**

To re-enable basic-auth if ever needed: set `STAGING_AUTH_USER` + `STAGING_AUTH_PASSWORD` again
and redeploy — the shim code ships dormant in `main.ts`. Know the trade-off it carries: it will
challenge fetch/chunk requests again, so only re-enable it on a build where that interaction is
resolved or for emergency lockdown.

## 8 · Rollback

Railway dashboard → service `app` → Deployments → select the last SUCCESS deployment from the
previous build → **Redeploy** (the image is pinned; no rebuild). Notes that make this safe:

- The volume is untouched by rollback. All new-schema tables are **additive**, and the old image's
  Prisma client ignores tables it never knew — the 22 Aug build runs against the migrated DB.
- Documents generated meanwhile stay as ciphertext on the volume; the old build has no documents
  module and never touches them.
- If basic-auth was already retired (step 7), **re-add the two shim variables before rolling
  back** — the old build's only gate is the shim, and rolling back without it would expose the
  x-user-email development shim to the open internet.
- Rollback is a signal to stop: capture the failing deployment's logs before redeploying over it.
