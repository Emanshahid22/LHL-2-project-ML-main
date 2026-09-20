# UC-01 — open questions, scope deviations and coverage gaps

Found while writing this pack retrospectively against the delivered code and the scope document. UC-01
is delivered and closed; nothing here is a defect report unless it says so.

Three kinds of entry: **deviation** (the build does something other than what the scope says),
**coverage gap** (behaviour exists but no automated check proves it), **open question** (needs a human).

---

## Deviations from the scope document

### D1 — The picker offers eleven forms, two of which research says are the wrong form
**Scope:** "presented with a form picker showing all available MG forms", and the DoD requires "All 11
MG forms are available and load correctly".
**As built:** all eleven are offered. But the template research (`docs/mg-form-research-findings.md`)
concluded MG1 is not in the current MG suite (0/7 fields corroborated), MG2 is the Special Measures
Assessment rather than a taped-interview form (33/34 corroborated), and MG14 is the Conditional Caution
rather than an identification statement.
**Why it was not "fixed":** the DoD names eleven forms, and quietly dropping or relabelling three of
them would be a product decision taken by an engineer. It is a decision-maker question
(`human-instructions.txt` §2.1, §2.2).
**Consequence:** acceptance criterion #1 is **Partial** in `docs/acceptance-mapping.md`.

### D2 — There is no "verified" state in use, by design
**Scope:** silent on template verification — it assumes the field sets are known.
**As built:** the field sets were never supplied by the client, so the product carries an explicit
`verification` marker and per-field `provenance`, and renders an "Unverified template" chip. This is an
addition beyond the scope rather than a departure from it, and it exists because a plausible invented
box on a police case file is a professional-conduct risk. Recorded here so the addition is visible.

---

## Coverage gaps

### G1 — "persists across browser sessions" is proven as server-side persistence, not literally
**Criterion:** "Draft save is confirmed by UI and persists across browser sessions".
**Covered:** `explicit Save draft persists and confirms with a snackbar`, `debounced autosave persists
without an explicit save`, `draft appears in the work queue and resumes with its saved values` — all
proving the values survive the client and come back from the API.
**Not covered:** nothing simulates closing and reopening a browser, and nothing tests survival without a
server (there is no offline story). If "browser sessions" means more than server-side persistence, the
criterion needs restating before it can be tested. See `human-instructions.txt` §3.2.
**Status:** recorded as **Partial** in `docs/acceptance-mapping.md`.

### G2 — No automated scan for PII in identifiers or storage keys
The rule ("no case data ever appears in an id, URL or storage path") is held by convention and review —
every id is a cuid — not by a test. Ticket **LER-1018 Storage-key PII scan** exists for this and is
not started. The rule matters more as UC-09 (PDF) and UC-10 (archive) create file paths.

### G3 — No visual regression harness
Layout is asserted structurally (element visibility, geometry, wrap behaviour at narrow widths), which
catches the failure that actually happened — the picker sinking below the fold — but would not catch a
purely visual regression such as a colour or spacing change. Ticket **LER-1017 Pixel-difference test
harness** exists and is not started.

### G4 — `templateVersion` has no test asserting the intended behaviour, because the behaviour is not implemented
The field is recorded on every draft and ignored on load. `npm run orphan-scan` reports drafts that are
behind their template's version as information, which is the closest thing to coverage. If the version
is later honoured, that report becomes a test.

---

## Open questions

### Q1 — Every ticket in this UC is still "To Do" in DevOps Bot, not Done
Checked live against `devopsbot-be…/tasks-ml` while writing this pack: **all twelve UC-01 story tickets
(LER-1019…1030) report `status: "To Do"`**, as do the four supporting tickets (LER-1000, LER-1002,
LER-1006, LER-1096). The work is delivered and proven; only the tracker disagrees. This matches
`docs/HANDOVER.md` §2 phase 11 ("45 already delivered but still To Do") and roadmap item 9.
**No ticket status was changed while writing this pack** — that is a deliberate tracker action for
whoever owns Jira hygiene, and it was not part of this task.

**RESOLVED — 20 Aug 2026.** The tracker now agrees. All twelve UC-01 story tickets (LER-1019..1030) and the supporting tickets are Done, and so are the five template tickets LER-1033/1034/1035/1038/1039 that the UC-01 block carries. LER-1040 (the QA ticket) was closed by the check PR #115 added — `every one of the 11 forms opens and renders its own field set`. Each carries an evidence comment naming the
delivering branch, commit and covering checks. Project-wide, 130 of 244 LER tickets are Done; what is still
open is deliberate — 5 deferred, 11 blocked on a human, and 2 that belong to UC-08.

### Q2 — Is MG1 in scope? (decision-maker)
See D1 and `human-instructions.txt` §2.1. Blocks nothing; changes ~20 test fixtures if answered "no".

### Q3 — Practitioner verification of every field set (practitioner)
The marker, the provenance tags and the conformance gate are delivered. The sign-off is not, and no code
change can supply it. This is the project's critical path (`docs/HANDOVER.md` §7 item 2).

### Q4 — Should `templateVersion` be honoured, or forward-migration adopted? (decision-maker)
See G4 and `human-instructions.txt` §2.3.

### Q5 — Is there a fuller requirements pack than the scope document? (client)
The "19 UC-01 / 33 UC-02 checks" brief does not correspond to the scope document's four criteria per use
case. If a real acceptance pack exists, `docs/acceptance-mapping.md` should be redone against it.

### Q6 — Memo decisions A1–A4 all land on this use case (decision-maker)
The **Decision & Review Memo** is now in the repository: `docs/decisions/decision-and-review-memo.md`
(19 August 2026, responses requested by 22 August). It supersedes the note this entry previously carried
about the memo being absent.

All four form-identity decisions are UC-01 decisions, because UC-01 is what puts eleven forms in the
picker and renders whichever field sets they carry:

| Memo item | UC-01 bearing | Relates to |
|---|---|---|
| **A1** Does the product carry MG1 at all? | The reason criterion #1 is **Partial**. Three options in the memo: remove and amend the criterion, keep it labelled non-statutory, or replace the slot. | D1, Q2 |
| **A2** MG2 designation (Special Measures Assessment?) | Changes a template in the picker wholesale. The memo records **one live draft** under the current ids — run `npm run orphan-scan` first. | D1 |
| **A3** MG14 designation (Conditional Caution?) | Same, with **three live drafts**. A genuine blank MG14 is needed before any rebuild. | D1 |
| **A4** Is MG16 one form or two? | A template-shape question here (one template with relabelled sections, or a split with a new `ebc003` template). The same item decides UC-02's subject-name mapping rule. | D1 |

**A5** (MG6 naming) and **A6** (ratify the delivered stack) are context rather than UC-01 decisions.
**Section B** of the memo is the practitioner review agenda, which is Q3 above.
Mapping and detail: `human-instructions.txt` §4.
