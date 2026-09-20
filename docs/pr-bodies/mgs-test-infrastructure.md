# test(infrastructure): unit tranche 1 (111 tests, seconds not minutes) + the database guard

**Branch** `mgs/test-infrastructure` → `ali-zulqarnain/mgs-forms` · **Stacked on
`mgs/build-safety-net` — merge that first** (the CI step slots into its pipeline, and the
import-the-dist design leans on its `noEmitOnError`).

Two additions with one theme: gates that cannot be silently violated.

## 1. Unit tests — tranche 1, `libs/shared/test/`

The project had 217 browser checks and zero unit tests — an inverted pyramid where a redaction bug
needed an eight-minute run to catch. This adds **111 tests that run in ~0.4 s** using Node's
built-in runner (`node --test`, `node:assert/strict`): **no Jest, no Vitest, no new dependency, no
config** — Node >= 20 is already the engine floor.

- `quality-check.test.mjs` (54), `sensitive-material.test.mjs` (27), `validation.test.mjs` (30) —
  what each guards is in `libs/shared/test/README.md`, highlights: both sensitive-wording hash pins
  recomputed live; the severityFor provenance cap tested hard (an unsourced format must never reach
  error — rule 1's runtime half); the acknowledgement cap inclusive at 500 and exclusive at 501;
  CSV export exclusion with `__id` never leaking.
- Tests import **the built dist** — deliberately (they test what ships; `noEmitOnError` means a
  type error can no longer emit a dist they would bless). The stale-dist dependency this creates is
  stated in a header comment on every file, in the README, and on the CI step.
- **Additive**: no e2e check was deleted or weakened. The browser run proves the wiring; these make
  the logic fast to fix.
- `npm run test:unit` in root package.json; CI runs it **before the build** — a broken pure
  function now fails in seconds, not minutes.

**The tranche found three real library defects the 217 e2e checks never caught**, filed same day
with read-back (LER-1270 shape-only date validity — sharpened by the fact that a *passing* e2e
check says "an impossible date is rejected at input", so two layers disagree; LER-1271
display-labels keyed into acknowledgement issue ids — fails safe but keys a legal audit trail on
mutable strings; LER-1272 a half-filled sensitive schedule row reviews clean — High). The failing
reproductions ship as `validation-date-contract.bugs.test.mjs.draft` — the `.draft` suffix keeps it
out of the run; the fix PRs promote it and it must flip to passing.

**Tranche 2 is proposed, not built** (Ali's call) — the per-module property list is in the test
README.

## 2. The database guard — `e2e/db-guard.spec.ts`

On 24 Aug the throwaway-DB verification leg was found to have been **silently unreliable**: an
orphaned five-day-old dev server on :3000 was reused (`reuseExistingServer: true`) with its own
dev.db, while `db:setup` and the direct-SQLite helper honoured the run's `DATABASE_URL` — browser
checks green, every direct-DB assertion red, and the masking pipelines made even that look green
twice. Earlier PR bodies' throwaway claims are recorded as *uncertain* in HANDOVER §5.

A convention that can be silently violated is not a gate, so the invariant is now a test: the guard
creates a draft and saves through the API, then asserts the write is visible to the suite's
direct-DB reader — in every configuration. If an orphan server ever splits the API from the run's
database again, the suite fails at once with a message naming the cause and the fix, instead of 18
misleading "missing audit row" failures. Suite on this branch: 216 → **217**.

## A third face of the stale-dist gotcha, met while verifying this PR

`libs/shared/dist` is gitignored, so it survives **branch switches** carrying the previous branch's
build — and the root `npm run build` builds api+web only (postinstall is what builds shared). This
branch's first gate run failed exactly one test because the API was serving the *previous* branch's
MG11 (with its new verification marker) against this branch's expectations. The known gotcha said
"after any libs/shared change, rebuild and curl"; the precise rule is **a branch switch IS a
libs/shared change** — `npm run build -w @mgs/shared` after every checkout that moves the base.
(The unit tests were re-run against the correctly rebuilt dist: still 111/111.)

## Verification

- `npm run test:unit` — **111/111 in ~0.4 s**.
- The guard proven both ways: green against a correct stack; red-path exercised manually by
  pointing `DATABASE_URL` at a second database while the API held the first (fails with the
  guard's message, not a generic timeout).
- Both builds, conformance 68/68, orphan-scan clean; full Playwright suite ×2 on dev.db + ×1 on a
  freshly seeded throwaway DB (fresh servers, pipefail) — results quoted in the PR conversation,
  and the throwaway leg now carries the guard it was missing.
