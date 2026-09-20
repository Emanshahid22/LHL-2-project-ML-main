# UC-07 — Sensitive Material Handling

Branch `mgs/uc-07-sensitive-material` @ `2a67e73`, cut from `ali-zulqarnain/mgs-forms` @ `ed2b3bf`
(the PR #131 merge). Target: `ali-zulqarnain/mgs-forms`. Three commits: the authoring pack
(`491d13c`), the delivering-ticket mapping (`ae2f9d8`), the build (`2a67e73`).

Scope source of truth: <https://lhl-agents.netlify.app/mg-forms-scope/> (UC-07). Client tickets
**LER-1126–1140**; delivering tickets **LER-1240–1254** (mapping recorded up front in
`docs/usecases/uc-07/open-questions.md` — the UC-05/UC-06 duplicate-block lesson applied from day one).

## Summary

Marking an MG6 schedule item **Sensitive** (UC-04's `sensitivityFlag`) now activates a mandatory
**MG6D section**: red "Sensitive — Restricted Access" banner, read-only cited handling instructions
that must be confirmed **on every access** before the section can be edited, the MG6D schedule itself
(three columns, each cited to the Manual of Guidance v11 MG06D entry), and a Public Interest Immunity
reminder panel with a recorded acknowledgement and a practice-direction link. Users without the
**Sensitive Material Access** permission see a locked section naming the level and who in the firm
holds it — and the content is **never sent** to their client. A new non-sensitive schedule export
(CSV) excludes sensitive items by construction. Every view, edit, confirmation, acknowledgement,
denial and export goes through the existing append-only audit path with user identity and timestamp.

Four findings shaped the design (recorded in the pack before any code):
1. **The save path replaces `valuesJson` wholesale**, so redaction + autosave would erase MG6D for a
   locked user — the server now **merge-preserves** sensitive keys absent from a request.
2. **`DynamicForm` builds a control for every field**, so sensitive fields are excluded from the base
   FormGroup and join it only on confirmation — pre-confirmation there is no control to type into and
   no key for autosave to send, which is what makes the UI genuinely non-bypassable.
3. **No export existed**, so UC-07 builds the minimal one it constrains (one shared builder both the
   endpoint and the tests call).
4. **MG6D is officially a separate form** (MoG v11); the scope specifies a section within MG6, so that
   ships — keyed off the `sensitive: true` declaration, never the form code (LER-1205 stays open).

## Definition of Done — quoted verbatim, with the checks that prove each

> **"Sensitive material flag (MG6D) triggers the mandatory handling instruction every time without
> exception"**
- `classifying a row Sensitive activates the MG6D section immediately, no save needed` — the section,
  banner and instructions appear the moment the select changes, before any save.
- `a second, fresh draft triggers the same handling — no exception` — plus every instruction sentence
  and its citation asserted individually, and the unverified notice.
- `deactivation un-flags the draft while MG6D content survives, dormant, and returns`.

> **"Confirmation cannot be bypassed at API level — tested with a direct API call without the
> confirmation flag"**
- `a direct API call touching MG6D without the confirmation flag is rejected` — a REAL HTTP `PATCH`
  asserting **403** and that nothing was stored.
- `an invented confirmation id, and one belonging to another draft, are equally rejected` — the
  confirmation must be this user's, for this draft, of kind HANDLING_INSTRUCTIONS.
- `a user without the permission is rejected outright — confirm and edit both` (both 403s audited
  with the caller's identity).
- `the legitimate flow — confirm, then save — succeeds` and
  `merge-preserve: a save that omits the sensitive key cannot erase MG6D`.

> **"All MG6D access events appear in the audit trail with correct user identity and timestamp"**
- `view, confirmation and edit each reach the trail with the acting user and timestamp` — rows read
  back from the database: `SENSITIVE_SECTION_VIEWED` / `SENSITIVE_INSTRUCTIONS_CONFIRMED` (with the
  wording-hash pin) / `SENSITIVE_SECTION_EDITED` (field ids + confirmation id, never content), each
  asserting the acting user's identity and a sane timestamp.
- Denial rows carry the caller's identity (asserted in the no-permission check above).

> **"Sensitive items are absent from non-sensitive schedule exports — verified with a test export"**
- `a test export contains the plain item and not one byte of the sensitive one` — the CSV fetched
  over HTTP; the sensitive description, its reference and the MG6D columns asserted absent; the
  non-sensitive row present; `SCHEDULE_EXPORTED` audited with counts only.
- `the export is offered beside the schedule as a plain download link`.

## Beyond the DoD lines (the client tickets)

- **Locked section (LER-1138/1139 → 1252/1253):** payload-level proof that a user without the
  permission receives no sensitive values, no instructions and no PII steps; the locked screen names
  `Sensitive Material Access` and lists its holders.
- **UI non-bypass (LER-1130 → 1244):** pre-confirmation there is no editable rendering, the
  instructions block contains no input element, stored rows show read-only, and the autosave request
  is captured off the wire carrying no sensitive key.
- **Step-up (LER-1137 → 1251):** reload → locked again; each fresh confirmation is a **new** persisted
  row (asserted at two rows). The confirmation id lives in memory only, never browser storage.
- **PII panel (LER-1132/1133 → 1246/1247):** four cited steps, the official gov.uk rules-index link
  (`rel="noopener"`, exact practice direction recorded as open question Q1), acknowledgement recorded,
  audited, and persisted per user per draft across accesses.
- **Immutability (LER-1136 → 1250):** structural check — comment-stripped grep of `apps/api/src` for
  any update/delete/upsert on `auditEvent` or `sensitiveAcknowledgement`; creation is the only verb.
- **Mandatory-when-active:** an error-severity consistency finding while sensitive material exists and
  MG6D is empty; clears when the schedule is completed.
- **Red (LER-1127 → 1241):** the `_tokens.scss` slot reserved since UC-03 is filled with
  `--mg-sensitive-*`; the banner's computed colour is asserted; amber and the validation danger
  palette untouched.
- **Wording integrity:** handling instructions and PII steps are hash-pinned in `libs/shared` and
  verified at API startup (boot-refusal on drift — the MG11-declaration discipline); acknowledgement
  rows record the pin they acknowledged.

## What was deliberately NOT done

- No box invented: MG6D carries exactly the three columns the MoG v11 documents (description in
  detail, location, reason sensitive). The prosecutor's boxes are open question Q5; an item-number
  column is positional, not stored.
- No uncited sentence: instructions and PII steps ship only with citations; storage/copying/marking
  rules are open question Q3. `verification` stays `'unverified'` everywhere.
- No permission-granting UI (Q2), no PDF (UC-09), no masking of the main schedule's sensitive-classed
  rows for locked users (Q4 — recorded, practitioner call).

## Testing

```
npx playwright test                      195 passed  (dev.db, run 1)
npx playwright test                      195 passed  (dev.db, run 2)
npx playwright test                      195 passed  (freshly migrated + seeded throwaway DB,
                                                      API :3400 / web :4400, then torn down)
npm run conformance                      EXIT=0  self-tests: 63 passed (was 56; 7 planted-defect
                                                 tests for the new sensitive-declaration rules)
npm run orphan-scan                      EXIT=0  27 drafts scanned, no orphaned values
npm run build (api + web)                EXIT=0
```

Suite 176 → **195** (+19 UC-07 checks). Every pre-existing check green; every pre-existing
`data-testid` intact (UC-04's `sensitive-material-indicator` asserted still present). The one test
edit outside UC-07 is documented inside it: LER-1040's all-fields-render check gains
`sensitiveScheduleItems` in its documented-exceptions set (the field renders only when active AND
confirmed, by design — the same treatment as `specialMeasuresApplied`).

Test hygiene: 406 suite-created drafts (and their 920 audit rows and 56 acknowledgement rows) removed
via the E2E draft log; `dev.db` verified back at **27 drafts / 66 audit rows / 0 acknowledgement
rows**. The 27 real drafts were never touched.

## Data model

Additive migration `20260821163845_uc07_sensitive_material`: `User.sensitiveMaterialAccess`
(default false; seed grants it to the demo user and withholds it from the colleague) and the
append-only `SensitiveAcknowledgement` table. MG6 `templateVersion` 4 → 5, strictly additive.

## Checklist

- [x] The four scope DoD lines quoted verbatim, each proven by named checks
- [x] API-level guard in the NestJS layer, proven by direct HTTP calls (403)
- [x] Redaction server-side — locked content never reaches the client
- [x] Merge-preserve: being locked out can never erase what others wrote
- [x] Audit through the existing append-only path; immutability structurally checked
- [x] Additive only; `orphan-scan` clean; every new field cites its source; all `unverified`
- [x] Red used only on UC-07 surfaces, via tokens
- [x] Suite ×2 on dev.db + ×1 fresh DB, conformance (63 self-tests), both builds — all green
- [x] Test drafts cleaned; 27 real drafts untouched
- [x] Targets `ali-zulqarnain/mgs-forms`, not `main`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
