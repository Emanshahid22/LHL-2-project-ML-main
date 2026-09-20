# Fix: finalise writes nothing to the audit trail until the transition has won

Branch `mgs/uc-08-finalise-audit-order` @ `64c4e06`, cut from `ali-zulqarnain/mgs-forms` @
`83b6148` (the PR #142 merge). Target: `ali-zulqarnain/mgs-forms`. One commit.

## The defect

`finalise()` committed its `ADVISORY_BYPASSED` audit rows BEFORE the guarded status flip. Each
audit write is an independent, immediately-committed insert, so any interleaving that made the
guard match zero rows afterwards left those rows stranded: **the trail recorded advisory bypasses —
timestamped, with the user's reasons — on a form that was never finalised.** Since bypass rows are
only meaningful as part of a finalisation (acknowledgements are not persisted state; the
finalise-time audit IS the record, uc-08 Q7), that is a genuinely misleading trail, on exactly the
surface LER-1106/1265 exists to make trustworthy.

Three interleavings reach the `count === 0` branch:
1. **Autosave** landing between finalise's read and its update (a user types, then finalises
   within the 1.5 s debounce window — or a second tab).
2. **A second finalise** from another tab — the loser also wrote a **duplicate** set of bypass
   rows before failing.
3. **A concurrent `review()`**, whose own update flips `DRAFT → REVIEWED` without touching
   `version`, failing finalise's `status` predicate alone.

**This was proven, not theorised:** the new regression test was written first and run against the
old ordering — it reproduced the duplicate case exactly (two `ADVISORY_BYPASSED` rows for one
`issueId`, both committed by requests of which only one finalised). Separately, a read-only
forensic sweep of the development database found no stranded or duplicated rows from real usage —
the anomaly had not yet escaped the lab.

## The fix

Reorder — the guarded flip goes first; the loser of any race throws 409 having written nothing:

```
count = updateMany(guarded status flip)
if count === 0 → throw 409          // nothing written
for each advisory → audit ADVISORY_BYPASSED
audit FORM_FINALISED
```

This closes all three interleavings and the duplicate case. The residual risk it accepts — a crash
between the successful flip and the audit writes leaves a FINALISED form missing bypass rows — is
the same audit-failure risk `AuditService`'s never-fatal contract already accepts everywhere.

**Deliberately NOT a `$transaction`** (decision made): inside a transaction, a failed audit insert
would abort the finalisation, inverting the standing contract that an audit failure never breaks
the user's action. The transactional option — with the real argument FOR it (a bypass that cannot
be recorded arguably should not happen at all, since the record is LER-1106's whole purpose) — is
recorded as **Q8** in `docs/usecases/uc-08/open-questions.md`, a contract decision for Husnain,
flagged for the LER-1189 security review. The in-code comment that framed the old ordering as
deliberate is replaced by one stating why the reorder is correct and which interleavings it closes.

`review()` needed no change and got none: its pre-flip `QUALITY_CHECK_COMPLETED` row asserts only
that a run happened (true regardless of the transition), and a lost guard there is a soft no-op,
not a throw.

## Test coverage

- `a finalise that loses the guard writes ZERO bypass rows — and the winner exactly one set` —
  **deterministic**: two finalise requests race via `Promise.all`; exactly one of them must lose
  whichever way the awaits interleave. Asserts one 201 + one 409, exactly ONE bypass row for the
  probe advisory (no duplicates, nothing stranded), exactly one `FORM_FINALISED`. This test failed
  against the old code (received 2 rows) and passes against the fix.
- `a save racing a finalise never strands bypass rows on an unfinalised form` — the mid-window
  PATCH interleaving **cannot be forced deterministically from outside the process** (it lives in
  the server's own await gaps), and the PR says so rather than shipping a check that passes for the
  wrong reason. The test staggers a PATCH into the engine window and asserts the ordering
  INVARIANT under whichever interleaving occurred: a 409 finalise left zero bypass rows and no
  `FORM_FINALISED`; a 201 left exactly one set. The `count === 0` branch itself is pinned
  deterministically by the double-finalise test, which exercises the identical code path.

Both ran at `--repeat-each=3` against the fix: 6/6.

## Testing

```
npx playwright test                      215 passed  (dev.db, run 1)
npx playwright test                      215 passed  (dev.db, run 2)
npx playwright test                      215 passed  (freshly migrated + seeded throwaway DB,
                                                      API :3400 / web :4400, then torn down)
regression tests, --repeat-each=3          6 passed  (post-fix; pre-fix: reproduced the duplicate)
npm run conformance                      EXIT=0  self-tests: 68 passed
npm run orphan-scan                      EXIT=0  27 drafts scanned, no orphaned values
npm run build (api + web)                EXIT=0
```

Suite 213 → **215**. No template, schema or endpoint-surface change — a statement reorder in one
method, one replaced comment, one new open question, two tests. dev.db verified restored to
**27 drafts / 66 audit rows / 0 acknowledgements**.

## Checklist

- [x] Reorder applied exactly as approved; no `$transaction` (contract decision recorded as Q8)
- [x] Q8 states the argument both ways and flags it for Husnain / the LER-1189 security review
- [x] The now-wrong in-code comment replaced with the real reasoning
- [x] Regression test reproduced the anomaly pre-fix and pins it post-fix
- [x] Non-forcible interleaving stated plainly; covered by invariant + the deterministic twin
- [x] Suite ×2 dev.db + ×1 fresh DB (215/215/215); conformance 68; both builds green
- [x] dev.db restored to 27/66/0; targets `ali-zulqarnain/mgs-forms`, not `main`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
