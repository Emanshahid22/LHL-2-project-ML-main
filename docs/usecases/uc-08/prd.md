# UC-08 — Form Review & Quality Check · PRD

_Epic: `docs/usecases/uc-08/epic.md` · Scope: <https://lhl-agents.netlify.app/mg-forms-scope/>
(UC-08) · Client tickets: LER-1141–1152 + LER-1104/1106 (stories named by client key)._

## 1. Summary
"Review & Finalise" runs a four-check quality suite server-side, presents findings as a grouped
checklist with Jump-to-field, lets advisories be acknowledged with a recorded reason, and gates
finalisation in both layers: the Finalise button stays inert AND `POST /drafts/:id/finalise`
rejects — with an audited refusal — while any blocking issue, incomplete check, unconfirmed MG6D
section, or unacknowledged advisory stands. Success sets `FINALISED`; the UC-09 PDF handoff is a
stub that says so.

## 2. Scope requirements (verbatim)
- **Actors:** authenticated legal professional; form quality engine.
- **Pre-conditions:** form in draft state with at least one field completed; user clicks "Review &
  Finalise" or navigates to the review step.
- **Main flow:** (1) full quality check suite runs automatically on "Review"; (2) Check 1 —
  Completeness: all required fields completed (red if not); (3) Check 2 — Date logic: all dates
  valid and in correct chronological sequence; (4) Check 3 — Cross-reference consistency: form
  reference numbers cited are consistent across forms in the same case; (5) Check 4 — Sensitive
  material: confirms MG6D handling confirmed if any sensitive items present; (6) issues displayed
  as a checklist with description, affected field/section, and "Jump to field" button; (7) blocking
  issues must be resolved; advisory issues can be acknowledged and bypassed; (8) once all blocking
  issues resolved, "Finalise" becomes active.
- **Alt flow:** no issues → green "Ready to Finalise" confirmation; user proceeds toward PDF
  generation (UC-09 — stub the handoff point only).
- **Error handling:** quality engine times out → partial results shown; blocking issues from
  completed checks still enforced; user told which checks could not complete and to verify
  manually.
- **Post-conditions:** quality check outcome recorded in audit trail; form status updated to
  "Reviewed"; blocking issues resolved; form ready for finalisation.
- Gating is enforced server-side, not just UI — the UC-07 discipline.

**Definition of Done:** the four lines quoted verbatim in the epic; §9 names the checks proving
each.

## 3. What already exists (reuse, never duplicate)
| Piece | Where | Used by |
|---|---|---|
| `requiredFieldIds`, `isFieldValueComplete`, `isConditionallyRequired` | `form-template.types.ts`, `validation.ts` | Check 1 |
| `isGroupValueComplete` (a schedule with an incomplete row is incomplete) | `schedule.ts` | Check 1 |
| `sensitiveScheduleFindings` (MG6D mandatory-when-active) | `sensitive-material.ts` | Check 1 |
| Declared date rules `notBefore`/`notAfter` + `requiredWhen` via `crossFieldFindings` | `validation.ts` (UC-05) | Check 2 |
| The `'invalid'` IsoDateAdapter sentinel + ISO shape | `dynamic-form.ts` precedent | Check 2 |
| `mapsTo` (urn, defendantName repeat across a case's forms) | templates | Check 3 |
| Exhibit-reference convention "JS/1", documented in helpText | MG11 `exhibitsReferenced` (cites), MG12 `exhibitEntries` (defines) | Check 3 |
| `isSensitiveSectionActive` + `SensitiveAcknowledgement` (HANDLING_INSTRUCTIONS) | UC-07 | Check 4 |
| Append-only audit path; DemoAuthGuard + `x-user-email`; two seeded users | UC-01/07 | throughout |
| Consistency panel + `ValidationFinding` shape | `consistency-issues.ts`, `validation.ts` | checklist |

## 4. The engine (`libs/shared/src/lib/quality-check.ts`, pure)
```ts
QualityCheckId = 'completeness' | 'dateLogic' | 'crossForm' | 'sensitiveHandling'
QualityIssue {
  id: string;            // stable: `${checkId}:${kind}:${fieldId}[:${relatedFieldId}]`
  checkId: QualityCheckId;
  severity: 'blocking' | 'advisory';
  fieldId?: string;      // affected field — absent for form-level issues (e.g. Check 4)
  sectionLabel?: string; // affected section, for fields the viewer cannot see (UC-07 lock)
  message: string;
}
QualityCheckResult { checkId; status: 'clean' | 'issues' | 'incomplete'; issues: QualityIssue[];
                     guidance?: string /* the verify-manually text when incomplete */ }
QualityReport { checks: QualityCheckResult[4]; blocking: n; advisory: n; incomplete: n;
                readyToFinalise: boolean }
```
- **Check 1 — completeness** (all blocking, rendered red): statically required fields,
  conditionally-required fields whose trigger is set, required groups via `isGroupValueComplete`
  (incomplete rows named), and MG6D-empty-while-active via `sensitiveScheduleFindings`.
- **Check 2 — date logic**: (a) validity — a date field whose stored value is neither empty nor
  `YYYY-MM-DD` (including the adapter's `'invalid'` sentinel) is blocking; (b) sequence — the
  DECLARED `notBefore`/`notAfter` rules through `crossFieldFindings`, severity carried over from
  the rule (`error`→blocking, `advisory`→advisory), suppressed findings surfacing as advisory
  "could not compare" notes. **No new date rule is invented, and target dates keep no
  `noFutureDate`** — the UC-04 lesson; the engine evaluates only what templates declare.
- **Check 3 — cross-form references** (needs the case's sibling drafts, so the engine takes them
  as input): (a) `mapsTo`-keyed equality — `urn` and `defendantName` values present on ≥2 of the
  case's drafts must agree; a mismatch is **blocking** (one case has one URN by definition of the
  datum). (b) exhibit references — tokens matching the documented `AB/1` convention on `crossRef:
  {vocabulary:'exhibitReference', role:'cites'}` fields must appear among the tokens of the case's
  `role:'defines'` fields; a citation with no matching definition is **advisory** (a statement may
  legitimately precede the compiled list — open-questions D2). Standalone drafts: check reports
  clean-with-note (no siblings to compare).
- **Check 4 — sensitive handling**: section active on stored values → a `HANDLING_INSTRUCTIONS`
  acknowledgement row must exist for this draft (blocking, form-level, `sectionLabel` = the MG6D
  section). Inactive or undeclared → clean.
- **`crossRef` declaration** (additive on `FormFieldDefinition`): `{ vocabulary:
  'exhibitReference'; role: 'defines' | 'cites' }`. DECLARED, never inferred — the same discipline
  as `narrative`/`sensitive`. Conformance: valid vocabulary/role, textarea-or-text only, and a
  parser note: only tokens matching the convention the helpText documents (`/^[A-Za-z]{1,4}\/\d+/`
  per line) are treated as references; prose lines are ignored, never guessed at.

## 5. API surface
- `POST /drafts/:id/review` → `200 QualityReviewResponse { report, status }`. Owner-scoped; 409 on
  a FINALISED/ARCHIVED draft; 422 when no field is complete (the scope's pre-condition). Runs each
  check under `QUALITY_CHECK_TIMEOUT_MS` (4 000 ms, Q2): a check that throws or times out reports
  `incomplete` with guidance, the others stand. Audits `QUALITY_CHECK_COMPLETED`
  `{ formCode, blocking, advisory, incomplete, perCheck: {checkId: status} }` — the outcome is
  recorded whether or not it passed (a check that only logs success cannot prove it ran). Sets
  status `REVIEWED` when `readyToFinalise` (no blocking, no incomplete); an issue-laden run leaves
  status untouched.
- `POST /drafts/:id/finalise` `{ advisoryAcknowledgements: [{ issueId, reason }] }` → the gate.
  Re-runs the engine AT THE BOUNDARY (never trusts the client's last report). Rejections are 409
  with an audited `FINALISE_REJECTED` `{ reason, blocking, incomplete, unacknowledged }`:
  any blocking issue · any incomplete check (a timeout is not a bypass, Q5) · any advisory not
  covered by an acknowledgement with a non-empty reason. Each accepted bypass audits
  `ADVISORY_BYPASSED` `{ issueId, checkId, fieldId, reason }` (LER-1106 — the reason is the user's
  own words, recorded verbatim). Success: status → `FINALISED`, `FORM_FINALISED` audited, response
  carries the final report.
- `UpdateDraftRequest` untouched. `update()` gains one behaviour: saving a `REVIEWED` draft
  succeeds and reverts status to `DRAFT`, noted in `DRAFT_SAVED` metadata
  (`{ reviewInvalidated: true }`) — F3. `FINALISED`/`ARCHIVED` stay uneditable (existing 409).
- `listForUser` includes `REVIEWED` alongside `DRAFT` (a reviewed form is still in progress);
  `FINALISED` stays off the work queue.
- `DraftStatus` union gains `'REVIEWED'` (string column — no migration needed).

## 6. Client
- **Trigger (LER-1141):** a "Review & Finalise" button in the form header, enabled once ≥1 field
  is complete (the live progress signal already knows). Clicking runs the review and opens the
  **review panel**.
- **Checklist (LER-1146):** findings grouped **Blocking** / **Advisory** / **Could not complete**,
  each row: message, affected field label (or section label when the field is not renderable for
  this viewer — the UC-07 locked case), and **Jump to field**.
- **Jump (LER-1147):** scrolls to `[data-field-id]`, focuses the control, and applies a temporary
  highlight class. MG11: the wizard first reveals the step containing the field (new `revealField`
  input driving `currentStep`). A sensitive-declared target that is not rendered (locked or
  unconfirmed) jumps to the sensitive section block instead.
- **Advisory acknowledgement (LER-1149 + 1106):** each advisory row takes a required free-text
  reason; Finalise sends the collected `{issueId, reason}` pairs. Acknowledgements live in
  component state only — a fresh review run resets them (Q7).
- **Gating (LER-1148/1150):** Finalise disabled until blocking = 0, incomplete = 0 and every
  advisory has a reason; blocking rows have no acknowledge control at all. The server re-checks
  regardless.
- **Alt flow:** zero issues → green "Ready to Finalise" state. Post-finalise: a finalised banner,
  the form read-only (controls disabled; server already refuses edits), and the UC-09 stub: "PDF
  generation arrives with UC-09."
- **Partial results:** an incomplete check renders its guidance ("could not complete — verify
  manually") and the panel says finalisation stays blocked until a full run completes.
- Colour: blocking rows use the existing danger tokens (validation-error red), advisory rows amber.
  UC-07's sensitive red appears only if the section itself renders. No new colour.

## 7. Failure modes
- Engine failure inside a check → that check `incomplete`, others stand (per-check isolation).
- Audit write failure → logged, never breaks review or finalise (existing contract).
- Review of a just-deleted draft → 404; finalise racing an edit → optimistic-concurrency semantics
  unchanged (finalise re-reads at the boundary).

## 8. Business rules
1. Reuse the primitives: Check 1/2 call the UC-01/04/05/07 functions; a duplicated rule is a forked
   rule and will drift.
2. Nothing new blocks a SAVE. The gate exists at exactly one transition: finalise.
3. Severity discipline: blocking only where the datum's semantics justify it (missing required,
   invalid date, declared error-severity ordering, URN/defendant divergence, MG6D unconfirmed,
   incomplete check). Documented in Q3; re-banding is data, not architecture.
4. Declared, never inferred: cross-form participation is a `crossRef` annotation; no prose parsing
   beyond the convention the printed form's own instructions document; no invented rules (F1/Q4).
5. The endpoint is the boundary: every UI gate has a server twin, every refusal is audited.
6. A review attests the values it saw: edits revert `REVIEWED` to `DRAFT` (F3).
7. Every existing `data-testid` survives; suite baseline 195 must not regress.

## 9. E2E plan (`e2e/uc08-review-quality.spec.ts`)
DoD 1 — required-type coverage across **MG6, MG11, MG3**: blocking issues for text, date, select,
checkbox (MG11 declaration), group (MG6 schedule) and textarea required fields; red grouping
asserted; fixing each clears it. DoD 2 — jump: flat form scroll+highlight+focus; MG11 wizard step
reveal; UC-07 locked target lands on the section block. DoD 3 — advisory acknowledged with reason
→ finalise succeeds AND `ADVISORY_BYPASSED` carries the reason; blocking cannot be acknowledged
(no control) and **a real HTTP finalise attempt with a blocking issue outstanding is 409** with
`FINALISE_REJECTED` audited; an unacknowledged advisory also rejects. DoD 4 — two drafts on one
case: MG11 citing `PC/1, PC/2`, MG12 defining only `PC/1` → advisory names `PC/2`; adding `PC/2`
to MG12 clears it; URN divergence across the same case's forms is blocking. Plus: review
pre-condition (empty draft → 422 / disabled trigger); outcome audited on failing AND passing runs;
`REVIEWED` set on clean review, reverted by an edit (audit metadata asserted); finalised form
read-only + UC-09 stub; timeout path via route interception (partial results UI + enforcement
text); standalone draft cross-form note; green ready state.

## 10. Out of scope / deferred
PDF (UC-09) · archive (UC-10) · MG5-witness rule (Q4) · advisory persistence across runs (Q7) ·
severity re-banding (Q3) · any change to save-path validation semantics.
