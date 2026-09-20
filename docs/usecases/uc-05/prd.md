# PRD — UC-05 Field Validation

Epic: `docs/usecases/uc-05/epic.md`. Scope source of truth: the UC-05 section of
<https://lhl-agents.netlify.app/mg-forms-scope/>, quoted verbatim in §13.

This PRD is written as the **delta** over what the product already does. §3 states the existing surface
precisely so that nothing already delivered is rebuilt, and so a reviewer can see exactly what is new.

## 1. Overview
Two new capabilities and one closed gap.

**New:** per-field **format** rules declared in the template layer, and **cross-field consistency** rules
surfaced in a dedicated panel. **Closed:** the declarative `validation` rules currently run only in the
browser, so the API enforces nothing a client declines to send.

Around both sits the mechanism that makes them safe to ship: every rule carries a `provenance`, and a rule
whose provenance is not `documented` **cannot be error severity**. It hints, it never blocks, and it says
the format is unverified. That is the scope's instruction for collar numbers, generalised to every format.

## 2. Goals & Non-Goals
**Goals**
- Validate the *shape* of a value against a named, sourced format.
- Validate *consistency* between two values, including a form field against a case datum.
- Run one rule engine in the browser and the API, so the two cannot disagree.
- Fire on blur, clear on correction, and keep cross-field findings out of the inline error slot.
- Make it structurally impossible to ship a blocking rule on an unsourced format.

**Non-Goals**
- Inventing a statutory format. No rejecting pattern goes on a URN, ASN, custody number or collar number
  in this epic.
- Rejecting a draft save on a semantic rule. Drafts may be incomplete and inconsistent by design.
- Adding a field so that a rule has somewhere to live.
- Finalisation itself (UC-10), legal-language advice (UC-06), sensitive material (UC-07), whole-form
  quality review (UC-08).

## 3. Current Behaviour & Context
**What already exists — do not rebuild any of this.**

| Capability | Where | Status |
|---|---|---|
| `required` (and `requiredTrue` for checkboxes) | `DynamicForm.validatorsFor()` | Delivered |
| `minLength`, `maxLength`, `pattern`, `min`, `max` | same | Delivered |
| `noFutureDate` | `noFutureDateValidator()` | Delivered |
| `uniqueInGroup` (cross-row, later row flagged) | `uniqueInGroupValidator()` | Delivered, UC-04 |
| Impossible date rejected, not rolled over | `IsoDateAdapter` + `matDatepickerParse` branch | Delivered, asserted |
| Inline error message per field, on touch | `errorMessage()` / `messageFor()` | Delivered |
| Group shape rejected at the API with **422** | `validateGroupValue()` | Delivered, UC-04 |
| Declaration tampering rejected with **422** | `assertDeclarationNotTampered()` | Delivered, UC-03 |
| `values` not an object → **400**; stale `baseVersion` → **409** | `DraftsService.update()` | Delivered |
| Completeness definition shared by progress and the wizard | `isFieldValueComplete`, `isGroupValueComplete` | Delivered |
| Validation coverage floor (30%) on assessed templates | `npm run conformance` | Delivered |

**What is missing, and is therefore this epic:**

1. **No format rules.** Three `pattern` rules exist in total, all telephone. `FieldValidation.pattern` takes
   a raw regex string with a hand-written message, so a format is copied per field with no source recorded.
2. **No cross-field rules of any kind.** Every validator sees one control. The one cross-*row* validator
   (`uniqueInGroup`) reaches its siblings through the `FormArray`; there is no equivalent for fields.
3. **No server enforcement of the declarative rules.** The README has said since UC-01 that they "are
   already framework-free; re-run them in the API" — they never were.
4. **No severity.** Every rule is a hard Angular validator: it invalidates the control, which removes the
   field from the progress count. There is no way to express "this looks wrong but I am not certain".
5. **No date format hint.** The scope asks for one; today there is a `DD/MM/YYYY` placeholder and an error
   message after the fact.

**Three findings established against the delivered templates:**

- **No template declares a CPS reference field.** `cpsReference` is a `CaseFieldPath` only.
- **No template declares a collar-number field.** Collar numbers sit inside composite officer boxes —
  MG1/MG3/MG4 `officerInCase`, MG5 `officerCompleting`, MG16 `officerCompleting` ("rank, number or job
  title").
- **Neither scope-named cross-field pair exists on one form.** MG4 has `chargeDate`, no offence date; MG3
  and MG5 have `offenceDate`, no charge date; MG11 has `statementDate`, and no template has a hearing date
  alongside it. Both rules are therefore built as **case datum vs form field**.

## 4. How It Works — Mechanism
1. **A format is data, not a regex in a template.** `FIELD_FORMATS` in `libs/shared` maps a name to
   `{ pattern, hint, example, provenance, source }`. A field says `validation: { format: 'urn' }`. Correcting
   a format is one edit in one place, and its source travels with it.
2. **Provenance decides severity.** `severityFor(format)` returns `'error'` only when
   `provenance === 'documented'` **and** a non-empty `source` is present; otherwise `'advisory'`. A template
   may request `severity: 'error'`; the function overrides it. The conformance gate fails any format whose
   declared severity exceeds what its provenance permits, so the rule cannot be edited away.
3. **Error severity behaves as today.** The Angular validator invalidates the control, the inline message
   appears on blur, and the field does not count towards required-field progress.
4. **Advisory severity does not touch validity.** It renders as a hint under the field — the scope's
   *"Unverified format"* wording for collar numbers — leaves the control valid, and never affects progress
   or saving. An advisory finding is recorded in the audit metadata like any other.
5. **Blur, not keystroke.** Display is already gated on `control.touched`, which Material sets on blur.
   UC-05 keeps that and adds the scope's **format hint**, shown on a date field while it is focused and
   empty or unparseable.
6. **Automatic clearing is inherent, and now asserted.** Messages are computed from control state on every
   change, so correcting a value clears the message with no extra machinery. DoD line 4 asserts it rather
   than assuming it.
7. **Cross-field rules are declared on the field that owns them**, so nothing keys off a form code:
   - `notAfter: { fieldId: 'chargeDate' }` — this field's date may not be later than that field's.
   - `notAfter: { casePath: 'offenceDate' }` — …than a case datum, resolved through UC-02's
     `resolveCaseField`.
   - `notBefore` is the mirror. `requiredWhen: { fieldId, equals }` makes a field required conditionally.
   - Each carries its own `severity` and message, because some pairs are impossible and others merely
     unusual.
8. **A cross-field rule fires only when both operands have values** — the scope's "cross-field checks run
   when a second dependent field is completed". A half-filled pair produces nothing.
9. **An unresolvable case datum suppresses the rule and says so.** If `resolveCaseField` returns
   `ambiguous` (several offence dates) or `no_data`, the rule does not fire; the panel carries a line
   explaining that the check could not run and why. Guessing which offence date to compare against would
   produce a confident wrong answer.
10. **Cross-field findings go to the Consistency Issues panel**, below the form section, never into a
    field's inline error slot. The scope is explicit about this, and it is also the only sensible place:
    a finding about two fields has no single field to sit under.
11. **One engine, three callers.** `validateForm(template, values, caseDto?)` returns
    `ValidationFinding[]` — `{ fieldId?, relatedFieldId?, kind, severity, message }`. The renderer uses it
    for hints and the panel; the API uses it to record counts; the future finalise path uses it to refuse.
12. **The API's own gate is type shape, not semantics.** A new `assertValueTypesStorable()` rejects with
    **422** a value whose type cannot be stored for that field kind — a non-boolean into a checkbox, a
    non-ISO string into a date, a non-finite number, an object where a scalar belongs. Semantic rules never
    reject a draft save.

## 5. Architecture & Components
- `libs/shared/src/lib/validation.ts` **(new)** — `FIELD_FORMATS`, `severityFor`, `validateFieldValue`,
  `validateForm`, `ValidationFinding`, `crossFieldFindings`. Pure and framework-free.
- `libs/shared/src/lib/form-template.types.ts` — `FieldValidation` gains `format`, `severity`, `notBefore`,
  `notAfter`, `requiredWhen`; new `FieldFormatName`, `FieldFormatDefinition`, `FieldDateOrder`,
  `FieldRequiredWhen`, `ValidationSeverity`.
- `libs/shared/src/lib/form-templates.ts` — declare the new rules on real field ids (see §8). Bump
  `templateVersion` on each template touched. **Additive only.**
- `libs/shared/src/lib/template-conformance.ts` + `tools/template-conformance/index.js` — new structural
  rules: a `format` must name a registry entry; declared severity may not exceed what provenance permits;
  `notBefore`/`notAfter`/`requiredWhen` must reference a field that exists on the template (or a valid
  `CaseFieldPath`); date-order rules only on date fields. Self-tests for each.
- `apps/web/.../shared/dynamic-form/dynamic-form.ts` — derive Angular validators from the shared rule set
  rather than from a second hand-written list; render advisory hints; emit cross-field findings.
- `apps/web/.../shared/dynamic-form/consistency-issues.*` **(new)** — the panel.
- `apps/api/src/drafts/drafts.service.ts` — `assertValueTypesStorable()` (422) and validation counts in
  `DRAFT_SAVED` metadata.
- `apps/api/src/audit/audit.service.ts` — no new action; UC-05 extends `DRAFT_SAVED` metadata.

## 6. Data Model & Schema
**No Prisma migration.** Nothing new is stored per draft: findings are computed, never persisted. This is
deliberate — a stored finding goes stale the moment a rule is corrected, and the rules are expected to
change as formats get sourced.

```ts
export type ValidationSeverity = 'error' | 'advisory';

export type FieldFormatName =
  | 'telephone' | 'email' | 'postcode'      // sourced or self-evident
  | 'urn' | 'asn' | 'custodyNumber'         // shape NOT sourced -> advisory
  | 'collarNumber' | 'cpsReference';        // shape NOT sourced -> advisory

export interface FieldFormatDefinition {
  pattern: string;              // ECMAScript source, no flags
  hint: string;                 // shown while the field is focused
  example: string;
  provenance: FieldProvenance;  // documented | likely | inference
  /** Citation. Required for `documented`; a format with no source can never be an error. */
  source?: string;
}

export interface FieldDateOrder {
  fieldId?: string;             // a sibling field on the same template
  casePath?: CaseFieldPath;     // or a case datum, resolved via UC-02
  message?: string;
  severity?: ValidationSeverity;
}

export interface FieldRequiredWhen { fieldId: string; equals: string; }
```

`FieldValidation` gains `format?`, `severity?`, `notBefore?`, `notAfter?`, `requiredWhen?`. Every existing
member is untouched, so every existing rule keeps working unchanged.

**Registry provenance as shipped.** `telephone` is `documented` (already in use, sourced during the MG4
rebuild) and `email` is self-evident, so both may be `error`. **`urn`, `asn`, `custodyNumber`,
`collarNumber` and `cpsReference` ship `inference`** — their patterns encode the shape of the *examples* in
the research and the scope, not a cited specification — so all five are forced to **advisory**. `postcode`
ships `likely`: the UK postcode format is widely published but was not sourced for this project, so it too
is advisory until someone cites it.

## 7. API / Interface Contracts
**Additive. No new endpoints.**

- `GET /api/form-templates`, `/:code` — a field's `validation` may now carry `format`, `severity`,
  `notBefore`, `notAfter`, `requiredWhen`. Existing consumers ignore unknown keys.
- `PATCH /api/drafts/:id` — **new 422** for a value whose type cannot be stored for its field kind:
  a non-boolean for a `checkbox`, a non-`YYYY-MM-DD` non-empty string for a `date`, a non-finite value for
  a `number`, an object or array where a scalar field belongs. The message names the field.
  **Semantic rules never reject**: a wrongly formatted URN, an offence date after the charge date, or a
  missing required field all still save. A draft is allowed to be wrong.
- `DRAFT_SAVED` audit metadata gains `validationErrorCount` and `validationAdvisoryCount`, so the trail
  shows what was outstanding at each save without storing the findings themselves.
- **The finalisation gate is written and unreachable.** `validateForm` is the function a finalise endpoint
  would call to refuse; no such endpoint exists (UC-10). Documented here so nobody looks for it.

## 8. Detailed Logic & Business Rules
- **A format may be `error` only if `provenance === 'documented'` and `source` is non-empty.** This is the
  epic's central rule. It is a function, not a convention, and the conformance gate fails a template that
  declares more severity than its format permits.
- **Advisory findings never affect control validity, progress, or saving.** They are copy, plus an audit
  count.
- **Cross-field rules fire only when both operands are complete**, per the scope.
- **An `ambiguous` or `no_data` case datum suppresses the rule**, and the panel says the check could not
  run and why. This is the same discipline UC-02 applies: report, never guess.
- **Rules as shipped, on real field ids** (each `templateVersion` bumped):

| Rule | Template · fields | Severity | Why |
|---|---|---|---|
| Charge date not before the offence date | MG4 `chargeDate` vs case `offenceDate` | **error** | You cannot be charged before the offence. The scope's DoD line 3. |
| Hearing date not before the charge date | MG4 `hearingDate` vs `chargeDate` | **error** | A hearing precedes no charge. |
| First arrest not after the charge date | MG4 `firstArrestDate` vs `chargeDate` | advisory | Usual, but a charge can follow a later arrest on another matter. |
| Interview end after interview start | MG2 and MG15 `interviewEnd` vs `interviewStart` | **error** | Same-day interview; an end before a start is impossible. |
| Statement date not before the witness date of birth | MG11 `statementDate` vs `witnessDob` | **error** | Impossible. |
| Statement date vs case hearing date | MG11 `statementDate` vs case `nextHearingAt` | advisory | A later statement is normal practice — flagging it as an error would be wrong. |
| Arrest date not after the decision date | MG3 `arrestDate` vs `decisionDate` | advisory | Usual ordering, not an impossibility. |
| Notice date not after receipt by prosecutor | MG16 `noticeDate` vs `dateReceivedByProsecutor` | **error** | A notice cannot be received before it exists. |
| Detail required when the disclosure test is answered yes | MG6 `underminesDetail` when `underminesCase` = `yes` | **error** | The schedule exists to support this judgement. |
| URN / ASN / custody number format | MG3, MG4, MG5, MG12, MG15, MG16 | **advisory** | Shape not sourced. See §6. |

- **The composite officer boxes get no pattern.** MG1/MG3/MG4 `officerInCase`, MG5/MG16
  `officerCompleting` hold a name, a rank *and* a number in one free-text box. A collar-number pattern over
  that box would reject correct input. The `collarNumber` format ships in the registry, referenced by
  nothing, awaiting either a dedicated field with evidence or a practitioner ruling.
- **`cpsReference` likewise ships unreferenced**, because no template has the field.
- **A form with no findings is not a verified form.** Most templates are `unverified`; validation checks the
  value against a rule, not the rule against reality. The Consistency Issues panel says so when the
  template is unverified, so a clean panel cannot be read as sign-off.
- **Existing rules are untouched.** No `minLength`, `maxLength`, `min`, `max`, `pattern`, `noFutureDate` or
  `uniqueInGroup` rule changes behaviour.

## 9. Data Flow & Integrations
Template declares rules → renderer builds Angular validators for `error`-severity rules from the shared
definitions, and computes hints and cross-field findings from `validateForm` → user blurs a field → inline
message (single-field) or Consistency Issues panel (cross-field) → autosave `PATCH` → API applies the
type-shape guard (422 on unstorable), saves, and records `validationErrorCount` /
`validationAdvisoryCount`. Case data reaches cross-field rules through `resolveCaseField`, the same
resolver UC-02 uses. No external systems.

## 10. Error Handling & Edge Cases
| Situation | Behaviour |
|---|---|
| Format matches | No finding |
| Format fails, provenance `documented` + source | Inline error, control invalid, excluded from progress |
| Format fails, provenance `likely`/`inference` | Advisory hint ("Unverified format"), control stays valid |
| Template declares `severity: 'error'` on an unsourced format | Forced to advisory at runtime; **conformance fails the build** |
| Cross-field pair half complete | No finding — the scope's "second dependent field" condition |
| Case datum `ambiguous` (two offence dates) | Rule suppressed; panel explains the check could not run |
| Case datum `no_data`, or draft is standalone | Rule suppressed silently — there is no case to compare against |
| Date unparseable | Existing `matDatepickerParse` message wins; format hint shown; no cross-field rule fires |
| `requiredWhen` trigger changes to a non-matching value | The conditional requirement lifts and its message clears |
| Client sends a non-boolean into a checkbox | **422**, message names the field |
| Client sends a badly formatted URN | Saves. Recorded in the advisory count. A draft may be wrong. |
| Every rule passing on an unverified template | Panel states the template is unverified; no clean bill of health |

## 11. Security & Performance (Non-Functional)
- **A regex from a template runs in the browser and the server.** Every registry pattern is reviewed for
  catastrophic backtracking, has no nested unbounded quantifier, and is length-bounded. Patterns come from
  the registry in `libs/shared`, never from a client.
- The type-shape guard is the first thing a save does, before anything is written.
- Validation is O(fields) per change for single-field rules and O(rules) for cross-field rules, both of
  which are tens, not thousands. `validateForm` is pure and memoisable per value snapshot.
- Audit metadata carries **counts only** — never a field value, never a failing string.
- **Colour:** error styling reuses Material's existing error token, already in use for `mat-error` and
  UC-04's schedule errors. Advisory styling is amber, as the design system requires. The red UC-07 reserves
  for sensitive material is a distinct, stronger treatment and is not introduced here (CLAUDE.md rule 6).
  A reviewer should confirm the two reds remain visually distinguishable when UC-07 lands.
- AA contrast and visible focus on every new message and panel; the panel is a labelled landmark with
  `role="status"` so a screen reader announces findings without stealing focus.

## 12. Testing Strategy
- **Unit (pure, in `libs/shared`):** `severityFor` for every provenance/source combination including the
  override case; each registry pattern against a valid and an invalid example; `validateFieldValue` per
  rule kind; `crossFieldFindings` for both-complete, half-complete, ambiguous and no-data cases;
  `validateForm` aggregation and ordering.
- **Conformance (`npm run conformance`):** a format naming no registry entry; severity exceeding
  provenance; a date-order rule pointing at a missing field, a non-date field, or an invalid `CaseFieldPath`;
  `requiredWhen` pointing at a missing field. Each with a planted-defect self-test.
- **E2E (Playwright, existing style):** one check per DoD line — required-field validation on a
  deliberately incomplete form across **three MG form types** (the DoD says three); DD/MM/YYYY violations
  and impossible dates; offence date after charge date flagged; and a corrected value clearing its error.
  Plus: an advisory format does not block saving and shows "Unverified format"; the Consistency Issues
  panel holds cross-field findings and inline slots hold none; an ambiguous case datum suppresses the rule
  with an explanation; the type-shape guard returns 422; the audit counts are recorded.
- **Regression:** the full suite stays green, every `data-testid` intact, `npm run orphan-scan` clean.

## 13. Acceptance Criteria
The scope's Definition of Done, verbatim, and how each is met:

- "Field validation catches all required field types — tested with a deliberately incomplete form across 3
  different MG form types" — three templates chosen to cover distinct field kinds: **MG11** (text, date,
  textarea, checkbox, select), **MG4** (the largest sourced field set, dates and formats), **MG6** (a
  required repeating group plus a conditional requirement).
- "Date validation rejects DD/MM/YYYY format violations and impossible dates" — already delivered and
  asserted; UC-05 adds the format hint and keeps the existing checks.
- "Cross-field check: offence date after charge date is flagged correctly in all tested cases" — built as
  MG4 `chargeDate` vs the case's `offenceDate`, because no template carries both. Cases: valid ordering,
  charge before offence (flagged), equal dates (not flagged), ambiguous case data (suppressed with an
  explanation), standalone draft (suppressed).
- "Validation errors clear automatically when the field is corrected to a valid value" — asserted for a
  single-field error, an advisory hint and a cross-field finding.

Plus the repo's own bar: no rule blocks on an unsourced format; conformance and orphan-scan green; every
`data-testid` intact; test drafts cleaned from `dev.db`.

## 14. Dependencies, Risks & Rollout
- **Prerequisites, all delivered:** UC-01's template model and renderer; UC-02's `resolveCaseField` for
  case-datum comparisons; UC-04's validator patterns and the `verification`/`provenance` types.
- **Risk — a wrong rule rejecting correct data.** The epic's whole shape is the mitigation: provenance
  decides severity, and the gate enforces it.
- **Risk — scope creep into UC-06/UC-08.** This epic validates *values*, not prose and not whole-form
  quality.
- **Risk — a rule referencing a field that a later template edit removes.** Conformance fails on a
  dangling reference, so it cannot ship.
- **Depends on decisions, blocked by none.** The memo's **A1–A4** change which templates exist and
  therefore which rules apply (`docs/decisions/decision-and-review-memo.md`). Sourcing the URN, ASN,
  custody-number and collar-number formats is a practitioner question that *upgrades* advisory rules to
  errors later; nothing waits on it.
- **Rollout:** additive and behind existing markers. Ship the engine and the severity gate first
  (stories 1–2), then the single-field rules (3–8), then cross-field and the panel (9–14), then server
  parity (15), then the DoD checks (16). Every stage is independently shippable, and no stage introduces
  a blocking rule on an unsourced format.
