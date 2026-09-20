## Epic
UC-08 — Form Review & Quality Check

## Overview
Six use cases have built the pieces a quality gate needs: required-field completeness (UC-01),
declarative validation and cross-field date rules (UC-05), repeating-group completeness (UC-04), and
the sensitive-material confirmation machinery (UC-07). What no use case has built is the moment they
all matter at once: the point where a solicitor says "this form is done" and the product either
agrees or explains exactly why not.

UC-08 is that moment. A **Review & Finalise** action runs a four-check quality suite — completeness,
date logic, cross-form reference consistency, and MG6D sensitive-handling confirmation — and presents
every finding as a checklist with a description, the affected field, and a **Jump to field** control.
Blocking issues must be fixed; advisory issues can be acknowledged and bypassed, each bypass
recording a reason (LER-1106). Once clean, **Finalise** activates — and the same gate holds at the
API, where a finalise request with outstanding blocking issues, an unconfirmed MG6D section, or an
unacknowledged advisory is rejected and the refusal audited, exactly the UC-07 discipline.

**Source of truth:** the UC-08 section of <https://lhl-agents.netlify.app/mg-forms-scope/>. Client
tickets **LER-1141–1152**, plus the two reserved for UC-08 since the UC-04/05 cycle: **LER-1104**
(cross-form rules — folded into Check 3) and **LER-1106** (advisory override with reason — folded
into advisory acknowledgement). Stories in `stories/` are named by those client keys; the
delivering-ticket mapping is recorded in `open-questions.md` from day one.

## Business Value / Goal
A defence solicitor's form does not fail in the editor; it fails at the CPS, in front of a court
clerk, or during disclosure — days later and at a cost measured in hearings, not keystrokes. Three
kinds of value:

1. **Errors caught where they are cheapest.** A missing required box, an impossible date sequence,
   an exhibit cited in a statement that no exhibit list carries — each is seconds to fix while the
   form is open and a formal deficiency once served.
2. **A gate that cannot be politely ignored.** Everything before UC-08 is advisory by design, and
   correctly so — a draft is allowed to be wrong. Finalisation is the one moment the product is
   allowed to say no, and it says no in both layers: the button stays inert AND the endpoint refuses,
   because a gate that lives only in Angular form state is a suggestion.
3. **A defensible record.** Every quality-check run, every advisory bypassed (with the reason),
   every refused finalisation and the finalisation itself land in the append-only audit trail — the
   difference between "we checked" and being able to prove it.

Against that, the discipline that shapes the epic: **the checks assert only what the product
actually knows.** Nothing is inferred from prose, no rule is invented to look thorough, severities
follow the same provenance discipline as UC-05, and a check that cannot run says so rather than
passing silently.

## Scope
**In scope:**
- A **pure quality engine** in `libs/shared` (`quality-check.ts`) composing the existing primitives
  — `requiredFieldIds`/`isConditionallyRequired`/`isGroupValueComplete` (Check 1), the declared
  UC-05 date rules via `crossFieldFindings` plus date validity (Check 2), a **declared cross-form
  vocabulary** (Check 3), and UC-07's activation + acknowledgement state (Check 4). Reused, never
  duplicated.
- **Check 3's honest basis:** `urn` and `defendantName` already repeat across the case's forms
  through `mapsTo`, and the exhibit-reference convention ("JS/1") is documented in the templates'
  own helpText on MG11 `exhibitsReferenced` (cites) and MG12 `exhibitEntries` (defines). A new
  declared `crossRef` annotation marks exactly those fields; parsing follows the convention the
  printed form itself instructs. The MG5-witness rule LER-1104 names is NOT structurally possible
  today and is recorded, not faked (open-questions Q4).
- **Server endpoints:** `POST /drafts/:id/review` (runs the suite, audits the outcome, sets
  `REVIEWED` when clean) and `POST /drafts/:id/finalise` (re-runs the suite at the boundary;
  rejects with an audited refusal on any blocking issue, incomplete check, unconfirmed MG6D, or
  unacknowledged advisory; each advisory bypass needs a reason and is audited; success sets
  `FINALISED`).
- **Review UI on the form page:** the Review & Finalise trigger (enabled once ≥1 field is
  complete), the grouped checklist (blocking / advisory / could-not-complete), Jump-to-field with
  highlight (including MG11 wizard step reveal and the UC-07 locked-section case), advisory
  acknowledgement with reason, Finalise gating, the green "Ready to Finalise" state, and the UC-09
  handoff stub.
- **Timeout honesty:** each check runs under a time budget; a check that cannot complete is shown
  as such with "verify manually" guidance, still-completed checks stay enforced, and an incomplete
  check blocks finalisation (a timeout must not become a bypass — open-questions Q5).
- **Status lifecycle additions:** `REVIEWED` (new `DraftStatus`), editing a reviewed draft reverts
  it to `DRAFT` (a review attests the values it saw), `FINALISED` becomes reachable and read-only.
- New audit actions through the existing append-only path: `QUALITY_CHECK_COMPLETED`,
  `ADVISORY_BYPASSED`, `FINALISE_REJECTED`, `FORM_FINALISED`.

**Out of scope (recorded):**
- PDF generation — UC-09. The post-finalise handoff is a stub that says so.
- Archive/case attachment — UC-10.
- Any NLP or name extraction from narrative text (Q4).
- Re-banding of severities by a practitioner (the table ships with recorded defaults, Q3).

## The findings that shaped the design
- **F1 — MG5 has no structured witness field**, so LER-1104's literal rule ("a witness named in MG5
  must have a corresponding MG11") cannot run on structured data. Inventing an MG5 witness box
  violates rule 1; parsing prose for names is inference the codebase refuses everywhere else. What
  ships is the cross-form RULES ENGINE with every rule the shared vocabulary makes honest —
  URN/defendant-name equality, exhibit citations against the exhibit list — and Q4 records what the
  witness rule needs before it can exist.
- **F2 — Everything before UC-08 never blocks, and must stay that way.** Saves are still never
  rejected for quality (a draft is allowed to be wrong; autosave fires 1.5s after a keystroke). The
  gate exists at exactly one place: the finalise transition. `update()` keeps its semantics; only
  `REVIEWED → DRAFT` reversion is added.
- **F3 — A review is an attestation of specific values**, so `REVIEWED` cannot survive an edit:
  any successful save of a reviewed draft reverts it to `DRAFT`, recorded in the save's audit
  metadata. Without this, review-then-edit-then-finalise would attach the gate's blessing to values
  it never saw.
- **F4 — UC-07's redaction changes what Check 4 may say.** A reviewer without sensitive-material
  access cannot see MG6D content, but the ENGINE runs server-side on stored values, so the check is
  computed honestly for everyone; its finding text names the section, never the content.

## Definition of Done (scope document, quoted verbatim)
1. "Quality check catches all required field types across 3 different MG form types"
2. "'Jump to field' links correctly navigate to and highlight the relevant field"
3. "Advisory issues can be acknowledged and bypassed; blocking issues cannot"
4. "Cross-reference consistency check correctly flags mismatched exhibit numbers across linked
   forms"

DoD 3's blocking half is proven at the API with a real HTTP finalise attempt, per the run brief.

## Stories and build order
Stage 1 — the engine (`libs/shared`): LER-1142 (Check 1), LER-1143 (Check 2), LER-1144 + LER-1104
(Check 3 + the declared vocabulary), LER-1145 (Check 4).
Stage 2 — the boundary (API): LER-1141 (trigger/review endpoint), LER-1150 (server-side finalise
gating), LER-1151 (outcome logging), LER-1106 (bypass reasons, audited).
Stage 3 — the surface (UI): LER-1146 (checklist), LER-1147 (jump to field), LER-1148 (blocking must
resolve), LER-1149 (advisory acknowledgement).
Stage 4 — proof: LER-1152 (QA DoD checks).
