# libs/shared unit tests

Node's built-in runner (`node --test`, `node:assert/strict`), plain `.test.mjs`, **no test
framework dependency** — Node >= 20 is already the engine floor. Run with `npm run test:unit`
(seconds), or a single file with `node --test libs/shared/test/<file>`.

**The tests import `../dist/index.js` — the built library — deliberately.** They test what actually
ships, which pairs with `noEmitOnError` (a type error can no longer emit a dist these tests would
then bless). The flip side: they depend on the root `postinstall` building `libs/shared`. If that
postinstall is ever removed, these tests silently run against a **stale dist** — the MG6/35-fields
trap. CI builds before running them; locally run `npm run build -w @mgs/shared` after any src
change.

Unit tests here are **additive to the e2e suite, never a replacement**: the browser run proves the
wiring, these make the logic fast to fix. No e2e check is deleted or weakened because a unit test
covers the same case.

## Tranche 1 (24 Aug 2026) — 111 tests

| File | Tests | Guards |
|---|---|---|
| `quality-check.test.mjs` | 54 | all four review checks, severity sides, issue-id derivation, the timeout's `incomplete`-blocks-finalisation half, `unacknowledgedAdvisories` (500-char cap inclusive/exclusive), `assembleReport`, `isFinaliseRequest` |
| `sensitive-material.test.mjs` | 27 | both wording-hash pins recomputed live with node:crypto, redaction (remove-not-blank), dormant-section normalisation, CSV export exclusion + RFC 4180 quoting + `__id` never leaking, confirm-request shape |
| `validation.test.mjs` | 30 | the severityFor provenance cap hard (an unsourced format must NEVER reach error — pinned to exactly email+telephone today), every registry format's pass/fail table, requiredWhen, cross-field ordering, ambiguity suppression, validateForm ordering determinism |

`validation-date-contract.bugs.test.mjs.draft` fails **by design** — it reproduces LER-1270 (shape-only
date validity) and LER-1271 (display label in `relatedFieldId` on the failed branch). The `.draft`
suffix keeps it out of the `*.test.mjs` glob; the fix PRs promote it to a real test file, where it
must flip to passing. LER-1272 (half-filled sensitive row reviews clean) was also found here and is
ticketed.

## Tranche 2 — proposed, not built (Ali's call)

- **completeness.ts** — threshold banding boundary-exact per band (4/5 complex, 2/3 standard, 0/1
  summary_only); unknown complexity never flags and reports `threshold: null`; the trigger union
  (finalising always runs, ≥10 items runs bandless, a known band runs from 1 item);
  `COMPLETENESS_TRIGGER_ITEM_COUNT` pinned.
- **schedule.ts** — `moveRow` preserves `__id` and identity, out-of-range no-op, no input mutation;
  `findDuplicateReferences` reports the later row, trims/lowercases; `validateGroupValue` rejection
  reasons (missing/duplicate `__id`, unknown column — audit integrity); `isGroupValueComplete`;
  ordinal contiguity by construction.
- **narrative-flags.ts** — overlap resolution (earlier-longer wins, nested phrases never
  double-report); `segmentNarrative` reconstruction identity (the backdrop-alignment invariant);
  stateful `g` matchers reset between scans; `distinctFlaggedPhrases` normalisation.
- **autofill.ts** — derived-path ambiguity (two offence dates → `ambiguous` with counted reason;
  same-day → `value`); `no_data` vs `value` per direct path; ISO timestamp truncation; `charges`
  join order.
- **mg11-witness.ts** — `ageOnDate` birthday boundaries (eve = 17, day = 18, UTC; leap-day DOB);
  unusable dates → null → non-vulnerable, never a guess; both vulnerability routes; undated
  statement assessed as at today.
- Later slots: `template-conformance.ts` (the CI half of the severity cap) and
  `language-assistance.ts` (`canProposeVerbatim` — rule 10).
