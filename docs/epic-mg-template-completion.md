## Epic
MG Form Template Completion — Replace Placeholder Field Sets with Practitioner-Grade Templates

## Overview
Nine of the eleven MG form templates in `libs/shared/src/lib/form-templates.ts` are placeholder
field sets. Only MG11 (witness statement, 15 fields) and MG5 (case summary, 13 fields) carry
realistic definitions; the other nine average 7.2 fields each (65 in total) with thinner
contextual help (71 characters average against 97) and almost no validation rules. The README
states this openly: the remaining nine are "reasonable placeholders to be fleshed out with
practitioners".

Because the whole product is template-driven — the renderer, progress tracking, auto-population
and future PDF output all read the same `FormTemplate` definitions — this single data gap is what
separates a convincing demo from a tool a defence solicitor could actually file from. This epic
closes it: draft each field set from authoritative sources, put it to a practitioner as a review
rather than an authoring task, and add the guardrails that stop an unverified legal form being
treated as verified.

## Business Value / Goal
MG forms are the standardised documents that make up a police case file; a form with invented or
missing boxes is worse than no form, because it looks complete. Completing the nine templates
unlocks genuine use of UC-01 (initiation), UC-02 (auto-population) and the forthcoming UC-05
(PDF output) across the whole form set rather than two forms, and it is the prerequisite for any
pilot with real practitioners. Success = every one of the eleven templates is either
practitioner-verified, or clearly marked unverified and blocked from producing a filed document.

## Scope
**In scope:** field sets (label, type, required, section, helpText, validation, `mapsTo`) for MG1,
MG2, MG3, MG4, MG6, MG12, MG14, MG15, MG16; a per-template provenance/verification marker; a
review artifact a practitioner can mark up; a house-style conformance check; handling of existing
drafts when field sets change.

**Out of scope:** MG11 and MG5 (already realistic); PDF rendering (UC-05); server-side validation
on finalisation; the repeating-group field type needed for genuinely tabular forms (raised as a
dependency, specified separately); any change to how drafts are stored.

## User Stories
1. **Draft field sets from authoritative sources** — each of the nine templates gets a researched
   field set with per-field provenance, so a practitioner reviews rather than authors.
2. **Per-template verification state** — templates carry an explicit verified/unverified marker and
   the UI/API refuse to treat an unverified template as filing-ready.
3. **Practitioner review artifact** — a single printable/annotatable document per form that a
   solicitor can mark up in minutes without touching the codebase.
4. **House-style conformance check** — an automated check that a template meets the MG11/MG5 bar
   (field count, helpText depth, validation coverage, `mapsTo` sanity) so quality is measurable.
5. **Existing drafts survive template growth** — decide and implement how drafts created against an
   older field set behave, since `templateVersion` is currently recorded but never honoured.

## Epic-level Acceptance Criteria
- All nine templates have field sets meeting the MG11/MG5 bar, each field carrying provenance
  (documented / likely / inference) rather than being silently invented.
- No template can be presented as filing-ready while its verification state is unverified.
- A practitioner can review one form's proposed field set in under 15 minutes using the artifact,
  with no repository access.
- The conformance check runs in CI and fails a template that regresses below the bar.
- Existing drafts of a changed form still open and still show their previously entered values; no
  stored value is orphaned by a field-id change.
- The full Playwright suite (95 checks today) stays green.

## Dependencies & Risks
- **Client dependency, already unanswered once:** the field definitions were requested from the
  client and no answer has arrived. This epic is deliberately structured so engineering proceeds
  without that answer and the practitioner ask shrinks to a review — it must not re-block on it.
- **Authoritative sources may not exist publicly for every form.** Research is being verified
  adversarially; forms whose fields cannot be corroborated must ship as unverified rather than as
  confident guesses.
- **Risk of shipping researched-but-unverified legal fields into a tool handling real criminal case
  files.** Mitigated by story 2 (verification state + filing block) and per-field provenance. This
  is the single most important guardrail in the epic.
- **Type-system dependency:** several MG forms are inherently tabular (MG12 exhibit list, MG6
  unused-material schedule). `FormFieldDefinition` supports only text/textarea/date/time/number/
  select/checkbox — there is no repeating group, so those forms cannot be fully faithful until that
  exists. Scope those two to a flat approximation now and specify repeating groups separately.
- **`templateVersion` does not do what the README claims.** `apps/web/src/app/features/form-fill/
  form-fill-page.ts:130` loads the template by `formCode` alone, so only one revision of each
  template exists. Live evidence: one MG11 draft at v1 renders against v2 today and silently
  gained the `title` and `specialMeasuresApplied` fields. Growing nine field sets makes this
  material — hence story 5.
- Renaming or removing an existing placeholder field id would orphan values already stored in
  `valuesJson`; additive change is safe, destructive change is not.
