## Epic
UC-01 — Form Selection & Initiation

> **Retrospective documentation of delivered work.** UC-01 was built, tested and closed before this
> pack existed. It is written here in the company Epic/PRD/Story format so the delivered behaviour is
> documented to the same standard as work planned in advance (UC-04 was the first pack authored
> up-front — see `docs/usecases/uc-04/`). Nothing in this pack is a request to build anything.
> Completion commit `3cf7644`, marker branch `mgs/uc-01-form-selection`.

## Overview
A solicitor opening the module needs to get from "I need an MG11" to "I am filling in an MG11" without
friction, and needs the form to tell them what it wants: which boxes are compulsory, what each box
means, and how much is left to do. UC-01 is that path — the form picker, the case-link decision, the
template render, the progress indicator and draft persistence.

It is also the use case that establishes the **template system** every later use case builds on: a form
is data (`FormTemplate` in `libs/shared`), not a component, so adding a form or a field is a data
change consumed identically by the renderer, auto-fill (UC-02), the MG11 wizard (UC-03) and the
schedule engine (UC-04).

**Source of truth:** the UC-01 section of <https://lhl-agents.netlify.app/mg-forms-scope/>.

## Business Value / Goal
Every other use case is reached through this one. If the picker is buried, forms do not get started; if
required fields are not marked, incomplete files reach the CPS; if a draft does not survive a closed
laptop, work is lost and trust with it. The value is a reliable, honest entry point: the full form set
visible without scrolling, a case link that only ever offers cases the user may actually see, and a
draft that persists without being asked.

Success = a form can be started in two clicks from a cold dashboard, the header always answers "how
much is left", and nothing the user typed is ever lost silently.

## Scope
**In scope (as delivered):** the form picker over all eleven MG templates; the "Link to a case?"
decision with the case list scoped to the user's access; standalone initiation; initiation from a case
detail page (which skips the link question because the case is already known); template render with
required-field markers, contextual `?` help per field and inline validation; the header progress
indicator (*N of M required fields completed*) recomputed on every keystroke; explicit **Save draft**
with confirmation; debounced autosave; draft resume from the work queue; the dashboard work queue
itself (filter, sort, view-all, per-draft progress); optimistic concurrency on save; error and
degraded paths (template load failure, draft load failure, inaccessible case, stale save).

**Also delivered here, and load-bearing for everything after:**
- **The template model.** `FormTemplate` + `FormFieldDefinition` with a closed `FieldType` union,
  `required`, `helpText`, `validation`, `section`, and `templateVersion`.
- **The verification / provenance model.** A template may carry `verification: 'unverified'` and each
  field a `provenance` of `documented | likely | inference`. An unverified template renders a
  persistent header chip saying so. This exists because a plausible invented box on a police case file
  is a professional-conduct risk, not a cosmetic bug — see PRD §6.

**Out of scope:**
- Auto-population from the case file — **UC-02**.
- The MG11 guided wizard — **UC-03**.
- Repeating groups / schedules — **UC-04**.
- Server-side re-validation of `validation` rules on finalisation — **UC-05**.
- PDF output — **UC-09**. Finalise / archive — **UC-10**.
- **Practitioner verification of any template's field set.** The marker is delivered; flipping it is a
  human act (see `human-instructions.txt`).

## User Stories
Each maps to the DevOps Bot ticket that delivered it. See `stories/`.

1. **Form list interface** (LER-1019) — the picker lists every template from the API, not a hardcoded list.
2. **Initiation modes** (LER-1020) — case-linked or standalone, chosen explicitly.
3. **Skip selection when case-initiated** (LER-1021) — starting from a case does not ask which case.
4. **Template load** (LER-1022) — a form's fields, sections and help come from `libs/shared`.
5. **Required-field marking** (LER-1023) — compulsory boxes are visibly compulsory.
6. **Contextual help icons** (LER-1024) — a `?` per field explaining how to complete it.
7. **Progress indicator** (LER-1025) — *N of M required fields completed*, live.
8. **Draft save** (LER-1026) — explicit save, confirmed in the UI.
9. **Draft resume** (LER-1027) — reopening restores every saved value.
10. **Autosave** (LER-1028) — typing persists without an explicit save.
11. **Error: template load failure** (LER-1029) — a failed template fetch offers Retry, never a blank page.
12. **Error: inaccessible case** (LER-1030) — a denied case link degrades to standalone with an explanation.

**Supporting tickets** (foundation block, also delivered, not UC-01 stories in their own right):
LER-1000 *Specify FormDefinition format*, LER-1002 *Define field types*, LER-1006 *Renderer*,
LER-1096 *Date format enforcement*.

## Epic-level Acceptance Criteria
The scope's Definition of Done, verbatim:

- "All 11 MG forms are available and load correctly"
- "Case-link selection shows correct case list filtered to user's accessible cases"
- "Progress indicator updates in real time as fields are completed"
- "Draft save is confirmed by UI and persists across browser sessions"

Two of these are recorded as **Partial** in `docs/acceptance-mapping.md`, for reasons that are about
the criteria rather than the code — MG1's existence and the meaning of "browser sessions". Both are in
`open-questions.md`.

Plus the repo's own standing rules, which UC-01 established:

- A template whose field set is not practitioner-verified must be visibly marked and must never read as
  filing-ready.
- Field ids are permanent: `valuesJson` is keyed by id, so a rename strands live draft data.

## Dependencies & Risks
- **No case-management system exists.** The `Case` model is seeded fiction (five cases, one belonging
  only to a colleague so access control is testable). Real integration is LER-1041, not started.
- **Risk, realised: the entry point sinking.** The picker was originally 1332px down a 2349px page and
  fell further as drafts accumulated. Fixed by making the picker the first section and asserting it is
  fully visible without scrolling at two viewport sizes — a layout regression is now a test failure.
- **Risk: `templateVersion` recorded but not honoured.** A draft stores the version it was created
  against, but `form-fill-page.ts` loads by `formCode` alone, so an old draft renders against the
  current field set. Deliberate for now under the additive-only rule; carried in `open-questions.md`.
- **Risk: MG1 is not a real form.** Research (phase 8) found 0/7 fields corroborated and MG1 absent
  from the current MG suite, yet the DoD requires "all 11 MG forms". MG1 is retained and is the fixture
  form for ~20 assertions. A decision-maker question, not an engineering one.
- **Authentication is a demo guard.** `DemoAuthGuard` resolves a fixed user (or `x-user-email`).
  Access-control behaviour is real and tested; the identity source is not.
