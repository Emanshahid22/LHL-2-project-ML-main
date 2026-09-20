# MGs Forms — Decision & Review Memo

From: Ali Zulqarnain, Consultancy Outfit · To: Project decision-maker and Senior Solicitor · Date: 19 August 2026

Three use cases of the MGs Forms module are delivered and verified, and the eleven form templates have been audited against official sources. That audit surfaced findings that only a decision-maker or practising solicitor can resolve. This memo lists each decision, the evidence, the options, and what it blocks. **Requested by: 22 August** — the PDF-generation phase (UC-09) binds official layouts and cannot safely start while form identities are open.

## Section A — Decisions required (decision-maker)

### A1. Does the product carry MG1 at all?
**Evidence.** MG1 (File Front Sheet) is absent from the Home Office register of MG forms (Criminal Casefiles v2.0, 9 June 2026, which begins at MG02), absent from CPS Director's Guidance on Charging 6th ed., and a search of the 2011 Manual of Guidance returns zero occurrences. None of its 7 current fields could be corroborated.
**Options.** (a) remove MG1 and amend the 'all 11 forms' acceptance criterion; (b) keep it as a local-practice cover sheet, clearly labelled non-statutory; (c) replace the slot with another form.
**What it blocks.** ticket LER-1031; the practitioner sign-off scope; the UC-09 layout binding for this slot.

### A2. MG2 designation
**Evidence.** The official MG2 is the Special Measures Assessment (YJCEA 1999 witness assessment). Our MG2 currently holds taped-interview content, which officially belongs on MG15 (Interview Record). One live draft stores values under the current fields.
**Options.** (a) re-designate MG2 to Special Measures Assessment and migrate the interview draft to MG15; (b) keep the scope-document naming and record the divergence for the client.
**What it blocks.** LER-1032; the special-measures assessment referenced by UC-04's completeness flow and the MG3 referral.

### A3. MG14 designation
**Evidence.** The official MG14 is the Conditional Caution. Our MG14 holds eyewitness/identification-statement content; officially, identification evidence is taken on an MG11. Part of the public research for MG14 traces to an AI-generated document (file metadata author 'Claude') and was struck; a genuine blank MG14 is needed before any rebuild. Three live drafts exist.
**Options.** (a) re-designate to Conditional Caution and move identification capture to MG11 practice; (b) keep scope naming and record the divergence.
**What it blocks.** LER-1037; sign-off scope; UC-09 binding for this slot.

### A4. Is MG16 one form or two?
**Evidence.** The official MG16 is 'Bad Character or Dangerous Offender Information' — a police-to-CPS information form. Our template also carries six fields that match the separate MoJ notice-to-adduce form (ebc003), including a defendant / non-defendant (s.100/s.101 CJA 2003) distinction. If MG16 is defendant-only, the current rule keeping the subject-name field un-prefilled rests on a false premise and could be simplified.
**Options.** (a) MG16 = information form; move the notice fields to a new ebc003 template; (b) keep both field sets on one template with relabelled sections.
**What it blocks.** final MG16 shape; the subject-name auto-fill rule; sign-off of MG16.

### A5. MG6 naming for the unused material schedule
**Evidence.** Officially, unused material schedules are MG6C (non-sensitive) and MG6D (sensitive), with MG6E the disclosure officer's report; plain MG6 is Case File Information. The schedule mechanics now being built (UC-04) are deliberately designation-independent, so development is not blocked — but the printed form name must be settled before PDF layouts are bound in UC-09.
**Options.** (a) split into MG6 + MG6C/D; (b) keep the scope document's single-MG6 model and record the divergence.
**What it blocks.** UC-09 layout binding; UC-07 (MG6D handling) naming.

### A6. Ratify the delivered technology stack (for the record)
**Evidence.** The original plan named Python/FastAPI/React/PostgreSQL/Redis. The delivered, verified build is Angular 20 + NestJS 11 + Prisma (SQLite in dev, PostgreSQL-portable), with 122 automated end-to-end checks in CI.
**Options.** (a) ratify the delivered stack (recommended — four use cases already proven on it); (b) direct a rebuild.
**What it blocks.** nothing technically; needed for the record and for UC-09 tooling choices.

## Section B — Practitioner review agenda (senior solicitor)

Every rebuilt template ships marked 'unverified' and is displayed as such in the product. Flipping a template to 'verified' requires a practitioner's confirmation against the current official form — roughly 15 minutes per form. The review agenda: MG4 Charge Sheet (36 fields — field set vs current official MG4; the specimen used carries the obsolete RESTRICTED marking); MG3 Pre-Charge Decision Request (59 fields — reconstruction of DG6 Annex 4; does a defence solicitor ever complete one?); MG15 Interview Record (18 fields — one vs two reference boxes; interviewee pre-fill hazard); MG16 (19 fields — depends on A4); MG12 Exhibit List (7 fields — one-exhibit-per-line acceptable?); MG5 and MG11 (realistic but never practitioner-verified); MG11 statutory declaration (provide the current official verbatim wording, s.9 CJA 1967 / s.5B MCA 1980 — the build carries a draft protected by an integrity hash).

## Section C — Sources

GOV.UK 'Criminal casefiles: forms, standards and file structure' v2.0 (9 June 2026); CPS Director's Guidance on Charging 6th edition (DG6) incl. Annex 4 and 5; CPS DG6 Desktop Guide; Manual of Guidance 2011; police.uk Two Way Interface Business Process v1.0; and the repository's evidence files (docs/mg-form-research-findings.md, docs/review/*), each field traced to source with a documented/likely/inference confidence and independently verified.

Responses can be given per item (A1–A6) in any order; each unblocks work independently.
