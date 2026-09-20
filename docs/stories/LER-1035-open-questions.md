# LER-1035 (MG12) — open questions for a practitioner

MG12's research is clean: 9 fields, all `documented`, verdict `usable-as-draft`, low fabrication risk,
two independent specimens agreeing exactly. The template is nonetheless `unverified` — nobody with a
practising certificate has checked it.

## The structural problem: this form is a table

The printed MG12 carries **twelve numbered rows**, each with five columns — police property reference,
brief description of item (indicating if a copy), exhibit reference number, person producing, current
location — plus an "attached" tick per row.

`FormFieldDefinition` has **no repeating group**. So six of the nine researched fields cannot be
modelled as fields at all. They are approximated inside a single `exhibitEntries` textarea, one exhibit
per line with the columns named in its help text.

That is why the field count only moves 5 → 7. It is not a shortfall in the research; it is the type
system's ceiling.

**Questions this raises:**

- Is one-exhibit-per-line acceptable for now, or does the exhibit list need real repeating rows before
  it is usable? Exhibit lists are the form most likely to be long.
- Should the twelve-row limit be reproduced at all, or is it an artefact of paper?
- When PDF output lands (UC-05), the flat textarea must render as a table. Does the line format above
  parse reliably enough for that, or should the data be structured first?

## Fields retained that are not on the printed form

- **`compiledBy`** ("List compiled by") — kept and marked `likely`. Officer-completing blocks appear
  across the MG suite, but the verifier did not confirm one on the MG12 specimens.
- **`continuityConfirmed`** — kept and marked `likely`, with help text saying so. Not a box on the
  printed form; retained only because drafts store values under the id.

**Confirm whether either belongs**, and whether removing them later is acceptable once the drafts
holding their values are resolved.

## Other questions from the research

- Which boxes are treated as mandatory in practice, and whether the "attached" tick is used at all.
- Whether the exhibit reference convention is force-specific (initials plus sequence, e.g. "JS/1").
- Whether continuity is evidenced on this form or only by MG11 statements.
