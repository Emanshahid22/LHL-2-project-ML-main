## Epic
UC-03 — MG11 Witness Statement Completion

> **Retrospective documentation of delivered work.** UC-03 was built, tested and closed before this pack
> existed. It is written here in the company Epic/PRD/Story format so delivered behaviour is documented to
> the same standard as work planned up-front (UC-04 was the first pack authored in advance — see
> `docs/usecases/uc-04/`). Nothing here is a request to build anything.
> Completion commit `7c36d24` (cosmetic required-marker fix in `fe0825e`), marker branch
> `mgs/uc-03-mg11-wizard`.

## Overview
MG11 is the form solicitors complete most often, and the one where getting it wrong matters most: it
carries a witness's account in their own words, under a statutory declaration that exposes them to
prosecution if it is false. Handing a solicitor fifteen boxes in one long column does not reflect how a
statement is actually taken.

UC-03 delivers a four-step guided wizard — witness details, narrative, declaration, signature — with three
pieces of substance behind it: **declaration integrity** (the statutory wording is a hash-pinned constant
the API refuses to boot without), **hearsay and opinion flagging** (advisory, never blocking, recorded in
the audit trail), and **vulnerable-witness derivation** (under-18 at the statement date, or a
special-measures category, reveals a field and a persistent indicator).

Critically, the wizard is a **shell around** the shared renderer, not a fork of it. `DynamicForm` still
owns the single `FormGroup`; the wizard narrows what is displayed via `visibleFieldIds`.

**Source of truth:** the UC-03 section of <https://lhl-agents.netlify.app/mg-forms-scope/>.

## Business Value / Goal
Three distinct kinds of value, in ascending order of consequence:

1. **Throughput.** The form solicitors fill most often becomes the one that guides them, with per-step
   progress and a resume that returns to the furthest incomplete step.
2. **Statement quality.** Hearsay and opinion are the two most common reasons a witness statement gets
   picked apart. Flagging them as the solicitor types — while never blocking — moves that correction from
   the courtroom to the drafting.
3. **Legal integrity.** A witness signs a declaration exposing them to prosecution. If that wording can
   drift — by an accidental edit, a bad merge, or a tampering client request — a witness has signed
   something other than the statutory declaration. The wording is therefore one constant, hash-pinned,
   verified at startup, and unwritable through any endpoint.

Success = the four steps work with the same save and progress guarantees as every other form, the
declaration provably cannot drift, flags help without obstructing, and a vulnerable witness is visible
from the header.

## Scope
**In scope (as delivered):** the four-step wizard shell with clickable visited steps, per-step
required-field counts and resume-to-furthest-incomplete; step 1 witness details including title,
occupation and the witness-care fields; step 2 narrative with spell-check, a live word count and
hearsay/opinion highlighting; step 3 the read-only declaration and its confirmation checkbox, which gates
advancing; step 4 signature name, statement-taken-by and the signature date, plus a note that wet-signature
space is reserved on PDF output; the declaration as an immutable shared constant with a SHA-256 pin, a
fatal startup check and a 422 API guard; hearsay/opinion detection shared between browser and API, with
distinct phrases recorded in `DRAFT_SAVED` audit metadata; vulnerable-witness derivation, the revealed
"Special measures applied" field, the header chip, and the derived `isVulnerableWitness` flag persisted
into the draft's values.

**Out of scope:**
- **PDF output** — UC-09. This includes the wet-signature space itself and whether the vulnerable-witness
  indicator reaches the printed page. UC-03 persists the flag; it cannot render it.
- **Legal Language Assistance as a use case** — UC-06. Hearsay/opinion flagging here is the narrow,
  scope-named subset; the general "legal language hook" (LER-1062) is not built.
- **Page-count fields on the printed form** (LER-1071–1073) — a PDF-layout concern.
- **Signing the declaration wording off as verbatim-correct.** The wording is pinned; nobody has confirmed
  it matches the current official MG11. That is the one criterion recorded as **Blocked**.
- Spell-check as a product feature: the browser's own `spellcheck` is enabled, not a custom dictionary.

## User Stories
Each maps to the DevOps Bot ticket that delivered it. See `stories/`.

1. **MG11 definition and layout** (LER-1056) — the template's fifteen fields and their sections.
2. **Wizard shell** (LER-1057) — four steps around the shared renderer, never a fork.
3. **Step 1: witness details** (LER-1058) — every field the scope names, plus witness care.
4. **Step 2: narrative text area** (LER-1059) — the statement in the witness's own words.
5. **Step 2: spell-check** (LER-1060) — browser spell-check on, deliberately.
6. **Step 2: word count** (LER-1061) — live, so statement length is visible.
7. **Step 3: declaration displayed read-only** (LER-1063) — text, not an editable field.
8. **Step 3: confirmation checkbox** (LER-1064) — the tick that records confirmation.
9. **Block advance without confirmation** (LER-1065) — step 3 gates step 4.
10. **Step 4: signature date field** (LER-1066) — DD/MM/YYYY, with wet-signature space noted for PDF.
11. **Declaration as immutable constant** (LER-1067) — one copy, server-owned, never per draft.
12. **SHA-256 hash of declaration** (LER-1069) — the pin.
13. **Startup hash verification** (LER-1070) — a mismatch is fatal, not a warning.
14. **Hearsay and opinion detection** (LER-1074) — the five scope phrases, shared pure function.
15. **Amber underline, non-blocking** (LER-1075) — advisory highlighting, audit-recorded.
16. **Vulnerable witness fields** (LER-1076) — two routes in, one derived flag.

**In the UC-03 ticket block but NOT delivered** (see `open-questions.md`): LER-1062 *Step 2: legal
language hook*, LER-1068 *Literal typing of declaration*, LER-1071–1073 *Page count* (three tickets),
LER-1079 *QA: Definition of Done checks*, and LER-1077/LER-1078 *Senior solicitor review* — both of which
are **blocked on a human**, not on code.

## Epic-level Acceptance Criteria
The scope's Definition of Done, verbatim:

- "MG11 declaration text matches the current official verbatim wording"
- "Hearsay flag correctly identifies 'I was told that', 'I heard that', and 'In my opinion' patterns"
- "Flags are non-blocking — form can be submitted with flags present and audit log records them"
- "Vulnerable witness indicator persists correctly to PDF output"

Outcome: 1 **Covered**, 2 **Partial**, 1 **Blocked** — and the Blocked one needs the client, not code. See
`prd.md` §13.

Plus the repo's own rules this use case established:

- The MG11 wizard is a shell around `DynamicForm`, never a fork of it.
- The statutory declaration is server-owned: no endpoint accepts declaration wording from a client, on any
  form.

## Dependencies & Risks
- **Depends on UC-01's renderer and UC-02's provenance model.** The wizard reuses both; a UC-03 check
  asserts UC-02 behaviour is unchanged (witness fields never auto-fill).
- **Risk, realised and fixed during verification:** the highlight backdrop initially sat *below* the
  textarea, which killed tooltips. It now layers *above*, transparent and `pointer-events: none` except on
  marks, with mousedown forwarding the caret. Found by testing, not review.
- **Risk, realised and fixed:** the declaration rendered twice — the checkbox label was itself the wording.
- **Risk: the declaration wording is unverified.** It is the wording that was already in the template. The
  hash guarantees it cannot change silently; it does not guarantee it is right. Jira sub-task LER-1200
  exists for the sign-off.
- **Risk: flagging read as validation.** Flags are advisory. If they ever blocked a save, a solicitor could
  not record a statement a witness actually gave — which would be worse than an unflagged phrase.
- **Risk: a wizard drifting from the renderer.** Every field behaviour (help, validation, dates, badges)
  must keep coming from `DynamicForm`. Forking it would double every future fix, which is why
  `visibleFieldIds` exists.
- **`isVulnerableWitness` is a derived key in `valuesJson`**, not a template field. `npm run orphan-scan`
  knows it deliberately, so it is never reported as stranded data.
