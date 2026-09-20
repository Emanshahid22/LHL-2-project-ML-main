# PRD — UC-03 MG11 Witness Statement Completion

> **Retrospective, as-built.** This documents what the delivered code actually does, verified against the
> source and the E2E suite. Scope-versus-built differences are in `open-questions.md`, not smoothed over
> here. Epic: `docs/usecases/uc-03/epic.md`. Completion commit `7c36d24`.

## 1. Overview
MG11 is completed through a four-step wizard: witness details, statement narrative, declaration, signature
and date. Every other form keeps the flat renderer. Behind the steps sit three pieces of substance — a
hash-pinned statutory declaration the API refuses to boot without, advisory hearsay/opinion flagging shared
between browser and server, and a derived vulnerable-witness flag with two routes in.

## 2. Goals & Non-Goals
**Goals**
- Guide statement-taking in the order a statement is actually taken, without losing any renderer behaviour.
- Make the statutory declaration incapable of drifting silently, and unwritable by any client.
- Flag hearsay and opinion as the solicitor types, without ever obstructing them.
- Derive vulnerability rather than asking for it, and persist it for downstream output.

**Non-Goals**
- PDF output (UC-09), including the wet-signature space and whether the indicator reaches the page.
- General legal-language assistance (UC-06). Only the five scope-named phrases are detected.
- A custom spell-check dictionary. The browser's own spell-check is enabled.
- Confirming the declaration wording is the current official wording. It is pinned, not verified.

## 3. Current Behaviour & Context
- **MG11 is `templateVersion` 2**, fifteen fields, in four sections (*Witness details*, *Statement*,
  *Declaration*, *Witness care*). Eight fields are required. Version 2 added `title` and
  `specialMeasuresApplied`. It carries **no `verification` marker**, which means "not yet assessed" —
  MG11 and MG5 are the quality bar but are explicitly **not** practitioner-verified (CLAUDE.md rule 2).
- **No MG11 field carries `mapsTo`.** A witness is not the defendant, so nothing auto-fills. A UC-03 check
  asserts this, so a future well-meaning mapping fails the suite.
- **The wizard's step definition is deliberately local.** `MG11_STEPS` lives in the wizard component, not
  in the shared template model, because only MG11 has steps and putting a `step` field on every template
  would imply otherwise.
- **The declaration was already in the template as a field's wording.** UC-03 lifted it out into a shared
  constant precisely so that it stopped being data a draft could hold.

## 4. How It Works — Mechanism
1. **Routing to the wizard.** `form-fill-page.ts` renders `<app-mg11-wizard>` when
   `template().code === 'MG11'` and `<app-dynamic-form>` otherwise. This is the only form-code branch in
   the product, and it is a presentation choice, not a behaviour fork.
2. **One FormGroup, four views.** The wizard passes the whole template to `DynamicForm` with
   `visibleFieldIds` set to the current step's fields, so the `FormGroup` always holds every control with
   its validators — hidden fields keep their values, and autosave and progress work unchanged from any step.
3. **Step navigation.** Headers become clickable once visited; skipping ahead past unvisited steps is
   refused. Resuming a draft lands on the **furthest incomplete step** (the first step with an unfinished
   required field), so returning to a part-done statement continues rather than restarts.
4. **Narrative (step 2).** `statementText` is rendered by a dedicated `NarrativeField` component rather
   than by the generic textarea branch, because it needs a highlight layer, a word count and its own flag
   summary. `spellcheck="true"` is set explicitly.
5. **Highlighting.** `detectNarrativeFlags` returns every match with its start and end index;
   `segmentNarrative` splits the text into consecutive segments whose concatenation reproduces the input
   exactly. The segments are rendered into a backdrop div that is metric-matched to the textarea — a
   textarea cannot style ranges within its own value. The backdrop sits **above** the transparent
   textarea with `pointer-events: none` except on marks (so tooltips work), and a mousedown on a mark
   forwards the caret to the textarea.
6. **Declaration (step 3).** `MG11_DECLARATION` is rendered as read-only text in a `declaration-block`. The
   checkbox beside it records `declarationConfirmed: true` and nothing else. Advancing past step 3 without
   the tick is refused with an inline reminder, and the wizard stays on step 3.
7. **Declaration integrity, three layers.**
   - *Build-time*: the wording is one exported constant; nothing else in the system holds a copy.
   - *Startup*: `assertDeclarationIntegrity()` runs before `NestFactory.create` and hashes the constant
     against `MG11_DECLARATION_SHA256`. A mismatch **exits the process** — the API does not serve at all.
   - *Request-time*: `PATCH /drafts/:id` returns **422** for a `declarationText` key on **any** form, and
     422 for a non-boolean `declarationConfirmed` on MG11, so a truthy string cannot pass for a tick.
8. **Audit.** On every save of an MG11 with a non-empty narrative, the API re-runs the same detection and
   records `hearsayFlagCount` and the distinct flagged phrases in `DRAFT_SAVED` metadata. Detection is
   wrapped so that a failure never fails the save.
9. **Vulnerable witness.** `isVulnerableWitness(values)` is true when `specialMeasures` is one of
   `vulnerable | intimidated | assessment`, **or** the witness was under 18 at the statement date
   (`ageOnDate`, which falls back to today when the statement date is blank so age is never skipped). Either
   route reveals the *Special measures applied* field and shows a persistent header chip. The result is
   written into the draft's values under `isVulnerableWitness` via a control the wizard adds to the
   `FormGroup`, so it rides along with every save without the page knowing about it.

## 5. Architecture & Components
- `libs/shared/src/lib/mg11-declaration.ts` — `MG11_DECLARATION`, `MG11_DECLARATION_SHA256`,
  `MG11_DECLARATION_FIELD_ID`, `FORBIDDEN_DRAFT_VALUE_KEYS`.
- `libs/shared/src/lib/narrative-flags.ts` — `NARRATIVE_PATTERNS`, `detectNarrativeFlags`,
  `distinctFlaggedPhrases`, `segmentNarrative`. Pure, so browser and API agree.
- `libs/shared/src/lib/mg11-witness.ts` — `MG11_VULNERABLE_FLAG_KEY`,
  `MG11_SPECIAL_MEASURES_APPLIED_FIELD_ID`, `MG11_VULNERABLE_SPECIAL_MEASURES`, `ageOnDate`,
  `isVulnerableWitness`.
- `apps/api/src/integrity/declaration-integrity.ts` — the fatal startup check, called from `main.ts`
  before the app is created.
- `apps/api/src/drafts/drafts.service.ts` — `assertDeclarationNotTampered()` and
  `narrativeAuditMetadata()`.
- `apps/web/.../form-fill/mg11-wizard/` — the shell: steps, navigation, gating, per-step progress, the
  derived-flag control.
- `apps/web/.../form-fill/narrative-field/` — textarea, backdrop, marks, word count, flag summary.
- `apps/web/.../shared/dynamic-form/` — unchanged and shared; the wizard adds no field rendering of its own.

## 6. Data Model & Schema
**No migration.** UC-03 added no column and no table.

- **The declaration is not data.** A draft records only `declarationConfirmed: true`. The wording lives in
  code, and `FORBIDDEN_DRAFT_VALUE_KEYS = ['declarationText']` is rejected on every save path so no form can
  smuggle wording into `valuesJson`.
- **`isVulnerableWitness` is a derived key** stored in `valuesJson` on purpose, so PDF output (UC-09) need
  not re-derive it. It is not a template field, and `npm run orphan-scan` knows it as a deliberate derived
  key rather than stranded data — the same mechanism UC-04 later used for `hasSensitiveMaterial`.
- **`AuditAction`** gained nothing here; UC-03 extended `DRAFT_SAVED` *metadata* instead:
  `hearsayFlagCount` and `hearsayFlagPhrases` (distinct, lower-cased, whitespace-normalised, sorted).
- **MG11's fifteen fields** (required marked ★): title, witnessName★, witnessDob★, witnessOccupation,
  witnessAddress★, witnessPhone, statementDate★, statementText★, exhibitsReferenced,
  declarationConfirmed★, signatureName★, statementTakenBy★, witnessConsentsCourt, specialMeasures,
  specialMeasuresApplied.

## 7. API / Interface Contracts
Additive only. No new endpoints.

- `PATCH /api/drafts/:id`
  - `declarationText` present, on **any** form → **422** *"the statutory declaration wording is
    server-owned and is never stored per draft"*.
  - MG11 with a non-boolean `declarationConfirmed` → **422**. A truthy string is not a tick.
  - Otherwise unchanged: 400 on a non-object `values`, 409 on a stale `baseVersion`.
  - On success, `DRAFT_SAVED` metadata carries `hearsayFlagCount` (and `hearsayFlagPhrases` when non-zero)
    for an MG11 with a narrative.
- `GET /api/form-templates/MG11` → the fifteen fields. The declaration wording is **not** in the payload;
  the client imports it from `@mgs/shared`.
- **Startup, not a route:** the process exits non-zero before listening if the declaration hash does not
  match. There is no degraded mode.

## 8. Detailed Logic & Business Rules
- **The wizard is a shell, never a fork.** All field rendering, help, validation, date handling and
  auto-fill badges come from `DynamicForm`. The only thing the wizard does to fields is choose which are
  visible.
- **Hidden fields keep their validators.** Because the `FormGroup` is always built from the whole template,
  the header's *N of M* count covers the whole form while the step shows its own subset.
- **Advancing is gated at step 3 only.** Steps 1, 2 and 4 can be left incomplete — a statement is often
  taken out of order — but the declaration must be ticked before step 4 is reachable.
- **Detection is word-boundary and case-insensitive**, and internal whitespace matches any whitespace, so
  *"I  was told\nthat"* across a line break is still found.
- **Overlapping matches resolve to the earlier, longer match**, so "In my opinion" is never also reported
  as a shorter nested phrase.
- **Five patterns, not three.** The scope's DoD names three; the main flow says "hearsay or opinion". The
  delivered list adds *"I think"* and *"In my view"*, both opinion.
- **Every explanation says what to do**, not just what is wrong — e.g. *"May be hearsay — consider stating
  what the witness directly observed, and who said what to whom."*
- **Flags never block.** Saving, navigating between steps and completing every step all work with flags
  present. If detection throws, the narrative stays editable and a notice says flagging is unavailable.
- **Vulnerability has two independent routes**, and either is sufficient. `ageOnDate` returns null for an
  unusable date rather than guessing, and assesses as at *today* when the statement date is blank, so an
  undated statement is not silently treated as an adult's.
- **The derived flag is recomputed on every change**, including back to false — it does not latch.

## 9. Data Flow & Integrations
Open MG11 draft → `form-fill-page` routes to the wizard → `DynamicForm` builds one `FormGroup` from the
whole template → wizard adds the `isVulnerableWitness` control → user types on step 2 → `detectNarrativeFlags`
runs in the browser (debounced) → backdrop re-renders marks → autosave `PATCH` → API re-runs the same
detection → `DRAFT_SAVED` + flag metadata. No external systems. The declaration never travels from client to
server.

## 10. Error Handling & Edge Cases
| Situation | Behaviour |
|---|---|
| Declaration constant edited without updating the hash | API **exits** on startup with "integrity check failed"; it never serves |
| Client sends `declarationText` (any form) | 422 |
| Client sends `declarationConfirmed: "yes"` | 422 — not a boolean |
| User tries to advance past step 3 unticked | Refused, inline reminder, stays on step 3 |
| User clicks an unvisited step header far ahead | Refused; no skipping |
| Narrative detection throws | Narrative stays editable, notice says flagging unavailable, save still works |
| Narrative empty | No flags, no audit flag metadata |
| Witness DOB present, statement date blank | Age assessed as at today, so vulnerability is not skipped |
| Unparseable witness DOB | `ageOnDate` returns null; the special-measures route still applies |
| Vulnerable, then changed to not vulnerable | Flag recomputes to false; the revealed field hides again |
| Resume a part-done statement | Opens at the furthest incomplete step, not step 1 |

## 11. Security & Performance (Non-Functional)
- **The declaration cannot be altered through the product.** One copy in code, hash-verified at startup,
  and no endpoint accepts wording. That is three independent layers, because the consequence — a witness
  signing something other than the statutory declaration — is not recoverable after the fact.
- **A failed integrity check is fatal by design.** Serving with an unknown declaration would be worse than
  not serving.
- Audit metadata records **flagged phrases, not the narrative** — the count and the matched phrases only,
  never the statement text.
- Detection is debounced in the browser and runs once per save on the server; it is linear in narrative
  length per pattern, with five patterns.
- The backdrop is metric-matched to the textarea rather than measuring text, so highlighting does not
  reflow on every keystroke.

## 12. Testing Strategy
`e2e/uc03-mg11-wizard.spec.ts` — 21 checks in three groups: the wizard and declaration integrity (10),
hearsay/opinion flagging (8), vulnerable witness (3). Notable techniques:

- The startup check is proven by **spawning a Node process** with a tampered constant and asserting a
  non-zero exit and the "integrity check failed" message — the only way to test a fatal boot check.
- The shipped wording is hashed in the test and compared with the pinned constant, so the pin is verified
  independently of the API.
- Backdrop alignment is asserted by comparing mark geometry with the text it underlines, which is what
  caught the original below-the-textarea layering bug.
- Audit recording is asserted through the same detection function the API records with, because
  `AuditEvent` has no read endpoint; it was additionally verified directly against the database during
  development (`hearsayFlagCount: 2, hearsayFlagPhrases: ["i was told that","in my opinion"]`).

## 13. Acceptance Criteria
The scope's Definition of Done, verbatim, with the checks that cover it:

| # | Criterion | Status | Covering checks |
|---|---|---|---|
| 1 | "MG11 declaration text matches the current official verbatim wording" | **Blocked** | `the declaration is read-only text, not an editable field`; `the shipped declaration matches its integrity hash`; `the API refuses to start on a tampered declaration`; `the API rejects declaration tampering` |
| 2 | "Hearsay flag correctly identifies 'I was told that', 'I heard that', and 'In my opinion' patterns" | **Covered** | `flags every phrase the scope requires` (all five, including the two beyond this criterion); `detects mixed-case variants`; `does not flag ordinary narrative prose`; `marks align with the text they underline`; `hovering a flagged phrase explains why` |
| 3 | "Flags are non-blocking — form can be submitted with flags present and audit log records them" | **Partial** | `flags never block saving, navigating or completing`; `saving records the flags in the audit trail` |
| 4 | "Vulnerable witness indicator persists correctly to PDF output" | **Partial** | `an under-18 date of birth reveals special measures and the indicator`; `an adult with a special-measures category is treated the same`; `the indicator and derived flag survive a reload` |

**Why #1 is Blocked and needs the client, not code.** The scope requires the declaration to match "the
current official verbatim wording" but does not reproduce that wording, so nothing in this repository can
prove the match. What *is* proven: the wording exists in exactly one place, is rendered read-only, is never
stored per draft, is pinned by a SHA-256 the API verifies at startup, and cannot be supplied or altered by
any client. The text carried is the wording that was already in the MG11 template. Someone with access to
the current official MG11 must sign it off (Jira sub-task LER-1200); changing it means updating the
constant and its hash together.

**Why #3 is Partial.** "Submitted" cannot be tested because there is no submit or finalise action anywhere
in the product yet — that is UC-10. The checks prove flags block neither saving nor completing every wizard
step, and that the audit metadata is written.

**Why #4 is Partial.** "Persists to PDF output" cannot be tested because PDF generation does not exist
(UC-09). What is proven is the half that does: both routes into vulnerability show the indicator, and the
derived flag is persisted into the draft's values so the PDF renderer can read it without re-deriving.
Re-test when UC-09 lands.

## 14. Dependencies, Risks & Rollout
- **Delivered and closed.** Marker branch `mgs/uc-03-mg11-wizard` → `7c36d24`.
- **Depends on** UC-01's renderer (never forked) and UC-02's provenance model (asserted unchanged).
- **Feeds UC-09** the `isVulnerableWitness` flag and the wet-signature requirement; feeds **UC-06** the
  pattern list as a starting point for general legal-language assistance.
- **Blocked on a human:** the declaration wording sign-off (LER-1200, and tickets LER-1077/LER-1078 for
  senior-solicitor review of wording and output). No amount of code closes these.
- **Not built, in this UC's ticket block:** LER-1062 legal language hook, LER-1068 literal typing of the
  declaration, LER-1071–1073 page count, LER-1079 QA ticket. All are in `open-questions.md`.
- **Rollout note for any future wording change:** the constant and its hash must change in the same commit,
  or the API will not boot. That is the intended friction.
