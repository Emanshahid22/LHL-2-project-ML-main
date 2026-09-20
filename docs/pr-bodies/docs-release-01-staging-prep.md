# Staging prep — runbook, UAT, readiness & handover skeletons, seed safety (D-I)

**Branch:** `docs/release-01-staging-prep` → `ali-zulqarnain/mgs-forms`
**Scope: documentation plus exactly ONE code change** (the D-I seed path). **No Railway action has
been taken** — the runbook is prepared, not executed; Ali approves the deploy separately after
this merges.

## The four documents

| Document | What it is |
|---|---|
| `docs/deployment/release-01-staging-runbook.md` | The exact redeploy runbook: env vars (`DOCUMENT_MASTER_KEY` with its boot-refusal shape check, `DOCUMENT_STORE_DIR=/data/documents`, `SEED_USER_PASSWORD`, `NODE_ENV` verification), Chromium on the image (nixpacks + `CHROMIUM_EXECUTABLE`; the current image has no browser), additive migrations, post-deploy verification, UAT gate, basic-auth retirement only after UAT, rollback incl. the re-add-the-shim-before-rolling-back trap. |
| `docs/release/uat-script.md` | Ali's 30–45 min UAT: five blocks, ~30 steps, every UC end-to-end through real login, explicit expected result and pass/fail space per step; sign-off gates basic-auth retirement. |
| `docs/release/release-readiness-report.md` | Skeleton, one section per LER-1187–1193, each with planned checks and a pre-committed honest depth statement (checklist review ≠ pen test; single-user timings ≠ load test; heuristic a11y ≠ WCAG certification). |
| `docs/release/handover.md` | LER-1196 skeleton: admin guide, user guide, ops-runbook consolidation, and the ordered fast-follow list (MFA, email reset, CSP, DB rate limiter, CI parallelisation, full-depth QA, practitioner ratification queue, the 18 remaining pre-pivot backlog tickets with a triage-don't-build note). |

One honest correction inside the runbook: **`SESSION_SECRET` is not a real variable** — no code
reads one. Sessions are opaque server-side rows and CSRF secrets are per-session rows; the runbook
says "do not set" rather than inventing a knob.

## The one code change — seed safety (D-I, provisional)

`apps/api/prisma/seed.js` honours `SEED_USER_PASSWORD`: when set, every fixture credential is
created with that value and **`mustChange: true`** — first sign-in forces a real choice, and the
documented dev credential never works in the environment. When unset, dev/e2e behaviour is
unchanged. The seeded administrator then provisions real users through the ruled admin surface
(temporary password + forced change, both audited). Recorded as **D-I** in
`docs/decisions/provisional-decision-register.md` (PROVISIONAL, Ali's authority, ratification
queued).

**Proof:**
- Both paths seeded onto throwaway DBs — unset: 5 credentials, `mustChange` all false, dev
  password verifies, other refused; set: 5 credentials, `mustChange` all true, the set password
  verifies, the dev password refused.
- Unit suite 157/157; `release01-auth.spec.ts` 14/14 against the unset path (all five fixture
  logins through the real PKCE flow).
- The credential upsert's empty `update` clause keeps both paths idempotent across reboots — an
  existing credential row is never overwritten.

## After merge

Execution of the runbook is a **separate approval** — nothing deploys from this PR. The tracker
work for LER-1194/1195/1196 fills these skeletons as each pass actually runs.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
