# LER-1269: dedicated suite fixtures — the documented pattern

Branch `mgs/ler-1269-fixtures`, cut from `ali-zulqarnain/mgs-forms` @ `f9e1922` (the PR #185 merge).
Target: `ali-zulqarnain/mgs-forms`. One commit; six files (seed, three migrated suites, one derived
dashboard count, `e2e/FIXTURES.md`).

## What this settles

UC-08's cross-form Check 3 is case-wide by design, so any suite that persists case-divergent data
(an edited defendant name, a deliberately bad URN) poisons that case for every later reviewer.
UC-08 survived by hunting for "the last unpolluted case" (Sofia Renard) — LER-1269 recorded that as
debt, and this PR executes the decision by promoting the workaround into the pattern:

**A suite that WRITES case-divergent data owns a dedicated fixture case; no suite may read another
suite's fixture or depend on its leftovers.** The rules and ownership table live in `e2e/FIXTURES.md`.

## Changes Made

- **Seed** (`apps/api/prisma/seed.js`): four dedicated, clearly-commented fixture cases join the
  original five (all synthetic): **Theo Marchetti** (uc02's manual-edit + failed-autofill writers),
  **Isla Fenwick** (uc05's malformed-URN writers; single offence AND a hearing so both the ordering
  rule and the after-hearing advisory run on one case), **Rowan Ashcroft** (uc08's cross-form
  scenarios), and **Nadia Kowalczyk** — **RESERVED for UC-09 reference renders**, frozen by rule:
  nothing may write case-divergent values there, because pixel-diff baselines will be captured
  against it. The original five stay pristine for read-only use; Whitfield stays colleague-only.
- **uc02-autofill**: the two divergent writers move Foster → Marchetti (`Theo MARCHETTI (edited)`).
  Foster keeps its eleven read-only/autofill uses — autofill writes the case's own values, so it
  never diverges.
- **uc05-field-validation**: `singleOffenceCase()` moves Okafor → Fenwick; the after-hearing
  advisory moves Renard → Fenwick. Two hardcoded "corrected" dates that silently coupled to
  Okafor's 2025 calendar are now **derived from the fixture's own offence date** — the tests state
  their real dependency (a charge on/after the offence) instead of pinning a seed calendar.
- **uc08-review-quality**: all case-linked scenarios move Renard → Ashcroft; the "unpolluted case"
  comment becomes the pattern reference. Run-unique exhibit tokens stay — ownership isolates suites
  from each other, tokens isolate runs from their own history between cleanups.
- **dashboard**: the one pinned case count (`· 4`) becomes derived from `getCases()`, like the stat
  tile beside it already was.
- **Reference renders**: none captured — UC-09's baselines wait for this PR to merge, per the brief.

## Testing

```
npx playwright test                      219 passed  (dev.db, run 1 — after two honest failures
                                                      surfaced the hardcoded-date couplings, fixed
                                                      by deriving from the fixture)
npx playwright test                      219 passed  (dev.db, run 2)
npx playwright test                      219 passed  (freshly migrated + seeded throwaway DB)
npm run conformance                      EXIT=0  self-tests: 68 passed
npm run orphan-scan                      EXIT=0
npm run build (api + web)                EXIT=0
```

dev.db re-seeded in place (upserts; the 27 real drafts and 66 audit rows untouched, verified) and
restored to **27 / 66 / 0** after the runs.

## Checklist

- [x] Every write-bearing suite owns a dedicated fixture; ownership documented in e2e/FIXTURES.md
- [x] UC-09 render case reserved and frozen before any baseline exists
- [x] No suite reads another's fixture; read-only sharing of the original five stated as the rule
- [x] Date literals that coupled tests to a seed calendar replaced with derivations
- [x] Suite ×2 dev.db + ×1 fresh (219 each); all gates green; 27/66/0
- [x] Targets `ali-zulqarnain/mgs-forms`, not `main`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
