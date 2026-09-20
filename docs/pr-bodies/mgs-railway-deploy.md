# Railway staging deploy: basic-auth gate, health endpoint, single-service bundle serving

Branch `mgs/railway-deploy`, cut from `ali-zulqarnain/mgs-forms` @ `ee7454e` (the PR #148 merge —
parity-fix commit confirmed present). Target: `ali-zulqarnain/mgs-forms`. One commit; three files:
`apps/api/src/main.ts`, `railway.json`, `.railwayignore`.

## Why each piece exists

**Basic-auth gate (decided by Ali).** The app has no real auth — `DemoAuthGuard` trusts an
`x-user-email` header, and OAuth2/RBAC (LER-1013/1014) are unbuilt — so on a public URL any visitor
could assert any identity, including the sensitive-material permission. A small express middleware
in `main.ts` now fronts EVERYTHING (static assets and `/api/*` alike) with HTTP basic auth read from
`STAGING_AUTH_USER` / `STAGING_AUTH_PASSWORD`, comparing credentials constant-time over SHA-256
digests. It is enabled only when BOTH variables are set, so local development and the 216-check E2E
suite are untouched — proven by a full green run on this branch. Exactly one exemption:
`/api/health`.

**Health endpoint.** `GET /api/health` returns `{status:"ok"}` — registered as a raw express route
ahead of Nest's router, so it bypasses the global `DemoAuthGuard` and depends on neither the
database nor the seed: a liveness probe must not depend on the things it exists to watch. Railway's
healthcheck points at it (`railway.json`).

**Single service, one origin.** The API serves the built Angular bundle (`express.static` over
`apps/web/dist/web/browser` + an SPA fallback whose regex explicitly excludes `/api`), activated
only when the bundle exists — the dev server on :4200 keeps proxying exactly as before. One
service means one origin, one auth gate, and **no CORS surface at all**: the existing
localhost-only CORS regex stays, and no production origin is ever added, because permissive CORS
would undermine the MG6D access gate. The web app already calls `/api` relative, so it needed no
change.

**PORT binding** was already correct (`process.env.PORT ?? 3000`) — verified, not changed.

**`railway.json`.** Nixpacks build via `npm run build` (root `npm ci` postinstall builds
`libs/shared` first — the stale-dist trap from HANDOVER §5 is why the build order matters — and
`apps/api`'s postinstall runs `prisma generate`). Start command: `prisma migrate deploy` → seed →
serve. The seed is idempotent by construction (upserts; per-case offence replace) — proven twice
locally: a second seed run leaves users 2 / cases 5 / offences 6 / drafts 0.

**`.railwayignore`.** Excludes `node_modules`, all `dist` outputs, test artefacts — and
**`apps/api/prisma/dev.db`**: staging runs its own database on the mounted volume
(`DATABASE_URL=file:/data/mgforms.db`), seeded with the synthetic fixtures and nothing else
(project DoD #11); shipping local state would defeat that.

## Local verification (staging simulation on a throwaway DB, gate ON)

```
/api/health without credentials                     200
/ without credentials                               401 + WWW-Authenticate: Basic realm="MG Forms staging"
/api/me without credentials                         401
/ with credentials                                  200 (the Angular index)
/drafts/<anything> with credentials                 200 (SPA fallback)
wrong password                                      401
/api/form-templates/MG6 with credentials            v5, 48 fields (fresh libs/shared dist)
boot log: MG11 declaration integrity verified ·
          UC-07 sensitive-material wording verified ·
          gate enabled · bundle served
second seed run                                     users 2 / cases 5 / offences 6 — no duplication
npx playwright test (gate off, dev.db)              216 passed
dev.db after cleanup                                27 / 66 / 0
```

## What this PR does NOT do

No schema or Prisma-provider change. No production CORS origin. No real auth (the gate is a
staging shim in front of the demo identity model, not a replacement for LER-1013/1014). No
Railway resources — project, service, volume and domain creation are operator actions awaiting
approval, and no secret value appears in this diff or its PR.

## Checklist

- [x] Gate fronts every route incl. static and /api/*; /api/health is the only exemption
- [x] Enabled only by env — dev and E2E behaviour byte-identical (216/216 on this branch)
- [x] Constant-time credential comparison; no secret in code, diff, or logs
- [x] Single-service architecture: no CORS surface, one auth gate
- [x] Seed idempotent on boot; dev.db excluded from the deploy context
- [x] Targets `ali-zulqarnain/mgs-forms`, not `main`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
