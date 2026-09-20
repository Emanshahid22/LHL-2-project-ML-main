# UC-05 — open questions

Raised during authoring, against the delivered templates and the scope document. **None of these blocks the
build** — the epic is deliberately shaped so that every unsourced format ships *advisory*, so no story waits
on an answer. Answering them **upgrades** advisory rules to errors later, which is a one-line provenance
change per format.

Add to this file rather than blocking a ticket.

---

## Findings that changed the design (recorded, not questions)

### F1 — No template declares a CPS reference field
The scope asks for "CPS reference format: validated against known pattern (e.g. XX/XX/XXXXXX/XX); inline
error if pattern mismatch". Searched all eleven templates: **no field holds a CPS reference.**
`cpsReference` exists only as a `CaseFieldPath` — a value supplied by the case file, displayed read-only,
never typed by the solicitor. So there is nothing on a form to validate.
**Consequence:** the registry entry ships and nothing references it, with a check asserting that, so adding
such a field later forces the rule to be wired up deliberately. See story 08 (LER-1214).
**What was not done:** a CPS reference box was **not** invented on an MG form so the rule had somewhere to
live. That would invert CLAUDE.md rule 1.

### F2 — No template declares a collar-number field
The scope asks for "Officer collar number: validated against force-specific prefix where known; flagged as
'Unverified format' if force unknown". Collar numbers exist in this product only *inside* composite
free-text boxes — MG1/MG3/MG4 `officerInCase`, MG5 `officerCompleting`, MG16 `officerCompleting` ("rank,
number or job title") — each holding a name, a rank and a number together.
**Consequence:** a pattern over those boxes would reject correctly completed fields, so none carries one,
and a check asserts that. There is also **no force registry** in the product, so the scope's "force unknown"
case is the universal one and the advisory path is the whole of the rule today. See story 07 (LER-1213).

### F3 — Neither of the scope's named cross-field pairs exists on a single form
- "offence date vs charge date": MG4 has `chargeDate` and **no** offence date; MG3 and MG5 have
  `offenceDate` and **no** charge date.
- "statement date vs hearing date": MG11 has `statementDate`; **no** template carries a hearing date
  alongside a statement date (MG4 has `hearingDate`, but no statement date).

**Consequence:** both rules are built as **case datum vs form field**, using the `CaseFieldPath` values
UC-02 already resolves (`offenceDate`, `nextHearingAt`). This is why the cross-field engine supports a
`casePath` operand at all, and why suppression on an `ambiguous` case datum is a first-class behaviour
rather than an edge case. See stories 09 (LER-1215) and 11 (LER-1217).
**The only same-form pair that exists today** is `interviewStart` / `interviewEnd` on MG2 and MG15 — which
is why story 14 (LER-1220) exists, to exercise the sibling-field path.

---

## Practitioner / client

### Q1 — What is the official URN format?
The research corpus evidences that the URN **box** exists on MG3, MG4, MG12, MG15 and MG16
(`provenance: 'documented'`), but **nowhere states its character format**. The shipped pattern encodes the
shape of the only example available — the MG1 placeholder `01AB0123456/24` — so it ships `inference`, and
therefore advisory.
**Needed:** a citation for the format (force code length, station/unit code, sequence length, year). With
one, `urn` becomes `documented` + `source` and the rule upgrades to an error across seven templates at once.
**Until then:** a wrongly formatted URN shows an "unverified format" hint and still saves.

### Q2 — What is the official Arrest/Summons Number (ASN) format?
Same position as Q1. The ASN box is `documented` on MG3, MG4 and MG16; its format is not. Ships
`inference` / advisory.

### Q3 — What is the custody number format, and is it force-specific?
MG4 carries `custodyNumber` (`documented` as a box). If the format varies by force, a single pattern is the
wrong shape for the rule and it should stay advisory permanently, or become a per-force registry.

### Q4 — Is there a collar-number format worth validating, and should it have its own field?
Two questions in one, and the second matters more. (a) Is there a national or force-specific format? (b)
Should any MG form carry a **dedicated** collar-number box, or is the composite "name, rank and collar
number" box what the real forms actually have? Only evidence about the real form can answer (b) — see
CLAUDE.md rule 1. Until then no collar-number rule is applied anywhere.

### Q5 — Is the CPS reference ever entered by hand?
See F1. If a solicitor does type it somewhere, that box needs to exist first, with evidence. If it is
always supplied by the case system, then validating it is a case-integration concern (LER-1041), not a form
validation concern.

### Q6 — Is a UK postcode pattern safe to enforce?
MG4 carries a `postcode` field. The UK postcode format is widely published but was **not sourced for this
project**, so it ships `likely` / advisory. A citation makes it an error. Worth asking whether BFPO and
overseas addresses appear on these forms, because a strict UK pattern would reject them.

### Q7 — Which cross-field orderings are genuine impossibilities, and which are merely unusual?
The severity split in PRD §8 is our reading and needs a practitioner's confirmation, because it decides
whether the product blocks or advises:
- **Proposed error:** charge before offence; hearing before charge; interview ending before it starts;
  statement dated before the witness's date of birth; notice received before it was dated; MG6 detail
  missing when the disclosure test is answered yes.
- **Proposed advisory:** first arrest after the charge date; statement after the case's listed hearing
  (further statements are ordinary practice); MG3 arrest date after the decision date.
If any "advisory" here is actually an impossibility, say so — it is a one-line change.

### Q8 — Can an interview cross midnight?
MG2 and MG15 each carry a single `interviewDate` with a start and end time, so the rule assumes a same-day
interview. An interview running through midnight would be flagged wrongly. Does that happen in practice?
Nothing was guessed: the rule as written assumes same-day, and this question records the assumption.

---

## Decision-maker

### Q9 — Do the memo's A1–A4 answers change which rules apply?
`docs/decisions/decision-and-review-memo.md`. Each answer changes the template set, and rules travel with
their fields:
- **A1** MG1 dropped → its `urn` box goes with it (MG1 is not `verified` and its fields are uncorroborated).
- **A2** MG2 re-designated → its `interviewStart`/`interviewEnd` pair moves to MG15, and story 14's (LER-1220) rule
  moves with it. Declaring the rule on the field rather than the form is what makes that a data change.
- **A3** MG14 re-designated → no UC-05 rules are affected (MG14 carries only `observationDate`).
- **A4** MG16 split → its `noticeDate` / `dateReceivedByProsecutor` ordering rule follows whichever template
  keeps those boxes.
None of these blocks the build.

### Q10 — Should validation ever block a draft save?
The build says no: the API rejects what it cannot **store** (type shape, 422) and records what is merely
**wrong** (semantics, audit counts), because a form is invalid for most of the time a human is filling it
in, and rejecting would break autosave. If the intent is that some rule must be unsaveable, name it — but
note it would need a different interaction model than autosave.

### Q11 — Where does the finalisation gate live?
`validateForm` is written to be what a finalise endpoint calls to refuse, and **there is no finalise
action** in the product (UC-10). Confirm the gate belongs to UC-10 rather than UC-08 (Form Review & Quality
Check), so the hook is called from the right place when it lands.

---

## Engineering (resolvable in build, recorded for visibility)

### Q12 — `requiredFieldIds` becomes a function of values
It is currently static per template. A conditional requirement (story 13) makes the required set depend on
the current values, which touches the header progress counter **and** the MG11 wizard's per-step count.
Both must be updated together, or progress will disagree with itself between the wizard and the header.

### Q13 — Regex safety review
Every registry pattern must be length-bounded with no nested unbounded quantifier: the same pattern runs in
the browser and in the API, so a catastrophic-backtracking case is a server-side denial of service, not
just a slow page. Patterns come only from the registry in `libs/shared`, never from a client.

### Q14 — Two reds
Errors use Material's existing error token; UC-07 reserves red for sensitive material. Confirm the two
remain visually distinguishable when UC-07 lands, and that a validation error is never mistaken for a
sensitivity marker. Advisory stays amber (CLAUDE.md rule 6).

---

## API limitations found while loading the tickets (19 Aug 2026)

Tickets **LER-1207 – LER-1222** were created for stories 01–16 respectively, one per story, with each
story's full markdown body as the description (byte-exact, verified against the source file).

### L1 — `agentMode` cannot be set to false through the API. Every ticket is created with Agent mode ON.
`POST /tasks-ml` was called with `agentMode: false` on **all sixteen** tickets. The API returns 201 and the
created ticket reports `agentMode: true`. `PUT /tasks-ml/{id}` with `agentMode: false` returns 202 and
**echoes `true` back in its own response body**, and the stored value never changes; `PATCH` is not a
supported method (404).

**Why this matters, not just a nit:** per `docs/HANDOVER.md` §2 phase 11, `agentMode: true` makes a bot run
wait on a WhatsApp approval that never arrives, and the run times out to Backlog after 15 minutes. So all
sixteen tickets will stall if the bot is pointed at them as they stand.

**Action needed:** turn Agent mode off in the DevOps Bot **UI** for LER-1207…1222. This is the same class of
failure as L2 below and as the `dueDate` limitation recorded in `docs/usecases/uc-04/open-questions.md` —
the field is accepted by the request, dropped before persistence. Worth raising with the API owner
(nouman.aziz@consultancyoutfit.co.uk) as one bug rather than three.

### L2 — `dueDate` is still silently ignored
Not attempted on these tickets, per instruction. The intended sequence and target dates are recorded in
`human-instructions.txt` instead. Order matters more than the dates: stories 01–02 must land first, because
the severity gate is what makes every later format rule safe to ship.

### L3 — The POST contract differs from what a GET returns
Two mismatches cost a round trip each, recorded so the next person does not repeat them:
- `assigneeEmail` (an email address) is **required** on POST. A GET returns `assigneeId` (a uuid) and no
  email, so the read shape cannot be replayed as a write.
- `slaTarget` must be an hours string such as `"8h"` on POST, but a GET returns `"normal"`. Sending the
  value a GET reports fails validation. It was omitted entirely on these sixteen.

---

## The duplicate-block mapping — the client's original UC-05 tickets

**This is the gap that made the backlog unreadable.** The client's backlog already contained a UC-05 block,
**LER-1094–1108**. When this pack was authored we created our own tickets, **LER-1207–1222**, and delivered
against those — leaving fifteen originals sitting at *To Do* describing work that was finished. Read from
the tracker alone, UC-05 looked untouched.

Recorded here so nobody has to rediscover it. Every original was closed on 20 Aug 2026 with an evidence
comment naming its delivering ticket.

| Client's original | Delivering ticket | Delivered by | Status |
|---|---|---|---|
| LER-1094 Validation on field blur | **LER-1209** | `no error is shown while the field still has focus`; `findings clear automatically when the value is corrected` | Done |
| LER-1095 Required field error state | **LER-1210** | `required fields are caught across three MG form types` | Done |
| LER-1096 Date format enforcement | — (was already Done) | `typed DD/MM/YYYY is accepted and stored as ISO` (`uk-dates.spec.ts`) | Done |
| LER-1097 Impossible date rejection | **LER-1211** | `an impossible date is rejected at input` (`uk-dates.spec.ts`) | Done |
| LER-1098 CPS reference validation | **LER-1214** (engineering) | Registry entry ships unreferenced — no template declares a CPS reference box (finding F1) | **Open — needs a decision**, not code |
| LER-1099 Officer collar number check | **LER-1213** (engineering) | `no composite officer field carries a format rule, and two formats are unreferenced` (finding F2) | **Open — needs a decision** |
| LER-1100 Unverified format warning | **LER-1212** | `an unsourced format shows an advisory hint and blocks nothing` | Done |
| LER-1101 Cross-field trigger | **LER-1215** | the five cross-field checks, incl. `an ambiguous case suppresses the check and explains why` | Done |
| LER-1102 Offence date vs charge date rule | **LER-1217** | `a charge dated before the offence is flagged as an error` + 3 more | Done |
| LER-1103 Consistency Issues panel | **LER-1216** | `cross-field findings never appear in a field inline slot` + 2 more | Done |
| LER-1104 Cross-form rules | — **not built** | Nothing compares two drafts of different forms; duplicates UC-08's LER-1144 | **Open — belongs to UC-08** → *delivered by UC-08 as LER-1259 (`checkCrossForm`), closed 22 Aug* |
| LER-1105 Blocking vs advisory classification | **LER-1208** | `a sourced format is a hard error on the field`; `conformance fails a template that asks a blocking rule of an unsourced format` | Done |
| LER-1106 Advisory override with reason | — **not built** | No override affordance exists | **Open — belongs to UC-08** → *delivered by UC-08 as LER-1265 (acknowledge-to-bypass with reason), closed 22 Aug* |
| LER-1107 Finalise blocked on required-field errors | — **not buildable yet** | No finalise action exists; the `validateForm` hook is written and waiting | **Open — needs UC-08/UC-10** → *delivered by UC-08's finalise gate (`POST /drafts/:id/finalise` 409s on blocking issues), closed 24 Aug with evidence comment. Note the gate runs the quality engine, not `validateForm` — format errors do not block finalise; recorded in the acceptance mapping* |
| LER-1108 QA: Definition of Done checks | **LER-1222** | `e2e/uc05-field-validation.spec.ts` — 22 checks, mapped in `docs/acceptance-mapping.md` § UC-05 | Done |

**Ten of the fifteen were already delivered.** The five that were genuinely open were open for reasons that
are not engineering capacity: two need a decision about whether a field should exist at all (still open —
LER-1098/1099), two belonged to UC-08, and one needed a finalise action that did not exist yet. *(Updated
24 Aug 2026: UC-08 delivered all three of the latter — 1104, 1106 and 1107 are closed with evidence; see
the rows above.)*

**The lesson worth carrying:** when a pack is authored for a use case the client has already ticketed, map
the originals in the pack *before* creating new tickets. Two parallel ticket sets for one body of work cost
more to reconcile than they saved.
