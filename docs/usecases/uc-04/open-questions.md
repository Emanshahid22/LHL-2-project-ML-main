# UC-04 — open questions

Raised during authoring. **None of these block the build** — the epic is deliberately designed so
work proceeds while they are outstanding. Add to this file rather than blocking a ticket.

## Decision-maker

1. **The MG6 designation.** Official sources call MG6 "Case File Evidence and Information", with
   unused material on the separate MG6C / MG6D / MG6E schedules
   (`docs/answers/LER-1205-designation-mismatches.md`). **Not blocking:** the schedule mechanics are
   designation-independent by design — nothing branches on the form code, so the schedule moves with
   its field definition if the form is renamed or split.
2. **Sensitive schedule split.** LER-1089's ticket text says sensitive classification triggers *MG6D*
   handling; the scope says *UC-07* handling. If non-sensitive items belong on MG6C and sensitive on
   MG6D, is the product's single schedule with a per-row classification the right model, or should it
   generate two schedules? This UC raises a flag either way; the split is UC-07's problem.

## Client / practitioner

3. **Case complexity bands.** The PRD chose a manual field with bands complex / standard /
   summary_only (PRD §6). Are those the right bands, and are the thresholds (5 / 3 / 1 items) right?
   The scope fixes only "Complex" at fewer than 5 and "lower for summary-only".
4. **Who sets complexity?** Is it a property the case-management system already holds (in which case
   the migration path in PRD §6 applies), or a judgement the solicitor makes per form?
5. **Material types.** The scope gives document / CCTV / forensic as examples. What is the full list
   in practice, and is it force-specific?
6. **Item reference format.** Is there a convention (sequential integers, initials plus sequence,
   force-specific)? The current design treats it as free text with a duplicate guard.
7. **Does the completeness advisory need to be dismissible or acknowledged?** The scope says the
   outcome is recorded; it does not say whether the user must acknowledge it.

## Engineering (resolvable in build, recorded for visibility)

8. **Reorder affordance.** Drag-and-drop or move-up/move-down buttons? Buttons are more accessible and
   testable; drag is faster for long schedules. Accessibility argues for buttons at minimum.
9. **Nested groups are out of scope** — a group inside a group is rejected. Confirm no MG schedule
   needs it (MG6C/D appear flat).

## Resolved during the build (19 Aug 2026) — deviations from the PRD, recorded

10. **Completeness trigger is the union of both scope statements, not just the 10-item one.**
    PRD §4.7 describes a 10-item trigger, but PRD §12 and the DoD both require the advisory for a
    Complex case with 4 items — which never reaches 10. `shouldRunCompletenessCheck` therefore runs
    the check on a finalisation attempt, at 10+ items, **or** as soon as a band is known and the
    schedule holds at least one item. An untouched empty schedule does not trigger it: *not started*
    is a different thing from *implausibly thin*, and advising on an unstarted form teaches users to
    ignore the advisory. **Note:** the finalisation half is unreachable — there is no finalise
    action in the product yet — so it exists in the pure function and is untested end to end.

11. **`DRAFT_SAVED` audit metadata uses `scheduleItemCounts` keyed by field id, not the PRD's
    `unusedMaterialItemCount`.** The same engine serves MG12 and the MG6C/D schedules; a
    form-specific key in generic metadata would need renaming the moment a second schedule exists.
    The count is still in the trail, under the field it belongs to.

12. **`COMPLETENESS_CHECKED` is written when the schedule's size or band changes, not on every
    save.** Autosave fires 1.5 s after any keystroke, so recording unconditionally would bury the
    trail under identical rows from someone editing a description. A trail nobody can read is not an
    audit trail.

13. **Reorder affordance (question 8): move-up/move-down buttons.** Accessible and testable;
    drag-and-drop can be added later as an additional affordance, not a replacement.

14. **In-cell labels were dropped in favour of the column header.** At table widths a repeated
    `mat-label` covered the whole control — a real user's click still focused it (Material's
    container-click), but the text was doubled and unreadable. Controls carry the column name as an
    `aria-label` instead, so screen-reader output is unchanged.

## API limitation found while loading the tickets (18 Aug 2026)

**`dueDate` cannot be set via `PUT /tasks-ml/{id}`.** All 14 tickets accepted the update (HTTP 202)
and `description` + `humanInstructions` were written correctly, but `dueDate` was silently ignored —
the stored value stayed at the creation timestamp. Tried three formats on LER-1080, all 202, none
applied: `2026-08-21`, `2026-08-21T00:00:00.000Z`, `2026-08-21T12:00:00Z`.

The field does appear to work on **POST** (creation), per the API examples. So either the PUT handler
omits it or it is deliberately immutable after creation.

**Consequence:** the requested due date of **2026-08-21 is not set** on LER-1080–1093; they still
carry their creation date. Set it in the DevOps Bot UI, or raise it with the API owner
(nouman.aziz@consultancyoutfit.co.uk). Worth checking whether `startDate`, `estimatedHours` and
`slaTarget` behave the same way, since the same handler probably governs them.

## MG6 field-set rebuild (LER-1239, 20 Aug 2026) — what is inferred, and what could not be sourced

The rebuild took MG6 from 9 fields to 47, adding the 41 printed boxes the research corpus documents
(`docs/mg-form-research-findings.md` § MG6, corroborated by two independent specimens —
bbpolice.uk/uploads/MG6.pdf and its-training-uk.com/MGForms/MG6.docx — plus the Prosecution Team Manual of
Guidance 2011 §3 guidance notes, National Disclosure Standards 2018, DG6 Annex 5 and the Home Office
"Criminal casefiles" guidance). Every added field carries its citation on the field itself, in a new
`source` property. Three things are inferences rather than readings, and they are recorded here rather
than presented as documented:

### I1 — The eight question boxes are typed Yes/No; the print has blank answer spaces
Sections 3-8 ask questions ("Is there any relevant third party material?", "Is POCA or other asset recovery
being considered?", and six more). **The printed form gives each a blank answer space, not a dropdown** —
the research says so explicitly. Typing them as a two-option select is this project's inference, so each
carries `provenance: 'likely'` and says so in its `source`. A practitioner should confirm whether a
Yes/No control is right, or whether these should be free text.
Affected: `visualMaterialViewed`, `thirdPartyMaterial`, `outstandingStatements`, `vulnerableWitnesses`,
`specialMeasuresMeeting`, `publicInterestMatters`, `pocaConsidered`, and the pre-existing `underminesCase`.

### I2 — Two labels are light paraphrases of the print
`defendantName` is labelled "Defendant full name" where the form prints "R v", and section 3 is titled
"Visually recorded material" where the form prints "Visually recorded evidence (CCTV / Photographs etc.)".
Both are recorded in the research's own unknowns. Neither is a fabricated box.

### What was NOT added, and why
- **No box beyond the documented 41.** The form's page 3 carries printed MUST/DO NOT instructions and a
  numbered 1-6 list; those are instructions to the officer, not fields, so they are helpText rather than
  boxes.
- **The pre-existing `disclosureOfficer`, `scheduleReference` and `sensitiveMaterial` fields keep
  `provenance: 'likely'` and carry no source.** They are not on the printed MG6 — they read as MG6C/MG6D
  schedule headers — but they hold data in live drafts, so they stay (additive-only). Whether they belong on
  MG6 at all is part of the LER-1205 designation question.
- **`caseComplexity` stays `inference`.** It exists to drive UC-04's sparse-schedule advisory and is not a
  printed box; that was already recorded when UC-04 shipped.

### Questions this raises for a practitioner
- **Which generation of MG6 do the client's users hold?** Every public specimen is the Manual of Guidance
  2010/11 form headed "RESTRICTED (when complete)". RESTRICTED was abolished in April 2014, and the Home
  Office describes current MG forms as OFFICIAL / OFFICIAL-SENSITIVE. If the in-use form is locally revised,
  box numbering may differ from what now ships.
- **Which boxes are mandatory in practice?** The print marks only the page 3 remand/intimidation section as
  one that MUST be completed. Only `urn`, `defendantName` and `dateCompleted` ship required; local CJU
  file-quality checklists, not the form, decide the rest.
- **Is MG6 content still entered on the form locally at all**, or typed into the police-CPS digital
  interface? DG6 Annex 5 expects "provided digitally or MG3/MG6".
