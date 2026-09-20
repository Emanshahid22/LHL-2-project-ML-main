# Fix: /api/me is the mustChange session's state oracle — allow it

**Branch:** `fix/mustchange-me-oracle` → `ali-zulqarnain/mgs-forms`
**Found:** 27 Aug 2026, during the commissioned post-deploy UI login proof on staging —
the P1's immediate follow-up, same family (a state only staging exhibits, invisible to
logged-in/dev-seeded tests).

## The defect

After a successful login, the login page decides where to route by reading `/api/me`
(`mustChange` → `/change-password`, else `/`). But the session guard confined a `mustChange`
session to exactly `change-password` + `logout` — **including blocking `/api/me`** — so the
routing read failed with 403 and the page rendered "Set a new password to continue." as a *login
error*, stranding the freshly reset user on `/login`. The forced-change flow was unreachable
through the UI. Every earlier proof of ruling #5 was direct-API; local seeds carry
`mustChange: false`, so no UI test could hit it.

## The fix

`MUST_CHANGE_ALLOWED` gains `/api/me` (`session-auth.guard.ts`, with the reasoning in a comment).
A confined session may now do exactly three things: **learn its own state, change the password,
or leave.** `/api/me` returns only the caller's own identity, roles and flags — no content; every
content route stays confined. No test pinned the old behaviour (checked before changing).

## The regression net

New e2e test (suite 283 → **284**): an admin-created user with a temporary password drives the
**real form** — login lands on `/change-password` (the exact navigation the bug killed), the
change completes, and the session survives a reload signed-in. Self-cleaning (own afterAll).

## Verification

Auth spec 17/17 · full suite **284 passed (11.3 m)** · units **157/157** · dev.db baseline restored.
Root-caused live on staging: `POST /auth/login` 201 → `POST /auth/token` 201 → `GET /me` **403
"Set a new password to continue"** → stranded on `/login` with that text as the visible error.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
