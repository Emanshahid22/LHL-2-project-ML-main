# LER-1205 — Resolve MG2, MG6 and MG14 designation mismatches

**Answer: all three are mismatched, and MG2 and MG14 are the wrong form entirely.**
Evidence below; full detail and per-field sources in `docs/mg-form-research-findings.md`.

Primary sources used throughout:

- **[official]** Home Office / GOV.UK, *Criminal casefiles: forms, standards, and file structure* v2.0, 9 June 2026 — tabulates every MG form still in use, with its purpose.
- **[official]** CPS *Director's Guidance on Charging*, 6th ed. (Dec 2020), incorporating the National File Standard — Annexes 4/5 list required material per case-file type.
- **[official]** CPS legal guidance, *Special Measures*.
- *Prosecution Team Manual of Guidance* (2011), Section 3 "Guide to completion of MG forms" — carries the annotated MG specimens.

---

## MG2 — WRONG FORM

| | |
|---|---|
| Scope / repo call it | Initial Description of Taped Interview |
| Official name | **Special Measures Assessment** (printed title: *Witness Assessment for Special Measures*) |
| Fields corroborated | **33 of 34** |

MG2 has never been an interview form. It is the YJCEA 1999 vulnerable/intimidated witness
assessment: seven eligibility boxes (a)–(g) covering s.16 and s.17, the ss.23–30 measures,
the witness's own views, views of other interested parties, and an assessing-officer block.
DG6 Annex 5 requires *"Any special measures assessment (MG2)"* at multiple file stages, so it
is current — unlike MG1.

**The interview content currently sitting on our MG2 belongs on MG15.**

Two further points for the record:
- The version in day-to-day circulation is still the **2010/11** form: it is headed
  `RESTRICTED (when complete)`, a marking abolished by the 2014 Government Security
  Classifications. A locally reissued OFFICIAL-SENSITIVE version may differ.
- It carries **chequered banding and "Not Disclosable"**, which the Home Office confirms means
  not disclosable to the defence. Any defence-facing bundle or export must exclude MG2 —
  that is a product rule, not a template detail.

## MG6 — MISLABELLED (right form, wrong purpose)

| | |
|---|---|
| Scope / repo call it | Case File Information (Unused Material) |
| Official name | **Case File Evidence and Information** |
| Fields corroborated | **41 of 41** |

MG6 is the officer's report of evidence and information accompanying the file. **Unused
material is the MG6C / MG6D / MG6E schedules**, which are separate forms we do not model at
all. Our current framing conflates the two. Corroborated by two independent specimens,
including a 2017 Hillingdon adaptation.

## MG14 — WRONG FORM

| | |
|---|---|
| Scope / repo call it | Eyewitness / Identification Statement |
| Official name | **Conditional Caution** |
| Fields corroborated | **31 of 34** |

MG14 is the conditional-caution record, not an identification statement. Identification
evidence is taken on an MG11 witness statement with the appropriate provisions.

**Caveat — strike three fields before use.** `PNC No.`, `Date condition set` and `Date
condition is to be met` trace only to a `criminaljusticehub` .docx whose `dc:creator`
metadata is literally **"Claude"** — an AI recreation of a form, not a genuine specimen. Our
own verifier caught this. Do not carry them into the template.

---

## Two adjacent findings from the same research

**MG1 is not in the MG suite at all.** Absent from the Home Office June 2026 table (which
begins at MG02), absent from DG6, and zero occurrences of "MG1" or "front sheet" across the
131-page 2011 Manual of Guidance. Independent verification corroborated **0 of 7** proposed
fields (fabrication risk: high). It cannot simply be deleted — it is the fixture form for
~20 assertions in `e2e/uc02-autofill.spec.ts`, `e2e/uk-dates.spec.ts` and
`e2e/support/api.ts` — so it should be retained, marked not-in-current-suite, and put to the
practitioner. Note this conflicts with the UC-01 acceptance criterion *"All 11 MG forms are
available and load correctly"*.

**MG16 may also be mis-modelled.** The research suggests our MG16 fields describe the separate
MoJ form `ebc003`, and that MG16 is **defendant-only** — which would mean the s.100
non-defendant reasoning in commit `d5178cf` rests on a false premise and `defendantName` could
be mapped safely. Flagged rather than acted on: it is a legal judgement and needs the
practitioner. The genuine s.100 hazard appears to belong to MG15 `personInterviewed`, which may
be a vulnerable witness rather than the suspect.

---

## Recommendation

1. Correct the designations in the scope document and the templates: MG2 → Special Measures
   Assessment, MG6 → Case File Evidence and Information, MG14 → Conditional Caution.
2. Treat MG2 and MG14 as **rewrites, not edits**. Renaming or removing a field id silently
   destroys stored values on the first autosave (1.5 s after a keystroke), and there are live
   drafts on both forms — run an orphan scan against the database first.
3. Add MG6C/MG6D to the backlog if unused-material scheduling is in scope; it is not MG6.
4. Put MG1 and MG16 to the practitioner via `docs/review/mg-form-summary.csv`.
