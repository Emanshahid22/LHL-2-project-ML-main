# Pre-UC09 cleanup: UC-07 audit-count parity + PR bodies into the audit record

Branch `mgs/pre-uc09-cleanup`, cut from `ali-zulqarnain/mgs-forms` @ `b2d6c13` (the PR #147 merge —
confirmed present before branching). Target: `ali-zulqarnain/mgs-forms`. One commit.

## Job A — UC-07 audit-count parity (the gap the UC-08 build surfaced)

`validationAuditMetadata` in `update()` ran `validateForm` on raw stored values, and
`sensitiveScheduleFindings`' key-presence guard meant a draft whose MG6D was **never opened** (no
key stored at all) contributed no mandatory-schedule error to the `DRAFT_SAVED` validation counts.
The trail under-reported a true outstanding error until the section was first unlocked — and
disagreed with the UC-08 review engine, which already normalised absence to emptiness.

**Change:** the dormant-key normalisation is hoisted out of `checkRequiredCompleteness` into a
shared helper, `withDormantSensitiveSections` (`libs/shared/src/lib/sensitive-material.ts` — it is
a statement about sensitive sections, so it lives with them), consumed by BOTH server-side
surfaces: the UC-08 quality engine (same behaviour as before, now shared) and
`validationAuditMetadata` (new — the counts now say what the server knows).

**The two surfaces may legitimately differ, and the helper's doc says why:** the server counts
stored truth; a pre-unlock or locked client has no key AND no knowledge of what is stored, and
honestly declines to guess (UC-07 open-questions D3). Save-metadata counts may therefore exceed
what a pre-unlock client displays — that is parity with reality, not a discrepancy.

**Covering check** (new, `e2e/uc07-sensitive-material.spec.ts`):
`a never-opened MG6D counts as the empty mandatory schedule in the save audit` — two saves
differing ONLY in one row's classification; the `validationErrorCount` delta of exactly one IS the
mandatory-schedule error, read back from the `DRAFT_SAVED` rows.

## Job B — fixture-debt ticket (API operation, recorded here)

**LER-1269** created via `POST /tasks-ml` with `humanInstructions` set **at creation** per the new
CLAUDE.md default — read-back byte-exact (2,029 chars), the first ticket to prove the default works.
It records: the 27-draft dev.db baseline holds `"Daniel FOSTER (edited)"` (UC-02's manual-entry
test) and `not-a-urn` (UC-05's validation tests); UC-08's case-wide Check 3 **correctly** flags both
as blocking, which is why UC-08's case-linked tests run on Sofia Renard with run-unique exhibit
tokens; UC-09's pixel-diff reference renders and UC-10's version history will meet the same
problem, and the unpolluted-case pool only shrinks. The ticket is a strategy DECISION, explicitly
forbidding a quiet fixture fix — UC-09's docs pack schedules the work. `agentMode` landed `true`
(the known defect): UI-toggle list grows to 64.

## Job C — PR bodies are part of the audit record

New rule in CLAUDE.md: every PR body is written to `docs/pr-bodies/<branch-slug>.md` **in the
repo**, committed on the PR's own branch, AND printed into the chat — never scratchpad-only,
because `/tmp` dies with the session and the body is where the DoD quotes, deviations and
not-built decisions live. Applied to this PR, and the four bodies still alive in the current
session's scratchpad were rescued into `docs/pr-bodies/` before they were lost:
`mgs-uc-07-sensitive-material.md` (#139), `mgs-uc-08-review-quality-check.md` (#142),
`mgs-uc-08-finalise-audit-order.md` (#144), `mgs-workflow-template-alignment.md` (#147). Bodies of
earlier PRs exist only on GitHub, which the CLAUDE.md note states.

## Testing

```
npx playwright test                      216 passed  (dev.db, run 1)
npx playwright test                      216 passed  (dev.db, run 2)
npx playwright test                      216 passed  (freshly migrated + seeded throwaway DB,
                                                      API :3400 / web :4400, then torn down)
npm run conformance                      EXIT=0  self-tests: 68 passed
npm run orphan-scan                      EXIT=0  27 drafts scanned, no orphaned values
npm run build (api + web)                EXIT=0
```

Suite 215 → **216** (+1 parity check). dev.db restored to **27 drafts / 66 audit rows / 0
acknowledgements** (496 test drafts, 1,063 audit rows, 30 acks cleaned via the draft log).

## Checklist

- [x] Normalisation hoisted to one shared helper; both server surfaces consume it; no behaviour
      change in the review engine
- [x] The legitimate client/server divergence documented at the helper and the call site
- [x] New E2E check pins the DRAFT_SAVED count including the mandatory-schedule error
- [x] LER-1269 created with humanInstructions at creation, byte-exact on read-back
- [x] PR-body rule in CLAUDE.md; this body committed in-repo; four prior bodies rescued
- [x] Suite ×2 dev.db + ×1 fresh (216/216/216); conformance 68; both builds green; 27/66/0
- [x] Targets `ali-zulqarnain/mgs-forms`, not `main`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
