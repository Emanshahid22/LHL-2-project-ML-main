# PRD: UC-04 — MG6 Unused Material Schedule

Repo: LHL-2-project-ML (`mgs-forms`) · UC branch: `mgs/uc-04-mg6-schedule` · Base:
`ali-zulqarnain/mgs-forms` · Tickets: LER-1080–LER-1093
Scope source of truth: <https://lhl-agents.netlify.app/mg-forms-scope/> (UC-04)

## 1. Overview
Add guided list entry to the form engine so unused material can be scheduled: `Add Item` rows
carrying a reference, description, material type and sensitivity classification, with numbering that
stays continuous across every mutation, confirmation before renumbering, automatic routing of
sensitive items to UC-07, and a completeness check against case complexity.

The engine piece — a **repeating-group field type** — does not exist today and is the substance of
the work. The schedule behaviour sits on top of it.

## 2. Goals & Non-Goals
**Goals:** a `group` field type in `libs/shared` with renderer support; stable row identity with
computed ordinals; gap-free numbering across add/edit/delete/reorder; renumbering confirmation; a
duplicate-reference guard; a draft-level sensitivity flag for UC-07; a configurable completeness
check writing `COMPLETENESS_CHECKED` to the audit log.

**Non-Goals:** UC-07 sensitive-material handling itself; the MG6 designation decision; MG6's field-set
rebuild from the sourced research; a finalise endpoint (UC-10); PDF rendering of the schedule (UC-09);
nested groups (a group inside a group).

## 3. Current Behaviour & Context
- `libs/shared/src/lib/form-template.types.ts` — `FieldType` is
  `text | textarea | date | time | number | select | checkbox`. **No repeating structure exists.**
  `FormFieldDefinition` carries `id`, `label`, `type`, `required`, `helpText`, optional `mapsTo`,
  `provenance`, `validation`, `options`, `section`, `placeholder`, `rows`.
  `isFieldValueComplete(value)` returns true for a non-empty string, a true boolean, or any other
  non-null value — **an empty array would therefore count as complete**, which this PRD must fix.
- `libs/shared/src/lib/form-templates.ts` — MG6 is a 7-field placeholder, `templateVersion: 1`, no
  `verification`. Its field set rebuild is separate work (research: 41/41 documented).
- `apps/web/src/app/shared/dynamic-form/dynamic-form.ts` — builds one `FormGroup` from the template,
  one `FormControl` per field, and renders by a `@switch` on `field.type`. Dates have their own
  top-level branch because a suffix nested in a control-flow block does not reach `mat-form-field`'s
  suffix slot — the same lesson applies to any new branch.
  `visibleFieldIds` narrows what renders (the MG11 wizard uses it); `showSectionTitles` toggles headings.
- `apps/api/src/drafts/drafts.service.ts` — `update()` validates `values` is an object, enforces
  optimistic concurrency on `baseVersion` (409), guards the MG11 declaration (422), prunes auto-fill
  provenance for changed values, and writes `DRAFT_SAVED` audit metadata (MG11 adds hearsay counts).
- `apps/api/src/audit/audit.service.ts` — `AuditAction` is
  `'FORM_INITIATED' | 'DRAFT_SAVED' | 'AUTO_POPULATED'`. Audit writes never break a user action.
- `FormDraft.valuesJson` is serialised JSON keyed by **field id**; the renderer ignores unknown keys,
  which is why `isVulnerableWitness` (UC-03) can live there as a derived draft-level flag.
- `tools/orphan-scan` knows deliberate derived keys and must learn the new one.
- `tools/template-conformance` scores templates; its rules assume scalar fields today.

## 4. How It Works — Mechanism
1. **Template declares the schedule.** MG6 gains a field of `type: 'group'` whose `columns` are
   ordinary `FormFieldDefinition`s (scalar types only): `itemReference`, `description`,
   `materialType` (select), `classification` (select: `non_sensitive` | `sensitive`).
2. **Renderer builds a FormArray.** `DynamicForm` sees `type: 'group'` and creates a `FormArray` of
   `FormGroup`s instead of a `FormControl`, rendering a row table with an `Add Item` button and a
   delete control per row. Each row `FormGroup` includes a hidden `__id` control.
3. **Identity is a uuid; the number is a view.** On `Add Item` the row gets
   `__id = crypto.randomUUID()`. The displayed ordinal is `index + 1`, computed at render.
   **No ordinal is ever stored.** Renumbering is therefore not an operation — it is what happens
   automatically when the array changes.
4. **Delete asks first.** The delete control opens a confirmation dialog naming the item and stating
   that the items below it will be renumbered. On confirm, the row is spliced out; ordinals recompute.
   On cancel, nothing changes.
5. **Duplicate references are blocked at the row level.** A cross-row validator on the `FormArray`
   marks a row's `itemReference` invalid when another row already uses it, so two items cannot claim
   the same disclosure reference.
6. **Sensitivity raises a draft-level flag.** Whenever any row's `classification` is `sensitive`, the
   form writes `hasSensitiveMaterial: true` into the draft values — the same mechanism UC-03 uses for
   `isVulnerableWitness`. This needs no user action, which is exactly what the scope's DoD requires.
   UC-07 consumes the flag; this UC only raises it.
7. **Completeness check.** Evaluated client-side when the item count reaches the trigger (10) and
   server-side when a finalisation attempt occurs. It compares item count against the threshold for
   the case's complexity band and, if under, surfaces a non-blocking advisory. Either way the outcome
   is written to the audit log as `COMPLETENESS_CHECKED`.
8. **Storage.** `valuesJson` gains an array under the group's field id:
   `[{ "__id": "…", "itemReference": "1", "description": "…", "materialType": "document",
   "classification": "sensitive" }]`. Additive: no other field changes, no migration.

## 5. Architecture & Components
- `libs/shared/src/lib/form-template.types.ts` — `FieldType` gains `'group'`;
  `FormFieldDefinition` gains `columns?: FormFieldDefinition[]`; new `GROUP_ROW_ID_KEY = '__id'`.
- `libs/shared/src/lib/schedule.ts` *(new)* — pure helpers: `nextOrdinal`, `withOrdinals(rows)`,
  `findDuplicateReferences(rows, columnId)`, `hasSensitiveRow(rows)`, `isGroupValueComplete(rows)`.
  Pure so both apps and the tests share one definition of correctness.
- `libs/shared/src/lib/completeness.ts` *(new)* — `COMPLEXITY_THRESHOLDS` map and
  `checkCompleteness({ itemCount, complexity })` returning `{ sparse, threshold, complexity }`.
- `libs/shared/src/lib/form-templates.ts` — MG6 declares the group field; `templateVersion` bumps;
  `verification: 'unverified'`.
- `apps/web/.../dynamic-form/` — a `'group'` branch rendering the row table, plus a small
  `ScheduleRowsComponent` so the group's markup does not bloat the renderer template. A confirmation
  dialog component for deletion.
- `apps/api/src/drafts/drafts.service.ts` — validate group values on save; write
  `COMPLETENESS_CHECKED`; extend `DRAFT_SAVED` metadata with `unusedMaterialItemCount` and
  `hasSensitiveMaterial`.
- `apps/api/src/audit/audit.service.ts` — `AuditAction` gains `'COMPLETENESS_CHECKED'`.
- `tools/orphan-scan/index.js` — add `hasSensitiveMaterial` to `DERIVED_KEYS`.
- `tools/template-conformance` — teach the structural rules about `group` (columns present, scalar
  column types, no nested group, unique column ids).

## 6. Data Model & Schema
**No Prisma migration.** `FormDraft.valuesJson` keeps its shape; the schedule is one more key.

**Case complexity — decision and justification.** The completeness check needs a complexity
indicator. Two options were considered:

| Option | Verdict |
|---|---|
| Add `complexity` to the `Case` Prisma model + seed data | **Rejected for now** |
| A manual entry field on the form, with a documented migration path | **Chosen** |

Reasons: (1) **standalone drafts must work** — UC-01 supports starting a form with no case linked, and
a case-derived-only indicator would leave the check permanently inert for those drafts; (2) the `Case`
model is **seeded fiction**, so a `complexity` column would encode a guess about what the real
case-management system exposes, and LER-1041 (case system integration) is the ticket that will
actually know; (3) the repo's standing rule is additive, migration-avoiding change.

**Migration path when integration lands:** add `complexity` to `CaseSummaryDto`, add a
`'caseComplexity'` member to `CaseFieldPath`, set `mapsTo: 'caseComplexity'` on the field. UC-02 then
auto-fills it, badges it, and the manual value becomes the override — the established pattern, no
rework of the check.

**Threshold configuration** (`libs/shared/src/lib/completeness.ts`, not hardcoded at call sites):

```ts
export const COMPLEXITY_THRESHOLDS = {
  complex:      { minItems: 5 },  // scope: "Complex" with fewer than 5 items is sparse
  standard:     { minItems: 3 },
  summary_only: { minItems: 1 },  // scope: "Lower threshold applied for summary-only matters"
} as const;
export const COMPLETENESS_TRIGGER_ITEM_COUNT = 10; // scope: "fires after 10+ items"
```

## 7. API / Interface Contracts
**Additive only. No new endpoints.**
- `GET /api/form-templates` and `/:code` — a field may now carry `type: 'group'` and `columns`.
  Existing consumers ignore unknown keys.
- `PATCH /api/drafts/:id` — `values` may contain an array of row objects under a group field id.
  Rejections (**422**, matching the MG11 declaration guard's precedent): a group value that is not an
  array; a row that is not an object; a row missing `__id`; a duplicate `__id` within the array; a row
  key that is not one of the declared column ids.
  Example: `{"values":{"unusedMaterialItems":[{"__id":"a1…","itemReference":"1",
  "description":"Officer's notebook","materialType":"document","classification":"non_sensitive"}]},
  "baseVersion":3}` → 200.
- `GET /api/drafts/:id` — returns the array as stored; `values.hasSensitiveMaterial` present when any
  row is sensitive.

## 8. Detailed Logic & Business Rules
- **Ordinal = array index + 1, computed at render, never persisted.** Any stored counter is a defect.
- **Gap-free by construction.** Because the ordinal is derived from position, no operation can leave a
  gap. The scope's "gaps are not permitted without explicit deletion" is satisfied by design, and the
  QA story asserts it across add, edit, delete and reorder.
- **`__id` is immutable for the life of the row.** Edit and reorder must never regenerate it — audit
  entries and (later) UC-07 sensitivity decisions attach to `__id`, not to the number.
- **Delete requires confirmation** naming the item and stating that following items renumber. Cancel
  is a true no-op.
- **Duplicate `itemReference` invalidates the row**, not the whole form, so the user can see which two
  rows collide.
- **`hasSensitiveMaterial`** is recomputed on every change and removed when no sensitive row remains
  (a flag that latches on would over-report). It is derived — never user-editable.
- **Completeness is advisory, never blocking.** It fires at `>= 10` items or on a finalisation attempt,
  compares against the band's `minItems`, and its result is recorded either way — a check that only
  logs failures cannot prove it ran.
- **Empty-array completeness.** `isFieldValueComplete([])` currently returns true, which would let an
  empty required schedule count as done. A group field is complete only when it has at least one row
  and every required column in every row is complete.
- **Ordering is user-controlled**, and reorder is a first-class operation, not a side effect of
  delete-and-re-add (which would destroy `__id` and its history).

## 9. Data Flow & Integrations
No external systems. Flow: template declares group → renderer builds `FormArray` → user edits →
autosave `PATCH` (existing 1.5s debounce, existing optimistic concurrency) → API validates the array,
writes `DRAFT_SAVED` metadata → completeness evaluated → `COMPLETENESS_CHECKED` audit row. The
sensitivity flag is an **internal contract to UC-07**, which has no implementation yet.

## 10. Error Handling & Edge Cases
- Malformed group value / row / missing or duplicate `__id` / unknown column key → **422** with a
  message naming the field.
- Concurrent edits → existing **409** on stale `baseVersion`; the whole array is replaced atomically,
  so two tabs cannot interleave rows.
- Delete the last remaining row → allowed; a required schedule then reads incomplete (see §8).
- Duplicate reference → row-level validation error, save still permitted (drafts may be incomplete).
- Complexity not chosen → the check does not fire and records `complexity: 'unknown'` rather than
  guessing a band.
- Audit write failure → logged, never surfaced (existing `AuditService` behaviour).
- A legacy draft whose value under the group id is a string (should not occur, but the column is
  free-form JSON) → treated as empty and reported by `orphan-scan` rather than crashing the renderer.

## 11. Security & Performance (Non-Functional)
- No new auth surface; all access stays scoped to `req.user` via the existing guard.
- **No PII in identifiers.** `__id` is a random uuid — never a name, reference or file path. This
  matters because the ids reach audit rows and, later, storage keys.
- **Sensitive means marked, not protected.** Until UC-07 lands the flag is advisory. Nothing in this
  UC may be described as making disclosure safe.
- Schedules are expected in the tens of rows; the `FormArray` and the cross-row duplicate check are
  O(n²) in the worst case, which is fine at that scale — revisit above ~500 rows.
- Autosave already debounces at 1.5s, so row edits do not amplify write volume.

## 12. Testing Strategy
- **Unit (shared, pure):** `withOrdinals` after add/edit/delete/reorder; `findDuplicateReferences`;
  `hasSensitiveRow`; `isGroupValueComplete` including the empty-array case;
  `checkCompleteness` at every band boundary (4 vs 5 items complex; summary-only lower bar; unknown).
- **E2E (Playwright, existing style):** Add Item creates a row; ordinals are 1..n; deleting row 2 of 3
  prompts, and on confirm the survivors read 1,2 while their `__id`s are unchanged; cancel is a no-op;
  reorder preserves `__id`; duplicate reference shows a row error; marking a row sensitive sets
  `hasSensitiveMaterial` with no further action; the completeness advisory appears at 10 items and for
  a Complex case with 4; `COMPLETENESS_CHECKED` is written; the full existing suite stays green and no
  `data-testid` changes.
- **Designation independence:** a test asserts the schedule renders from a template declaring a group
  regardless of its `code`, and that no source file branches on `'MG6'` for schedule behaviour.
- **Conformance/orphan-scan:** `npm run conformance` passes with a group template;
  `npm run orphan-scan` reports zero orphans and does not flag `hasSensitiveMaterial`.

## 13. Acceptance Criteria
The scope's DoD, verbatim, plus the repo's standing rules:
- "MG6 schedule numbering is correct and sequential across add, edit, and delete operations"
- "Renumbering on deletion prompts user confirmation before executing"
- "Completeness check fires correctly for 'Complex' cases with fewer than 5 items"
- "Sensitive classification automatically triggers UC-07 handling without additional user action"
- No stored ordinal exists anywhere; `__id` survives every mutation.
- Thresholds are configurable in one place, not literals at call sites.
- Full E2E suite green; every existing `data-testid` intact; `dev.db` cleaned after tests.

## 14. Dependencies, Risks & Rollout
- **Prerequisite delivered here:** the repeating-group field type (LER-1080–1082). It also unblocks
  MG12 and the MG6C/D schedules, so design it as engine work.
- **Depends on a decision, not blocked by it:** the MG6 designation. Nothing branches on form code.
- **Risk:** numbering treated as identity — mitigated by uuid + computed ordinal, asserted by tests.
- **Risk:** the sensitivity flag read as "disclosure handled" — mitigated by wording in the UI and by
  UC-07 owning the actual handling.
- **Risk:** `isFieldValueComplete([])` returning true silently marking empty schedules complete —
  explicitly fixed and tested.
- **Rollout:** additive and behind the existing `verification: 'unverified'` marker on MG6; no
  migration, no downtime. Ship the engine first (LER-1080–1082), then numbering (1083–1085), then the
  destructive paths behind confirmation (1086–1088), then sensitivity (1089), then completeness
  (1090–1092), then QA (1093) — each independently reviewable.
