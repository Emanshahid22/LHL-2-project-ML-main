# PRD — UC-06 Legal Language Assistance

Epic: `docs/usecases/uc-06/epic.md`. Scope source of truth: the UC-06 section of
<https://lhl-agents.netlify.app/mg-forms-scope/>, quoted verbatim in §13.

Written as the **delta over UC-03's flagging**. §3 states the existing surface precisely so nothing already
delivered is rebuilt, and so a reviewer can see exactly what is new.

## 1. Overview
A collapsible **Legal Language Assistant** panel beside a narrative field. It surfaces three kinds of
prompt — informal-language flags with a formal alternative, standard phrase suggestions, and completeness
hints — each with an **Insert** button that places the text at the cursor. Nothing is ever applied without
that press, the press is audited, and when the service behind the panel is unavailable the panel simply is
not there.

## 2. Goals & Non-Goals
**Goals**
- Bring the narrative treatment to MG5 as well as MG11, from one shared component.
- Flag informal language *with* the formal alternative, not merely a warning.
- Offer standard phrasing only where the wording can be attributed.
- Point out what the account has not recorded.
- Make Insert the single, explicit, audited route from a suggestion into the text.
- Fail invisibly: no service, no panel, no error.

**Non-Goals**
- Inventing phrasing or drafting rules. Unattributable wording does not ship.
- Auto-correction, auto-formatting, "apply all", or any bulk affordance.
- Spell-check (UC-03 delivers the browser's own), translation, whole-narrative rewriting, tone scoring.
- Blocking a save, a step or a navigation for any reason.
- Whole-form review (UC-08), sensitive material (UC-07), PDF (UC-09).

## 3. Current Behaviour & Context
**What already exists — do not rebuild any of it.**

| Capability | Where | Status |
|---|---|---|
| Hearsay/opinion detection, five patterns, word-boundary + case-insensitive | `libs/shared/src/lib/narrative-flags.ts` › `detectNarrativeFlags` | Delivered, UC-03 |
| Overlap resolution (earlier, longer match wins) | same | Delivered |
| Segmentation for the highlight layer, concatenating back to the exact input | `segmentNarrative` | Delivered |
| Distinct flagged phrases for the audit trail | `distinctFlaggedPhrases` | Delivered |
| Amber underline drawn by a backdrop layered **above** a transparent textarea, `pointer-events: none` except on marks, mousedown forwarding the caret | `apps/web/.../narrative-field/` | Delivered, UC-03 |
| Live word count, flag summary, tooltip per mark, "flagging unavailable" notice | same | Delivered |
| Flags recorded in `DRAFT_SAVED` metadata (`hearsayFlagCount`, phrases) | `drafts.service.ts` › `narrativeAuditMetadata` | Delivered |
| Non-blocking discipline: flags never stop saving or navigating | UC-03, asserted | Delivered |
| Advisory-vs-error severity model and its conformance gate | `libs/shared/src/lib/validation.ts` (UC-05) | Delivered — reused as precedent |

**What is missing, and is therefore this epic:**

1. **`NarrativeField` is wizard-only.** It is referenced from `mg11-wizard.html` and nowhere else. MG5's
   five textareas (`summaryOfCircumstances` 10 rows, `keyEvidence` 6, `defendantInterview` 5,
   `injuriesLoss` 3, `chargesList` 3) render as plain textareas with no highlighting. The DoD names MG5,
   so the component has to move into the shared renderer.
2. **Nothing declares which fields are prose.** `witnessAddress` and `chargesList` are textareas that are
   not narratives. Inferring from `type === 'textarea'` would flag "I think" inside an address.
3. **No informal-language kind and no suggested alternative.** `NarrativePattern` has `phrase`, `kind`
   (`hearsay | opinion`) and `explanation` — no replacement text.
4. **No phrase library, no completeness hints, no panel, no insert mechanic, no dismissal state.**
5. **No assistance service and no boundary around one.** The scope's DoD line 4 presumes a "language AI
   service" exists and can be down.

## 4. How It Works — Mechanism
1. **A template declares its narratives.** `FormFieldDefinition` gains `narrative?: true`. MG11
   `statementText` and MG5 `summaryOfCircumstances`, `keyEvidence`, `defendantInterview`, `injuriesLoss`
   carry it; `witnessAddress` and `chargesList` deliberately do not. Nothing keys off a form code.
2. **The renderer honours it.** `DynamicForm`'s `textarea` branch renders `NarrativeField` when
   `field.narrative` is set, and a plain textarea otherwise. The MG11 wizard keeps passing the same
   component explicitly, so its behaviour is unchanged — one component, two entry points.
3. **The panel.** `app-language-assistant` sits beside the narrative, collapsed by default and opening
   when the narrative takes focus (the scope: "appears when a narrative field is focused"). Collapsing is
   sticky for the session, because a user who closed it did mean it.
4. **Three prompt sources, one list.** The panel renders a single ordered list of `AssistancePrompt`
   objects, each `{ kind, message, insertText?, provenance, source?, anchor? }`:
   - `informal` — from the pattern registry; `insertText` is the formal alternative; `anchor` is the
     matched range so the panel entry and the amber mark correspond.
   - `phrase` — from the standard-phrase registry, offered by trigger rather than by guess.
   - `completeness` — from the hint rules, e.g. the scope's *"You have not recorded the time of the
     incident"*.
5. **Informal flags reuse UC-03's highlight.** `NarrativeFlagKind` gains `'informal'` and
   `NarrativePattern` gains `suggestion?: string`. `segmentNarrative` is untouched, so the amber marks and
   their tooltips come for free and UC-03's five patterns keep behaving identically.
6. **Provenance decides whether a suggestion exists at all.** This is UC-05's rule adapted to a harder
   problem. In UC-05 an unsourced *format* was downgraded to advisory; here everything is already
   advisory, so downgrading means nothing. Instead: **a prompt carrying `insertText` must have
   `provenance: 'documented'` and a `source`.** Anything less may still *observe* ("this reads
   informally") but may not *propose* wording. A suggestion is drafting advice on a court document, and
   unattributable drafting advice must not be one button-press from a witness's signed words.
7. **Insert at cursor.** The panel asks the narrative component to insert; the component splices
   `insertText` at the textarea's `selectionStart`, sets the control value, and leaves the caret after the
   inserted text so the user can keep typing — the scope: "user can then edit". Insert is the **only**
   path from a prompt to the control.
8. **Insert is audited.** The client reports the insertion and the API writes a
   `LANGUAGE_SUGGESTION_INSERTED` audit row recording *which prompt kind, which prompt id and the field
   id* — never the narrative text and never the inserted wording, matching the existing rule that audit
   metadata carries no case content.
9. **The scope's assistance toggle.** The panel carries an off switch: off hides every suggestion and
   clears the **informal** highlights, for this session only, resetting to on next session. UC-03's
   hearsay and opinion marks are deliberately unaffected — they are not language assistance, and
   removing a delivered behaviour through an unrelated toggle would be a defect. (This is the scope's
   alt flow, which this PRD's first draft did not carry as its own step.)
10. **The panel is discoverable before it opens.** Its collapsed header sits beside every narrative and
   the body opens when the narrative takes focus, per the scope. A panel with no visible handle would
   not be collapsible, it would be absent — and the header is also what makes the no-cursor state
   reachable, where Insert is correctly disabled.
11. **Dismissal is per session.** A dismissed prompt id is held in component state, not persisted: the
   scope says "for that session", and persisting it would silently hide a prompt from a colleague opening
   the same draft.
12. **Degradation is quiet.** If the assistance service errors, times out or is not configured, the
    panel renders nothing and no snackbar, banner or console error is produced. The local pattern and hint
    rules still work, because they are pure and in-process — so the panel degrades to *less*, not to
    nothing, and the user is never told about infrastructure.

## 5. Architecture & Components
- `libs/shared/src/lib/narrative-flags.ts` — `NarrativeFlagKind` gains `'informal'`; `NarrativePattern`
  gains `suggestion?`. **Additive**; existing exports unchanged.
- `libs/shared/src/lib/language-assistance.ts` **(new, pure)** — `AssistancePrompt`,
  `INFORMAL_PATTERNS`, `STANDARD_PHRASES`, `COMPLETENESS_HINTS`, `assistancePrompts(text, field)`,
  `canProposeVerbatim(prompt)`. Pure so the browser, the API and the tests share one definition.
- `libs/shared/src/lib/form-template.types.ts` — `narrative?: true` on `FormFieldDefinition`.
- `libs/shared/src/lib/form-templates.ts` — declare `narrative` on the five prose fields. Bump
  `templateVersion` on MG5 and MG11. Additive only.
- `libs/shared/src/lib/template-conformance.ts` + `tools/template-conformance/index.js` — new rules:
  `narrative` only on a `textarea`; every registry prompt carrying `insertText` must be `documented` with
  a non-empty `source`; a hint rule must reference a real trigger. Each with a planted-defect self-test.
- `apps/web/.../narrative-field/` — gains an `insertAtCursor` method and an `@Output` for insertions.
- `apps/web/.../language-assistant/` **(new)** — the panel: prompt list, Insert, Dismiss, collapse.
- `apps/web/.../shared/dynamic-form/` — the `textarea` branch chooses `NarrativeField` when declared.
- `apps/api/src/language/` **(new)** — the assistance boundary. See below.
- `apps/api/src/audit/audit.service.ts` — `AuditAction` gains `LANGUAGE_SUGGESTION_INSERTED`.

### The assistance service boundary — the important part
The scope presumes a "language AI service". Whatever sits behind it, the boundary is fixed:

- **One direction only.** The service takes narrative text and returns *candidate prompts*. It has no
  Prisma client, no `DraftsService`, no access to `FormDraft`, and therefore **no way to change a draft**.
  The only code that writes a narrative is the Angular control, driven by a user pressing Insert.
- **Its output is untrusted data.** Returned prompts are validated against the `AssistancePrompt` shape
  and passed through `canProposeVerbatim()` before any of them can offer `insertText`. A service that
  returns unattributed wording gets its `insertText` stripped, not honoured.
- **It is optional.** With `LANGUAGE_ASSIST_URL` unset **nothing outbound happens**: no call is made and
  no narrative text leaves the deployment. The in-process pattern and hint rules supply the panel on
  their own. No configuration, no failure.
  **As built, the module is still registered in that state** — a change from this PRD's original "the
  module is not registered", made for a reason worth recording. The client has to learn that there is
  nothing to ask, and the only alternative is a 404, which Chromium logs to the console as a failed
  resource. DoD line 4 requires "no errors surfaced to user" and the check asserts zero console errors,
  so an unconfigured deployment answers `200 { prompts: [], enabled: false }` and the client latches
  off after one request. The **outbound** boundary is the one that matters, and it is never crossed.
- **It is bounded.** A short timeout, a response size cap, no retries, and any error is logged
  server-side and answered as an empty prompt list. It never fails a request the user made.
- **It sees narrative text**, which is case content — so §11 records what that means for a hosted model
  and why an unconfigured deployment is the safe default.
- **A test asserts the absence of a write path**, in the shape UC-02's case-write-path guard uses: a grep
  over the module for `prisma.`/`DraftsService` that must find nothing.

## 6. Data Model & Schema
**No Prisma migration.** Prompts are computed, never stored; dismissals live in component state for the
session. The only persisted new thing is an audit row, and `AuditEvent` already exists.

```ts
export type AssistanceKind = 'informal' | 'phrase' | 'completeness';

export interface AssistancePrompt {
  /** Stable within a session so dismissal and audit can name it. */
  id: string;
  kind: AssistanceKind;
  /** What the panel says. Always safe to show. */
  message: string;
  /** Wording the user may insert. Present ONLY when canProposeVerbatim() is true. */
  insertText?: string;
  provenance: FieldProvenance;          // documented | likely | inference
  /** A citation. Required before insertText may be offered. */
  source?: string;
  /** The matched range in the narrative, for informal flags. */
  anchor?: { startIndex: number; endIndex: number };
}
```

**Registry provenance as shipped.** This is where the epic is deliberately thin, and the thinness is the
point:

- **`INFORMAL_PATTERNS`** — informal register is observable from the text itself, so a flag needs no
  external authority: it says "this reads informally", which is a statement about English. Those flags
  ship `likely` and therefore **carry no `insertText`** unless a formal alternative can be attributed.
- **`STANDARD_PHRASES`** — the scope asks for "standard phrasing for common evidential descriptions" but
  supplies none. **The registry therefore ships empty**, with the shape, the gate and the tests in place,
  and is filled by a practitioner. See `open-questions.md` Q1; this is the single largest thing a human
  must supply for this UC to deliver its headline value.
- **`COMPLETENESS_HINTS`** — the scope gives exactly one: *"You have not recorded the time of the
  incident"*. That one ships `documented`, cited to the scope document. A small number of obvious
  siblings (date, place, who was present) ship `inference` and are **observations only**, never proposals.

## 7. API / Interface Contracts
**Additive. No new endpoint is required for the panel itself** — the in-process rules run in the browser
from `libs/shared`, exactly as UC-03's detection does.

- `POST /api/drafts/:id/language-insert` **(new, minimal)** — records an insertion.
  Body `{ fieldId, promptId, kind, suggestionText }`. Returns **204**. Writes
  `LANGUAGE_SUGGESTION_INSERTED`. `suggestionText` is required because the scope's post-condition
  requires the wording to be logged; it is capped at 500 characters and is the assistant's wording,
  never the narrative.
  It records; it does not modify the draft. The narrative reaches the server by the normal autosave
  `PATCH`, unchanged.
  Rejections: unknown draft → 404; not the user's draft → 404; a `kind` outside the union → 422.
- `POST /api/language/prompts` **(new, only when `LANGUAGE_ASSIST_URL` is configured)** — proxies narrative
  text to the assistance service and returns validated prompts. Empty array on any failure. Never 5xx to
  the client.
- `PATCH /api/drafts/:id` — unchanged. A narrative containing flagged or informal language saves exactly
  as before.

## 8. Detailed Logic & Business Rules
- **Nothing is auto-applied, ever.** The control's value changes only in the Insert handler, and the Insert
  handler runs only from a click or an Enter/Space on the Insert button. DoD line 2 is asserted directly:
  render prompts, wait, assert the control's value is byte-identical.
- **A prompt may only propose wording it can attribute.** `canProposeVerbatim(prompt)` requires
  `provenance === 'documented'` and a non-empty `source`; the panel renders no Insert button without it.
  Enforced in the function *and* in the conformance gate, the two-layer pattern UC-05 established.
- **Insert splices at `selectionStart`**, not at the end. With no cursor (never focused) the prompt's
  Insert is disabled rather than guessing a position.
- **Insert never overwrites a selection silently** — a non-empty selection is replaced only because that is
  what a text editor does, and the caret is left after the inserted text.
- **Informal flags use the amber highlight and the panel together**, per the scope: highlight in the text,
  entry in the panel with the alternative. `anchor` ties the two so hovering one can indicate the other.
- **Dismissal is by prompt id, for the session.** A dismissed prompt does not return until reload.
- **The panel says what it does not know.** A narrative with no prompts shows a line stating the assistant
  only checks the patterns it has been given and is not a review of the statement — the same honesty the
  UC-05 consistency panel carries about unverified templates.
- **Assistance is never blocking.** No prompt invalidates a control, affects required-field progress, or
  gates a wizard step. Saving, navigating and completing behave exactly as UC-03 and UC-05 established.
- **Audit records the act and the wording it offered, never the witness's words.**
  `{ formCode, fieldId, promptId, kind, suggestionText }`.
  **This is a change from this PRD's first draft**, which recorded ids and a kind only. The scope's
  post-condition is explicit — *"All Insert actions logged in the form audit trail with the suggestion
  text"* — and the scope is the source of truth. The distinction that makes it safe: the suggestion text
  is the **assistant's own** wording, product text with a citation behind it, not case content. The
  narrative is never sent to the endpoint and never recorded, and a check asserts the row contains
  neither the narrative nor any phrase from it. This also answers half of `open-questions.md` Q7.
- **UC-03 is unchanged.** Its five patterns, their explanations, the word count and the backdrop geometry
  all behave identically; a check asserts the existing hearsay/opinion behaviour still passes.

## 9. Data Flow & Integrations
Narrative field takes focus → panel opens → the user types → in-process rules (`libs/shared`) produce
informal, phrase and completeness prompts → *if* `LANGUAGE_ASSIST_URL` is configured, `POST
/api/language/prompts` may add more, validated and `insertText`-stripped unless attributable → the panel
lists them → the user presses **Insert** → the component splices at the cursor and the control updates →
existing 1.5 s autosave `PATCH` persists the narrative → `POST /api/drafts/:id/language-insert` records
the act. The assistance service is the **only** external system, it is optional, and it can only ever
return data.

## 10. Error Handling & Edge Cases
| Situation | Behaviour |
|---|---|
| `LANGUAGE_ASSIST_URL` unset | Module not registered; panel runs on in-process rules only. No error |
| Service down, timing out, or 5xx | Empty prompt list, and the panel states *"Language assistance temporarily unavailable"* — the scope's own Error Handling wording, which is more specific than this PRD's first draft ("renders nothing"). It is a line inside the panel, not an error: **no snackbar, no banner, no console error, nothing blocked** (DoD 4) |
| Service returns malformed prompts | Dropped by shape validation; the rest are shown |
| Service returns `insertText` without a source | `insertText` stripped; the observation may still show |
| Narrative empty | No prompts; the panel shows its "only checks what it has been given" line |
| Field never focused, no cursor | Insert disabled — no guessed position |
| Insert while text is selected | Selection replaced, caret left after the insertion |
| The same prompt dismissed then the page reloaded | It returns — dismissal is per session by design |
| Audit write fails | Logged server-side, never surfaced; the insertion stands (existing `AuditService`) |
| A non-narrative textarea (address, charge list) | No panel, no flags, no prompts |
| Narrative with flags | Saves normally; nothing blocks |

## 11. Security & Performance (Non-Functional)
- **The service has no write path.** No Prisma client, no draft service, no route that mutates a draft.
  Asserted by a source-level guard test, in the shape UC-02 uses for the case-write-path guarantee.
- **Narrative text is case content.** Sending it to a hosted model sends a witness's account to a third
  party. That is why the service is **optional and unconfigured by default**, why the boundary is one-way,
  and why the decision to configure one is recorded as a decision-maker question rather than assumed
  (`open-questions.md` Q6). A staging instance with `DemoAuthGuard` must not be pointed at a real model
  with real statements.
- **Untrusted output.** Everything the service returns is data to be validated, never markup to render or
  wording to trust. Prompt text is rendered as text, never as HTML.
- **Bounded cost.** Short timeout, response size cap, no retries, debounced on the same interval UC-03's
  detection uses, so typing does not amplify calls.
- Audit metadata carries ids and a kind only.
- **Colour:** informal flags reuse UC-03's amber. **Red stays reserved for UC-07** (CLAUDE.md rule 6).
- Panel is a labelled landmark with `role="complementary"`; prompts are announced without stealing focus
  from the narrative — a panel that grabs focus mid-sentence would be worse than no panel.

## 12. Testing Strategy
- **Unit (pure, `libs/shared`):** `assistancePrompts` for each kind and for an empty narrative;
  `canProposeVerbatim` across every provenance/source combination; informal patterns against a matching
  and a non-matching sample; the scope's time-of-incident hint firing and not firing; UC-03's five
  patterns unchanged.
- **Conformance:** `narrative` on a non-textarea; a registry prompt with `insertText` but no source; a
  hint rule with no trigger. Planted-defect self-tests for each.
- **E2E:** one check per DoD line — panel present for **MG5 and MG11**; **the text field unchanged with no
  Insert action**; Insert places text at the cursor **and** writes the audit row; the panel degrades to
  nothing with the service unavailable and **no console error**. Plus: dismissal persists for the session
  and returns after reload; a non-narrative textarea gets no panel; an informal flag shows both the amber
  mark and its panel entry; saving is never blocked; the audit row contains no narrative text.
- **Regression:** the full suite stays green, every `data-testid` intact, `orphan-scan` clean.

## 13. Acceptance Criteria
The scope's Definition of Done, verbatim, and how each is met:

- "Legal language assistance suggestions appear correctly in the side panel for MG5 and MG11" — the panel
  is driven by the declared `narrative` flag, which MG11 `statementText` and MG5's four prose fields carry.
  Asserted on both forms, and asserted absent on a non-narrative textarea.
- "Suggestions are never auto-applied — verified by automated test that confirms text field is unchanged
  without a user Insert action" — asserted byte-for-byte on the control value with prompts rendered.
- "Insert action correctly places text at cursor position and logs the action in the audit trail" —
  asserted by placing the caret mid-text, inserting, checking the resulting string and caret, and reading
  the `LANGUAGE_SUGGESTION_INSERTED` row back from the database.
- "Panel degrades gracefully when language AI service is unavailable — no errors surfaced to user" —
  asserted with the service route failing: no panel error, no snackbar, and **zero console errors**.

Plus the repo's own bar: no unattributable wording is insertable; conformance and orphan-scan green; every
`data-testid` intact; test drafts cleaned from `dev.db`.

## 14. Dependencies, Risks & Rollout
- **Prerequisites, all delivered:** UC-03's detector, segmentation and highlight backdrop; UC-01's template
  model and renderer; UC-05's provenance-gating precedent and its conformance machinery.
- **Risk — an invented phrase becomes the witness's words.** The epic's central risk, mitigated by shipping
  `STANDARD_PHRASES` **empty** and gating `insertText` on attribution. It means UC-06 ships useful but
  incomplete: informal flags and completeness hints work; standard phrasing waits on a practitioner.
  That is the honest trade and it is stated rather than hidden.
- **Risk — the panel read as a review.** Mitigated by the panel's own wording.
- **Risk — scope creep into UC-08.** This UC assists a *narrative field*; it does not review a form.
- **Risk — the service becoming a write path** in a later refactor. Mitigated structurally and by a test.
- **Decision needed, not blocking:** whether a language AI service is configured at all, and if so which
  (`open-questions.md` Q6). Everything ships and works with none.
- **Rollout:** additive, in five independently shippable stages, matching the ticket order in
  `human-instructions.txt`. Stage 1 — the declared narrative flag and the renderer generalisation, the
  largest piece (LER-1223, LER-1224). Stage 2 — the panel and its three prompt sources (LER-1225..1228).
  Stage 3 — insert at cursor, the audit row, and the never-auto-applied proof (LER-1229..1232). Stage 4 —
  the service boundary, graceful degradation and the non-blocking guarantee (LER-1233..1235). Stage 5 —
  accessibility and the Definition of Done checks (LER-1236, LER-1237). Stage 1 must land first: until
  narratives are declared and the renderer honours the declaration there is nowhere for the panel to
  attach on MG5, which is half of DoD line 1. No stage introduces insertable wording that cannot be
  attributed.
