# UC-08 engine remediation: LER-1270, 1271, 1272

Branch `mgs/uc08-engine-remediation`, cut from `ali-zulqarnain/mgs-forms` @ `19bc07a` (the PR #149
merge). Target: `ali-zulqarnain/mgs-forms`. One commit; four files (`quality-check.ts`,
`validation.ts`, the UC-08 spec, one corrected UC-05 assertion). The three tickets were filed on
24 Aug by the unit-test tranche-1 review; each is quoted below with the check that now covers it.

## LER-1270 — "checkDateLogic accepts impossible calendar dates — validity is shape-only"

> "The review engine's Check 2 promises that a value holding anything other than a real ISO date is
> blocking, but the check is the regex /^\d{4}-\d{2}-\d{2}$/ … '2026-13-45' and '2026-02-31' review
> clean. … the input layer rejects impossible dates while the review engine accepts them."

**Fix:** new exported `isRealIsoDate` — shape AND a UTC round-trip, so impossible months, days and
non-leap 29 Februaries all fail — used by Check 2's validity pass. No new dependency.
**Covering check:** `an impossible calendar date is blocking — the engine now agrees with the input
layer` — the tranche-1 draft's engine cases folded in (`2026-13-45`, `2026-02-31`, `2026-02-29`
block; real leap day `2024-02-29` passes) plus the deployed-shape path: the impossible date saved
through the API (the writer the input layer cannot police) is a blocking `dateLogic:invalid`
finding, and correcting it clears. The check's comment names its input-layer counterpart
(`uk-dates.spec.ts › an impossible date is rejected at input`) — the two layers now agree.

## LER-1272 — "A half-filled sensitive schedule row reviews clean — MG6D completeness tests emptiness only"

> "checkRequiredCompleteness never flags a HALF-FILLED MG6D row: the sensitive group is
> required: false and the mandatory-schedule rule tests emptiness only. A form can therefore
> finalise carrying a sensitive-material schedule row with blank required columns."

**Fix:** while the sensitive section is ACTIVE (the trigger schedule holds a sensitive row), a
sensitive group whose rows fail `isGroupValueComplete` is a blocking completeness issue —
`completeness:sensitive-incomplete:<fieldId>` — naming the section and never the content, matching
the empty-schedule error's wording discipline. The emptiness rule (and its dormant-key
normalisation) is unchanged; this closes the existing-but-incomplete gap beside it.
**Covering check:** `a half-filled sensitive schedule row is a blocking completeness issue naming
the section` — full API flow (sensitive row → UC-07 confirmation → half-filled MG6D row → blocking;
completing the columns clears), with the wording discipline asserted: the message contains the
section label and does NOT contain the row's content.

## LER-1271 — "ValidationFinding.relatedFieldId carries a display label on the failed ordering branch"

> "The interface documents relatedFieldId as 'a field id or case:<path>', and the suppressed branch
> honours that — but a FAILED cross-field ordering assigns the operand's human label. …
> ADVISORY_BYPASSED audit rows are then keyed on mutable display strings — in a legal audit trail
> that is a records-quality defect."

**Fix:** the failed branch now carries `order.casePath ? \`case:<path>\` : order.fieldId`, exactly
like the suppressed branch; messages keep the human label. One UC-05 assertion had pinned the
defective behaviour ("named by its human label") and is corrected to expect the stable id, with the
reasoning in its comment.
**Covering check:** `a failed ordering identifies the operand by id, matching the suppressed
branch` (from the tranche-1 draft), plus the corrected UC-05 operand assertion.

> **Behaviour note for reviewers:** `dateLogic:order:*` issue ids change shape for this finding
> class (they now embed the operand id, not its label), so any previously recorded advisory
> acknowledgement for such a finding stops matching. This **fails safe** — the advisory reappears
> and must be re-acknowledged; nothing is silently cleared. `ADVISORY_BYPASSED` rows written from
> now on are keyed on stable identifiers.

## Also in this change window (recorded, not part of the diff)

- **dev.db residue removed** before the gates ran: 3,892 synthetic drafts + 9,936 audit rows + 266
  acknowledgements, all created 24 Aug 06:31–11:06 UTC by suite runs outside the draft-log cleanup.
  Deleted in one guarded transaction that snapshotted the 27 protected draft ids and 66 audit ids
  first and would have rolled back on any mismatch — post-delete id sets verified identical.
- **Status-artifact correction** (for the next republish; not republished now): the 22 Aug report's
  UC table said UC-08 had 22 checks; the true figure was 20, and with this PR it is **23**
  (uc07 spec: 20). Suite total is now **219**.

## Testing

```
npx playwright test                      219 passed  (dev.db, run 1)
npx playwright test                      219 passed  (dev.db, run 2)
npx playwright test                      219 passed  (freshly migrated + seeded throwaway DB)
npm run conformance                      EXIT=0  self-tests: 68 passed
npm run orphan-scan                      EXIT=0
npm run build (api + web)                EXIT=0
```

Suite 216 → **219** (+3 remediation checks). dev.db verified at **27 / 66 / 0** after cleanup.

## Checklist

- [x] Each ticket quoted with its covering check; tranche-1 draft cases folded into the suite
- [x] Engine and input layer proven to agree on calendar validity
- [x] Section named, content never, in the new completeness message
- [x] Acknowledgement-id shape change stated; fails safe by construction
- [x] Suite ×2 dev.db + ×1 fresh (219/219/219); conformance 68; both builds green; 27/66/0
- [x] Targets `ali-zulqarnain/mgs-forms`, not `main`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
