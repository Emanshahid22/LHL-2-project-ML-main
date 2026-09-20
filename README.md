# MGs Forms

Legal document assistance module for UK defence solicitors: guided completion of the
standardised **MG forms** used in police case files. All ten scoped use cases are
delivered — form selection, auto-population, the MG11 wizard, the MG6 schedule, field
validation, legal-language assistance, sensitive-material handling, review & quality
check, PDF/DOCX generation, and the versioned archive — plus **Release-01:
authentication & RBAC** (self-hosted OAuth2 + PKCE, four roles, guard-by-default API).

## Documentation map

| Question | Where |
|---|---|
| History, decisions, roadmap | `docs/HANDOVER.md` (start here) · `CLAUDE.md` (short version) |
| Who runs and uses this | `docs/release/handover.md` — admin guide, user guide, ops runbook, fast-follows |
| How staging deploys | `docs/deployment/release-01-staging-runbook.md` + `docs/deployment/railway-staging.md` |
| Release confidence | `docs/release/release-readiness-report.md` (LER-1187–1193, with honest depth statements) · `docs/release/uat-script.md` |
| Every non-code decision | `docs/decisions/provisional-decision-register.md` (D-A..D-J, all PROVISIONAL) |
| Scope coverage | `docs/acceptance-mapping.md` · per-UC packs in `docs/usecases/` |
| PR audit record | `docs/pr-bodies/` |

## Stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | Angular 20 (standalone components, signals), Reactive Forms, Angular Material |
| Backend  | NestJS 11 |
| Data     | Prisma ORM on SQLite (dev) — schema portable to PostgreSQL |
| Layout   | npm-workspaces monorepo: `apps/web`, `apps/api`, `libs/shared` |

## Setup

Requires Node ≥ 20.

```bash
npm install            # installs all workspaces and builds libs/shared
npm run db:setup       # applies migrations and seeds demo data
npm run dev            # runs API (:3000) and web app (:4200) together
```

Open <http://localhost:4200>. The Angular dev server proxies `/api` to the NestJS app.

Seeded demo data: five credentialed users (one per role, two Senior Solicitors) and ten
fictional cases. Sign in at `/login` — the dev/e2e password for every seeded account is
`mgs-dev-password-2026!` (`apps/api/prisma/seed.js`; deployed environments override it via
`SEED_USER_PASSWORD` with a forced first-sign-in change — decision D-I). **Alex Marlowe**
(`demo.solicitor@example.co.uk`, Senior Solicitor with the sensitive-material grant) is the
primary demo user; *R v Whitfield* belongs to Priya Chandran and must never appear in his
case picker.

## Monorepo layout

```
apps/web       Angular app (dashboard, case detail, dynamic form filler)
apps/api       NestJS API (OAuth2+PKCE auth, RBAC, cases, drafts, documents, archive, audit)
libs/shared    Framework-free domain package used by BOTH apps:
                 form-template.types.ts   template/field type system
                 form-templates.ts        the 11 MG form definitions
                 api.types.ts             API request/response contracts
                 mg11-declaration.ts      statutory declaration + integrity hash
                 narrative-flags.ts       hearsay/opinion detection (pure)
                 mg11-witness.ts          vulnerable-witness derivation
```

`libs/shared` compiles to plain CommonJS (consumed by Node) and is consumed as TypeScript
source by Angular via a `paths` mapping — one source of truth, no duplication of form
definitions or DTOs.

## Data model (`apps/api/prisma/schema.prisma`)

- **User** — authenticated subject (server-side sessions, Argon2id credentials, roles as
  data); all data access is scoped to the requesting user and gated by capability.
- **Case** — fictional case records (URN, defendant details, court, CPS reference,
  officer in the case). `offenceSummary` is a single display string; the individual
  charged offences live in **CaseOffence**.
- **CaseOffence** — one charged offence (date + charge wording); a case can carry
  several, and auto-population treats disagreeing offences as ambiguous, never guessing.
- **CaseAccess** — user↔case grants; every case query goes through this table, so real
  RBAC can be layered on without touching call sites.
- **FormDraft** — a form instance. Versioning-ready by design:
  - `valuesJson` — field values as a JSON object keyed by field id
  - `version` — increments on every save; saves carry a `baseVersion` and conflict with
    409 (optimistic concurrency), the foundation for the versioned archive use case
  - `templateVersion` — records the template revision the draft was created against. **It is recorded
    and NOT honoured:** `form-fill-page.ts` loads a template by `formCode` alone, so an old draft renders
    against the newest field set. That is why template edits are additive-only — renaming an id would
    strand the value on the next autosave — and why `npm run orphan-scan` exists. Honouring it (or
    adopting forward-migration) is on the roadmap
  - `status` — `DRAFT` today; `FINALISED` / `ARCHIVED` later
  - `autoFillJson` — per-field auto-fill provenance (UC-02): the source, the case's
    `updatedAt` at population time, the exact value written, and an accepted flag. A
    draft value differing from the recorded one marks the field as manually edited.
- **AuditEvent** — append-only trail (`userId`, `action`, `formDraftId`, `metadataJson`,
  timestamp). Written by `AuditService` for `FORM_INITIATED` and `DRAFT_SAVED`; audit
  failures are logged, never surfaced as user errors.

SQLite portability notes: `status`/`action` are strings (SQLite has no enums) whose values
already match the shared union types — on Postgres they can become native enums; the
serialised-JSON columns can become `Json`. Switch the datasource provider and re-migrate.

**Identifier hygiene:** URLs, file names and storage paths only ever contain opaque cuids.
Case data (URNs, defendant names) appears solely in response bodies and rendered UI.

## The template system

A form is a `FormTemplate`: ordered `FormFieldDefinition[]`, each with `id`, `label`,
`type` (`text | textarea | date | time | number | select | checkbox | group`), `required`,
contextual `helpText`, optional `validation` rules and an optional `section` heading.
`DynamicForm` (apps/web) builds a `FormGroup` from any template — adding a new form (or
field) is purely a data change in `libs/shared`; no new components are required.

A **`group`** field is a repeating group: a numbered list of rows, declared by giving the
field `columns` (themselves ordinary field definitions). The renderer builds a `FormArray`
of row `FormGroup`s and draws a row table with add, delete and reorder controls. A group
may also declare `sensitivityFlag` (which column value raises a derived draft-level flag)
and `complexityFieldId` (which field holds the band its completeness check compares
against). Nothing keys off a form code, so a schedule can move between forms as data.

MG11 (witness statement) and MG5 (case summary) carry realistic field sets; the other nine
(MG1, MG2, MG3, MG4, MG6, MG12, MG14, MG15, MG16) are reasonable placeholders.

Auto-population (UC-02) builds on this: a field may declare `mapsTo`, a typed path into
the case DTO (`urn`, `defendantName`, `defendantDob`, `defendantAddress`, `courtName`,
`cpsReference`, `officerInCase`, `nextHearingAt`, plus the derived `offenceDate` and
`charges`, which resolve from the case's offences). The shared `resolveCaseField`
resolver never guesses — conflicting offence data yields an `ambiguous` outcome with a
human-readable reason, and absent data yields `no_data`. Fields where case data would be
wrong (an MG11 witness name is not the defendant) simply carry no `mapsTo`.

How the remaining use cases plug in:

- **Field validation (UC-05): delivered** (PR #85). Formats live in a `FIELD_FORMATS` registry with
  provenance, cross-field rules compare against a sibling field or a case datum, and the API records what
  the browser shows from the same pure `validateForm` — client and server cannot disagree. A format may be
  `error` severity only if its provenance is `documented` with a citation; everything else is advisory and
  blocks nothing. See `docs/usecases/uc-05/`.
- **Sensitive material handling (UC-07):** consumes the `hasSensitiveMaterial` flag UC-04
  raises. Until it lands, sensitive means *marked*, not *protected*.
- **PDF generation (UC-09):** templates are the layout source — iterate `fields` (with
  `section` groupings) against `valuesJson`.
- **Form archive and case attachment (UC-10):** `version` + `status` + immutable
  `AuditEvent`s; a finalise endpoint flips status and snapshots the draft.
- **Audit trail:** extend the `AuditAction` union and call `AuditService.record` from new
  write paths — UC-04 added `COMPLETENESS_CHECKED` this way.

## API surface

All routes are guarded by `SessionAuthGuard` + `CapabilityGuard` (Release-01): a session
cookie resolves the user, `@Requires` metadata names the capability each route needs, and a
boot-time completeness check refuses to start the server if any route is undeclared. (The
pre-Release-01 `DemoAuthGuard`, which resolved users from an `x-user-email` header, is gone —
the swap-in-real-auth promise it existed for was kept in PR #211.)

```
GET   /api/me                    current user
GET   /api/form-templates        all 11 templates
GET   /api/form-templates/:code  one template (404 if unknown)
GET   /api/cases                 cases accessible to the current user
GET   /api/cases/:id             one case (404 if inaccessible OR missing)
POST  /api/drafts                initiate a form {formCode, caseId?}
                                 → inaccessible caseId ⇒ standalone + warning
GET   /api/drafts                current user's drafts (In Progress list)
GET   /api/drafts/:id            resume a draft
PATCH /api/drafts/:id            save values {values, baseVersion} → 409 on conflict
POST  /api/drafts/:id/autofill   populate mapped fields from the linked case (UC-02)
                                 → {values, outcomes, summary, draft}; 400 if standalone
```

## UC-01 behaviour implemented

- Form picker with all 11 forms; "Link to a case?" dialog listing only accessible cases
  (or standalone); case detail page with **Complete MG Form** that pre-links the case.
- Dynamic renderer with required-field marking, per-field "?" contextual help, inline
  validation messages.
- Live header progress: *N of M required fields completed*, driven by `valueChanges`.
- Debounced autosave (1.5 s) + explicit **Save draft** with snackbar; drafts persist via
  the API and survive browser restarts; dashboard **In progress** list resumes drafts.
- Failure handling: template/draft load errors show a Retry action; a draft requested
  against an inaccessible case is initiated standalone with an explanatory banner.

## UC-02 behaviour implemented

- First open of a case-linked draft with no values runs auto-population automatically and
  shows a dismissible summary: *"X of Y mappable fields were filled from the case file."*
- Filled fields carry an **Auto-filled** badge with a **Clear** affordance; editing (or
  clearing) a field turns it manual — the badge goes and stays gone across saves, because
  the server prunes provenance for any saved value that differs from what auto-fill wrote.
- Population never overwrites user input: only empty fields, or fields still holding
  exactly the value a previous run wrote, are fillable. Manual edits always survive
  re-runs.
- Ambiguous case data (e.g. Marcus Bellamy's two offence dates) leaves the field blank
  with a subtle *"Not auto-filled — …"* note explaining why; missing case data
  (`no_data`) is flagged the same way. Unmapped fields get no extra noise.
- Each provenance entry records the case's `updatedAt`; if the case changes afterwards,
  the form shows *"The case file has changed since this form was populated"* with a
  **Re-run auto-fill** button. Re-running refreshes pristine/empty mapped fields only.
- Standalone drafts never call autofill (the endpoint also rejects them with 400); if the
  call fails, a snackbar explains and the form stays fully usable for manual entry.
- Every run writes an `AUTO_POPULATED` audit event with `{formCode, filled, total}`.

## UC-03 behaviour implemented

MG11 is completed through a guided four-step wizard. Every other form keeps the flat
renderer — the wizard is an MG11-specific shell **around** the shared field machinery,
not a fork of it: `DynamicForm` still owns the single `FormGroup`, and the wizard only
narrows which fields it displays (`visibleFieldIds`).

- **Steps:** 1 witness details (including the new `title` field and the witness-care
  fields), 2 statement narrative, 3 declaration, 4 signature and date. Step headers are
  clickable once visited, each step shows its own required-field count, and the header's
  overall *N of M required fields completed* is unchanged. Autosave and **Save draft**
  work on every step, and resuming a draft returns to the furthest incomplete step.
  MG11's `templateVersion` is **5** (UC-03 added `title` and `specialMeasuresApplied`; UC-05 added validation rules; UC-06 declared `statementText` a narrative; UC-08 declared the exhibit-reference `crossRef` on `exhibitsReferenced` — annotation only).

- **Declaration integrity.** The s.9 CJA 1967 / s.5B MCA 1980 wording lives in one place,
  `MG11_DECLARATION` in `libs/shared`, and is rendered read-only. It is **not** a form
  field and is **never** stored per draft — a draft records only
  `declarationConfirmed: true`. `MG11_DECLARATION_SHA256` pins the wording: the API
  hashes the constant on startup and **refuses to start** on a mismatch, so drift fails
  loudly instead of reaching a witness. `PATCH /drafts/:id` returns **422** for a
  `declarationText` key (on any form — wording is server-owned) and for a
  non-boolean `declarationConfirmed`. The user cannot pass step 3 until it is ticked.

- **Hearsay and opinion flagging.** `detectNarrativeFlags` (pure, in `libs/shared`) finds
  the scope's patterns — *I was told that*, *I heard that*, *In my opinion*, *I think*,
  *In my view* — case-insensitively and on word boundaries, with the pattern list kept as
  data so it can grow. Matches are drawn as amber underlines by a highlight backdrop
  aligned behind a transparent textarea (a textarea cannot style its own ranges); hovering
  a phrase explains what to do instead. Flagging is **strictly non-blocking**: saving,
  navigating and completing all work with flags present. The same function runs in the
  API, so `DRAFT_SAVED` audit metadata carries `hearsayFlagCount` and the distinct
  phrases. If detection throws, the narrative stays editable and a notice says flagging
  is unavailable.

- **Vulnerable witness.** A witness under 18 at the statement date, or any
  `specialMeasures` category, reveals the **Special measures applied** field and a
  persistent **Vulnerable Witness** chip in the form header. The derived
  `isVulnerableWitness` flag is stored in the draft's values so PDF output (UC-09) does
  not have to re-derive it.

Known gap: the scope requires the declaration to match "the current official verbatim
wording" but does not reproduce that wording. The text carried here is the wording that
was already in the MG11 template and still needs sign-off against the current official
form; changing it means updating the constant and its hash together.

## UC-04 behaviour implemented

MG6 carries an **unused material schedule**: a numbered, repeating list of items with a
per-item classification. It is built as engine work, not an MG6 feature — the schedule is
a `group` field (see *The template system*), and no source file in the renderer, the API or
the shared helpers compares a form code to `MG6`. A test asserts that, because the MG6
designation is disputed (`docs/answers/LER-1205-designation-mismatches.md`) and the
schedule may end up on MG6C/MG6D or MG12.

- **Numbering is positional, never stored.** A row's number is its index plus one,
  computed at render. There is no counter to drift and no renumber routine to get wrong,
  so the sequence is gap-free by construction across add, edit, delete and reorder. Each
  row instead carries `__id`, a uuid that survives every one of those operations —
  audit rows and (later) UC-07 decisions attach to it, not to the number. Reorder moves
  the control itself rather than rebuilding a row from its value, so identity travels
  with it.

- **Deletion asks first.** The delete control opens a confirmation naming the item and
  stating how many later items will be renumbered. Cancel is a true no-op: same rows,
  same identities, same numbers.

- **Duplicate references are blocked per row.** A cross-row validator invalidates the
  *later* row's `itemReference`, so the user is pointed at the row they just typed rather
  than at both. Saving is still allowed — a draft is permitted to be incomplete. Any
  column can opt in with `validation.uniqueInGroup`.

- **Sensitivity is derived, not typed.** Setting any row's classification to *Sensitive*
  raises `hasSensitiveMaterial` on the draft with no further user action, and the header
  shows a **Sensitive Material** chip. The API recomputes it from the rows on every save
  and *removes* it when the last sensitive row goes, so it cannot latch on; a
  client-supplied value is discarded. **Sensitive here means marked, not protected** —
  UC-07 owns the handling and does not exist yet.

- **Completeness is advisory.** `COMPLEXITY_THRESHOLDS` in `libs/shared` holds the bands
  (complex 5, standard 3, summary-only 1) in one place; nothing hardcodes a number at a
  call site, and a test proves changing the constant changes the outcome. The check runs
  when it has something to say — on a finalisation attempt, at `COMPLETENESS_TRIGGER_ITEM_COUNT`
  (10) items, or as soon as a band is known and the schedule holds an item. With no band
  chosen it records `complexity: 'unknown'` rather than guessing. The outcome is written
  to the audit log as `COMPLETENESS_CHECKED` whether or not it found the schedule sparse,
  because a check that only logs failures cannot prove it ran. It never blocks anything.

- **API changes are additive.** No new endpoints and no migration: the schedule is one
  more key in `valuesJson`. `PATCH /drafts/:id` returns **422** for a group value that is
  not an array, a row that is not an object, a row missing `__id`, two rows sharing an
  `__id`, or a key that is not a declared column. `DRAFT_SAVED` metadata gained
  `scheduleItemCounts` (keyed by field id) and `hasSensitiveMaterial`.

- **MG6's `templateVersion` is 5** (LER-1239 rebuilt its field set to the documented printed boxes, 9 -> 47 fields; UC-07 then added the MG6D sensitive section, taking it to 48 top-level fields) and every original field id is unchanged, so live
  drafts keep their values — `npm run orphan-scan` reports zero orphans. The template is
  marked `verification: 'unverified'`: the seven pre-existing fields are placeholders that
  have never been checked against a specimen (`provenance: 'likely'`), and MG6's own
  field-set rebuild is separate work.

## UC-06 behaviour implemented

Legal language assistance for narrative fields, built as the delta over UC-03's flagging.

- **Narratives are declared, not guessed.** `FormFieldDefinition.narrative` marks a field as prose.
  MG11's `statementText` and MG5's `summaryOfCircumstances`, `keyEvidence`, `defendantInterview` and
  `injuriesLoss` carry it; `witnessAddress` and `chargesList` deliberately do not. There are 57 textareas
  across the eleven templates and most are not prose, so inferring from `type` or `rows` would attach a
  statement assistant to an address. Conformance fails `narrative` anywhere but a top-level textarea.
- **The narrative treatment moved into the shared renderer.** `NarrativeField` — the amber highlight
  backdrop, word count and flag summary — was referenced only from `mg11-wizard.html` before this, so MG5's
  prose had no highlighting at all. `DynamicForm` now renders it for any declared narrative, and the wizard
  still passes it explicitly: one component, two entry points, no fork.
- **A collapsible Legal Language Assistant panel** beside each narrative, opening when the narrative takes
  focus. Three prompt sources: informal-language flags (a third `NarrativeFlagKind`, drawn with a dotted
  amber underline), completeness hints, and standard phrase suggestions.
- **Nothing is ever auto-applied.** The narrative control is written in exactly one place — the Insert
  handler — and a test asserts that single write site as well as the behaviour.
- **Insert splices at the cursor**, replaces a selection, leaves the caret after the inserted wording, and
  is disabled until the narrative has a cursor. Every insertion writes a `LANGUAGE_SUGGESTION_INSERTED`
  audit row recording `{ formCode, fieldId, promptId, kind, suggestionText }` — the scope requires the
  suggestion text; the narrative itself is never recorded.
- **Wording proposal is provenance-gated.** A prompt may carry `insertText` only when its provenance is
  `documented` with a source (`canProposeVerbatim`), enforced at runtime and in `npm run conformance`.
  **`STANDARD_PHRASES` therefore ships empty**: the scope asks for standard phrasing and supplies none, and
  an invented phrase is one button-press from becoming a witness's signed words. Informal flags observe and
  do not propose. Filling the registry is a data-only change.
- **The assistance service is a one-way boundary.** `apps/api/src/language/` has no Prisma client, no
  drafts service and no route that mutates anything; a test asserts that absence. Unconfigured is the
  default: with `LANGUAGE_ASSIST_URL` unset no outbound call is made and no narrative text leaves the
  deployment, while the in-process rules still supply the panel. Everything a service returns is untrusted
  data — shape-validated, length-capped, and stripped of any wording it cannot attribute.
- **Degradation is quiet.** An unavailable service produces the scope's "Language assistance temporarily
  unavailable" line in the panel and nothing else: no snackbar, no banner, zero console errors, saving
  unaffected.
- **Session-scoped state only.** Dismissed suggestions and the assistance on/off toggle last for the
  session and are never persisted to the draft — a dismissal saved onto a draft would silently hide a
  prompt from a colleague who never made that decision.

## Testing

```bash
npm run test:e2e        # Playwright, 219 checks
npm run conformance     # template house-style gate, 68 self-tests
npm run orphan-scan     # draft values stranded by a template change
```

The suite covers the dashboard layout, UC-01, UC-02, UC-03, UC-04, UC-05 and UC-06, and runs on every push via
`.github/workflows/ci.yml` (install → seed a throwaway database → build both apps → run
the suite, uploading traces on failure). Specs live in `e2e/`. Playwright starts the API
and web dev servers itself and reuses them if they are already running.

## Design system

The visual language lives in one place: `apps/web/src/styles/_tokens.scss` — palette,
spacing scale, radii, shadows, breakpoints and the hero gradient. It emits CSS custom
properties (`--mg-*`) once from `styles.scss`, and Angular Material's own system tokens
are pointed at the same values, so components we do not hand-style (dialogs, selects,
snackbars) inherit the theme. Component stylesheets reference `var(--mg-*)` rather than
hardcoding colours; `@use 'tokens'` is available everywhere via `stylePreprocessorOptions`.

Notes on the palette: a deep, calm professional blue, because this is a working tool for
defence solicitors rather than a consumer product. Advisory elements (hearsay/opinion
notes, case-changed banners) are amber; **red is reserved for sensitive material (UC-07)**
and is not used for ordinary emphasis. Icons are hand-drawn inline SVG
(`apps/web/src/app/shared/icon/app-icon.ts`), deliberately not an icon webfont — a font
that fails to load renders its icon *name* as visible text.

Accessibility: WCAG AA contrast including white-on-gradient text, a global
`:focus-visible` outline, and a `prefers-reduced-motion` block that disables transitions.

## Dates

UK convention throughout: every date field is typed and displayed as **DD/MM/YYYY**
(UC-03's signature date, and the engine-wide rule for UC-05). Native `<input type="date">`
renders per browser locale — a US-configured browser showed `mm/dd/yyyy` — so date fields
use the Material datepicker instead, applied once in the shared renderer and therefore to
all 13 date fields across the 11 forms.

**Storage is unchanged.** Drafts still hold ISO `YYYY-MM-DD`. That is deliberate rather
than incidental: `provideNativeDateAdapter` would put `Date` objects in the form controls,
which would change what gets persisted and would silently break UC-02 — auto-fill
provenance is compared with `JSON.stringify(control.value) === JSON.stringify(provenance.value)`,
and a `Date` never equals the ISO string the server recorded, so every "Auto-filled" badge
would disappear. The no-future-date rule compares ISO strings too. So
`apps/web/src/app/core/date/iso-date-adapter.ts` implements `DateAdapter<string>`: it parses
DD/MM/YYYY (and ISO) into an ISO string and formats ISO back to DD/MM/YYYY, leaving the
control value exactly as it was.

Impossible dates are rejected rather than rolled over — 31/02/2026 raises
*"Enter a real date as DD/MM/YYYY"* instead of becoming 3 March. Weeks start on Monday.

## Template changes and existing drafts

`FormDraft.valuesJson` is keyed by **field id**, and the renderer only reads the ids the template
declares. So renaming or removing a field id does not raise an error — it silently strands whatever the
user had typed there, and the next autosave (1.5 s after a keystroke) can write the pruned object back.

Before any template change that renames or removes an id:

```bash
npm run orphan-scan          # exits 1 if any draft holds data under a dropped id
npm run orphan-scan -- --json
```

It distinguishes three things a naive comparison would confuse:

- **true orphans** — a value under an id the template no longer has. These are the ones that matter.
- **deliberate derived keys** — `isVulnerableWitness` is stored in `valuesJson` on purpose (UC-03) so
  PDF output need not re-derive it. Not drift.
- **drafts behind their template version** — reported for information, because `templateVersion` is
  recorded but **not honoured**: `form-fill-page.ts` loads the template by `formCode` alone, so an
  older draft renders against the current field set rather than its own.

The rule the sourcing tickets follow is therefore **additive only**: add the correct field alongside,
never rename or delete an id that drafts may hold values under.

## Branch map

This project lives alongside other workstreams in a shared repository, so its branches are
namespaced and follow fixed roles:

- **`ali-zulqarnain/mgs-forms`** — the integration branch for this project. All work lands here via
  PR. (The repo's `main` is a placeholder unrelated to this project's history.)
- **`mgs/uc-NN-<slug>`** — use-case markers and, from UC-04 onwards, use-case working branches. The
  `mgs/` prefix is deliberate: another workstream in this repo already uses bare `uc-*` names (e.g.
  `reverify-uc-04`) with its own numbering.
- **`LER-NNNN`** — per-ticket working branches, named exactly the Jira ticket id per the DevOpsBot
  SDK convention, PR'd into this project's branches. Ticket branches may be stacked when one
  depends on another's changes (the template tickets stack on `LER-1034`, which introduces the
  `verification`/`provenance` types).

### Delivered use cases — markers

`mgs/uc-01…03` are **read-only markers**: they point at the commit where each use case completed and
are never committed to. UC-01 and UC-02 deliberately share a marker — their implementations landed
earlier (`93440c4`, `f83cf53`) but no tests existed until `79d6965`, and a use case is not complete
until its behaviour is proven, which `3cf7644` did for both.

| UC | Marker branch | Completion commit | Implementation commits | Proof (current) |
|---|---|---|---|---|
| UC-01 Form Selection & Initiation | `mgs/uc-01-form-selection` | `3cf7644` | `93440c4`, `79d6965`, `3cf7644`, `b45afc8` | `e2e/uc01-form-selection.spec.ts` — 21 checks |
| UC-02 Auto-Population | `mgs/uc-02-auto-population` | `3cf7644` | `f83cf53`, `3cf7644`, `b45afc8` | `e2e/uc02-autofill.spec.ts` — 23 checks |
| UC-03 MG11 Witness Statement Wizard | `mgs/uc-03-mg11-wizard` | `7c36d24` | `7c36d24` (cosmetic required-marker fix in `fe0825e`) | `e2e/uc03-mg11-wizard.spec.ts` — 21 checks |
| UC-04 MG6 Unused Material Schedule | `mgs/uc-04-mg6-schedule` | merged, PR #85 | `26ee51e`, `d6b68bb`, `b45afc8` (MG6 field set) | `e2e/uc04-mg6-schedule.spec.ts` — 22 checks |
| UC-05 Field Validation | `mgs/uc-05-field-validation` | merged, PR #85 | `186edaf`, `09fb75c` | `e2e/uc05-field-validation.spec.ts` — 22 checks |
| UC-06 Legal Language Assistance | `mgs/uc-06-legal-language` | merged, PR #109 | `2980a3f` | `e2e/uc06-legal-language.spec.ts` — 25 checks |
| UC-07 Sensitive Material Handling | `mgs/uc-07-sensitive-material` | merged, PR #139 (+ fix in #148) | `2a67e73` | `e2e/uc07-sensitive-material.spec.ts` — 20 checks |
| UC-08 Form Review & Quality Check | `mgs/uc-08-review-quality-check` | merged, PR #142 + fix PRs #144/#184 | `c7b75a4` | `e2e/uc08-review-quality.spec.ts` — 23 checks |

The other suites (`dashboard.spec.ts` — 25 checks, `uk-dates.spec.ts` — 8, `mg4-charge-sheet.spec.ts`
— 9) hold cross-cutting and per-template behaviour; the full suite is **219 checks** (after PR #184)
and runs in CI on every push, alongside `npm run conformance`. (`npm run orphan-scan` reads real
drafts, so it is a pre-change tool run locally rather than a CI gate — a freshly seeded CI database
has no drafts to strand.)

### Convention from UC-04 onwards

Each new use case gets its own **working branch** `mgs/uc-NN-<slug>`, branched off the integration
branch. Per-ticket `LER-NNNN` branches PR into the UC branch where the Jira flow requires them, and
the UC branch PRs into the integration branch when the use case's Definition of Done is met. Both
granularities exist without renaming anything retroactively; once merged, the UC branch remains as
that use case's marker.
