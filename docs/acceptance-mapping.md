# Acceptance criteria → test mapping

Traces each acceptance criterion from the client scope document to the automated checks
that cover it, so coverage is answerable against the brief rather than against this
repository's own README.

- **Source of truth:** <https://lhl-agents.netlify.app/mg-forms-scope/> (UC-01 – UC-08)
- **Suite:** `npm run test:e2e` — **281 checks** as of Release-01 (PR #211): the 220 mapped here
  plus UC-09 (PR #194), UC-10 (PR #202), D-F verification-band checks and the 14 release-01 auth
  matrix tests. **This mapping still covers UC-01–08 only** — UC-09/UC-10 criteria are evidenced
  DoD-by-DoD in their PR bodies (`docs/pr-bodies/mgs-uc-09-pdf-generation.md`,
  `docs/pr-bodies/mgs-uc-10-archive-case-attachment.md`); extending this table to them is an
  open documentation task (see the release-readiness report, LER-1187).
- **Criteria:** the scope lists **4 per use case**. All eight delivered use cases — UC-01 to UC-08 — are
  now mapped below, 32 criteria in total.

> Note on counts: this work was originally briefed as "19 UC-01 checks and 33 UC-02
> checks". The scope document does not contain 19 or 33 criteria — it lists four apiece.
> The 122 checks here are our own tests; the 16 criteria below are the client's. If a
> separate acceptance pack with 19/33 items exists, it has not been shared and this
> mapping should be re-done against it.

Status key: **Covered** — an automated check asserts it. **Partial** — asserted for a
representative case, not exhaustively. **Blocked** — cannot be verified from inside this
repository yet, with the reason given.

**Per-use-case packs.** Each delivered use case now has a full documentation pack — epic, 14-section
as-built PRD, one story file per delivering ticket, outstanding human actions, and its own open questions
including every scope-vs-built deviation found:

| UC | Pack | Stories | Deviations recorded |
|---|---|---|---|
| UC-01 | `docs/usecases/uc-01/` | 12 | 2 |
| UC-02 | `docs/usecases/uc-02/` | 12 | 3 |
| UC-03 | `docs/usecases/uc-03/` | 16 | 4 |
| UC-04 | `docs/usecases/uc-04/` | 14 | 5 |
| UC-05 | `docs/usecases/uc-05/` | 16 | 3 findings + 3 tooling limits |
| UC-06 | `docs/usecases/uc-06/` | 15 | 7 |
| UC-07 | `docs/usecases/uc-07/` | 15 | 1:1 map LER-1126..1140 → 1240..1254 in its open questions |
| UC-08 | `docs/usecases/uc-08/` | 14 | 1:1 map LER-1141..1152 + 1104/1106 → 1255..1268 in its open questions |
| UC-04 (MG6 field set) | `docs/usecases/uc-04/stories/LER-1239.md` | 1 | 2 inferences recorded |

The story files carry the same criteria as the tables below at ticket granularity, each citing its
covering check by spec file and test name.

---

## UC-01 — Form Selection & Initiation

_Pack: `docs/usecases/uc-01/` — epic, as-built PRD, stories, human actions, open questions._

| # | Criterion (verbatim) | Status | Covering checks |
|---|---|---|---|
| 1 | "All 11 MG forms (MG1, MG2, MG3, MG4, MG5, MG6, MG11, MG12, MG14, MG15, MG16) are available and load correctly" | **Covered** | `every one of the 11 forms opens and renders its own field set` (LER-1040 — opens a draft of each of the eleven, asserts the header's required-field denominator equals `requiredFieldIds(template).length`, and asserts every declared field id renders; MG11 is walked step by step through the wizard); `picker offers all 11 MG forms`; `cards keep [data-form-code] and render code, name and description`; `all 11 cards lay out 4-up on a wide screen` |
| 2 | "Case-link selection shows correct case list filtered to the user's accessible cases" | **Covered** | `dialog lists only accessible cases and never the colleague-only case`; `a case belonging only to a colleague is not readable`; `another user's draft is not readable` |
| 3 | "Progress indicator updates in real time as fields are completed" | **Covered** | `header progress reports N of M required fields and advances as they are filled`; `each row shows required-field progress computed from the template` |
| 4 | "Draft save is confirmed by UI and persists across browser sessions" | **Partial** | `explicit Save draft persists and confirms with a snackbar`; `debounced autosave persists without an explicit save`; `draft appears in the work queue and resumes with its saved values`; `editing a filled field makes it manual, and it stays manual across a reload` |

**Gaps to close on UC-01**

- *#1* is **closed** (LER-1040, branch `mgs/finish-uc01-06`, commit `b45afc8`, merged in PR #115).
  Counting cards proved the eleven forms were OFFERED; the DoD says they "load correctly", so the new
  check opens a draft of each and asserts the renderer produced that template's own declared fields.
  Two documented exclusions: `specialMeasuresApplied` renders only for a vulnerable witness (UC-03), and
  `isVulnerableWitness` is a derived stored value, never a control.
  **What is still true and worth stating:** five of the eleven templates are not rebuilt from sourced
  research (MG1, MG2, MG5, MG11, MG14 carry no per-field provenance), and none is practitioner-verified,
  so "loads correctly" means the field set renders — not that it is the right field set.
- *#4* — persistence is proven across a page reload and a re-fetch from the API, not across
  a genuinely new browser session (fresh context/profile). The values live server-side, so
  this is very likely fine, but it is not what the check demonstrates.

---

## UC-02 — Auto-Population from Case File

_Pack: `docs/usecases/uc-02/` — epic, as-built PRD, stories, human actions, open questions._

| # | Criterion (verbatim) | Status | Covering checks |
|---|---|---|---|
| 1 | "Auto-population from a test case file correctly fills all matching fields without overwriting non-matching fields" | **Covered** | `first open of a case-linked draft populates and summarises`; `the summary counts only mappable fields`; `charges are joined from every offence on the case`; `auto-fill leaves fields the case cannot supply blank`; `unmapped fields carry no auto-fill note`; `MG16 subjectName is not auto-filled from the defendant` |
| 2 | "Auto-filled badge displayed on every pre-filled field" | **Covered** | `EVERY field the run filled carries the badge, on two different forms` (LER-1055 — loops over the draft's provenance map, the same source the badge derives from, asserting a badge and a Clear on each filled field, then asserts the on-screen badge count equals the number filled; run on MG1 and MG4); `filled fields carry an Auto-filled badge with a Clear affordance`; `provenance records the source, the value and the case timestamp` |
| 3 | "Ambiguous field handling tested with a case file containing duplicate offence entries" | **Covered** | `ambiguous case data leaves the field blank with an explanatory note` (Marcus Bellamy's two conflicting offence dates); `ambiguous and no_data outcomes are reported with reasons`; `missing case data is flagged with a no-data note` |
| 4 | "Re-run auto-population on case file update works without losing manually entered values" | **Covered** | `population never overwrites a manual value on re-run`; `a case that changed after population surfaces the banner, and Re-run clears it`; `re-run refills a field that was cleared back to empty`; `saving a value that differs from what auto-fill wrote prunes its provenance` |

**Gaps to close on UC-02**

- *#2* is **closed** (LER-1055, branch `mgs/finish-uc01-06`, commit `b45afc8`, merged in PR #115). The
  badge was asserted on one field (`defendantName`), which is a sample rather than the claim "every
  pre-filled field". The new check reads the provenance map back from the API and demands a badge on each
  field the run actually wrote, on two templates so it cannot be an MG1 peculiarity.
- No open gaps on UC-02.

---

## UC-03 — MG11 Witness Statement Completion

_Pack: `docs/usecases/uc-03/` — epic, as-built PRD, stories, human actions, open questions._

| # | Criterion (verbatim) | Status | Covering checks |
|---|---|---|---|
| 1 | "MG11 declaration text matches the current official verbatim wording" | **Blocked** | `the declaration is read-only text, not an editable field`; `the shipped declaration matches its integrity hash`; `the API refuses to start on a tampered declaration`; `the API rejects declaration tampering` |
| 2 | "Hearsay flag correctly identifies 'I was told that', 'I heard that', and 'In my opinion' patterns in test narratives" | **Covered** | `flags every phrase the scope requires` (all five patterns, including the two beyond this criterion); `detects mixed-case variants`; `does not flag ordinary narrative prose`; `marks align with the text they underline`; `hovering a flagged phrase explains why` |
| 3 | "Flags are non-blocking — form can be submitted with flags present and audit log records them" | **Partial** | `flags never block saving, navigating or completing`; `saving records the flags in the audit trail` |
| 4 | "Vulnerable witness indicator persists correctly to PDF output" | **Partial** | `an under-18 date of birth reveals special measures and the indicator`; `an adult with a special-measures category is treated the same`; `the indicator and derived flag survive a reload` |

**Gaps to close on UC-03**

- *#1* is **blocked and needs practitioner action — and now has citable evidence of a mismatch.**
  The scope requires the declaration to match "the current official verbatim wording" but does not
  reproduce that wording. On 24 Aug 2026 the constant was compared character by character against the
  declaration printed on a genuine **2013** MG11 specimen (<https://www.bbpolice.uk/uploads/MG11.pdf>,
  page 1 — the same specimen family the template rebuild verified). **They differ in three places**:
  the specimen opens "This statement *(consisting of ___ page(s) each signed by me)* is true…" and the
  constant omits the parenthetical (the page-count blank that LER-1071–1073, deferred to UC-09, exist
  to fill); the specimen reads "wilfully stated **in it anything**" where the constant has "wilfully
  stated **anything in it**"; and the specimen has a comma in "false**,** or do not believe". Nothing
  has been changed: the constant and its SHA-256 must move together, the API refuses to boot on a
  mismatch, and the parenthetical raises a design question (static blank now vs UC-09's interpolated
  page count). Honesty caveat: 2013 is the latest citable specimen — no current official central source
  exists (see `docs/answers/template-sourcing-evidence-2026-08.md`), so this evidences a mismatch with
  the 2013 revision, not knowledge of the current wording. **Decision owners: practitioner sign-off
  (LER-1077 / LER-1200) chooses the wording; UC-09 planning chooses how the page count lands.** What
  remains proven: single-sourced constant, read-only render, never stored per draft, hash-pinned at
  boot, unsettable by any client.
- *#3* — the finalise action now exists (`POST /drafts/:id/finalise`, UC-08), so "submitted" is no
  longer structurally untestable, and UC-08 proves advisories are bypassable-with-reason and audited.
  Still Partial for what the wording actually claims: no check yet finalises a statement **with
  hearsay/opinion flags present** and asserts the flags themselves reach the audit record of that
  submission — UC-08's checklist audits its own four checks, not the UC-03 narrative flags. Flag
  recording on save is still asserted through the same detection function the API records with,
  because `AuditEvent` has no read endpoint; it was additionally verified directly against the
  database during development (`hearsayFlagCount: 2, hearsayFlagPhrases: ["i was told
  that","in my opinion"]`).
- *#4* — "persists to PDF output" cannot be tested because PDF generation does not exist
  yet. What is proven is the half that does: the indicator appears on both routes into
  vulnerability, and the derived `isVulnerableWitness` flag is persisted into the draft's
  values so the PDF renderer can read it without re-deriving. This criterion should be
  re-tested when PDF output lands.

## UC-04 — MG6 Unused Material Schedule

_Pack: `docs/usecases/uc-04/` — epic, as-built PRD, stories, human actions, open questions._

| # | Criterion (verbatim) | Status | Covering checks |
|---|---|---|---|
| 1 | "MG6 schedule numbering is correct and sequential across add, edit, and delete operations" | **Covered** | `numbering is sequential as rows are added, and unaffected by editing`; `deleting a middle row renumbers the survivors and leaves no gap`; `reordering moves a row without changing its identity`; `no ordinal is ever persisted` |
| 2 | "Renumbering on deletion prompts user confirmation before executing" | **Covered** | `deletion prompts first, and cancelling changes nothing`; `nothing is deleted without the prompt being answered`; `deleting a middle row renumbers the survivors and leaves no gap` (the confirmed path) |
| 3 | "Completeness check fires correctly for 'Complex' cases with fewer than 5 items" | **Covered** | `a Complex case with fewer than five items is flagged as sparse`; `the check runs on size alone, and advises nothing without a band`; `summary-only matters use a lower threshold`; `the thresholds are configurable in one place, not at call sites`; `the completeness outcome is written to the audit log` |
| 4 | "Sensitive classification automatically triggers UC-07 handling without additional user action" | **Covered** | `marking a row sensitive raises the flag with no further action`; `the flag is derived, and clears when the last sensitive row goes`; and since PR #139 the handler itself: `classifying a row Sensitive activates the MG6D section immediately, no save needed`; `a second, fresh draft triggers the same handling — no exception` (`e2e/uc07-sensitive-material.spec.ts`) |

Repo rules asserted alongside the scope's four:

| Rule | Covering checks |
|---|---|
| No stored ordinal; `__id` survives every mutation | `no ordinal is ever persisted`; `reordering moves a row without changing its identity`; `deleting a middle row renumbers the survivors and leaves no gap` |
| Duplicate references blocked at row level, not form level | `a duplicate item reference is blocked at the row level` |
| Additive API, malformed schedule rejected at the boundary | `the API rejects a malformed schedule with 422` |
| Existing MG6 field ids preserved for live drafts | `an existing MG6 draft keeps every value it held before the schedule existed`; `npm run orphan-scan` (zero orphans) |
| Designation independence — nothing branches on the form code | `the schedule renders from the field type, never from the form code` |
| Guardrails green with a group template | `conformance and orphan-scan stay green with a group template` |

**Gaps to close on UC-04**

- *#4* moved **Partial → Covered when UC-07 landed** (PR #139). The earlier Partial reason —
  "UC-07 does not exist, so 'triggers UC-07 handling' has no handler to observe" — is obsolete: the
  MG6D section now activates from the classification alone, with no save and no further user action,
  and the whole handling chain (read-only instructions, confirmation gate, access levels, audit,
  export exclusion) is asserted by `e2e/uc07-sensitive-material.spec.ts`. Sensitive now means
  handled, not merely marked.
- *#3* — the scope says the check "fires after 10+ items or when the user attempts to
  finalise", and separately that it must fire for a Complex case with fewer than 5 items,
  which by definition never reaches 10. The trigger implemented is the union of both (see
  `shouldRunCompletenessCheck`). The finalisation half is **implemented in the pure function but
  still not wired**: UC-08 added a finalise action, but the API's only call site
  (`drafts.service.ts` save path) passes no `finalising` flag, and UC-08's review runs its own four
  checks, not this schedule-sparseness advisory. A finalise attempt on a sparse Complex schedule
  below 10 items therefore fires the advisory only if a save already had. One-line wiring plus a
  check when UC-09/UC-10 firm up what "attempts to finalise" should gate.

---

## UC-05 — Field Validation

_Pack: `docs/usecases/uc-05/` — epic, PRD, 16 stories (LER-1207..1222), build brief, open questions._
_Spec: `e2e/uc05-field-validation.spec.ts` — 22 checks. Delivered on `mgs/uc-05-field-validation` (`186edaf`),
merged in PR #85; two checks added by the audit remediation (`09fb75c`) in the same PR._

| # | Criterion (verbatim) | Status | Covering checks |
|---|---|---|---|
| 1 | "Field validation catches all required field types — tested with a deliberately incomplete form" | **Covered** | `required fields are caught across three MG form types` (MG11, MG4 and MG6 between them cover text, textarea, date, select and checkbox, plus the empty-repeating-group case); `a conditional requirement activates, counts and lifts` (a field made required by another field's value enters the denominator from the moment its trigger is set) |
| 2 | "Date validation rejects DD/MM/YYYY format violations and impossible dates" | **Covered** | `a date field offers a format hint while it is focused`; `an impossible date is rejected at input` (`e2e/uk-dates.spec.ts`); `typed DD/MM/YYYY is accepted and stored as ISO` (`e2e/uk-dates.spec.ts`); `a stored ISO date displays as DD/MM/YYYY` (`e2e/uk-dates.spec.ts`) |
| 3 | "Cross-field check: offence date after charge date is flagged correctly in all tested cases" | **Covered** | `a charge dated before the offence is flagged as an error`; `a charge on or after the offence date is not flagged` (later and same-day are both clean — a same-day charge is normal); `an ambiguous case suppresses the check and explains why`; `a standalone draft suppresses the check silently`; `findings clear automatically when the value is corrected` |
| 4 | "Validation errors clear automatically when the field is corrected to a valid value" | **Covered** | `findings clear automatically when the value is corrected` (a single-field error, an advisory hint and a cross-field finding, all three); `no error is shown while the field still has focus` |

Repo rules asserted alongside the scope's four:

| Rule | Covering checks |
|---|---|
| Severity follows provenance — a format may be `error` only if `documented` **with a source** | `a sourced format is a hard error on the field`; `an unsourced format shows an advisory hint and blocks nothing`; `only a sourced format can block, and the case-file references cannot`; `conformance fails a template that asks a blocking rule of an unsourced format` |
| No pattern on a composite officer box; two formats deliberately unreferenced | `no composite officer field carries a format rule, and two formats are unreferenced` |
| Cross-field findings sit in a panel, never in a field's inline slot | `cross-field findings never appear in a field inline slot`; `a cross-field finding names both fields involved`; `the panel says a clean result is not practitioner sign-off` |
| Ambiguity suppresses rather than guesses | `an ambiguous case suppresses the check and explains why`; `a standalone draft suppresses the check silently` |
| Severity belongs to the rule, not the field | `an unusual-but-legal ordering is advisory, not an error` (a statement after the listed hearing advises; one before the witness was born errors — same field, two rules) |
| Client and server reach the same verdict; validation never blocks a save | `the API records the findings the browser shows, and never 4xxs a draft for them`; `the type-shape guard rejects only what cannot be stored` |
| Guardrails green with the rules declared | `conformance and orphan-scan stay green with the validation rules` |

**Gaps to close on UC-05**

- **None against the scope's four criteria.** What is outstanding is *sourcing*, not coverage: URN, ASN,
  custody number, collar number, CPS reference and postcode all ship **advisory** because the research
  evidences that those boxes exist and never states their formats. Each is a one-line provenance change once
  someone can cite the format — `docs/usecases/uc-05/open-questions.md` Q1–Q6.
- Two of the scope's named checks have **no field to attach to**: no template declares a CPS reference box
  (it is a case datum, displayed read-only) and no template declares a collar-number box (collar numbers sit
  inside composite officer boxes, where a pattern would reject correct input). Both registry entries ship
  unreferenced, with a check asserting exactly that, so adding such a field later forces the rule to be
  wired up deliberately. Findings F1 and F2.
- The finalise action now exists (UC-08), which retires the old "no finalise action anywhere" caveat —
  but with a precision worth recording: `validateForm` runs server-side on every save (client/server
  parity in the audit metadata), while the **finalise gate runs the UC-08 quality engine**, whose four
  checks do not include format validation. A draft carrying a hard sourced-format error (email,
  telephone) can therefore still finalise; required-field errors block via Check 1. Whether
  error-severity format findings should also gate finalisation is an open wiring question for
  UC-09/UC-10 planning, not an accident to fix silently.

---

## UC-06 — Legal Language Assistance

_Pack: `docs/usecases/uc-06/` — epic, PRD, 15 stories (LER-1223..1237), build brief, open questions._
_Spec: `e2e/uc06-legal-language.spec.ts` — 25 checks._

| # | Criterion (verbatim) | Status | Covering checks |
|---|---|---|---|
| 1 | "Legal language assistance suggestions appear correctly in the side panel for MG5 and MG11" | **Covered** | `DoD 1 — the panel appears for an MG5 narrative and lists prompts`; `DoD 1 — the panel appears for the MG11 statement narrative`; `DoD 1 — a textarea that is not a declared narrative gets no panel and no marks`; `an informal phrase is marked in the text and listed in the panel`; `the scope's completeness hint fires only when no time is recorded` |
| 2 | "Suggestions are never auto-applied — verified by automated test that confirms text field is unchanged without a user Insert action" | **Covered** | `DoD 2 — the narrative is byte-identical with prompts shown and no Insert pressed`; `DoD 2 — the narrative control is written in exactly one place` |
| 3 | "Insert action correctly places text at cursor position and logs the action in the audit trail" | **Covered** | `DoD 3 — Insert splices at the cursor, leaves the caret after it, and is audited`; `DoD 3 — Insert replaces a selection, as a text editor would`; `Insert is disabled until the narrative has a cursor`; `recording an insertion does not modify the draft` |
| 4 | "Panel degrades gracefully when language AI service is unavailable — no errors surfaced to user" | **Covered** | `DoD 4 — an unavailable assistance service surfaces nothing to the user`; `DoD 4 — a request that fails outright is swallowed too` |

Repo rules asserted alongside the scope's four:

| Rule | Covering checks |
|---|---|
| No wording is insertable unless provenance is `documented` with a source | `a prompt that cannot attribute its wording may observe but not propose`; `nothing in the shipped registries proposes wording it cannot cite`; `in the default configuration no in-process prompt offers wording`; `npm run conformance` (planted defects in both directions) |
| `STANDARD_PHRASES` ships empty rather than invented | `nothing in the shipped registries proposes wording it cannot cite` |
| The assistance service has no write path to a draft | `the assistance module has no write path to a draft`; `recording an insertion does not modify the draft` |
| Assistance never blocks saving, progress or navigation | `assistance never blocks saving, progress or navigation` |
| `narrative` is declared, never inferred from field type | `DoD 1 — a textarea that is not a declared narrative gets no panel and no marks`; `npm run conformance` (`narrative-type`, `narrative-column`) |
| Dismissal and the assistance toggle last the session and no longer | `a dismissed suggestion stays dismissed for the session and returns after reload`; `turning assistance off hides suggestions and clears informal marks only`; `collapsing the panel keeps it closed when the narrative is focused again` |
| UC-03's hearsay/opinion behaviour is unchanged | `UC-03 hearsay and opinion flagging is unchanged by UC-06`; the whole of `e2e/uc03-mg11-wizard.spec.ts` (21 checks) |
| Accessible: labelled landmark, keyboard operable, focus never stolen | `the panel is a labelled landmark, keyboard operable, and never steals focus` |

**What is NOT delivered on UC-06, stated plainly**

- **No standard phrasing ships.** The scope asks for "standard phrasing for common evidential
  descriptions" and supplies none; `STANDARD_PHRASES` is empty on purpose, because inventing courtroom
  wording that a user can insert verbatim into a signed statement is the one thing this epic must not do.
  The main-flow line *"a corresponding entry in the panel with a suggested formal alternative"* is
  therefore **structurally supported but empty**: the panel renders an Insert the moment an entry carries a
  citation, and filling the registry is a data-only change. Open questions Q1 and Q2.
- **DoD 3 is proven through a configured service.** Because nothing in the default build proposes wording,
  the insert path is exercised with the assistance service stubbed at the browser boundary — a supported
  configuration exercising the same code, not a test-only route. Recorded as deviation D6 in the pack.
- The four DoD lines above are all **Covered**; the gap is in what there is to suggest, not in whether the
  mechanism works.

---

## UC-07 — Sensitive Material Handling

_Pack: `docs/usecases/uc-07/` — epic, PRD, 15 stories (client originals LER-1126..1140, delivered as
LER-1240..1254 — 1:1 map in the pack's open questions), open questions._
_Spec: `e2e/uc07-sensitive-material.spec.ts` — 20 checks (19 + PR #148's audit-parity check). Delivered on `mgs/uc-07-sensitive-material`
(`2a67e73`), merged in PR #139; save-audit fix for a never-opened MG6D in PR #148 (`e2263d8`)._

| # | Criterion (verbatim) | Status | Covering checks |
|---|---|---|---|
| 1 | "Sensitive material flag (MG6D) triggers the mandatory handling instruction every time without exception" | **Covered** | `classifying a row Sensitive activates the MG6D section immediately, no save needed`; `a second, fresh draft triggers the same handling — no exception`; `deactivation un-flags the draft while MG6D content survives, dormant, and returns`; `a never-opened MG6D counts as the empty mandatory schedule in the save audit` |
| 2 | "Confirmation cannot be bypassed at API level — tested with a direct API call without the confirmation flag" | **Covered** | `a direct API call touching MG6D without the confirmation flag is rejected`; `an invented confirmation id, and one belonging to another draft, are equally rejected`; `a user without the permission is rejected outright — confirm and edit both`; `the legitimate flow — confirm, then save — succeeds`; `merge-preserve: a save that omits the sensitive key cannot erase MG6D` |
| 3 | "All MG6D access events appear in the audit trail with correct user identity and timestamp" | **Covered** | `view, confirmation and edit each reach the trail with the acting user and timestamp`; `step-up: a reload locks the section again, and a fresh confirmation is a second recorded row`; `no API code path updates or deletes an audit event or an acknowledgement` |
| 4 | "Sensitive items are absent from non-sensitive schedule exports — verified with a test export" | **Covered** | `a test export contains the plain item and not one byte of the sensitive one`; `the export is offered beside the schedule as a plain download link` |

Repo rules asserted alongside the scope's four: the locked view names the required permission level and
its holders without leaking content (`the colleague sees a locked section naming the level and its
holders — and never receives the content`); before confirmation there is no editable control or form key
(`before confirmation there is nothing to edit: no control, no form key, read-only preview`); the PII
panel cites its steps and records the acknowledgement (`the PII panel lists the cited steps, links the
practice-direction rules, and records the acknowledgement`); an active section with an empty MG6D
schedule is an error-severity finding; the banner uses the sensitive tokens — the red reserved since
UC-03. The handling-instructions and PII-steps wording are hash-pinned like the MG11 declaration; the
API verifies both at boot.

## UC-08 — Form Review & Quality Check

_Pack: `docs/usecases/uc-08/` — epic, PRD, 14 stories (client originals LER-1141..1152 plus LER-1104 and
LER-1106 reassigned from UC-05, delivered as LER-1255..1268 — 1:1 map in the pack's open questions),
open questions._
_Spec: `e2e/uc08-review-quality.spec.ts` — 23 checks (20 + PR #184's three remediation checks for LER-1270..1272). Delivered on `mgs/uc-08-review-quality-check`
(`c7b75a4`), merged in PR #142; audit-ordering fix (finalise writes nothing until the transition has won)
in PR #144 (`64c4e06`)._

| # | Criterion (verbatim) | Status | Covering checks |
|---|---|---|---|
| 1 | "Quality check catches all required field types across 3 different MG form types" | **Covered** | `Check 1 catches every required field type, across MG6, MG11 and MG3`; `fixing a missing required field clears exactly its issue on the next run`; `an empty draft cannot be reviewed — API refuses, trigger stays disabled` |
| 2 | "'Jump to field' links correctly navigate to and highlight the relevant field" | **Covered** | `Jump to field scrolls to, focuses and highlights the target on a flat form`; `Jump reveals the MG11 wizard step that holds the field before highlighting it`; `a jump whose target the viewer cannot see lands on the sensitive section block` |
| 3 | "Advisory issues can be acknowledged and bypassed; blocking issues cannot" | **Covered** | `an advisory is bypassed only with a reason, which reaches the audit trail verbatim`; `blocking rows carry no acknowledgement control at all`; `a real HTTP finalise attempt with blocking issues outstanding is refused and audited`; `a finalise that loses the guard writes ZERO bypass rows — and the winner exactly one set`; `a save racing a finalise never strands bypass rows on an unfinalised form` |
| 4 | "Cross-reference consistency check correctly flags mismatched exhibit numbers across linked forms" | **Covered** | `an exhibit cited on one form but defined on no list is flagged, and clears when the list catches up`; `URN divergence across one case's forms is blocking; agreement clears it`; `a standalone draft says honestly that there was nothing to compare` |

Repo rules asserted alongside the scope's four: every run is audited with per-check outcomes, passing and
failing alike (`every run is audited — failing and passing alike, with per-check outcomes`); a clean
review marks the draft REVIEWED and any edit reverts it on the record; a finalised form is read-only and
hands off to a deliberate UC-09 stub; a timed-out check shows partial results and keeps finalisation
blocked (a timeout is never a bypass); Check 4 blocks while MG6D handling is unconfirmed and clears once
confirmed (the UC-07 composition); a clean run shows the green Ready to Finalise state.

---

## MG6 field set (LER-1239) — not a scope criterion, but it changes what UC-01 #1 covers

The scope has no acceptance criterion for an individual template's field set, so MG6's rebuild
(9 fields → 47, all 41 documented printed boxes, each citing its source) has no row above. It is recorded
here because it is what UC-01 #1's "load correctly" now exercises on MG6, and because it set the precedent
for per-field citations.

| Rule | Covering checks |
|---|---|
| Every added box cites the printed box it came from | `npm run conformance` — the `field-source` rule (a citation may not be empty, and may not appear without a provenance), with three planted-defect self-tests |
| MG6 passes the sourcing tier, not merely the structural one | `npm run conformance` — MG6 PASS (structural+sourcing) |
| Additive — no id renamed, UC-04's schedule untouched | `npm run orphan-scan` (zero orphans); `an existing MG6 draft keeps every value it held before the schedule existed`; the 22 UC-04 schedule checks |
| The rebuilt field set actually renders | `every one of the 11 forms opens and renders its own field set` |

Recorded with it: the eight section 3–8 question boxes are printed with blank answer spaces, not dropdowns,
so typing them Yes/No is this project's inference and each ships `provenance: 'likely'` saying so
(`docs/usecases/uc-04/open-questions.md` I1). MG6 stays `verification: 'unverified'`.

## Summary

| Use case | Covered | Partial | Blocked |
|---|---|---|---|
| UC-01 | 3 | 1 | 0 |
| UC-02 | 4 | 0 | 0 |
| UC-03 | 1 | 2 | 1 |
| UC-04 | 4 | 0 | 0 |
| UC-05 | 4 | 0 | 0 |
| UC-06 | 4 | 0 | 0 |
| UC-07 | 4 | 0 | 0 |
| UC-08 | 4 | 0 | 0 |
| **Total** | **28** | **3** | **1** |

All eight delivered use cases are mapped. The count has moved 13/6/1 → 19/4/1 → 28/3/1: UC-05's four
criteria were mapped for the first time and UC-01 #1 / UC-02 #2 closed with PR #115; then UC-07 and
UC-08 landed fully covered (PRs #139, #142/#144) and UC-04 #4 moved Partial → Covered because the
UC-07 handler it was waiting to observe now exists and is tested.

No criterion is failing. The three *Partial* rows: UC-01 #4 proves persistence across reload and
re-fetch, not a genuinely new browser session; UC-03 #3 has a finalise action at last but no check yet
finalising a flagged statement with the flags reaching that submission's audit record; UC-03 #4 waits
on UC-09's PDF output. The single *Blocked* row (UC-03 #1, the MG11 declaration) now carries evidence
of a **mismatch with the 2013 specimen** — three differences, recorded above — and needs a
practitioner's wording decision, not more code.

Beyond these 32 mapped criteria the suite carries 25 dashboard-layout checks and a number of
behaviours documented in `README.md` but not named in the scope (access control, optimistic
concurrency, retry paths, provenance pruning, auto-fill failure handling), plus the
`npm run conformance` and `npm run orphan-scan` guardrails.
