# PRD — UC-01 Form Selection & Initiation

> **Retrospective, as-built.** This PRD documents what the delivered code actually does, verified
> against the source and the E2E suite on `mgs/docs-backfill-uc01-03`. Where the build differs from the
> scope document, the difference is recorded in `open-questions.md` rather than smoothed over here.
> Epic: `docs/usecases/uc-01/epic.md`. Completion commit `3cf7644`.

## 1. Overview
UC-01 delivers the path into the product: pick an MG form, decide whether it belongs to a case, and get
a rendered form that states what it needs and remembers what you typed. It also delivers the template
model that the rest of the product is built on — a form is a data structure in `libs/shared`, rendered
by one component, so eleven forms need one renderer and a twelfth needs no new code.

The scope's main flow is implemented end to end: picker → "Link to a case?" → template loads with
required markers and `?` help → progress indicator in the header → save at any point.

## 2. Goals & Non-Goals
**Goals**
- All eleven MG templates selectable and renderable from one component.
- Case linking that can only ever offer cases the signed-in user may read.
- Required-field progress that is live, honest and derived from the template.
- Drafts that survive a reload without being asked to save, and an explicit save that confirms.
- Failure paths that explain themselves: no blank screens, no silent data loss.

**Non-Goals**
- Auto-population (UC-02), the MG11 wizard (UC-03), schedules (UC-04), server-side validation (UC-05),
  PDF (UC-09), finalise/archive (UC-10).
- Proving a template's field set is correct. UC-01 delivers the *marker* for that, not the sign-off.
- Real authentication or a real case-management integration.

## 3. Current Behaviour & Context
Before UC-01 there was no product. The relevant context is what UC-01 chose, because those choices bind
everything after it:

- **`libs/shared` is framework-free** and consumed by both apps, so the same field definition drives the
  Angular renderer, the Nest API's validation and (later) PDF layout. There is no second definition of
  a form anywhere.
- **`FormDraft.valuesJson` is keyed by field id.** The renderer reads only the ids the template
  declares and ignores unknown keys. This makes adding fields free and renaming them dangerous: a
  renamed id silently strands whatever the user typed, and the next autosave (1.5s) can write the pruned
  object back. Hence the standing **additive-only** rule and, later, `npm run orphan-scan`.
- **`templateVersion` is recorded but not honoured.** `form-fill-page.ts` loads the template by
  `formCode`, so a draft created against v1 renders against v2's field set. Accepted while changes are
  additive; see `open-questions.md`.
- **The verification / provenance model.** Nine of eleven templates began as placeholders. Rather than
  let them look authoritative, a template can carry `verification: 'unverified'` and each field a
  `provenance` (`documented` = a source shows the box exists, `likely` = plausible but unconfirmed,
  `inference` = our own reasoning). An unverified template shows a persistent header chip reading
  *"Unverified template — pending practitioner sign-off"*. Absent `verification` means "not yet
  assessed", which is why MG11 and MG5 — the quality bar — carry no marker and equally are **not**
  marked verified.

## 4. How It Works — Mechanism
1. **Picker.** The dashboard fetches `GET /api/form-templates` and renders one card per template with
   its real `code`, `name` and `description`, plus a hand-drawn inline SVG icon. The picker is the first
   section on the page and is asserted to be fully visible without scrolling at 1366×768 and 1920×1080.
2. **Case-link decision.** Choosing a card opens `CaseLinkDialog`, which lists cases from
   `GET /api/cases` — already scoped to the user by `CaseAccess` — plus an explicit *Standalone* option.
   Cancelling creates nothing. If the case list cannot load, the dialog says so and still allows a
   standalone start.
3. **Initiation.** `POST /api/drafts` with `{ formCode, caseId }` creates the draft, stamps
   `templateVersion` from the template, and writes a `FORM_INITIATED` audit event. If the requested case
   is not accessible the draft is created **standalone** and the response carries `caseLinkWarning`,
   which the form page shows as a banner — a denied link degrades, it does not fail.
4. **Initiation from a case.** The case detail page's *Complete MG Form* opens a form picker dialog only
   — the case is already known, so the link question is skipped entirely.
5. **Render.** `DynamicForm` builds one `FormGroup` from the template: a control per field, validators
   from `required` and `validation`, fields grouped under their `section` headings. Each field carries
   `data-field-id`, a `?` help toggle revealing `helpText`, and an inline error message. Material renders
   the required marker; the renderer does not add a second asterisk.
6. **Progress.** The page counts required fields whose control is both valid and non-empty
   (`isFieldValueComplete`), recomputed on every `valueChanges`, and renders *N of M required fields
   completed* with a progress bar.
7. **Save.** Explicit **Save draft** issues `PATCH /api/drafts/:id` with `{ values, baseVersion }` and
   confirms with a snackbar. Autosave issues the same call 1.5s after the last change, and only when the
   serialised values differ from what was last saved. Concurrent saves queue rather than interleave.
8. **Concurrency.** The update applies only if the stored `version` still equals `baseVersion`;
   otherwise **409** and the UI asks the user to reload rather than overwriting newer work.
9. **Resume.** The work queue lists the user's drafts most-recently-touched first with per-draft
   *N of M* progress; opening one restores every saved value into the same renderer.

## 5. Architecture & Components
- `libs/shared/src/lib/form-template.types.ts` — `FormTemplate`, `FormFieldDefinition`, `FieldType`,
  `FieldValidation`, `CaseFieldPath`, `TemplateVerification`, `FieldProvenance`, `isFieldValueComplete`,
  `requiredFieldIds`.
- `libs/shared/src/lib/form-templates.ts` — the eleven templates and `getFormTemplate`.
- `apps/api/src/form-templates/` — `GET /api/form-templates`, `GET /api/form-templates/:code`.
- `apps/api/src/drafts/` — create, list, get, update; optimistic concurrency; audit writes.
- `apps/api/src/cases/` — access-scoped case reads (`CaseAccess` join).
- `apps/api/src/audit/audit.service.ts` — append-only writes; a failed audit write never breaks a user
  action.
- `apps/web/.../dashboard/` — `dashboard-page`, `case-link-dialog`, work queue, hero stats.
- `apps/web/.../case-detail/` — `case-detail-page`, `form-picker-dialog`.
- `apps/web/.../form-fill/form-fill-page.ts` — load, progress, autosave, save state, banners.
- `apps/web/.../shared/dynamic-form/` — the single renderer for every template.
- `apps/web/src/styles/_tokens.scss` — design tokens; amber is advisory, red is reserved for UC-07.

## 6. Data Model & Schema
Prisma (`apps/api/prisma/schema.prisma`), SQLite in dev, kept portable to PostgreSQL:

- `User`, `Case`, `CaseOffence`, `CaseAccess` (the user↔case grant that scopes every case read),
  `FormDraft`, `AuditEvent`.
- `FormDraft`: `formCode`, `templateVersion`, `status` (`DRAFT | FINALISED | ARCHIVED`), `version`
  (optimistic concurrency counter), `valuesJson`, `autoFillJson`, `userId`, `caseId?`.
- `AuditEvent`: `action`, `formDraftId?`, `metadataJson?`. Metadata never carries case data beyond
  opaque ids. Actions at UC-01: `FORM_INITIATED`, `DRAFT_SAVED`.
- Identifiers are cuids. **No case data (URN, name) ever appears in an id, URL or storage path.**

**The template model, in the type system rather than the database.** Templates are code, not rows, so a
field change is a reviewable diff:

```ts
type FieldType = 'text' | 'textarea' | 'date' | 'time' | 'number' | 'select' | 'checkbox' | 'group';
type TemplateVerification = 'verified' | 'unverified';   // absent = not yet assessed
type FieldProvenance = 'documented' | 'likely' | 'inference';
```

Current state: MG3, MG4, MG6, MG12, MG15 and MG16 carry `verification: 'unverified'`; MG1, MG2, MG5,
MG11 and MG14 carry none. **No template is `verified`** — that is a practitioner's act.

## 7. API / Interface Contracts
All routes are behind `DemoAuthGuard`, which resolves the demo user (or `x-user-email`) onto the request.

- `GET /api/form-templates` → every template. `GET /api/form-templates/:code` → one, 404 otherwise.
- `GET /api/cases` → the signed-in user's accessible cases. `GET /api/cases/:id` → 404 (not 403) for a
  case the user cannot see, so the endpoint does not confirm the existence of other people's cases.
- `POST /api/drafts` `{ formCode, caseId? }` → `{ draft, caseLinkWarning? }`. Unknown `formCode` → 400.
  An inaccessible `caseId` does **not** fail: the draft is standalone and the warning is returned.
- `GET /api/drafts` → the user's `DRAFT`-status drafts, newest first. `GET /api/drafts/:id` → 404 for
  another user's draft.
- `PATCH /api/drafts/:id` `{ values, baseVersion }` → the updated draft. `values` not an object → 400;
  stale `baseVersion` → **409**; a non-`DRAFT` status → 409.
- `GET /api/me` → the signed-in user (drives the app bar).

## 8. Detailed Logic & Business Rules
- **A field is complete when `isFieldValueComplete` says so**: not `''`, `null`, `undefined` or `false`.
  One definition, shared by the header progress, the per-draft queue progress and the wizard.
- **Progress counts validity as well as content.** A required field holding an invalid value is not
  complete, so the count cannot overstate readiness.
- **Required marking is Material's**, not ours — the renderer adds no asterisk of its own inside a form
  field (it did once, producing "URN * *"). Checkboxes sit outside `mat-form-field` and do add one.
- **Autosave is debounced 1.5s and skips no-op saves** by comparing serialised values with the last
  saved payload. A save in flight queues the next one instead of racing it.
- **Optimistic concurrency is per draft, not per field.** The whole values object is replaced, so two
  tabs cannot interleave; the loser gets 409 and is told to reload.
- **A denied case link degrades, never blocks.** The user keeps the form; the banner explains the link
  was dropped and that it can be linked later.
- **Dates are DD/MM/YYYY on screen and ISO `YYYY-MM-DD` in storage**, via a custom `IsoDateAdapter`
  (`DateAdapter<string>`). `provideNativeDateAdapter` is deliberately not used: `Date` objects in
  controls would change what persists and break UC-02's provenance comparison. `31/02/2026` is rejected
  as an impossible date rather than rolled over to 3 March; weeks start Monday.
- **MG1 is retained** although research says it is not in the current MG suite, because the DoD requires
  eleven forms and ~20 assertions use it as a fixture. It is never padded to look complete.

## 9. Data Flow & Integrations
No external systems. Flow: dashboard → `GET /form-templates` → picker → `GET /cases` → dialog →
`POST /drafts` (+`FORM_INITIATED`) → navigate to `/drafts/:id` → `GET /drafts/:id` →
`GET /form-templates/:code` → `DynamicForm` builds the `FormGroup` → user types → progress recomputes →
debounced `PATCH /drafts/:id` (+`DRAFT_SAVED`). The case file is **read-only**: no API path writes to
`Case`.

## 10. Error Handling & Edge Cases
| Situation | Behaviour |
|---|---|
| Template list fails to load | Dashboard shows an error panel with **Retry**; the rest of the page still works |
| Draft fails to load | Form page shows an error panel with **Retry** |
| Unknown form code | `POST /drafts` → 400 |
| Case not accessible at initiation | Draft created standalone + `caseLinkWarning` banner |
| Case not accessible on direct fetch | 404, not 403 |
| Another user's draft | 404 |
| Stale save (two tabs) | 409 + "reload to continue from the latest version" |
| Save fails (network) | Save state goes to `error`, a dismissible snackbar explains, the form stays editable |
| Empty work queue | Friendly empty state, not a blank list |
| Filter matches nothing | Explicit no-matches state |
| Audit write fails | Logged server-side, never surfaced, never breaks the action |

## 11. Security & Performance (Non-Functional)
- Every case and draft read is scoped to `req.user`; there is no unscoped query on either table.
- Case reads for an inaccessible id return 404 so the API does not disclose existence.
- No PII in identifiers, URLs or storage paths — cuids only. (LER-1018, a storage-key PII scan, is a
  not-started ticket that would automate this check.)
- Autosave is debounced, so a burst of typing is one write, not one per keystroke.
- The renderer builds one `FormGroup` per form; MG3's 59 fields render without special handling.
- Icons are inline SVG, deliberately not an icon font: a font that fails to load renders icon *names* as
  visible text and pollutes assertions.

## 12. Testing Strategy
`e2e/uc01-form-selection.spec.ts` (20 checks) covers the use case; `e2e/dashboard.spec.ts` (25) covers
the surface it lives on; `e2e/uk-dates.spec.ts` (8) covers the date convention including a sweep of all
eleven templates; `e2e/mg4-charge-sheet.spec.ts` (9) covers the verification/provenance model.
Full suite 122 checks, in CI on every push, plus `npm run conformance` (25 self-tests, 11/11 templates).

The suite drives the real API and the real database. Every draft it creates is logged to
`E2E_DRAFT_LOG` and deleted afterwards, so the user's own drafts survive a run.

## 13. Acceptance Criteria
The scope's Definition of Done, verbatim, with the checks that cover it:

| # | Criterion | Status | Covering checks |
|---|---|---|---|
| 1 | "All 11 MG forms are available and load correctly" | **Partial** | `picker offers all 11 MG forms`; `cards keep [data-form-code] and render code, name and description`; `all 11 cards lay out 4-up on a wide screen`; `every date field across all 11 forms uses the shared datepicker` (loads each template in turn) |
| 2 | "Case-link selection shows correct case list filtered to user's accessible cases" | **Covered** | `dialog lists only accessible cases and never the colleague-only case`; `a case belonging only to a colleague is not readable`; `another user's draft is not readable` |
| 3 | "Progress indicator updates in real time as fields are completed" | **Covered** | `header progress reports N of M required fields and advances as they are filled`; `each row shows required-field progress computed from the template` |
| 4 | "Draft save is confirmed by UI and persists across browser sessions" | **Partial** | `explicit Save draft persists and confirms with a snackbar`; `debounced autosave persists without an explicit save`; `draft appears in the work queue and resumes with its saved values` |

Why the two Partials — both are about the criterion, not the code: #1 because MG1 is not in the current
official MG suite (0/7 fields corroborated) so "all 11 MG forms" may be the wrong target, and #4 because
persistence is proven across a reload and a fresh browser context, which is server-side persistence;
"browser sessions" is not defined further in the scope. Both are in `open-questions.md`.

## 14. Dependencies, Risks & Rollout
- **Delivered and closed.** Marker branch `mgs/uc-01-form-selection` → `3cf7644`. UC-01 and UC-02 share
  a marker: their implementations landed at `93440c4` and `f83cf53`, but neither was proven until
  `3cf7644`, and a use case is not complete until its behaviour is proven.
- **Downstream:** UC-02 extends the same renderer with badges; UC-03 wraps it in a wizard shell
  (`visibleFieldIds`) rather than forking it; UC-04 adds the `group` field type to the same model.
- **Open risk — `templateVersion` not honoured.** Safe only while every template change is additive.
  Honouring it (or adopting forward migration) is roadmap item 4.
- **Open risk — MG1.** Retained pending a decision-maker ruling; if it is dropped, ~20 fixtures move.
- **Human dependency:** practitioner verification of every template's field set. The marker and the
  guardrails are delivered; the sign-off is not. See `human-instructions.txt`.
