## Epic
UC-07 — Sensitive Material Handling

## Overview
UC-04 built the unused material schedule on MG6 and gave every row a `classification`. Marking one row
**Sensitive** already raises a derived, server-computed flag (`hasSensitiveMaterial`) and an amber chip in
the form header — and then nothing else happens. The sensitive item sits in the same schedule as everything
else, visible to anyone who can open the draft, absent from no export because no export exists, and
guarded by nothing.

UC-07 is what happens next. A sensitive classification **activates a mandatory MG6D section** — the
Schedule of Relevant Sensitive Unused Material — with a red "Sensitive — Restricted Access" banner,
mandatory handling instructions that must be confirmed before the section can be edited, a Public Interest
Immunity reminder panel, per-user access control with a locked state for those without the permission,
exclusion of sensitive items from the non-sensitive schedule export, and an append-only audit record of
every view and edit.

**Source of truth:** the UC-07 section of <https://lhl-agents.netlify.app/mg-forms-scope/>. The client's
own tickets for this use case are **LER-1126–1140**; the stories in `stories/` derive 1:1 from them and are
**named by those client keys** — the lesson of the UC-05/UC-06 duplicate blocks, recorded in
`docs/usecases/uc-05/open-questions.md`, applied from day one.

## Business Value / Goal
Sensitive unused material is the highest-stakes content this product touches. It is material a court may
rule the defence must never see — informant identities, surveillance techniques, a child's address. The
consequences of mishandling it are not a rework loop; they are collapsed prosecutions and endangered
people. Three failure modes, three defences:

1. **Disclosure through the wrong document.** A sensitive item copied into a schedule that is served on
   the defence is an irreversible act. The non-sensitive export therefore excludes sensitive rows by
   construction — in one shared function both apps and the tests call — not by the user remembering to
   delete them.
2. **Casual access.** Someone who can open a draft is not necessarily someone who should read why an item
   is sensitive. The section is locked for users without the named permission, and the content is **never
   sent** to their browser — a locked section that arrived with the payload is a screenshot away from not
   being locked at all.
3. **Unaccountable access.** Under later challenge ("who knew this, and when?") the firm needs a record
   that cannot have been tidied up. Every view and edit of the section is written to the append-only audit
   trail with user identity and timestamp, and no endpoint can alter or delete an audit row.

Against that sits the discipline this repo already lives by: **MG6D's fields are real printed boxes or
they do not ship.** The Manual of Guidance (v11, Home Office, 9 June 2026) documents exactly what MG6D
records — the sensitive material in detail, its location, and the reason it is considered sensitive — so
that, and only that, is the field set.

Success = a sensitive row makes the MG6D section appear every time without exception; editing it without a
recorded confirmation is impossible in the UI **and** rejected by the API when called directly; every
access is in the audit trail; and a test export proves sensitive items stay out of the non-sensitive
schedule.

## Scope
**In scope:**
- A **declared sensitive section**: `sensitive: true` on template fields (declared, never inferred —
  the same discipline as `narrative`, `group` and the validation rules), with the MG6D schedule added to
  MG6 additively as v5.
- **Activation** from UC-04's `sensitivityFlag` — live in the client the moment a row is marked
  sensitive, authoritative on the server via the derived `hasSensitiveMaterial` flag.
- The **red banner** ("Sensitive — Restricted Access") and the sensitive-red design tokens whose slot
  `_tokens.scss` has reserved since UC-03.
- **Handling instructions**: server-owned, sourced wording, rendered read-only, confirmed per access
  before the section can be edited; confirmation persisted per user and audited.
- **API-level enforcement**: a guard on the draft write path rejects any request that touches a
  sensitive-declared field without a valid recorded confirmation — Angular form state is presentation,
  the endpoint is the boundary.
- **PII reminder panel**: the steps of the Public Interest Immunity process (each step cited), a link to
  the practice-direction rules, and a recorded acknowledgement.
- **Access control**: a named permission level on the user; locked section naming the level and who in
  the firm holds it; server-side redaction so locked content never reaches the client.
- **Non-sensitive schedule export** (new — no export existed before UC-07): a CSV of the unused material
  schedule that excludes sensitive rows and the whole MG6D section, built by one shared function.
- **Audit**: `SENSITIVE_SECTION_VIEWED` / `SENSITIVE_SECTION_EDITED` / confirmation / acknowledgement /
  denial / export events through the existing append-only audit path.

**Out of scope (recorded in `open-questions.md`):**
- PDF export of any schedule — that is UC-09.
- Real authentication and role management — the permission is a column on the existing demo `User`,
  scoped through the same `DemoAuthGuard` seam real auth will replace.
- The MG6 designation question (LER-1205): officially MG6D is a separate form. The scope specifies a
  *section within MG6 handling*, so that is what ships — keyed off field declarations, never the form
  code, so the fields move wholesale if a decision-maker later splits the form.
- Practitioner verification of the MG6D field set or the instruction wording. Everything stays
  `unverified` and says so.

## The findings that shaped the design
- **F1 — The draft write path replaces `valuesJson` wholesale.** `PATCH /drafts/:id` stores exactly what
  the client sends. Redacting sensitive values from a locked user's GET would therefore make that user's
  next autosave *erase the sensitive schedule*. The server must **merge-preserve**: a sensitive field
  absent from an update keeps its stored value; a sensitive field *present* demands permission and a
  confirmation. This single decision drives the client architecture too (F2).
- **F2 — `DynamicForm` builds a control for every template field**, visible or not, and autosave sends
  `getRawValue()` — all keys, always. If MG6D's fields joined the FormGroup at build time, every autosave
  by anyone would trip the API guard. So sensitive fields are **excluded from the base FormGroup** and
  their controls are added only at the moment the user confirms the instructions — which is also what
  makes the UI genuinely unable to bypass the confirmation (LER-1130): there is no control to type into.
- **F3 — No export exists anywhere in the product.** "Sensitive items are excluded from any non-sensitive
  schedule export" cannot be proven against nothing, so UC-07 builds the export it constrains: a minimal
  CSV of the schedule, owner-accessible, audited.
- **F4 — `User` has no permission column.** The demo auth seam (`DemoAuthGuard`, `x-user-email` override)
  and a seeded second user (Priya Chandran) already exist, so the alt flow needs only an additive
  `sensitiveMaterialAccess` column: the demo user holds it, the colleague does not.

## Definition of Done (scope document, quoted verbatim)
1. "Sensitive material flag (MG6D) triggers the mandatory handling instruction every time without
   exception"
2. "Confirmation cannot be bypassed at API level — tested with a direct API call without the confirmation
   flag"
3. "All MG6D access events appear in the audit trail with correct user identity and timestamp"
4. "Sensitive items are absent from non-sensitive schedule exports — verified with a test export"

## Stories and build order
Stage 1 — foundations: LER-1126 (declaration, MG6D fields, activation), LER-1127 (banner + red tokens),
LER-1138/1139 (permission model, redaction, locked state — built early because merge-preserve underpins
everything).
Stage 2 — the gate: LER-1128 (instructions), LER-1129 (confirmation), LER-1131 (API guard),
LER-1130 (UI non-bypass), LER-1137 (step-up per access).
Stage 3 — the surround: LER-1132/1133 (PII panel + link), LER-1134 (export), LER-1135/1136 (audit).
Stage 4 — proof: LER-1140 (QA DoD checks).

Each story file records its **delivering ticket** once Phase B loads it — the client-original →
delivering-ticket mapping lives in `open-questions.md` from the start.
