# Stability fix — dashboard queue reads vs coalesced rendering

**Branch** `fix/dashboard-sort-race` → `ali-zulqarnain/mgs-forms` ·
**Surfaced by** PR #202's pull_request CI run `32953783522` (first attempt:
`e2e/dashboard.spec.ts` "sort by form code changes the order" failed at the
sorted-ranks assertion; the same tree was green on the push run and went
green on re-run — the signature of a race, not a code defect).

## Root cause

The app runs `provideZoneChangeDetection({ eventCoalescing: true })`
(`app.config.ts`), which schedules change detection on an **animation
frame** — a click's DOM re-render is a separate task from the click itself.
Four dashboard-spec read sites took instant snapshots
(`allTextContents()` / `count()`, neither of which auto-waits) with no
sentinel between the state-changing click and the read:

- `sort by form code`: both the post-expansion read and the post-sort read;
- `sort by case`: the same two reads;
- `filter narrows the queue`: the post-expansion read and the post-fill read.

On a slow runner the read lands inside the click→render gap. The CI failure
signature matches exactly: `byRecent` captured pre-expansion (capped list),
`byCode` captured post-expansion, so the not-equal check passed on length
while the ranks check failed on an unsorted order. The dashboard's sort
comparator itself is total and stable (numeric code rank + `updatedAt`
tie-break) — **no product code is touched by this PR**.

## The fix — deterministic sentinels, no sleeps

- Expansion sentinel: the view-all toggle re-labels to "Show fewer" in the
  same render pass as the expansion — `toHaveText(/Show fewer/)` before any
  instant read.
- Sort sentinel: the reorder itself landing —
  `expect.poll(queueCodes).not.toEqual(byRecent)` (the tests' asserted
  preconditions guarantee the orders must differ), then the strong
  assertions run on a settled DOM.
- Filter sentinel: the row count must change (the asserted precondition
  guarantees strict narrowing) — `not.toHaveCount(before)`.

## Validation

- Fixed sequence under a **6× CDP renderer throttle** (the exact conditions
  that widen the race window): **15/15 green** (~19s per iteration vs ~5s
  unthrottled — deep in race territory).
- Whole dashboard spec `--repeat-each=20`: **500/500 green**.
- One full suite leg with the fix in-tree: **266/266, exit 0**.
- dev.db baseline verified restored (35 drafts / 76 audit / 0 / 0 / 0 / 0),
  document store empty, after every leg.

One test-infrastructure file changed (22 insertions). The race stayed
latent in the merged tree between PR #202's merge and this fix — recorded
here so the audit trail is honest about that window.

## Tickets

No tracker ticket covers the dashboard/UC-01 test area (searched); this PR
body is the record, referenced from the UC-10 reconciliation comments
("sentinel fix … lands as a follow-up commit").
