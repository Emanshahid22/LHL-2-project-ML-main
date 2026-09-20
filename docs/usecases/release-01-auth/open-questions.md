# Release 01 (Auth & RBAC) — open questions and human rulings

_Flagged at planning, before any code (the LER-1200 lesson). Numbered for
the register and the eventual PR body._

## 1. Role list: D-G's model vs LER-1014's four named roles — TOP ruling

LER-1014 says *"Administrator, Senior Solicitor, Paralegal and Read-Only —
Four roles per scope document"*; the public scope document contains **no
role list** (verified 26 Aug). D-G directs Solicitor / Senior Solicitor /
stackable sensitive grant / Admin. Because roles are data (D-G's reversal
path), the build seeds capability sets and the ruling only names rows.
Proposal on the table: ship FOUR rows honouring the ticket's names —
Administrator (=D-G Admin), Senior Solicitor (=D-G2), **Paralegal**
(=D-G Solicitor minus `forms.finalise` — drafting under supervision),
**Read-Only** (read capabilities only) — with "Solicitor" as either a
rename of Paralegal+finalise at ratification or a fifth row. **Needs
Ali's ruling before the seed is written.**

## 2. OAuth2 shape — veto point

Recommended: self-hosted authorization-code + PKCE (the API as its own
first-party authorization server), BFF cookie sessions, tokens never in
browser JS (PRD §4, trade-offs stated). Alternative: managed IdP (cost,
external dependency, law-firm directory residency). Veto or confirm.

## 3. Session lengths

Proposal: 15-minute activity window on the session touch, 8-hour idle
timeout, 12-hour absolute, single-session-per-user OFF (solicitors use
multiple devices). Confirm or amend.

## 4. Password policy strength

Proposal (NCSC-style): minimum 12 characters, no composition rules, deny
known-breached passwords (offline top-100k list shipped in-repo), no
forced rotation, rate-limited attempts. Confirm or amend.

## 5. Password reset channel — blocker for self-service reset

No SMTP/email service exists in this deployment. v1 proposal:
**admin-initiated reset** (admin sets a one-time password, user must
change at next login). Self-service email reset needs an email-provider
decision (cost + config). Rule which ships in v1.

## 6. Admin existence in v1 vs seed-only provisioning

Ali's own question: ship the ADMIN role + /admin endpoints in v1, or
provision users by seed only initially (admin surface deferred)? The PRD
plans the admin surface; striking it shrinks stage 1 materially. Rule.

## 7. MFA

Not in the tickets; flagged because a law firm handling MG6D material may
expect it at UAT. Fast-follow or v1? (v1 adds TOTP scope.)

## 8. Read-Only × sensitive grant

If Read-Only ships (see #1): can the sensitive grant stack on it (a
reviewer who may SEE MG6D but change nothing)? D-G says the grant stacks
on "either role" — written before Read-Only was on the table. Rule.

## 9. Advisory-bypass oversight surface

D-G2 gives Senior "visibility/oversight of advisory bypasses". Minimum
v1: a read-only listing of bypass acknowledgement records
(`oversight.bypasses`). Anything more (approve-before-finalise flows)
changes UC-08 semantics and is NOT planned — confirm the minimum is the
intent.
