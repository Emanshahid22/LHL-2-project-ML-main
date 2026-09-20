# Template-sourcing evidence — August 2026

Evidence for the decision-maker on memo questions A1, A2, A3 and A5
(`docs/decisions/decision-and-review-memo.md`), on LER-1205 (designation mismatches), on LER-1198
("Obtain official HMCTS templates"), and on the MG11 declaration wording (LER-1200 / the one Blocked
acceptance criterion). This file records evidence and its consequences for tickets. **It changes no
designation and no template** — those calls stay with the decision-maker (standing rule 8).

Primary findings are from the sourcing research consolidated in the project's
`claude/mg-forms-template-sourcing.md` (Cowork project doc, 24 Aug 2026), plus a direct specimen
comparison performed in-repo the same day.

## 1. There is no official central source for blank MG forms

- The gov.uk "Manual of guidance and MG forms" page carries **one 16-page guidance document and no
  form templates**.
- The Manual of Guidance itself is under an **NPCC embargo** — not publicly distributed.
- Consequence for **LER-1198** ("Obtain official HMCTS templates for all eleven forms", tracker
  status Done with no artefact in the repo): as written the ticket is probably **not completable**,
  and its Done status has been misleading UC-09 planning. It has been **re-opened with an evidence
  comment** rather than left Done; the honest re-scope is "obtain the best available genuine
  specimens per form, and record which forms have none".
- Consequence for **UC-09's DoD wording**: the DoD says "official HMCTS layout", but MG forms are
  **Home Office / NPCC** forms, not HMCTS. The UC-09 pack must carry this as a recorded correction
  of the scope's terminology, and layout fidelity claims must name a genuine specimen or make no
  claim (see §4).

## 2. The current official list (June 2026) vs this product's designations

Evidence for LER-1205 and memo A1/A2/A3/A5 — recorded, not acted on:

| Finding | Bears on |
|---|---|
| There is **no MG1** on the current official list | A1 (MG1 in/out of scope; MG1 is also the suite's fixture form — ~20 assertions) |
| **MG02 is "Special Measures Assessment"** | A2 (this product's MG2 is "Initial Description of Taped Interview" — designation mismatch confirmed against the current list) |
| **MG14 is "Conditional Caution"** | A3 (this product's MG14 is "Eyewitness / Identification Statement" — mismatch confirmed) |
| **MG06C and MG06D are separate forms** | A5 (this product models MG6D as a section inside MG6 — a flat approximation the type system already documents; UC-07 built on it) |

None of this is new *direction* — the memo asked exactly these questions on 19 Aug — but it is the
first time the answers-in-waiting have current-list evidence behind them. The decision-maker can now
rule on A1/A2/A3/A5 against the June 2026 list rather than against 2010–2013 specimens alone.

## 3. MG11 declaration: the constant does not match the 2013 specimen

Compared 24 Aug 2026, character by character: `MG11_DECLARATION`
(`libs/shared/src/lib/mg11-declaration.ts`) vs the declaration printed on the genuine 2013 specimen
at <https://www.bbpolice.uk/uploads/MG11.pdf> (page 1). **Three differences**:

1. The specimen opens *"This statement **(consisting of ___ page(s) each signed by me)** is true…"* —
   the constant omits the parenthetical. That parenthetical is the page-count blank that LER-1071–1073
   (deferred to UC-09) exist to fill, so the omission and the deferral are the same decision seen from
   two sides.
2. Word order: specimen *"wilfully stated **in it anything** which…"*; constant *"wilfully stated
   **anything in it** which…"*.
3. Punctuation: specimen *"…false**,** or do not believe to be true."*; the constant has no comma.

Nothing was changed: the constant and `MG11_DECLARATION_SHA256` must move together, the API refuses
to boot on a mismatch, and every existing MG11 draft renders this wording. The wording decision
belongs to the practitioner sign-off (LER-1077 / LER-1200); the page-count design belongs to UC-09
planning. Caveat recorded with the evidence: 2013 is the **latest citable** revision, not proof of
the current one — see §1.

## 4. Standing rule: genuine specimens only

The only structural references this project accepts are genuine specimens — the bbpolice.uk 2010/11
and 2013 forms already verified during the template rebuild, covering MG11, MG5, MG6, MG4, MG12,
MG14 and MG2. Templates with no genuine specimen get **no fidelity claim**. AI-reconstructed MG
templates are never acceptable as references: the project's own research established that
criminaljusticehub.org.uk's 2026/06 files are AI recreations (Claude named in the file metadata) and
recorded that as a provenance defect. This rule binds UC-09's rendering work explicitly.
