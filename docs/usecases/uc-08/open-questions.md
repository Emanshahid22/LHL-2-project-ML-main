# UC-08 — open questions

Raised during authoring, against the scope document, the client tickets (LER-1141–1152 and the two
UC-08-reserved originals LER-1104/1106), and the delivered code of UC-01..07. **None of these blocks
the build** — each has a recorded default, and answering a question later changes data or copy, not
architecture. Add to this file rather than blocking a ticket.

---

## Client-ticket → delivering-ticket mapping

The client ticketed UC-08 as **LER-1141–1152**, and two earlier originals were reserved for it
during the UC-04/05 cycle: **LER-1104** (cross-form rules, pairs with Check 3) and **LER-1106**
(advisory override with reason). Stories in `stories/` are **named by those client keys**; the
delivering tickets (Phase B) are recorded here and in each story header as they are created.

| Client original | Story | Delivering ticket |
|---|---|---|
| LER-1141 | Review and Finalise trigger | **LER-1255** |
| LER-1142 | Check 1 — required fields | **LER-1256** |
| LER-1143 | Check 2 — date validity and sequence | **LER-1257** |
| LER-1144 | Check 3 — cross-form references | **LER-1258** |
| LER-1104 | Cross-form rules (declared vocabulary) | **LER-1259** |
| LER-1145 | Check 4 — MG6D confirmation | **LER-1260** |
| LER-1146 | Issue checklist display | **LER-1261** |
| LER-1147 | Jump to field navigation | **LER-1262** |
| LER-1148 | Blocking issues must resolve | **LER-1263** |
| LER-1149 | Advisory acknowledgement | **LER-1264** |
| LER-1106 | Advisory override with reason | **LER-1265** |
| LER-1150 | Finalise button gating (server-side) | **LER-1266** |
| LER-1151 | Quality check outcome logged | **LER-1267** |
| LER-1152 | QA: Definition of Done checks | **LER-1268** |

---

## Findings that changed the design (recorded, not questions)

### F1 — MG5 has no structured witness field
LER-1104's own description reads "a witness named in MG5 must have a corresponding MG11". MG5's
field set (v4, sourced) carries witnesses only inside prose (`keyEvidence`,
`summaryOfCircumstances`). Detecting "a witness named in MG5" therefore requires either a witness
box the research does not document (rule 1: never invent a field) or name extraction from
narrative (inference this codebase refuses everywhere else). What ships is the cross-form rules
ENGINE and every rule the shared vocabulary makes honest: URN and defendant-name equality across a
case's drafts, and exhibit citations (MG11) checked against exhibit definitions (MG12) using the
`AB/1` convention both templates' own helpText documents. Q4 records what the witness rule needs.

### F2 — Nothing new may block a save
Every quality signal before UC-08 is advisory at the save path by design (autosave fires 1.5 s
after a keystroke; a draft is allowed to be wrong). UC-08 adds its gate at exactly one transition —
finalise — and leaves `update()` semantics intact except for the REVIEWED→DRAFT reversion (F3).

### F3 — A review attests the values it saw
`REVIEWED` cannot survive an edit: any successful save of a reviewed draft reverts it to `DRAFT`,
noted in the save's audit metadata (`reviewInvalidated: true`). Otherwise review → edit → finalise
would attach the gate's blessing to values the review never examined.

### F4 — The engine runs server-side because two checks cannot run anywhere else
Check 3 needs the case's sibling drafts (another user-scoped query) and Check 4 needs the
acknowledgement table. Running the suite in `POST /drafts/:id/review` also means UC-07's redaction
never distorts a result: the engine sees stored values, while a locked viewer's checklist row names
the affected SECTION, never the content.

---

## Open questions (defaults recorded)

### Q1 — What does "Reviewed" permit or unlock?
The scope names the status but not its semantics. Defaults shipped: `REVIEWED` is set only by a
clean review run; it keeps the draft on the work queue; any edit reverts it to `DRAFT`; finalise
re-runs the engine regardless of status, so `REVIEWED` is evidence, not authority. Whether a
reviewed-but-not-finalised state should be visible to colleagues, expire, or gate anything else is
a product call.

### Q2 — Timeout threshold
"Quality engine times out" names no number. Default: `QUALITY_CHECK_TIMEOUT_MS = 4000` per check,
a shared constant. Tuning it is data, not architecture.

### Q3 — Which severities belong to which findings
Shipped banding — blocking: missing/incomplete required fields (incl. group rows and
MG6D-empty-while-active), undecodable dates, declared `error`-severity orderings, URN or
defendant-name divergence across one case's forms, MG6D handling unconfirmed, any incomplete
check at finalise time. Advisory: declared `advisory`-severity orderings, suppressed comparisons,
exhibit citations with no matching definition, UC-05 format advisories. A practitioner may re-band;
each is one line in the engine's tables.

### Q4 — The MG5-witness rule (LER-1104's example)
Needs ONE of: (a) research documenting a structured witness box on the printed MG5 (then the field
ships with provenance and the rule becomes a `crossRef` vocabulary pair), or (b) an explicit
product decision to accept name-matching against prose, which the project has so far refused on
principle. Until then the rule is recorded here and the engine's vocabulary carries what is honest.

### Q5 — May a form finalise while a check is incomplete?
Default: no. "Blocking issues from completed checks still enforced" says what a timeout must not
weaken; letting an incomplete check through would make a timeout a bypass. An incomplete check is
itself a blocking condition at the finalise boundary, and the UI says so.

### Q6 — What FINALISED unlocks
UC-09 (PDF) and UC-10 (archive) both start from a finalised form. UC-08 ships the stub handoff
("PDF generation arrives with UC-09") and nothing more.

### Q7 — Should advisory acknowledgements persist across review runs?
Default: no — they are collected in the review panel and submitted with the finalise request,
where each is audited (`ADVISORY_BYPASSED` with the verbatim reason). A fresh review resets them:
the findings may have changed, and a reason given for last week's advisory should not silently
cover today's. Persisting acknowledgements per user+draft (the UC-07 table pattern) is a
straightforward extension if practice wants it.

### Q8 — Should an unrecordable bypass abort finalisation? (the transactional option)
The finalise audit reorder (branch `mgs/uc-08-finalise-audit-order`) writes ADVISORY_BYPASSED and
FORM_FINALISED only after the guarded status flip has won, closing the stranded-rows and
duplicate-rows interleavings. The stronger alternative — one `$transaction` around flip + bypass
rows + FORM_FINALISED — was considered and deliberately NOT taken, because inside a transaction a
failed audit insert aborts the finalisation, inverting AuditService's standing contract that an
audit failure never breaks the user's action. The argument FOR the transaction is real: the bypass
record is LER-1106's whole purpose, so a bypass that cannot be recorded arguably should not happen
at all; the reorder instead accepts the codebase-wide residual risk that a crash between the flip
and the audit writes leaves a finalised form missing bypass rows (logged, never fatal). This is a
contract decision for Husnain, flagged for the LER-1189 security review.

### D1 — URN/defendant divergence is blocking; exhibit-citation gaps are advisory
One case has one URN — divergence across its forms is objectively wrong, so it blocks. An exhibit
cited in a statement but absent from the exhibit list may simply mean MG12 is not compiled yet, so
it advises (and DoD 4 asks only that it is *flagged*).

### D2 — Reference parsing follows the printed form's own instructions
Both exhibit fields' helpText instructs "initials and a sequence number, e.g. JS/1", one per line.
The parser extracts only leading tokens matching that convention (`[A-Za-z]{1,4}/digits`) and
ignores prose lines entirely — grounded in the template's documented convention, never in guesswork
about free text.

### D3 — Finding identity
`issueId = checkId:kind:fieldId[:related]` — stable across runs of the same draft state, so an
acknowledgement names exactly one finding and a changed form invalidates stale acknowledgements
naturally.
