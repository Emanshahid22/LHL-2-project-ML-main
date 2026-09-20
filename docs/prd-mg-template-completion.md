# PRD: MG Form Template Completion

Repo: LHL-2-project-ML (`mgs-forms` monorepo) · Base branch: `ali-zulqarnain/mgs-forms`
Source of truth for scope: <https://lhl-agents.netlify.app/mg-forms-scope/> · `docs/acceptance-mapping.md`

> **Status note:** the per-form field-set research (MG1, MG2, MG3, MG4, MG6, MG12, MG14, MG15,
> MG16) is in progress at the time of writing. It will be attached to this ticket as an update,
> carrying per-field provenance and an independent verification verdict per form. Sections 1–14
> below are grounded in the actual repository and do not depend on that research; only the concrete
> field tables do.

## 1. Overview
Replace the nine placeholder MG form templates with practitioner-grade field sets, and add the
guardrails that keep an unverified legal form from being treated as verified. The work is
data-and-guardrails, not a new feature: the renderer, progress tracking and auto-population
already consume whatever the templates declare.

## 2. Goals & Non-Goals
**Goals:** field sets for MG1, MG2, MG3, MG4, MG6, MG12, MG14, MG15, MG16 at the MG11/MG5 quality
bar; per-field provenance; a per-template verification state that blocks filing-readiness; a
practitioner review artifact; a CI conformance check; a defined behaviour for existing drafts.

**Non-Goals:** MG11/MG5 (done); PDF output (UC-05); server-side validation on finalisation; a
repeating-group field type (dependency, specified separately); changing draft storage.

## 3. Current Behaviour & Context
- `libs/shared/src/lib/form-templates.ts` holds all eleven `FormTemplate` definitions. Measured
  today: MG11 15 fields, MG5 13; the other nine total 65 fields (7.2 average). helpText averages 97
  characters on the realistic pair and 71 on the nine. Validation coverage is 9/15 (MG11) and 5/13
  (MG5) against roughly 1 field per placeholder.
- `libs/shared/src/lib/form-template.types.ts` defines `FormFieldDefinition`
  (`id`, `label`, `type`, `required`, `helpText`, optional `mapsTo`, `validation`, `options`,
  `section`, `placeholder`, `rows`). Field types: text, textarea, date, time, number, select,
  checkbox. **There is no repeating-group type.**
- `apps/web/src/app/shared/dynamic-form/dynamic-form.ts` builds one `FormGroup` from the template
  and renders every field type; it has no conditional-visibility mechanism (MG11's wizard does that
  in its own shell via `visibleFieldIds`).
- `apps/api/src/drafts/drafts.service.ts` stamps `templateVersion` on creation (line 68) and returns
  it (line 316), but nothing reads it to select a template revision.
- `apps/web/src/app/features/form-fill/form-fill-page.ts:130` loads the template by `formCode`
  only — so one live revision per form.
- 25 drafts exist locally, including one MG11 at v1 and seven at v2; the v1 draft renders against
  v2 today.
- 95 Playwright checks in `e2e/` run in CI via `.github/workflows/ci.yml`.

## 4. How It Works — Mechanism
1. **Research** — for each of the nine forms, gather the real field set from authoritative public
   sources (CPS legal guidance and Disclosure Manual, College of Policing APP, published specimens,
   force FOI disclosures). Each proposed field records its evidence and a confidence of
   `documented` | `likely` | `inference`.
2. **Adversarial verification** — an independent pass attempts to refute each claimed field against
   its cited source. Fields that cannot be corroborated stay in the draft but are marked, and a
   form whose fields are largely uncorroborated is flagged `not-usable` rather than shipped as
   confident.
3. **Author** — the surviving field sets are written into `form-templates.ts` in house style, with
   `mapsTo` added only where case data is genuinely the right value (the MG11 witness-name and MG16
   `subjectName` precedents govern when to omit it).
4. **Mark provenance** — each template gains a verification state and each field its confidence, so
   the system knows what it does not know.
5. **Review** — a generated artifact per form goes to a practitioner, who confirms, corrects or
   deletes lines. Their answers are applied and the template's state flips to verified.
6. **Guard** — filing-readiness (and later PDF output) is refused for an unverified template; the
   conformance check keeps quality from regressing.

## 5. Architecture & Components
- `libs/shared/src/lib/form-templates.ts` — the field sets (the bulk of the change).
- `libs/shared/src/lib/form-template.types.ts` — extend `FormTemplate` with verification state and
  `FormFieldDefinition` with an optional provenance/confidence marker.
- `libs/shared/src/lib/template-conformance.ts` *(new)* — pure functions scoring a template against
  the house-style bar; consumed by a test, so it lives in shared rather than in the suite.
- `tools/review-artifact/` *(new)* — a small script rendering one markdown/HTML sheet per form for
  practitioner mark-up. No runtime dependency; not shipped to the browser.
- `apps/api/src/drafts/drafts.service.ts` — refuse filing-readiness for unverified templates when
  that endpoint exists (UC-06); until then, expose the state through the DTO only.
- `apps/web` — surface an "unverified template" indicator on the form header; no other UI change.
- `e2e/` — conformance and guard checks.

## 6. Data Model & Schema
No database migration. `FormDraft.valuesJson` keeps the same shape, keyed by field id.

Shared type additions:
- `FormTemplate.verification: 'verified' | 'unverified'` (required; the nine start `unverified`,
  MG11/MG5 are `verified` only once a practitioner has actually confirmed them — until then they are
  `unverified` too, honestly labelled).
- `FormFieldDefinition.provenance?: 'documented' | 'likely' | 'inference'` — omitted means
  practitioner-confirmed.
- `templateVersion` bumps on every field-set change (all nine → 2; MG11 and MG5 unchanged).

## 7. API / Interface Contracts
No new endpoints. Contract changes are additive:
- `GET /api/form-templates` and `GET /api/form-templates/:code` — each template gains
  `verification`, and fields may carry `provenance`. Existing consumers ignore unknown keys.
- `GET /api/drafts/:id` — unchanged; `templateVersion` continues to be reported.
- Example addition: `{ "code": "MG12", "templateVersion": 2, "verification": "unverified",
  "fields": [ { "id": "exhibitNumber", "provenance": "documented", ... } ] }`

## 8. Detailed Logic & Business Rules
- **Additive-only field changes.** Existing placeholder field ids are never renamed or removed in
  this epic; a value already stored under an id must keep rendering. Where a placeholder id is
  wrong, add the correct field and leave the old one in place, marked deprecated in a comment, for a
  separate migration.
- **`mapsTo` is opt-in, not automatic.** A field only maps where the case datum is genuinely the
  same thing. Precedent: an MG11 witness name is not the defendant; MG16 `subjectName` stays
  unmapped because a s.100 notice concerns a non-defendant.
- **Conformance bar** (per template): ≥ 10 fields; every field has helpText ≥ 60 characters;
  ≥ 30% of fields carry a `validation` rule; every `date` field with a real-world past-only meaning
  carries `noFutureDate`; no two fields share an id.
- **Verification gating:** `verification === 'unverified'` blocks any future finalise/PDF path and
  shows an indicator in the form header. Drafting, saving and auto-population are unaffected —
  the tool stays usable while templates mature.
- **Tabular forms:** MG12 (exhibit list) and MG6 (unused material schedule) are approximated as a
  fixed set of fields plus a textarea for additional entries, with a comment recording that
  repeating groups are the correct long-term shape.

## 9. Data Flow & Integrations
No external systems at runtime. Research and review are offline inputs: sources → drafted field
sets → review artifact → practitioner mark-up → template edits. The review artifact is generated
from the templates themselves, so it cannot drift from what the product renders.

## 10. Error Handling & Edge Cases
- A template failing the conformance check fails CI with the specific shortfall named.
- A draft whose `templateVersion` predates a change still opens; newly added fields appear empty and
  progress recalculates against the new required set (progress may appear to drop — expected, and
  called out in story 5).
- A field id collision within a template is a build-time failure, not a runtime surprise.
- Auto-population against a newly mapped field only fills empty or pristine fields, so existing
  manual values survive (existing UC-02 behaviour, re-asserted by tests).

## 11. Security & Performance (Non-Functional)
- No new authn/authz surface. Templates are static data served through the existing guarded routes.
- Templates are already sent to every client; adding ~61 fields grows the
  `GET /api/form-templates` payload modestly. Keep an eye on the Angular `initial` bundle budget
  (500 kB warning) since the shared library is bundled into the client.
- **Accuracy is the real non-functional requirement here.** A wrong field on a criminal-case
  document is a professional-conduct risk, not a cosmetic bug; the verification state exists to make
  that risk explicit rather than silent.

## 12. Testing Strategy
- **Unit (shared):** `template-conformance.ts` scoring; every template asserted against the bar;
  no duplicate field ids across a template; `mapsTo` values are valid `CaseFieldPath`s.
- **E2E (Playwright, existing style):** each of the eleven forms opens and renders its full field
  set; an unverified template shows the indicator; a draft created before a field-set change still
  opens and retains its saved values; UC-02 auto-population still fills and badges newly mapped
  fields; the existing 95 checks stay green.
- **Review evidence:** the practitioner's marked-up artifact is committed alongside the template as
  the record of verification.

## 13. Acceptance Criteria
- Nine templates meet the conformance bar and CI enforces it.
- Every field added in this epic carries provenance, or is practitioner-confirmed.
- An unverified template is visibly marked and cannot be presented as filing-ready.
- A pre-existing draft of a changed form opens with its stored values intact.
- A practitioner reviews one form in under 15 minutes with no repo access.
- Full suite green.

## 14. Dependencies, Risks & Rollout
- **Dependency (already stalled once):** client field definitions. Structured so engineering does not
  wait on it; the ask reduces to a review.
- **Dependency:** repeating-group field type for MG12/MG6 fidelity — specify separately.
- **Risk:** unverifiable forms. Mitigation: ship unverified and labelled, never as confident.
- **Risk:** `templateVersion` is recorded but not honoured
  (`form-fill-page.ts:130`), so field-set growth changes what old drafts render against. Story 5
  either honours the version or explicitly accepts forward-migration and documents it; the README's
  claim at line 67 must be corrected either way.
- **Rollout:** per form, additively, behind the verification marker — no migration, no downtime, and
  each template can land independently. Suggested order: forms with the strongest sources first, and
  the two tabular forms last since they need the type-system decision.
