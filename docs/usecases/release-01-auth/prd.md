# Release 01 — Authentication & RBAC — PRD (as planned)

_Written before the build (release-phase stage 1, plan-first). Deviations
land in the PR body; this file is not rewritten. Decision basis: D-G
(`docs/decisions/provisional-decision-register.md`), PROVISIONAL._

## 1. Summary

Replace the demo auth shim with real authentication (OAuth2
authorization-code + PKCE against a self-hosted, first-party authorization
module, delivered through a BFF cookie session), a data-driven role model
(D-G), and API-boundary enforcement with a single explicit public
allowlist. The existing predicates keep their meaning: `sensitiveMaterialAccess`
remains the UC-07/09/10 grant (now assignable), `CaseAccess` remains the
UC-10 read scope, and every endpoint's requirement is declared in one
table. Roles are data; the client can rename or amend at ratification.

## 2. Scope requirements (verbatim)

The three client tickets, in full:

> **LER-1013 — OAuth2 authentication.** Login, session and token handling.
> Foundation for all access control.

> **LER-1014 — RBAC roles.** Administrator, Senior Solicitor, Paralegal
> and Read-Only. Four roles per scope document.

> **LER-1015 — API-boundary enforcement.** All authorisation checked at
> the API, never in the interface. A client-side defect cannot expose
> protected material.

The public scope document's own auth text (verified 26 Aug 2026): the
pre-condition *"User is authenticated on the platform"*; UC-07's
permission-level flow (*"section locked; user shown a message identifying
the required permission level and who in their firm has it"*) and its
access-logging line. **It contains no role list, no OAuth detail, no
password policy** — LER-1014's four-role list exists only in the ticket.
The D-G ↔ LER-1014 divergence is recorded in the register and is
open-questions #1.

## 3. What already exists

- **A deliberate swap point**: global `APP_GUARD` → `DemoAuthGuard`
  (x-user-email header shim), documented as replaceable "with real
  session/JWT auth" with **no downstream changes** — every handler already
  works from `req.user` via `@CurrentUser()`.
- `User` model: email (unique), name, `sensitiveMaterialAccess` boolean —
  already the UC-07/09/10 predicate (write gate, render redaction,
  serve-time re-check, diff redaction). `CaseAccess` — already the UC-10
  read scope. No password, session, or role storage exists.
- `/api/health` (public-worthy) currently passes through the demo guard.
- e2e: 267 checks authenticate implicitly (default demo user) or via the
  `x-user-email: second.solicitor@…` header (the COLLEAGUE pattern) —
  both must migrate to a real auth helper.
- Staging: Railway basic-auth in front of the app; `DOCUMENT_MASTER_KEY`
  env secret discipline already established.

## 4. Mechanism

**Authentication (LER-1013) — recommended shape, flagged for veto
(open-questions #2):** a self-hosted OAuth2 **authorization-code + PKCE**
flow in which the Nest API is its own authorization server for exactly one
first-party client (the Angular app), delivered in the **BFF pattern**:
the code exchange happens server-side, tokens never reach browser
JavaScript, and the browser holds only an HttpOnly `Secure`
`SameSite=Lax` session cookie referencing a server-side session row.
Access "token" lifetime 15 minutes (session-row touch), rotating refresh
up to the idle/absolute limits (open-questions #3); logout revokes the
session row and clears the cookie. Passwords: Argon2id hashes in a
separate `PasswordCredential` table; policy per open-questions #4
(NCSC-style proposal on the table); reset flow gated on the email-channel
ruling (open-questions #5 — no SMTP service exists today; v1 proposal is
admin-initiated reset).

*Why not the alternatives:* a **managed IdP** (Auth0/Entra) adds a paid
external dependency and puts a law firm's user directory in a third party
— viable later, rejected for v1 on the stated no-IdP-budget assumption
(veto point). A **plain cookie login without OAuth2 semantics** would be
simpler but LER-1013's own words are "OAuth2 authentication" and the
ticket is the contract (the D-C logic); code+PKCE against our own AS
honours the words without inventing a token economy the SPA doesn't need.

**RBAC (LER-1014, D-G):** roles are **data** — `Role` and `UserRole`
tables seeded from D-G's model, with capability sets resolved through one
shared, unit-testable mapping (`libs/shared`): capabilities like
`forms.edit`, `forms.finalise`, `documents.generate`, `archive.link`,
`admin.users`, `oversight.bypasses`. `SENSITIVE MATERIAL ACCESS` stays the
existing boolean **grant** (D-G3) — assignable via admin, stackable on any
role, feeding the unchanged UC-07/09/10 predicates. ADMIN holds
`admin.users` and NOTHING content-bearing (D-G4, separation of duties;
tested). The LER-1014 four-role list is reconciled at ratification by
renaming/adding role rows — no code change (D-G's reversal path).

**API boundary (LER-1015):** the global guard chain becomes
`SessionAuthGuard` (401 without a valid session) + `CapabilityGuard`
(403 without the endpoint's declared requirement) — guard-by-default;
`@Public()` on exactly one endpoint: `GET /api/health`. Every endpoint's
requirement is declared next to the handler and mirrored in §5's table;
a new conformance-style check fails the build if an endpooint lacks a
declaration (no accidental default-open or default-capability routes).

## 5. API surface — the endpoint requirement table

New endpoints: `POST /auth/login` (public — starts code+PKCE),
`GET /auth/callback` (public), `POST /auth/logout`, `GET /api/me`
(session), `POST /admin/users`, `PATCH /admin/users/:id/roles`,
`PATCH /admin/users/:id/grants`, `GET /admin/users` (all `admin.users`),
`POST /admin/users/:id/password-reset` (admin.users; v1 reset channel).

Existing endpoints (requirement = capability; SENS = the sensitive grant
where marked; ownership/case scoping stays as built):

| Endpoint | Requirement |
|---|---|
| GET /api/health | **public (the only one)** |
| GET /api/me | any authenticated session |
| GET /form-templates, /form-templates/:code | `forms.read` |
| GET /cases, /cases/:id | `cases.read` (+ CaseAccess row) |
| GET /cases/:id/documents | `archive.read` (+ CaseAccess) |
| POST /drafts · PATCH /drafts/:id · POST :id/autofill | `forms.edit` |
| GET /drafts, /drafts/:id | `forms.read` (owner-scoped as built) |
| POST /drafts/:id/review | `forms.edit` |
| POST /drafts/:id/finalise | `forms.finalise` (bypass records visible to `oversight.bypasses` — D-G2) |
| POST /drafts/:id/reopen | `forms.finalise` |
| POST /drafts/:id/language-insert | `forms.edit` |
| POST /drafts/:id/sensitive/confirmations | `forms.edit` + SENS (unchanged 403 path) |
| GET /drafts/:id/export/non-sensitive-schedule | `forms.read` |
| POST /drafts/:id/pdf · GET /pdf-jobs/:id | `documents.generate` |
| GET /documents/:id (+preview/download/docx) | `documents.read` (+ ownership/CaseAccess as built; SENS re-check unchanged) |
| GET /archive · /archive/lineages/:id/versions · /diff | `archive.read` (owner/case scope as built; diff redaction unchanged) |
| POST /archive/lineages/:id/link | `archive.link` |
| POST /language/prompts | `forms.edit` |
| POST /admin/* | `admin.users` (and NO content capability — D-G4) |

Role → capability seed (D-G; final names per open-questions #1):
SOLICITOR = forms.\*, documents.\*, archive.\*, cases.read ·
SENIOR SOLICITOR = SOLICITOR + oversight.bypasses ·
ADMIN = admin.users ONLY · (ticket's Paralegal/Read-Only: proposed as
data rows pending #1 — Paralegal = SOLICITOR minus `forms.finalise`;
Read-Only = `forms.read`+`cases.read`+`archive.read`+`documents.read`.)

## 6. Data Model & Schema

Additive only: `Role {id, name, capabilitiesJson}` · `UserRole {userId,
roleId}` · `PasswordCredential {userId, argon2Hash, updatedAt}` ·
`AuthSession {id, userId, createdAt, lastSeenAt, expiresAt, revokedAt,
csrfSecret}` · optional `AuthCode {code, pkceChallenge, userId, expiresAt}`
for the code+PKCE hop. `User` gains nothing destructive;
`sensitiveMaterialAccess` remains the grant column. **No audit-row
rewrites: historical rows keep their demo-era identity** (the demo user
rows become real users with credentials; ids unchanged).

## 7. Data Flow & Integrations

Login page (Angular) → `/auth/login` (PKCE) → local credential check →
`/auth/callback` sets the HttpOnly session cookie → SPA calls carry the
cookie + CSRF header on mutations. No third-party integration; the
language-assistance proxy and tasks-ml are untouched. Audit gains
`USER_LOGIN`, `USER_LOGOUT`, `LOGIN_FAILED` (content-free), `USER_ROLE_CHANGED`,
`GRANT_CHANGED` (admin writes — the trail stays writes-only).

## 8. Client

Login screen (email+password → PKCE flow), logout in the app bar, session-
expired interceptor (401 → login), 403 surfaces the API's content-free
reason (the UC-07 pattern generalised). Role-aware presentation is
COURTESY ONLY (hide admin nav for non-admins etc.); the API refusing is
the enforcement — stated in code exactly as UC-10 stage 3 did.

## 9. Security & Performance

Argon2id (memory-hard) credentials; constant-time comparisons; login
rate-limit + content-free failures; HttpOnly/Secure/SameSite=Lax cookie +
per-session CSRF secret (double-submit header) for mutations; helmet-set
security headers (CSP report-only first); session rows indexed for O(1)
lookup; cookie secret/OAuth signing key as Railway env secrets ALONGSIDE
`DOCUMENT_MASTER_KEY` (same discipline, never in the repo); Railway
basic-auth retired only when the login flow is proven on staging.
Admin/content separation (D-G4) is a tested property, not a convention.

## 10. Failure modes

Wrong password / unknown user → identical content-free 401 + LOGIN_FAILED
audit (no user-existence oracle). Expired/revoked session → 401, SPA
returns to login, drafts autosave state preserved client-side until then.
CSRF mismatch → 403 content-free. Missing capability → 403 naming the
required capability level (the UC-07 message pattern — level, never
content). Guard-declaration missing on a new endpoint → build-time check
fails (no silent default). Session store unavailable = SQLite unavailable
= the app is down anyway (no split-brain).

## 11. Business rules

Guard-by-default; one public endpoint; roles are data (D-G reversal);
the sensitive grant never travels with any role automatically — explicit
per-user assignment only (including Senior Solicitor: seniority ≠
clearance); ADMIN cannot read case content, drafts, documents or the
archive (D-G4); every admin mutation audited; bypass acknowledgement
records become visible to `oversight.bypasses` holders (D-G2) — a READ
surface, so it is scoped, not audited (writes-only trail unchanged).

## 12. E2E plan

- **Auth helper** (`e2e/support/auth.ts`): programmatic login returning an
  authenticated request context/cookie; per-suite **fixture users**
  registered in `e2e/FIXTURES.md` (the LER-1269 discipline extended to
  users): `solicitor.e2e@`, `senior.e2e@`, `admin.e2e@`, `readonly.e2e@`,
  plus sensitive-grant variants — seeded for dev/e2e.
- **Migration of the existing 267**: the default context logs in as the
  demo solicitor (now a real seeded credential); every `x-user-email:
  second.solicitor@…` COLLEAGUE usage migrates to a logged-in colleague
  context. The demo guard's swap-point promise is verified, not assumed:
  zero handler changes expected — any handler change discovered = stop and
  report.
- **New checks**: 401 matrix (no/expired/revoked session on a sample of
  every controller); 403 role×endpoint matrix from §5's table;
  privilege-escalation attempts (non-admin PATCHes roles/grants → 403 +
  no write); **admin-cannot-read-content** (admin session → cases, drafts,
  documents, archive, sensitive exports all 403); grant stacking (UC-07
  matrix re-run under real roles); login rate-limit; CSRF negative;
  logout invalidates; session expiry.
- **Unit**: the shared role→capability mapping and guard predicates
  (pure, in `libs/shared`) — matrix-tested like `shouldMintVersion`.

## 13. Dependencies, Risks & Rollout

Depends on D-B/D-F branches merging first (this branch stacks on D-F).
Risks: e2e migration breadth (every suite touches the auth helper — the
biggest mechanical cost; mitigated by the swap-point design); Argon2
native dependency on Railway build (verify in CI early); cookie behaviour
behind Railway's proxy (Secure + trust proxy). Rollout: staging first with
Railway basic-auth still in front, then retire basic-auth (a deploy task,
recorded like UC-09's). Render path untouched — **no baseline change
expected; if any arises, stop and report (recapture is CI-only)**.

## 14. Out of scope / deferred

Managed IdP / SSO federation; email-channel-dependent self-service
password reset (pending #5); MFA (flagged as a natural fast-follow for a
law firm — ruling #7); org/team multi-tenancy; API keys for
machine-to-machine; session device management UI; retiring the
`x-user-email` shim from HISTORY (it dies with the demo guard).
