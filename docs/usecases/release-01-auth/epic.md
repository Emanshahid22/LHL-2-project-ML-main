# Release 01 — Authentication & RBAC — Epic

## Epic

Real login replaces the demo header shim; roles become data (D-G); every
endpoint's requirement is declared and enforced at the API — one public
route, everything else guarded by default.

## Overview

The build phase shipped ten use cases behind a deliberate auth stub: a
global guard trusting an `x-user-email` header, with every handler already
scoped to `req.user` so the swap to real auth needs no downstream change.
Release stage 1 makes that swap: OAuth2 authorization-code + PKCE against
a self-hosted first-party authorization module, BFF cookie sessions,
Argon2id credentials, a data-driven role model per D-G (Solicitor, Senior
Solicitor, the stackable Sensitive Material Access grant, Admin — with the
LER-1014 four-role reconciliation as the top open ruling), and
guard-by-default API-boundary enforcement with `GET /api/health` as the
only public endpoint. Existing predicates keep their meaning: the
sensitive grant IS the UC-07/09/10 predicate made assignable; CaseAccess
stays the UC-10 read scope.

## Business Value / Goal

A defence-solicitor tool holding MG6D material cannot ship behind a
header-trusting stub. Stage 1 turns the platform's implicit identity into
real authentication and turns the existing permission predicates into an
administered model — without rewriting any of the ten delivered use
cases, because the boundary was designed for this swap. LER-1015's own
words are the goal: a client-side defect cannot expose protected material.

## Scope

- OAuth2 code+PKCE login, BFF cookie sessions, logout, session expiry,
  login rate-limiting, CSRF posture, security headers (LER-1013).
- Data-driven roles + the stackable sensitive grant, admin surface for
  users/roles/grants pending ruling #6 (LER-1014, D-G).
- Guard-by-default with a declared requirement per endpoint, one public
  route, build-time completeness check (LER-1015).
- e2e auth helper + fixture users; migration of all 267 existing checks;
  the new 401/403/escalation/admin-separation matrices.
- Out of scope: managed IdP, MFA (ruling #7), email self-service reset
  (ruling #5), multi-tenancy.

## User Stories

One per client ticket: `stories/LER-1013.md` (OAuth2 authentication),
`stories/LER-1014.md` (RBAC roles), `stories/LER-1015.md` (API-boundary
enforcement). Delivering tickets to be created after pack review, mapped
1:1 (the UC-05/06 lesson: deliver against the client's keys).

## Epic-level Acceptance Criteria

- No endpoint reachable without a valid session except `GET /api/health`
  (401 matrix proves it endpoint-by-endpoint).
- Role×endpoint 403 matrix matches PRD §5's table exactly.
- ADMIN cannot read case content, drafts, documents, archive or sensitive
  exports (D-G4, tested).
- The sensitive grant remains the single UC-07/09/10 predicate — the
  UC-07 matrix re-passes under real roles with zero semantic change.
- All 267 existing checks pass authenticated via the helper; zero handler
  changes (the swap-point promise, verified).
- Historical audit rows unchanged; every admin mutation audited.

## Dependencies & Risks

- Stacks on `mgs/layout-verification-d-f` (D-F; merge first).
- e2e migration breadth is the main mechanical risk (every suite's
  request context); the COLLEAGUE header pattern maps to a logged-in
  colleague context.
- Argon2 native build on Railway/CI; cookie Secure behind Railway's proxy.
- Nine human rulings flagged in `open-questions.md` — #1 (role list)
  blocks the seed; #5 (reset channel) and #6 (admin in v1) shape scope.
