# PRD — UC-02 Auto-Population from Case File

> **Retrospective, as-built.** This documents what the delivered code actually does, verified against the
> source and the E2E suite. Scope-versus-built differences are in `open-questions.md`, not smoothed over
> here. Epic: `docs/usecases/uc-02/epic.md`. Completion commit `3cf7644`.

## 1. Overview
For a case-linked draft, UC-02 fills the fields that correspond to case data, attributes each filled
value to its source, and lets the user accept, edit or clear any of them. Its defining property is
restraint: it fills only mapped fields, only while they are empty or still hold what a previous run
wrote, and it reports conflicting or absent case data rather than resolving it.

## 2. Goals & Non-Goals
**Goals**
- Fill every mapped field the case can supply, on first open, without being asked.
- Make every machine-supplied value visibly machine-supplied and one click from being undone.
- Never overwrite a human value — not on first run, not on re-run, ever.
- Report ambiguity and absence with a reason a solicitor can act on.
- Surface a case that changed after population, and allow a re-run that keeps manual work.

**Non-Goals**
- Integrating a real case-management system (LER-1041) or importing a case by hand (LER-1054).
- Writing to the case file. Nothing in the product does.
- Mapping fields where the case datum is not the field — see §8.
- Locking values after review (see `open-questions.md` D2).

## 3. Current Behaviour & Context
UC-02 builds directly on UC-01's model and adds one field to it:

- **`mapsTo?: CaseFieldPath`** on `FormFieldDefinition` — a closed union of ten paths, so a typo is a
  compile error and the conformance gate rejects a `mapsTo` that is not a real path.
- **`FormDraft.autoFillJson`** — a provenance map keyed by field id, alongside the existing
  `valuesJson`. Provenance is what makes the badge honest: it stores the exact value written and the
  case's `updatedAt` at the time, so the UI can tell "still as auto-filled" from "edited by a human".
- **The five seeded cases** are the fixtures. Marcus Bellamy carries two offences with different dates,
  which is what makes the ambiguity path testable; one case is granted only to a colleague, which is
  what makes access control testable.
- **Dates are stored as ISO strings, not `Date` objects.** Provenance matching is a
  `JSON.stringify` comparison, so a `Date` in a control would never equal the stored ISO string and
  every badge would vanish. `IsoDateAdapter` exists for this reason.

## 4. How It Works — Mechanism
1. **Trigger on first open.** `form-fill-page.ts` runs auto-fill automatically when the draft has a
   `caseId`, the template has at least one mapped field, the draft has no provenance yet, and no value is
   complete. Any of those failing means the draft is not new, so nothing is populated.
2. **Resolve.** `POST /api/drafts/:id/autofill` loads the draft with its case, then for each mapped field
   calls `resolveCaseField(path, caseDto)`, which returns one of:
   - `{ kind: 'value', value }` — usable data;
   - `{ kind: 'ambiguous', reason }` — the case holds conflicting candidates (e.g. two offence dates);
   - `{ kind: 'no_data', reason }` — the case simply lacks it.
3. **The pristine test — the rule that protects human work.** Before writing, the service computes
   whether the current value is *pristine*: provenance exists for the field and
   `JSON.stringify(current) === JSON.stringify(provenance.value)`. A field is written only if it is
   empty **or** pristine. A complete, non-pristine value is a manual value and is skipped.
4. **Write and attribute.** For each filled field, the value goes into `valuesJson` and a provenance
   entry into `autoFillJson`: `{ source: 'case', caseUpdatedAt, value, accepted: true }`.
5. **Refresh every provenance timestamp.** After the run, every surviving provenance entry has its
   `caseUpdatedAt` set to the case as just read — this is what makes the "case file has changed" banner
   clear after a re-run rather than sticking.
6. **Report.** The response carries `values` (only what this run wrote), `outcomes` (one per mapped
   field, with a reason for anything not filled), `summary` (`filled`, `total` over mappable fields) and
   the updated draft. `AUTO_POPULATED` is written to the audit log with the summary.
7. **Render.** `DynamicForm` shows an **Auto-filled** badge plus **Clear** on any field whose current
   value still equals its provenance value, and a *"Not auto-filled — {reason}"* note on a mapped field
   that was not filled and is still empty. The page shows the dismissible summary banner.
8. **Turning a value manual.** Editing or clearing the field breaks the value/provenance equality, so the
   badge disappears immediately — no separate "accept" action exists or is needed. On the next save the
   API **prunes** provenance for any field whose saved value no longer matches what was written, so the
   value is manual server-side too and survives a reload as manual.
9. **Re-run.** The case-changed banner appears when any provenance entry's `caseUpdatedAt` predates the
   case's current `updatedAt`. **Re-run auto-fill** repeats the whole process; manual values are skipped
   by the pristine test, cleared fields refill, and the banner clears.

## 5. Architecture & Components
- `libs/shared/src/lib/autofill.ts` — `resolveCaseField` and `CaseFieldResolution`. Pure, so the API
  resolves and the tests assert against the same function.
- `libs/shared/src/lib/form-template.types.ts` — `CaseFieldPath`, `mapsTo`.
- `libs/shared/src/lib/api.types.ts` — `AutoFillProvenance`, `AutoFillFieldOutcome`, `AutoFillResultDto`.
- `apps/api/src/drafts/drafts.service.ts` — `autoFill()` (the pristine test, provenance write, timestamp
  refresh) and `pruneProvenance()` on save.
- `apps/api/src/cases/cases.service.ts` — access-scoped case reads and `toDto`.
- `apps/web/.../form-fill/form-fill-page.ts` — first-open trigger, summary state, `caseChanged`
  computed, re-run, snackbar degradation.
- `apps/web/.../shared/dynamic-form/dynamic-form.ts` — `isAutoFilled()`, `autoFillNote()`,
  `clearField()`.

## 6. Data Model & Schema
No migration was needed: `autoFillJson` was already on `FormDraft`.

```ts
type CaseFieldPath =
  | 'urn' | 'defendantName' | 'defendantDob' | 'defendantAddress'
  | 'courtName' | 'cpsReference' | 'officerInCase' | 'nextHearingAt'
  | 'offenceDate'   // derived: unique across offences, else ambiguous
  | 'charges';      // derived: every offence's chargeWording, joined by newline

interface AutoFillProvenance {
  source: 'case';
  caseUpdatedAt: string;  // the case as it was when this value was written
  value: unknown;         // exactly what was written, for the pristine comparison
  accepted: boolean;
}
```

**Mapped fields by template as delivered:** MG4 8, MG3 6, MG1 5, MG5 5, MG16 3, MG12 2, MG15 2, MG2 1.
**MG11 and MG6 have none** — MG11 by the witness rule (§8), MG6 because its placeholder fields carry no
case-derived datum.

## 7. API / Interface Contracts
- `POST /api/drafts/:id/autofill` → `{ values, outcomes, summary: { filled, total }, draft }`.
  - Draft not the user's → **404**. Draft not `DRAFT` status → **409**.
  - **Standalone draft → 400** with "this draft is not linked to a case, so there is no case file to
    populate from" — there is nothing to populate from, and pretending otherwise would be misleading.
  - Unknown form code → 400.
- `GET /api/drafts/:id` → includes `autoFill`, the provenance map, so a reload restores badges exactly.
- `PATCH /api/drafts/:id` → prunes provenance for fields whose value no longer matches. This is why an
  edited field stays manual across a reload rather than reverting to "auto-filled".
- `GET /api/cases`, `GET /api/cases/:id` → access-scoped; an inaccessible case is **404**, not 403.
- **No endpoint writes to `Case`.** The read-only guarantee is structural, not a rule someone follows.

## 8. Detailed Logic & Business Rules
- **`mapsTo` only where the case datum genuinely IS the field.** An MG11 witness is not the defendant;
  MG16's `subjectName` concerns a non-defendant under s.100 CJA 2003 and stays unmapped pending a legal
  ruling. Signatures, and officers who are not the OIC, are never mapped. The conformance gate rejects a
  `mapsTo` that is not a valid `CaseFieldPath`, and a UC-04-era rule rejects `mapsTo` on a group column
  (auto-fill has no row to aim at).
- **Derived paths never guess.** `offenceDate` collects the distinct offence dates: none → `no_data`;
  one → that date; more than one → `ambiguous` with a reason naming the count. `charges` joins every
  offence's charge wording with newlines, so nothing is dropped.
- **A field is complete when `isFieldValueComplete` says so** — the same definition UC-01's progress
  uses, so "filled" and "counts towards progress" cannot disagree.
- **The summary denominator is mappable fields, not all fields.** *"3 of 5 mappable fields were filled"*
  is a statement about what auto-fill could ever have done. Counting all fields would make every form
  look mostly unfilled and the number would carry no information.
- **Empty-string values are not values.** `direct()` treats whitespace-only case data as `no_data` with a
  reason, so a blank column in the case file produces an explanation rather than an empty prefill.
- **Timestamps are truncated to dates for date fields** (`toDateOnly`), matching the `YYYY-MM-DD`
  storage the date fields use.
- **Badges are computed, not stored.** `isAutoFilled()` compares the live control value against
  provenance on every change, so the badge is always telling the truth about the value in front of you.
- **Population failure degrades.** If the call fails the form stays fully usable and a snackbar says
  "Auto-population was unavailable — you can complete the form manually."

## 9. Data Flow & Integrations
`GET /drafts/:id` → is it case-linked, mapped, empty and unpopulated? → `POST /drafts/:id/autofill` →
case read (access-scoped) → `resolveCaseField` per mapped field → pristine test → write `valuesJson` +
`autoFillJson` → `AUTO_POPULATED` audit row → response drives badges, notes and the summary banner.
Later saves prune provenance. **The only external system is the case file, and it is read-only.**

## 10. Error Handling & Edge Cases
| Situation | Behaviour |
|---|---|
| Standalone draft | 400, and the UI never triggers population on open |
| Draft belongs to someone else | 404 |
| Draft not in `DRAFT` status | 409 |
| Case has two offence dates | `ambiguous` + reason; field left blank |
| Case lacks a datum | `no_data` + reason; field left blank |
| Case datum is whitespace | Treated as `no_data`, with a reason |
| User cleared a field, then re-runs | Refills — an empty field is fair game |
| User edited a field, then re-runs | Skipped; the manual value survives |
| Case edited after population | Banner offers **Re-run auto-fill**; re-running clears it |
| Auto-fill call fails | Snackbar explains, form remains fully usable |
| Reload after editing an auto-filled field | Provenance was pruned on save, so it stays manual |

## 11. Security & Performance (Non-Functional)
- Every case read goes through `CasesService.findForUser`; there is no unscoped case query.
- An inaccessible case id returns 404 so the API does not disclose that the case exists.
- Provenance stores the value it wrote, which for a case-linked draft means case data lands in
  `autoFillJson` as well as `valuesJson` — both inside the same access-scoped draft row, no wider.
- Audit metadata carries counts and the form code only, never case data.
- Population is one case read plus one draft write, regardless of field count. Resolution is O(fields)
  with O(offences) work on the two derived paths.

## 12. Testing Strategy
`e2e/uc02-autofill.spec.ts` — 21 checks covering the happy path, both undo routes, both non-fill outcomes,
the pristine rule in both directions, provenance recording and pruning, the change banner and re-run, the
audit write, and the standalone rejection. `e2e/mg4-charge-sheet.spec.ts` adds two mapping-discipline
checks over the largest mapped template. `e2e/uk-dates.spec.ts` asserts an auto-filled date renders
DD/MM/YYYY and keeps its badge — the case that would break if the date adapter were swapped.

Fixtures are the seeded cases: Marcus Bellamy (two offences) for ambiguity, the colleague-only case for
access control, and a case missing a datum for `no_data`.

## 13. Acceptance Criteria
The scope's Definition of Done, verbatim, with the checks that cover it:

| # | Criterion | Status | Covering checks |
|---|---|---|---|
| 1 | "Auto-population from a test case file correctly fills all matching fields without overwriting non-matching fields" | **Covered** | `first open of a case-linked draft populates and summarises`; `population never overwrites a manual value on re-run`; `auto-fill populates exactly the mapped fields and nothing else` (MG4: every mapped field, and nothing beyond them); `charges are joined from every offence on the case`; `the summary counts only mappable fields`; `unmapped fields carry no auto-fill note` |
| 2 | "Auto-filled badge displayed on every pre-filled field" | **Partial** | `filled fields carry an Auto-filled badge with a Clear affordance`; `provenance records the source, the value and the case timestamp`; `an auto-filled date shows UK format and keeps its badge` |
| 3 | "Ambiguous field handling tested with a case file containing duplicate offence entries" | **Covered** | `ambiguous case data leaves the field blank with an explanatory note`; `ambiguous and no_data outcomes are reported with reasons` |
| 4 | "Re-run auto-population on case file update works without losing manually entered values" | **Covered** | `a case that changed after population surfaces the banner, and Re-run clears it`; `population never overwrites a manual value on re-run`; `re-run refills a field that was cleared back to empty` |

#2 is **Partial** for a precise reason: the badge is asserted on *a* filled field, not on **every** field
the run filled, and the criterion says "every". A loop over the run's `filled` outcomes would close it —
see `open-questions.md` G2.

#1 is **Covered**, with one honest qualification recorded in `open-questions.md` G4: "all matching fields"
is asserted exhaustively for MG4 (its eight mapped fields, and nothing beyond them) and through the shared
resolver elsewhere, rather than field-by-field across all eight mapped templates.

## 14. Dependencies, Risks & Rollout
- **Delivered and closed.** Marker branch `mgs/uc-02-auto-population` → `3cf7644`, shared with UC-01
  because neither was proven until that commit.
- **Depends on UC-01** for the template model and the renderer. Adds no second renderer and no second
  definition of completeness.
- **Consumed by UC-03**, which asserts the negative case: MG11's witness fields must never auto-fill.
- **Open risk — the case model is fiction.** When LER-1041 lands, `resolveCaseField` is the single place
  that changes, and `CaseFieldPath` is where new paths get added (UC-04's PRD §6 documents exactly this
  route for a future `caseComplexity`).
- **Open risk — the date adapter.** Swapping to `provideNativeDateAdapter` would silently break every
  badge. Locked by CLAUDE.md rule 7 and by `an auto-filled date shows UK format and keeps its badge`.
- **Deviations from the scope wording** — the "Requires manual entry" flag and the "confirmed values
  locked" step — are documented in `open-questions.md` (D1, D2).
