## Epic
UC-04 — MG6 Unused Material Schedule

## Overview
Unused material must be scheduled: every item the investigation holds but does not rely on, listed
with a reference, a description, a material type and a sensitivity classification. Today the product
has no way to express a schedule at all — `FormFieldDefinition` supports only scalar field types
(text, textarea, date, time, number, select, checkbox), so a numbered list of items cannot be
represented, and MG6's current template is a seven-field placeholder that flattens the whole schedule
into free text.

This epic adds guided list entry to the form engine and the schedule behaviour on top of it:
`Add Item` rows, automatic continuous numbering that survives add, edit, delete and reorder,
confirmation before renumbering, automatic routing of sensitive items to sensitive-material handling
(UC-07), and a completeness check that flags a schedule implausibly sparse for the case's complexity.

**Source of truth:** the UC-04 section of <https://lhl-agents.netlify.app/mg-forms-scope/>.

## Business Value / Goal
Unused material scheduling is where disclosure goes wrong, and disclosure failures collapse
prosecutions and end careers. A schedule with gaps in its numbering, a reference that silently
detaches from the item it described, or a sensitive item sitting unmarked on a non-sensitive schedule
is not a cosmetic defect — it is a disclosure failure with professional consequences. The value here
is a schedule the solicitor can trust: numbering that cannot drift, item identity that survives
renumbering so audit and sensitivity decisions stay attached to the right material, and a prompt when
the schedule looks too thin for the case.

Success = numbering is provably correct across all three mutation paths, renumbering never happens
without the user agreeing, sensitivity routing needs no extra user action, and the completeness check
fires when the scope says it should.

## Scope
**In scope:** a repeating-group field type in `libs/shared` and its renderer support in
`DynamicForm` (a row table with `Add Item`); stable per-row identity (uuid) with the displayed
ordinal computed at render and never stored; a continuous, gap-free sequence guarantee across add,
edit, delete and reorder; a confirmation dialog before renumbering on delete; a duplicate-reference
guard; a sensitivity classification per row that raises a **draft-level flag** for UC-07 to consume;
a completeness check with a **configurable** threshold that fires after 10+ items or on a finalisation
attempt and writes its outcome to the audit log as `COMPLETENESS_CHECKED`; the case-complexity input
that check compares against.

**Out of scope:**
- **MG6D / sensitive-material handling itself — that is UC-07.** This epic raises the flag and stops
  there. It does not decide what a sensitive schedule looks like, who may see it, or how it is served.
- **The MG6 designation decision.** Whether this form is called MG6, MG6C or MG6D is a decision-maker
  question, open in `docs/answers/LER-1205-designation-mismatches.md`.
- **MG6's field set rebuild.** The sourced research (41/41 fields documented) is a separate piece of
  work; this epic is the schedule *mechanics*, not MG6's other boxes.
- **Finalisation itself.** No finalise endpoint exists (that is UC-10 territory); the completeness
  check exposes a hook the future finalise path calls.
- **PDF rendering of the schedule** — UC-09.

### Designation independence — a deliberate design constraint
The MG6 designation is disputed: official sources call MG6 "Case File Evidence and Information", with
unused material on the separate MG6C / MG6D / MG6E schedules. That decision belongs to a
decision-maker and **must not block this build**.

Therefore **nothing in this epic may branch on the form code.** The schedule mechanics attach to any
template that declares a repeating-group field, not to `code === 'MG6'`. If the decision-maker later
renames the form or moves the schedule to MG6C, the mechanics move with the field definition and no
behaviour code changes. Every story below is written to that constraint, and the QA story asserts it.

## User Stories
1. **MG6 definition and layout** (LER-1080) — the template declares a schedule, structurally distinct from a flat form.
2. **Add Item action** (LER-1081) — the primary interaction: create a new schedule row.
3. **Row fields** (LER-1082) — reference, description, material type, classification per row.
4. **Stable item identity** (LER-1083) — each item holds a permanent id separate from its number.
5. **Computed ordinal numbering** (LER-1084) — the displayed number is derived at render, never stored.
6. **Continuous sequence guarantee** (LER-1085) — numbering stays gap-free after any operation.
7. **Renumbering confirmation dialog** (LER-1086) — deletion asks before renumbering.
8. **Renumber on delete** (LER-1087) — removal renumbers the remainder immediately and correctly.
9. **Renumber on edit and reorder** (LER-1088) — editing or reordering never orphans a reference.
10. **Route sensitive items to UC-07** (LER-1089) — sensitive classification raises the handling flag automatically.
11. **Completeness check** (LER-1090) — compare schedule volume against case complexity.
12. **Sparse schedule threshold** (LER-1091) — flag "Complex" cases carrying fewer than five items.
13. **Dynamic threshold for summary matters** (LER-1092) — lower the bar for summary-only cases.
14. **QA: Definition of Done checks** (LER-1093) — automated proof over all three mutation paths.

## Epic-level Acceptance Criteria
The scope's Definition of Done, verbatim:

- "MG6 schedule numbering is correct and sequential across add, edit, and delete operations"
- "Renumbering on deletion prompts user confirmation before executing"
- "Completeness check fires correctly for 'Complex' cases with fewer than 5 items"
- "Sensitive classification automatically triggers UC-07 handling without additional user action"

Plus two the repo's own standing rules impose:

- No existing `data-testid` changes and the full E2E suite stays green.
- The schedule mechanics are designation-independent: no behaviour keys off the form code.

## Dependencies & Risks
- **Hard prerequisite: the repeating-group field type does not exist.** It is delivered inside this
  epic (LER-1080–1082). It also unblocks faithful MG12 and the MG6C/D schedules, so its design
  outlives UC-04 — treat it as engine work, not MG6 work.
- **`valuesJson` is keyed by field id and the renderer ignores unknown keys**, so a schedule stored
  under a new id is additive and safe. But an array-valued field is a new *shape* in that column;
  `isFieldValueComplete` and progress counting must handle it deliberately rather than by accident.
- **Risk: numbering treated as identity.** The naive implementation stores an incrementing counter,
  which breaks the moment an item is removed mid-schedule and silently reattaches audit and
  sensitivity decisions to the wrong material. Mitigated by LER-1083/1084 — identity is a uuid,
  the number is a view.
- **Risk: sensitivity flag treated as done.** Raising a draft-level flag is not sensitive-material
  handling. Until UC-07 lands, a sensitive item is *marked*, not *protected* — the epic must not read
  as though disclosure safety is solved.
- **Depends on a decision, not blocked by it:** the MG6 designation. See designation independence.
- **Case complexity has no home in the data model.** The completeness check needs it; the `Case`
  model does not have it and the case-management integration (LER-1041) is not built. Resolved in the
  PRD as a manual field with a documented migration path — see PRD §6.
- **UC-07 does not exist yet**, so the flag this epic raises has no consumer. That is intended: the
  contract is the flag, and it is asserted by tests here. *(Since delivered: UC-07 landed in PR #139 —
  the MG6D handling now consumes exactly this flag, and the acceptance mapping moved UC-04 #4 to
  Covered on it.)*
