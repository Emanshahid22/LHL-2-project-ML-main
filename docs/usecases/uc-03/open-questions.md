# UC-03 — open questions, scope deviations and coverage gaps

Found while writing this pack retrospectively against the delivered code and the scope document. UC-03 is
delivered and closed; nothing here is a defect report unless it says so.

Three kinds of entry: **deviation** (the build does something other than what the scope says),
**coverage gap** (behaviour exists but no automated check proves it), **open question** (needs a human).

---

## Deviations from the scope document

### D1 — Five hearsay/opinion phrases are flagged, not the three named
**Scope DoD:** "Hearsay flag correctly identifies 'I was told that', 'I heard that', and 'In my opinion'
patterns".
**As built:** those three, plus **"I think"** and **"In my view"**, both classified `opinion`.
**Why:** the scope's own main flow says the system "highlights phrases that may constitute hearsay or
opinion" generally, and the three named phrases are given as examples of the pattern rather than as an
exhaustive list. Two obvious opinion markers were added. The pattern list is data
(`NARRATIVE_PATTERNS`), so adding or removing one is a one-line change plus a test.
**Status:** an addition beyond scope, not a shortfall. A practitioner should confirm the extra two are
right to flag (`human-instructions.txt` §2.1).

### D2 — Step 1 carries three fields the scope's step-1 list does not name
**Scope, step 1:** "title, full name, date of birth, address, occupation, contact number" — six fields, all
present.
**As built:** step 1 also carries `witnessConsentsCourt`, `specialMeasures` and (conditionally)
`specialMeasuresApplied`.
**Why:** special measures are assessed when the witness is identified, not after their account is taken,
and the vulnerability derivation reads `specialMeasures` — putting it on a later step would mean the
indicator appeared after the narrative was written.
**Status:** an addition. Recorded so the difference from the scope's list is visible rather than looking
like drift.

### D3 — "Spell-check" is the browser's, not a legal dictionary
**Scope, step 2:** "large text area with spell-check enabled".
**As built:** `spellcheck="true"` set explicitly on the textarea. There is no custom or legal-terminology
dictionary.
**Why:** the scope says "enabled", which the browser's own spell-check satisfies literally. A partial legal
dictionary would flag correct legal usage as errors, which is worse than none; a real one belongs to UC-06
(Legal Language Assistance).
**Status:** literal compliance, recorded because "spell-check" could be read as a larger feature.

### D4 — The general "legal language prompts" in the scope description are not built
**Scope description:** "statement narrative with spell-check and legal language prompts".
**As built:** the narrow, DoD-named hearsay/opinion flagging is delivered. The general legal-language hook
(ticket **LER-1062**, not started) is not.
**Why:** UC-06 is "Legal Language Assistance" as a use case in its own right, so a general prompt engine
built inside UC-03 would be built twice or built in the wrong place.
**Needs:** a decision-maker to confirm UC-06 subsumes LER-1062 (`human-instructions.txt` §3.1).

---

## Coverage gaps

### G1 — "persists correctly to PDF output" cannot be tested, because there is no PDF
**Criterion #4:** "Vulnerable witness indicator persists correctly to PDF output".
**Covered:** both routes into vulnerability show the indicator (`an under-18 date of birth reveals special
measures and the indicator`, `an adult with a special-measures category is treated the same`), and the
derived flag survives a round-trip (`the indicator and derived flag survive a reload`).
**Not covered:** the PDF half. UC-09 does not exist. `isVulnerableWitness` is deliberately persisted into
`valuesJson` so the future renderer can read it without re-deriving, which is the most this use case can do.
**Status:** **Partial** in `docs/acceptance-mapping.md`. Re-test when UC-09 lands.

### G2 — "form can be submitted with flags present" cannot be tested, because there is no submit
**Criterion #3.** There is no submit or finalise action in the product (that is UC-10). The checks prove
flags block neither saving nor completing every wizard step, and that the audit metadata is written.
**Status:** **Partial**. The same structural gap as G1, on a different criterion.

### G3 — The audit metadata is asserted through the shared function, not by reading an audit row
`AuditEvent` has no read endpoint (audit read is unnumbered in the scope). `saving records the flags in the
audit trail` asserts against the same `detectNarrativeFlags` the API records with, and the actual row was
verified directly against the database during development
(`hearsayFlagCount: 2, hearsayFlagPhrases: ["i was told that","in my opinion"]`).
**CLOSED — 20 Aug 2026, by UC-06's spec.** `UC-03 hearsay and opinion flagging is unchanged by UC-06`
(`e2e/uc06-legal-language.spec.ts`) polls the `DRAFT_SAVED` row **out of the database** via
`auditEventsFor()` and asserts `hearsayFlagCount: 3` for a narrative carrying one hearsay and two opinion
phrases — so the audit metadata is now proven by reading the row, not only through the shared function.
The gap is closed by a check in a different pack, which is worth noting for anyone auditing this one: the
UC-03 spec itself still asserts through the function, and that is fine, because a second spec now reads the
row.

### G4 — The wet-signature space is a note, not a rendered reservation
Step 4 states that space for a wet signature is reserved on PDF output, and a check asserts the note. The
reservation itself is UC-09.

---

## Open questions

### Q1 — The declaration wording is unverified. This is the project's only Blocked criterion.
The wording is pinned, single-sourced, read-only, unwritable by any client, and verified at startup. Nobody
has confirmed it matches the current official MG11, and the scope does not reproduce the wording, so no
test in this repository can. Needs a senior solicitor or the client (Jira LER-1200; review tickets
LER-1077, LER-1078). Full detail in `human-instructions.txt` §1.1.

### Q2 — Every ticket in this UC is still "To Do" in DevOps Bot, not Done
Checked live against `devopsbot-be…/tasks-ml` while writing this pack: **all sixteen delivered UC-03 story
tickets report `status: "To Do"`**, as do the six undelivered ones in the same block. The work is delivered
and proven; only the tracker disagrees. Consistent with `docs/HANDOVER.md` §2 phase 11 and roadmap item 9.
**No ticket status was changed while writing this pack** — that is a tracker action for whoever owns Jira
hygiene, and it was not part of this task.

**RESOLVED — 20 Aug 2026.** The tracker now agrees. All sixteen delivered UC-03 story tickets are Done, as are LER-1062 (delivered by UC-06) and LER-1079 (the QA ticket). LER-1068 is closed as SUPERSEDED — see Q5, which asked for exactly that. Still open by design: the two solicitor reviews (LER-1077/1078) and the three page-count tickets (LER-1071..1073), which belong to UC-09. Each carries an evidence comment naming the
delivering branch, commit and covering checks. Project-wide, 130 of 244 LER tickets are Done; what is still
open is deliberate — 5 deferred, 11 blocked on a human, and 2 that belong to UC-08.

### Q3 — Is under-18-at-statement-date the right vulnerability test? (practitioner)
YJCEA 1999 s.16/s.17 categories are broader than age, and the reference date could arguably be the offence
date or the likely trial date. Also: are the three special-measures options the right list, and is the
"assess as at today when the statement date is blank" fallback acceptable? See
`human-instructions.txt` §2.2.

### Q4 — Are the five flagged phrases and their explanations right? (practitioner)
See D1. The explanations tell the user what to write instead, so a wrong one actively misleads.

### Q5 — Should LER-1068 (Literal typing of declaration) be closed as superseded? (decision-maker)
It appears to predate the decision to make the declaration a hash-pinned constant rather than typed or
stored data. Not started, and probably obsolete.

### Q6 — Do the page-count tickets (LER-1071–1073) belong to UC-09? (decision-maker)
"Page count from renderer / interpolation / assertion" reads as PDF layout ("page 1 of 3" on the printed
statement), which is UC-09 rather than UC-03.

### Q7 — What does "submitted" mean in DoD #3? (client)
See G2. There is no submit action today.

### Q8 — The memo's ask for UC-03 is in Section B, not Section A (senior solicitor / client)
The **Decision & Review Memo** is now in the repository: `docs/decisions/decision-and-review-memo.md`
(19 August 2026, responses requested by 22 August). It supersedes the note this entry previously carried
about the memo being absent.

UC-03's blocking item is **not one of A1–A6**. It is the final item of the memo's Section B practitioner
review agenda, quoted verbatim:

> "MG11 statutory declaration (provide the current official verbatim wording, s.9 CJA 1967 / s.5B MCA
> 1980 — the build carries a draft protected by an integrity hash)"

That is **Q1 above**, the project's only Blocked criterion. Section B also lists *"MG5 and MG11 (realistic
but never practitioner-verified)"*, which is the sign-off behind `human-instructions.txt` §2.3.

Of the Section A decisions, three bear on UC-03 indirectly and none blocks it:

- **A3** MG14 designation carries real UC-03 content: the memo notes that identification evidence
  officially belongs on an MG11, so re-designating MG14 to the Conditional Caution would move
  identification capture into MG11 practice and widen this UC's practitioner review scope. No code change.
- **A1** and **A5** block the **UC-09 layout binding** — which is what G1 and G4 above are waiting for.
  They do not block UC-03; they block the use case that would finally close UC-03's two Partial criteria.
- **A2**, **A4** and **A6** have no bearing on UC-03.

Mapping and detail: `human-instructions.txt` §5.
