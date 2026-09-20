# Full-Stack / Codebase Task — Release 01: Authentication & RBAC

Real auth + data-driven RBAC + API-boundary enforcement over the
delivered ten-UC platform, per D-G (provisional register).

## Repos

- `consultancy-outfit/LHL-2-project-ML`; integration branch
  `ali-zulqarnain/mgs-forms` (repo `main` is a placeholder — never target).

## Git Workflow

- **Deviation (standard-stated):** stage-sized branch
  `mgs/release-01-auth-rbac`, not per-ticket; client keys LER-1013/1014/
  1015 delivered via stories and evidence comments.
- PR body at `docs/pr-bodies/mgs-release-01-auth-rbac.md`, committed on
  the branch AND printed in chat.

## Build Order

- **Deviation (standard-stated):** shared engine → API → UI.
- Stage A: shared capability model + role mapping (unit-tested), additive
  schema (Role/UserRole/PasswordCredential/AuthSession), seeds.
- Stage B: auth module (PKCE flow, session guard, CSRF), capability guard
  + per-endpoint declarations + build-time completeness check, admin
  surface (pending ruling #6).
- Stage C: Angular login/logout/interceptors, courtesy role presentation;
  e2e helper + suite migration + the new matrices.

## Backend Rules

- Additive-only schema; no audit-row rewrites (historical demo identity
  stays); every admin mutation audited (writes-only trail).
- Guard-by-default; `@Public()` on /api/health ONLY; an endpoint without a
  declared requirement fails the build, not the request.
- Content-free auth failures (no user-existence oracle); Argon2id;
  rate-limited login.
- The sensitive grant stays ONE column and ONE predicate — no forks.

## Frontend Rules

- Role-aware UI is COURTESY; the API refusing is the enforcement (say so
  in code). Tokens never in browser JS; the cookie is HttpOnly.
- Preserve every data-testid; new auth surfaces get their own.
- Design tokens only; amber advisory, red reserved for UC-07.

## Third-Party Integrations

- None. No managed IdP (ruling #2 veto point), no SMTP (ruling #5).

## Full-Stack Coordination

- The render path is untouched — NO baseline change expected; if one
  arises, STOP and report (recapture is CI-only, per PR #197).
- After libs/shared changes restart the API (stale-dist trap).
- Fixture USERS join e2e/FIXTURES.md with the same ownership discipline
  as fixture cases.

## PR Requirements (target: ali-zulqarnain/mgs-forms)

- Audit-ready body: D-G verbatim + provisional status, the LER-1014
  role-list conflict and its ruling outcome, the endpoint requirement
  table as shipped, the e2e migration account, battery numbers.
- Evidence comments per client key after push; flips only after merge.
- CI must be green before merge.

## Ground Rules

- dev.db baseline discipline (35/76/0/0/0/0 check, E2E_DRAFT_LOG,
  snapshot-guarded recovery); ports killed before fresh-DB legs;
  `set -o pipefail` on piped Playwright.
- Secrets never in the repo or chat: SESSION_SECRET / signing keys join
  DOCUMENT_MASTER_KEY as Railway env vars.
- tasks-ml: offset pagination, no dueDate, agentMode defect, read-back
  only verification.
- Nine open rulings (`open-questions.md`) go to the human queue at pack
  review — #1 blocks the role seed.
