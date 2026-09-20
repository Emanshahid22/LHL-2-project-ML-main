# UC-02 — open questions, scope deviations and coverage gaps

Found while writing this pack retrospectively against the delivered code and the scope document. UC-02 is
delivered and closed; nothing here is a defect report unless it says so.

Three kinds of entry: **deviation** (the build does something other than what the scope says),
**coverage gap** (behaviour exists but no automated check proves it), **open question** (needs a human).

---

## Deviations from the scope document

### D1 — Non-mappable fields are not flagged "Requires manual entry"
**Scope, main flow:** "Fields not mappable from the case file remain blank and flagged as 'Requires
manual entry'".
**As built:** a *mapped* field that could not be filled carries a note — *"Not auto-filled — {reason}"* —
naming why (ambiguous case data, or the case has no such datum). A field with **no mapping at all**
carries nothing.
**Why:** two reasons, both about signal rather than effort. Required marking already tells the user a
field needs completing, so a second marker adds no information; and a note on every unmapped field would
put one beside 51 of MG3's 59 boxes, 13 of MG11's 15, and every box on MG14 — which trains users to
ignore notes. The note as built is the more useful half of the requirement: it distinguishes "the case
file does not say" from "nobody tried".
**Asserted deliberately:** `unmapped fields carry no auto-fill note` — this is tested *as intended
behaviour*, so a future change to match the scope literally would fail that check and force the decision
to be made explicitly.
**Needs:** a decision-maker (`human-instructions.txt` §2.1).

### D2 — Values are never locked after review
**Scope, main flow:** "After review, form progresses to full editing mode with all confirmed values
locked".
**As built:** nothing is ever locked. A draft stays fully editable, and a value becomes "manual" simply by
being edited — there is no confirm step to lock against.
**Why:** there is no finalisation anywhere in the product yet (that is UC-10), so there is no point at
which "confirmed" is meaningful. Locking mid-draft would also fight autosave: a locked field with a typo
would need an unlock affordance, which is a confirm/unconfirm cycle the scope does not describe.
**Consequence:** the phrase "all confirmed values locked" is unimplemented, and no test claims it.
**Needs:** a decision-maker to say whether locking is real, and if so whether it belongs to UC-08 (Form
Review & Quality Check) or UC-10 (`human-instructions.txt` §2.2).

### D3 — There is no separate "accept" action per field
**Scope, main flow:** "User reviews each auto-filled field: can accept, edit, or clear the value".
**As built:** edit and clear are explicit; **accept is the absence of a change.** A value left alone is
accepted, and its badge simply says where it came from.
**Why:** a per-field accept button would be one click per field for no information gained — the system
already knows the value is unchanged, and provenance records that it is still exactly what was written.
Recorded because the scope names three actions and the product implements two plus a default.

---

## Coverage gaps

### G1 — No automated check that nothing writes to the case file
**Story:** LER-1053 *Read-only guarantee on case file*.
**What is true:** the guarantee is structural. `CasesService` has no create/update/delete method, and
`cases.controller.ts` declares only `@Get()` and `@Get(':id')`. There is no write path to `Case` or
`CaseOffence` anywhere in the API.
**What is missing:** no test asserts that absence. An accidental future write path — a well-meaning
"update the case's last-touched timestamp", say — would not fail the suite.
**Cheap fix if wanted:** a check in the style of UC-04's designation-independence test, which greps source
for a forbidden pattern and fails on a match.

### G2 — The badge is asserted on *a* filled field, not on **every** field a run filled
**Criterion #2:** "Auto-filled badge displayed on every pre-filled field" — and the criterion means every.
**Covered:** `filled fields carry an Auto-filled badge with a Clear affordance` asserts the badge and its
Clear affordance on a filled field; `provenance records the source, the value and the case timestamp`
asserts the data the badge is computed from, for the whole run; `an auto-filled date shows UK format and
keeps its badge` covers the type most at risk of losing it.
**Not covered:** nothing loops over the run's `filled` outcomes asserting a badge on each. Because the badge
is computed from a value/provenance comparison rather than set per field, a per-field failure is unlikely —
but "unlikely by construction" is not the same as asserted.
**Cheapest fix:** iterate `result.outcomes.filter(o => o.outcome === 'filled')` and assert a badge inside
each field's row.
**Status:** recorded as **Partial** in `docs/acceptance-mapping.md`.

### G3 — Provenance growth is not bounded or tested for size
`autoFillJson` stores the value written for every filled field. For today's templates that is at most
eight short strings. Nothing tests or limits what happens if a future template maps a very large field
(MG3's narrative boxes, say) — the provenance copy would double that content inside the draft row.

### G4 — "all matching fields" is exhaustive for one template, resolver-level elsewhere
**Criterion #1** is recorded as **Covered**, and this is the qualification behind it.
`auto-fill populates exactly the mapped fields and nothing else` asserts it exhaustively for MG4 — its
eight mapped fields, and nothing beyond them. The other seven mapped templates are covered through the
shared `resolveCaseField` and the shared pristine test rather than field-by-field.
**Why that is reasonable:** all eight run identical code, so a per-template sweep would re-assert one code
path eight times. **Why it is still worth noting:** a wrong `mapsTo` on MG3 would be a *data* error, and the
shared-resolver argument does not catch data errors — only a practitioner review of the mappings does
(`human-instructions.txt` §1.1).

---

## Open questions

### Q1 — Every ticket in this UC is still "To Do" in DevOps Bot, not Done
Checked live against `devopsbot-be…/tasks-ml` while writing this pack: **all twelve UC-02 story tickets
(LER-1042…1053) report `status: "To Do"`**. The work is delivered and proven; only the tracker disagrees.
Consistent with `docs/HANDOVER.md` §2 phase 11 and roadmap item 9.
**No ticket status was changed while writing this pack** — that is a tracker action for whoever owns Jira
hygiene, and it was not part of this task.

**RESOLVED — 20 Aug 2026.** The tracker now agrees. All twelve UC-02 story tickets (LER-1042..1053) are Done, along with LER-1054. LER-1055 (the QA ticket) was closed by the check PR #115 added — `EVERY field the run filled carries the badge, on two different forms`. LER-1041 (case system integration layer) is deliberately still open: it needs the real case API, whose own prerequisite LER-1199 is unanswered. Each carries an evidence comment naming the
delivering branch, commit and covering checks. Project-wide, 130 of 244 LER tickets are Done; what is still
open is deliberate — 5 deferred, 11 blocked on a human, and 2 that belong to UC-08.

### Q2 — Is the MG15 `interviewee` mapping legally safe? (practitioner)
Mapped to the defendant name, which is right for a suspect interview and wrong if the interviewee is a
witness. Raised during the MG15 rebuild (`docs/stories/LER-1038-open-questions.md`) and still open.

### Q3 — Does MG16 `subjectName` stay unmapped? (practitioner / legal)
Unmapped on a s.100 CJA 2003 non-defendant argument, and asserted by a test. Later research suggests MG16
may be defendant-only and that the current fields may describe MoJ form `ebc003` instead — which would
make the original premise false. Deliberately not reversed by an engineer.

### Q4 — Should non-mappable fields be flagged, and should confirmed values lock? (decision-maker)
See D1 and D2.

### Q5 — What does the real case file look like? (client)
The seeded cases are fiction. Real records may be multi-valued where ours are single, which changes which
paths must return `ambiguous` rather than a value.

### Q6 — Memo decisions A4 and A2 govern this use case's mapping rules (decision-maker)
The **Decision & Review Memo** is now in the repository: `docs/decisions/decision-and-review-memo.md`
(19 August 2026, responses requested by 22 August). It supersedes the note this entry previously carried
about the memo being absent.

Two of its six items change what UC-02 is allowed to map:

- **A4 — Is MG16 one form or two?** This is the item that decides Q3 above, and it goes further than
  informing it. The memo states plainly that *"if MG16 is defendant-only, the current rule keeping the
  subject-name field un-prefilled rests on a false premise and could be simplified"* — so A4 decides
  whether the unmapped rule (and the check asserting it) should exist at all. Options: (a) MG16 is the
  information form and the notice fields move to a new `ebc003` template; (b) both field sets stay on one
  template with relabelled sections. Until it is answered the rule stands (CLAUDE.md rule 8).
- **A2 — MG2 designation.** MG2 carries exactly one mapping (`interviewee` → `defendantName`), right for a
  suspect interview and wrong for a witness. If MG2 becomes the Special Measures Assessment and its
  interview content moves to MG15, that mapping moves with it — and MG15 carries the same hazard as Q2
  above. Answering A2 and Q2 together avoids reviewing one mapping twice.

Context, affecting how many mappings exist rather than which are legal: **A1** — dropping MG1 removes its
five mapped fields; **A3** — MG14 has no mappings, so its re-designation does not touch auto-fill;
**A5**/**A6** — no bearing here. Mapping and detail: `human-instructions.txt` §4.
