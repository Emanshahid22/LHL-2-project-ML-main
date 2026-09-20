# UC-07 — Sensitive Material Handling · PRD

_Epic: `docs/usecases/uc-07/epic.md` · Scope: <https://lhl-agents.netlify.app/mg-forms-scope/> (UC-07
section) · Client tickets: LER-1126–1140 (stories derive 1:1; files named by client key)._

## 1. Summary
When MG6's unused material schedule contains at least one item classified **Sensitive**, a mandatory
**MG6D section** activates on the form: red restricted-access banner, read-only handling instructions that
must be confirmed before the section can be edited, the MG6D sensitive schedule itself, and a Public
Interest Immunity reminder panel. Users without the **Sensitive Material Access** permission see a locked
section and never receive the content. Every view and edit is audited. Sensitive items are excluded from
the (new) non-sensitive schedule export. Enforcement lives in the NestJS layer, not in Angular form state.

## 2. Scope requirements (verbatim)
- **Pre-conditions:** MG6 contains ≥1 item classified Sensitive (UC-04's `sensitivityFlag`), triggering
  MG6D handling; user holds the appropriate access permission level.
- **Main flow:** (1) sensitive classification detected in MG6 activates a mandatory MG6D section; (2)
  section header renders a red "Sensitive — Restricted Access" banner; (3) mandatory handling instructions
  pre-populated as a READ-ONLY block — user must confirm they have read and understood before the section
  can be edited; (4) PII reminder panel lists the steps required under the Public Interest Immunity
  process, with a link to the relevant practice direction; (5) sensitive items are EXCLUDED from any
  non-sensitive schedule export; (6) every MG6D view and edit is recorded in the audit trail with user
  identity and timestamp.
- **Alt flow:** insufficient permission → section locked; message identifies the required permission level
  and who in the firm has it.
- **Error handling:** without recorded confirmation the section cannot be edited; confirmation cannot be
  skipped or bypassed at UI OR API level.
- **Post-conditions:** MG6D completed with instructions confirmed; audit trail records all access;
  sensitive items absent from non-sensitive exports; PII reminder acknowledged and recorded.
- The API-level guard is enforced in the NestJS layer (guard on the MG6D write path), not just Angular
  form state. Audit entries go through the existing append-only audit write path. The MG6D confirmation
  and PII acknowledgement are per-user, persisted, and auditable.

**Definition of Done (verbatim):** see epic — the four lines are quoted there and each E2E check in §9
names the line it proves.

## 3. What already exists (do not rebuild)
| Piece | Where | UC |
|---|---|---|
| Repeating-group schedule with per-row `classification` | `libs/shared/src/lib/schedule.ts`, MG6 `unusedMaterialItems` | UC-04 |
| `sensitivityFlag` declaration + `hasSensitiveRow()` | `form-template.types.ts`, `schedule.ts` | UC-04 |
| Derived `hasSensitiveMaterial` flag, server-computed on save, client-recomputed live | `drafts.service.ts` `withDerivedFlags()`, `form-fill-page.ts` `sensitiveMaterial` | UC-04 |
| Amber header chip `data-testid="sensitive-material-indicator"` | `form-fill-page.html` | UC-04 (stays — UC-07 adds the section, it does not remove the chip) |
| Append-only audit path | `audit/audit.service.ts` (`record()` only; no update/delete anywhere) | UC-01+ |
| Auth seam with per-request user override | `DemoAuthGuard` + `x-user-email` header | UC-01 |
| Two seeded users | Alex Marlowe (demo) and Priya Chandran (colleague), `prisma/seed.js` | UC-01 |
| Group value shape guard at the endpoint (422) | `validateGroupValue` in `drafts.service.ts` | UC-04 |
| Server-owned wording precedent (hash-pinned, boot-refusal) | `mg11-declaration.ts`, `integrity/declaration-integrity.ts` | UC-03 |
| Reserved slot for sensitive red | `_tokens.scss` — "deliberately NOT defined here — reserved for UC-07" | UC-03 |

## 4. Mechanism

### 4.1 Template declaration (additive; MG6 v4 → v5)
- `FormFieldDefinition.sensitive?: true` — this field belongs to the sensitive-material (MG6D) section.
  **Declared, never inferred**, like `narrative` and `group`.
- MG6 gains ONE new field, the MG6D schedule (`sensitiveScheduleItems`, type `group`,
  section `MG6D — Sensitive material schedule`, `sensitive: true`, `required: false` — mandatory-when-
  active is enforced by a validation finding, §4.8). Columns, all `provenance: 'documented'`, cited to
  the Manual of Guidance v11 (Home Office, 9 June 2026), MG06D entry:
  - `description` — "list only relevant, sensitive unused material, **in detail**"
  - `location` — "provide its **location**"
  - `sensitivityReason` — "provide the **reason it is considered to be sensitive**"
  - No other column ships. The prosecutor's boxes on the real MG6D (agree sensitive / PII application
    needed) are completed by the prosecutor, not the preparer, and are **not invented into the form** —
    recorded in `open-questions.md` Q5.
- Row numbering is positional via the existing group engine; no item-number column is invented.
- `verification` stays `'unverified'`. Every pre-existing MG6 field id is untouched.

### 4.2 Shared module (`libs/shared/src/lib/sensitive-material.ts`, new — pure, framework-free)
- `sensitiveFieldIds(template)` — the declared section.
- `isSensitiveSectionActive(template, values)` — template declares sensitive fields AND
  `values[SENSITIVE_MATERIAL_FLAG_KEY] === true` (server) — the client computes live activation from the
  current form value via `hasSensitiveRow` so the section appears the moment a row is marked sensitive.
- `SENSITIVE_PERMISSION_LEVEL = 'Sensitive Material Access'` — the named level (naming: open question Q2).
- `SENSITIVE_HANDLING_INSTRUCTIONS` — server-owned wording (§6), plus `sensitiveWordingHash()` (SHA-256,
  same discipline as the MG11 declaration) so acknowledgements record WHAT was acknowledged.
- `PII_STEPS` — the Public Interest Immunity steps, each with its citation (§6);
  `PII_PRACTICE_DIRECTION` — label + URL of the official Criminal Procedure Rules and Practice Directions
  index (exact practice-direction reference: open question Q1).
- `redactSensitiveValues(template, values)` — strips sensitive-declared keys (for locked users' DTOs).
  The derived `hasSensitiveMaterial` flag is NOT stripped — the locked user must still see that the
  section exists.
- `buildNonSensitiveScheduleCsv(template, values)` — the export (§4.7): rows of every `sensitivityFlag`
  group EXCLUDING rows whose flag column holds the flag value; sensitive-declared fields excluded
  entirely; RFC-4180 quoting.
- `isSensitiveConfirmRequest()` — request-shape guard for the confirmation endpoint (422 discipline).

### 4.3 Data model (additive Prisma migration)
```prisma
model User {           // + one column
  sensitiveMaterialAccess Boolean @default(false)
}
/// Append-only. One row per confirmation/acknowledgement act. No update or
/// delete path exists anywhere in the API.
model SensitiveAcknowledgement {
  id          String   @id @default(cuid())
  userId      String
  draftId     String
  /// HANDLING_INSTRUCTIONS | PII_STEPS
  kind        String
  /// sensitiveWordingHash() of the wording acknowledged
  wordingHash String
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id])
  @@index([draftId, userId, kind])
}
```
Seed: demo user (Alex Marlowe) `sensitiveMaterialAccess: true`; colleague (Priya Chandran) `false` —
the locked flow is testable with the existing `x-user-email` override.

### 4.4 API surface
- `POST /drafts/:id/sensitive/confirmations` `{ kind }` → `201 { id, kind, recordedAt }`.
  Owner-scoped; **403** if the user lacks the permission; **409** if the section is not active (nothing
  to confirm); 422 on bad shape. Writes the `SensitiveAcknowledgement` row and an audit event
  (`SENSITIVE_INSTRUCTIONS_CONFIRMED` / `SENSITIVE_PII_ACKNOWLEDGED`, metadata `{ formCode,
  wordingHash }`).
- `UpdateDraftRequest` gains optional `sensitiveConfirmationId?: string`.
- **The guard, in `DraftsService.update()` (the NestJS layer — the real boundary):**
  1. `touched` = sensitive-declared field ids present as keys in `req.values`.
  2. If `touched` is non-empty: the user must hold the permission AND `sensitiveConfirmationId` must
     name a `HANDLING_INSTRUCTIONS` acknowledgement row belonging to **this user and this draft** —
     otherwise **403** (`SENSITIVE_ACCESS_DENIED` audited with `{ mode: 'edit', reason }`; the values
     are not stored). Present-but-unchanged still counts as touched: an edit request without a
     confirmation is rejected on what it asked to do, not on a diff.
  3. **Merge-preserve:** sensitive keys ABSENT from `req.values` keep their stored values. Without this,
     redaction (§4.5) would make a locked user's autosave erase the sensitive schedule (epic F1).
  4. A permitted, confirmed save that touched the section records `SENSITIVE_SECTION_EDITED`
     (`{ formCode, fieldIds: touched, confirmationId }`) in addition to the ordinary `DRAFT_SAVED`.
- `GET /drafts/:id/export/non-sensitive-schedule` → `text/csv` attachment. Owner-scoped, no permission
  needed (it contains nothing sensitive by construction). Audited `SCHEDULE_EXPORTED`
  (`{ formCode, fieldId, includedRows, excludedSensitiveRows }` — counts, never content).

### 4.5 Redaction and the DTO
`FormDraftDto` gains a server-computed block, present whenever the template declares sensitive fields:
```ts
sensitiveSection?: {
  active: boolean;              // derived flag on stored values
  permitted: boolean;           // this user holds the level
  requiredPermissionLevel: string;
  permissionHolders: string[];  // names only — who in the firm to ask
  // Only when permitted — a locked client never receives these:
  handlingInstructions?: string;
  wordingHash?: string;
  piiSteps?: { text: string; source: string }[];
  practiceDirection?: { label: string; url: string };
  piiAcknowledged?: boolean;    // this user, this draft, any prior PII_STEPS row
}
```
For a user WITHOUT the permission, every DTO that carries values (`GET /drafts`, `GET /drafts/:id`,
PATCH response, autofill response) has sensitive-declared keys **removed** — content is never sent to an
unauthorised client (LER-1138), not hidden by CSS.

### 4.6 Audit (LER-1135/1136)
New `AuditAction` values through the existing append-only `AuditService.record()`:
`SENSITIVE_SECTION_VIEWED` (GET of a single draft whose section is active, by a permitted user — the
response contains the content, so that is the view), `SENSITIVE_SECTION_EDITED`,
`SENSITIVE_INSTRUCTIONS_CONFIRMED`, `SENSITIVE_PII_ACKNOWLEDGED`, `SENSITIVE_ACCESS_DENIED` (rejected
edit attempts and confirmation attempts without the permission), `SCHEDULE_EXPORTED`. User identity and
timestamp come from the audit row itself (`userId`, `createdAt`) — LER-1135's "view or edit" distinction
is the action name. The list endpoint redacts but does not log views: a dashboard listing never contains
section content, so it is not a view of MG6D. Immutability (LER-1136) is structural — the API has no
update or delete path for `AuditEvent` or `SensitiveAcknowledgement` — and a check greps the API source
to keep it that way.

### 4.7 Export (LER-1134)
No export existed before UC-07 (epic F3), so the DoD's exclusion promise is delivered by building the
export it constrains: a CSV of the unused material schedule for disclosure-side use. One shared builder
(`buildNonSensitiveScheduleCsv`) is called by the API endpoint and asserted by the tests, so the
exclusion rule cannot fork. Sensitive rows are excluded by the same `sensitivityFlag` declaration that
drives activation; MG6D fields never appear. The UI offers "Export non-sensitive schedule" beside the
schedule. PDF is UC-09 and out of scope.

### 4.8 Client (Angular)
- **`DynamicForm` excludes sensitive-declared fields from the base FormGroup** (epic F2). In their
  section's position it renders the new `SensitiveSection` component instead.
- `SensitiveSection` states:
  - *inactive*: renders nothing (the declaration is dormant until UC-04's flag raises it).
  - *active, not permitted*: red banner + lock: the required permission level and who in the firm holds
    it (`permissionHolders`). No content — the client never had it.
  - *active, permitted, unconfirmed*: red banner + read-only instructions block + "I have read and
    understood the handling instructions" checkbox + Confirm button. Existing MG6D rows render
    **read-only** (viewing is permitted and already audited; the confirmation gates *editing*).
  - *confirmed*: the group's controls are added to the page FormGroup (`form.addControl`) so the ordinary
    autosave carries them; the PII reminder panel renders alongside with its Acknowledge action.
- **Step-up per access (LER-1137):** the confirmation id lives in a session service
  (`SensitiveAccessSession`) in memory only — never localStorage. A reload, a navigation away and back,
  or a new tab starts locked again and requires a fresh confirmation; each confirmation is a new
  persisted row.
- `form-fill-page.save()` includes `sensitiveConfirmationId` from the session when set. Activation is
  live: the section appears the instant a schedule row is classified sensitive (client-side
  `hasSensitiveRow` on the current form value), and deactivates when the last sensitive row goes — the
  stored MG6D values are preserved server-side, just dormant (open question Q4).
- **Mandatory-when-active:** an `error`-severity consistency finding ("Sensitive material is recorded —
  complete the MG6D sensitive schedule") joins the existing Consistency Issues panel while the section is
  active and the MG6D schedule is empty. The static progress denominator is unchanged (decision D3).
- Colour: new `--mg-sensitive-*` tokens in `_tokens.scss` filling the reserved slot. Red appears ONLY in
  UC-07 surfaces. Amber advisories, the validation `danger` reds and the form accents are untouched.

## 5. Permission model
One named level, `Sensitive Material Access`, as a boolean on the demo `User`. It is deliberately not a
role system: real RBAC arrives with real auth (the `DemoAuthGuard` seam), and a second permission would
today have no second behaviour to gate. The locked message names the level and lists the names of users
who hold it — within a firm, "who can help me" is the requirement, not a leak. Naming and real-world
assignment are open questions (Q2), flagged `unverified` in the UI copy.

## 6. Sourced wording — instructions and PII steps
The handling-instructions block and the PII steps are **product wording on a legal document surface**, so
they follow rule 1/rule 10 discipline: every sentence is either directly attributable to a cited source or
it does not ship. Attributable today:
- MG6D lists **only relevant, sensitive unused material, in detail**, with its **location** and the
  **reason it is considered sensitive** — Manual of Guidance v11 table entry MG06D (Home Office,
  9 June 2026).
- The MG6 series carries **details of sensitive information that must not be disclosed to the defence** —
  Home Office, 'Criminal casefiles: forms, standards, and file structure' v2.0 (9 June 2026), recorded in
  `docs/mg-form-research-findings.md` § MG6.
- The prosecutor records whether they **agree the material is sensitive** and whether a **public interest
  immunity application to the court** is needed — Manual of Guidance v11 table entry MG06D.
The block closes with an explicit unverified notice. Anything beyond these sentences (storage rules,
copying prohibitions, marking schemes) is NOT included — practitioner input required, open question Q3.
The practice-direction link points at the official gov.uk Criminal Procedure Rules and Practice Directions
index; the precise practice direction is Q1.

## 7. Failure modes
- Audit write fails → logged, never breaks the user action (existing `AuditService` contract).
- Confirmation POST fails → section stays locked with the error surfaced; nothing optimistic.
- The guard never rejects a save that does not touch the section: MG6 remains editable by a locked user
  everywhere outside MG6D, and merge-preserve keeps their autosaves harmless.

## 8. Business rules
1. Sensitive fields are DECLARED (`sensitive: true`), never inferred; conformance enforces top-level
   only, a `section` present, all sensitive fields of a template sharing one section, no `mapsTo` on a
   sensitive field (auto-fill must never write into a gated section), and that a template declaring
   sensitive fields also declares a `sensitivityFlag` group (a section that could never activate is a
   dead declaration).
2. Additive only: MG6 v5 adds fields; nothing renamed, nothing removed; `orphan-scan` clean.
3. The endpoint is the boundary: every UI restriction has a server twin (redaction, guard, 403s).
4. Append-only records: no update/delete path for audit events or acknowledgements, ever.
5. Red is UC-07's and appears only here; tokens only, no hardcoded colour.
6. No invented wording, no invented boxes: MoG-cited columns, cited instruction sentences, open
   questions for everything else.
7. Every existing `data-testid` (including UC-04's `sensitive-material-indicator`) survives.

## 9. E2E plan (`e2e/uc07-sensitive-material.spec.ts`)
DoD1 — activation: marking a row sensitive shows section + instructions immediately; a second, fresh
draft does the same (no exception); clearing the last sensitive row deactivates; reactivation preserves
MG6D content. DoD2 — **direct HTTP** `PATCH /api/drafts/:id` with a sensitive key and no
`sensitiveConfirmationId` → 403; with a foreign/invented id → 403; as the colleague (no permission),
even with a confirmation id → 403; the full confirm-then-save flow → 200. DoD3 — view then edit in the
UI; read audit rows from the DB: `SENSITIVE_SECTION_VIEWED` and `SENSITIVE_SECTION_EDITED` carry the
demo user's id and sane timestamps; denial rows carry the caller's identity. DoD4 — build a schedule
with sensitive + non-sensitive rows; fetch the export over HTTP; the sensitive description/reason appear
NOWHERE in the CSV; the non-sensitive row does; `SCHEDULE_EXPORTED` audited. Plus: locked section for
the colleague (level named, holders listed, **response payload carries no sensitive values**);
merge-preserve (colleague autosave does not erase MG6D); step-up (reload → locked again, second
confirmation row); read-only instructions (no input control); PII panel steps + link + acknowledgement
row; immutability (structural grep: no `auditEvent.update|delete`, no `sensitiveAcknowledgement.update|
delete` in `apps/api/src`); UC-04 chip still present; conformance registries.

## 10. Out of scope / deferred
PDF (UC-09) · finalisation gating (UC-08 — the consistency finding is the mandatory signal today) ·
masking sensitive rows inside the MAIN schedule for locked users (Q4 — today the MG6C-style schedule is
visible to the draft owner as UC-04 built it; only MG6D detail is gated) · real roles/firms.
