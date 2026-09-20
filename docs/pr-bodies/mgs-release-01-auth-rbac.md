# Release-01 — Authentication & RBAC (LER-1013 / LER-1014 / LER-1015)

**Branch:** `mgs/release-01-auth-rbac` → `ali-zulqarnain/mgs-forms`
**Delivering tickets:** LER-2439 (auth, for LER-1013) · LER-2440 (RBAC, for LER-1014) · LER-2441 (boundary, for LER-1015) — created 1:1 before this PR, read-back verified.
**Merge-order dependency:** this branch is stacked on `mgs/layout-verification-d-f` (PR open, CI green, run 32987005484). Merge D-F first or this PR carries its commits.

Every ruling below is **PROVISIONAL** under `docs/decisions/provisional-decision-register.md` — made by Ali Zulqarnain on documented best judgment with the team unresponsive, awaiting ratification.

---

## The decision record this PR implements

**D-G (as amended)** — the RBAC model. The original D-G text proposed a role list that conflicted with LER-1014's own wording. The conflict was flagged before any code was written; Ali ruled (**ruling #1**) that **the ticket wins**, and D-G now carries the four roles verbatim from LER-1014:

- **Administrator** — user/role/grant management and password resets. **No content access.**
- **Senior Solicitor** — full practitioner capability, including finalise, advisory bypass, bypass oversight, and reopen.
- **Paralegal** — create/edit/review/autofill/archive/link and generation of own drafts. **Cannot finalise or bypass.**
- **Read-Only** — view only.

The capability assignments behind those sentences are a *documented interpretation* (recorded in D-G's amendment), not ticket text.

**D-H** — rulings #2–#9, verbatim in the register: self-hosted OAuth2 code+PKCE behind a BFF cookie (#2); 8 h idle / 12 h absolute sessions, logout destroys the row (#3); NCSC-style password policy — min 12, no composition rules, no forced rotation, deny-list, rate-limited (#4); admin-initiated reset in v1, email self-service as fast-follow (#5); minimal admin UI of exactly four actions (#6); MFA as fast-follow on the LER-1189 security-review checklist (#7); the sensitive-material grant stacks on Senior Solicitor and Paralegal only (#8); bypass oversight is a read-only listing with verbatim reasons, no approve/reject (#9 — Husnain's open Q8 linkage noted in the register).

## What was built (commit by commit)

| Commit | Content |
|---|---|
| `c95143c` | Planning pack (`docs/usecases/release-01-auth/`): epic, 14-section PRD, three stories, human-instructions, the nine open questions. |
| `e182480` | Register: D-G amendment + D-H, rulings verbatim. |
| `85e352d` | **A0 — the e2e seam, its own commit, zero behaviour change.** All 15 specs converted to a single `support/auth.ts` seam while the old `x-user-email` header still worked. Suite green before and after — the migration mechanics are auditable separately from the auth switch. |
| `fc8811e` | **Stage A** — `libs/shared/src/lib/access-control.ts` (capability model as data: `ROLE_CAPABILITIES`, `capabilitySetOf`, `grantAssignableTo`), 9 unit tests pinning the matrix as properties, Prisma schema (Role, UserRole, PasswordCredential, AuthSession, AuthCode; migration `20260826174016_release01_auth_rbac`), credentialed seeds. |
| `316e336` | **Stage B** — the auth boundary: PKCE login/exchange, server-side sessions, Argon2id, CSRF, `SessionAuthGuard` + `CapabilityGuard` as global `APP_GUARD`s, `@Requires` on every content route, `assertBoundaryComplete` boot refusal, admin surface (four actions), oversight listing, 8 new audit actions, helmet. |
| `8d06125` | **Stage C client** — login page (PKCE via `crypto.subtle`), forced-change page, minimal admin page, 401 interceptor, logout, capability-gated nav. |
| `5b40bf1` | **Stage C e2e** — global-setup logs in five fixture users, per-call header seam goes live, `release01-auth.spec.ts` (14 tests), `FIXTURES.md` users table. |
| `7e967d1` | **Harness fix the battery caught** — page identity rides the cookie jar (`pageAs()`), probe emails lowercased to match the store. Details below. |

## Architecture (ruling #2 as shipped)

OAuth2 authorization-code + PKCE (S256) with the API as its own authorization server for exactly one first-party client, delivered BFF-style:

1. `POST /api/auth/login` (public) — email + password + codeChallenge → 60 s single-use code. Failures are content-free and **identical** for wrong-password and unknown-user (comparable-time hashing burns the timing oracle); 5/min/email rate limit; every failure audited by id.
2. `POST /api/auth/token` (public) — code + verifier → server-side `AuthSession` row; browser gets HttpOnly `mgs_sid` (Secure in production, SameSite) plus a readable `XSRF-TOKEN` cookie. **Tokens never reach browser JS.**
3. Every other route: `SessionAuthGuard` (cookie → session with idle/absolute expiry and revocation) then `CapabilityGuard` (`@Requires` metadata vs. the user's role-derived capability set). Mutating verbs also require `X-XSRF-TOKEN` to match the session's per-session CSRF secret.
4. `assertBoundaryComplete` walks every registered route at boot and **refuses to start** if any route is neither `@Public`, `@Requires`-declared, nor on the three-entry session-only allowlist (`me`, `auth/logout`, `auth/change-password`). A new endpoint cannot ship undeclared.
5. Passwords: Argon2id; policy per ruling #4 enforced everywhere a password is set. Admin reset (ruling #5) issues a single-use temporary password, sets `mustChange`, revokes the subject's live sessions, and audits both ends; a `mustChange` session is confined to change-password + logout.

`/api/health` stays public by construction — it is a raw express route mounted before Nest's router.

## Endpoint requirements as shipped

| Route | Requirement |
|---|---|
| `POST /auth/login`, `POST /auth/token` | `@Public` (the only two) |
| `GET /me`, `POST /auth/logout`, `POST /auth/change-password` | session only |
| `GET /form-templates*` | `forms.read` (controller-level) |
| `GET /cases*` | `cases.read` (controller-level) |
| `POST /language/*` | `forms.edit` (controller-level) |
| drafts: create, PATCH, autofill, language-insert, review, sensitive confirmations | `forms.edit` |
| drafts: list, get, non-sensitive-schedule export | `forms.read` |
| drafts: finalise, reopen | `forms.finalise` |
| documents: PDF + pdf-jobs (generation) | `documents.generate` |
| documents: meta, preview, download, DOCX | `documents.read` |
| archive: case documents, list, versions, diff | `archive.read` |
| archive: link | `archive.link` |
| `GET /oversight/bypasses` | `oversight.bypasses` (ruling #9: read-only, verbatim reasons, no approve/reject) |
| `/admin/users` (list, create, roles, grant, password-reset — exactly the ruling-#6 four actions) | `admin.users` |

Administrator holds `admin.users` **only** — no content capability exists on the role, and the spec proves the 403s route-by-route.

## Tested properties (not just examples)

`e2e/release01-auth.spec.ts` — 14 tests:

- **401 matrix**: twelve endpoints anonymous → 401; tampered cookie → 401; `/api/health` is the only anonymous 200.
- **Admin cannot read content**: six content GETs + a create as `admin.e2e@` → all 403; `/admin/users` → 200.
- **Read-Only 403 matrix**: every write capability denied, each message naming the missing permission.
- **Paralegal matrix**: cannot finalise/reopen/oversight/admin; CAN generate a document on their **own** draft (201).
- **Ruling #8 at the API**: grant on Read-Only → 409 (`grantAssignableTo`); on Paralegal → 200, then revoked.
- **Ruling #5 end-to-end**: reset → temp password → `mustChange` confinement → change → old sessions revoked.
- **Content-free failures**: wrong-password and unknown-user byte-identical; rate limit after 5.
- **CSRF negatives**: missing and forged header → 403 on writes; reads unaffected.
- **Logout revokes**: the session cookie is dead server-side afterwards.
- **UC-07 unchanged**: `colleague` (Senior Solicitor, no grant) still 403s on sensitive confirmations — the grant predicate is untouched by RBAC.

**The UC-07 matrix re-passed with unchanged semantics**, and the pre-existing 267 checks passed through real authentication with **zero handler changes** — the A0 seam swap-point promise, verified.

## E2E migration account

The 267-check migration was **its own commit (A0) before any behaviour change**, per the standing rule. Two gotchas worth the audit trail:

- Inside a Playwright worker, `request.newContext()` **inherits the config's `storageState`** — the spec's "anonymous" contexts silently carried the demo session and the 401 matrix saw 200s. Every self-built context now passes an explicit empty `storageState`; pinned in comments in the spec.
- A browser page's **cookie jar outranks a hand-set `Cookie` header**, so the suite's only two page-level colleague swaps (UC-07 locked section, UC-08 jump-to-blocked-target) silently stayed signed in as demo — the pre-PR battery caught it as a deterministic 279/281 ×3. `pageAs()` in `e2e/support/auth.ts` now swaps the jar itself; the same battery pass also caught the spec's probe-user leak (uppercase RUN nonce vs. the API's lowercased emails — afterAll's case-sensitive match stranded three users per run). Both fixed in `7e967d1`, and the battery's baseline check now also asserts exactly 5 users / 0 sessions.

## Battery (pre-PR)

Gates: unit **157/157** (148 + 9 access-control) · conformance **68 self-tests, 0 failures** · orphan-scan **clean** · pii-scan **clean**.
Suite: **281 checks** (267 + 14 auth) — dev.db leg 1: **281 passed (11.3m)**, leg 2: **281 passed (11.2m)**, fresh throwaway DB: **281 passed (11.4m)**. dev.db baseline `35 drafts / 76 audit / 0 acks / 0 docs / 0 jobs / 0 archived versions` **plus 5 users / 0 sessions** verified before and restored after every leg (auth residue — sessions, codes, non-fixture users, and the eight new audit actions — swept per leg).

## Deviations & not-built (flagged, not hidden)

- **helmet ships with `contentSecurityPolicy: false`** — a real CSP needs an Angular-compatible policy designed, not a checkbox; deferred and recorded here rather than shipping a broken default.
- **Rate limiter is in-memory** — correct for the single-instance Railway shape; a multi-instance future moves it to the database (noted in the source).
- **`DEV_PASSWORD` in `seed.js`** is a documented dev/e2e fixture credential, not a production secret; production provisioning goes through the admin create flow (temporary password + forced change).
- **Not built by ruling**: MFA (#7 — on the LER-1189 security-review checklist), email self-service reset (#5 — fast-follow), any approve/reject on bypass oversight (#9 — read-only listing only).
- **tasks-ml agentMode defect**: LER-2439/2440/2441 landed `agentMode: true` (known field-specific write defect) — manual UI toggle chore, queued with the UC-10 batch.

## Verification for the reviewer

```bash
npm run test:unit      # 157 passing, incl. the 9 access-control property tests
npm run conformance    # 68 self-tests
npx playwright test    # 281 checks; global-setup logs the fixture users in
```

Boot proof: comment out any `@Requires` line and `npm run dev` refuses to start, listing the undeclared route.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
