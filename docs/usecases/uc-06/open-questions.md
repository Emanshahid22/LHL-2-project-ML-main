# UC-06 — open questions

Raised during authoring, against the delivered code and the scope document. **None of these blocks the
build.** The epic is deliberately shaped so that phrasing which cannot be attributed simply does not ship as
a *proposal* — the flag, the hint and the panel all still land. Answering these questions **adds**
suggestions later, which is a data change in a registry, not a code change.

Add to this file rather than blocking a ticket.

---

## Findings that changed the design (recorded, not questions)

### F1 — The narrative treatment is MG11-wizard-only
`NarrativeField` — the textarea with the amber highlight backdrop, word count and flag summary — is
referenced from `mg11-wizard.html` and `mg11-wizard.ts` and **nowhere else**. MG5 goes through the flat
`app-dynamic-form`, so its five textareas today have no highlighting at all and no flagging.
**Consequence:** the DoD requires the panel for "MG5 and MG11", so UC-06 has to lift the component into the
shared renderer. That is engine work in `DynamicForm`, not panel work, and it is the largest single piece of
the epic — story 02 (LER-1224). Costing UC-06 as "a side panel" would under-scope it by most of its effort.
**What was not done:** the component was **not** copied into a second place. One component, two entry
points; a fork would mean every future fix twice.

### F2 — Not every textarea is a narrative, and most are not
There are **57 textareas across the eleven templates**. MG11's `witnessAddress` and MG5's `chargesList` are
textareas that hold an address and a list of charges — flagging "I think" inside an address, or offering a
formal alternative for a charge wording, is nonsense at best.
**Consequence:** a template must **declare** `narrative: true` on a field; the renderer must never infer
prose from `type === 'textarea'` or from `rows`. Same discipline UC-04 used for `group` and UC-05 for
validation rules, and it keeps form codes out of the renderer. Story 01 (LER-1223).

### F3 — UC-03's pattern type has no notion of a replacement
`NarrativePattern` carries `phrase`, `kind` and `explanation` only, and `NarrativeFlagKind` is
`'hearsay' | 'opinion'`. The scope requires informal flags to come with "a suggested formal alternative".
**Consequence:** the kind union gains `'informal'` and the pattern gains an optional `suggestion` —
additive, so UC-03's five patterns keep working untouched, and `segmentNarrative` and the amber backdrop are
reused rather than rebuilt.

### F4 — The scope supplies the requirement for standard phrasing but none of the phrasing
The scope asks for "standard phrasing for common evidential descriptions" and gives **no examples, no
source and no register guidance**. It gives exactly **one** completeness hint verbatim: *"You have not
recorded the time of the incident"*.
**Consequence:** `STANDARD_PHRASES` **ships empty** — the interface, the provenance gate, the conformance
rule and the tests all land, and the registry is filled by a practitioner in a pull request that adds data
and no code. The one completeness hint ships `documented`, cited to the scope; its obvious siblings ship
`inference` as observations only. Stories 05 and 06 (LER-1227 and LER-1228).
**What was not done:** plausible courtroom phrasing was **not** written to fill the registry. An invented
"standard phrase" is one button-press from becoming a witness's signed words, which is a worse failure than
an invented form field — a missing field is visibly empty, an invented phrase reads as authoritative.

### F5 — The "language AI service" is named but not specified
The scope's DoD says the panel must degrade gracefully "when language AI service is unavailable", which
presumes such a service, but the scope never says what it is, where it runs, or what it returns.
**Consequence:** UC-06 ships the **boundary**, not a vendor: one direction only, no draft write path,
output treated as untrusted, optional behind `LANGUAGE_ASSIST_URL`, and unconfigured by default with the
in-process rules supplying the panel on their own. The answer to Q6 can then change without touching the
UI. PRD §5 and §11; stories 11 and 12 (LER-1233 and LER-1234).

---

## Practitioner / client

### Q1 — What is the standard phrasing for common evidential descriptions?
**The single largest thing a human must supply for this UC to deliver its headline value.** The scope asks
for standard phrasing; it supplies none, and no source in the research corpus states any. `STANDARD_PHRASES`
therefore ships empty.
**Needed:** for each phrase — the trigger (what in the narrative should offer it), the exact wording, and a
citation (a CPS or force drafting guide, a witness-statement style guide, or a named practitioner's sign-off
recorded as the source).
**Until then:** the panel offers no phrase suggestions. Everything else in the epic works.
**Cost of answering:** a data-only pull request. Each entry with a real `source` becomes insertable
immediately, with no code change and no new tests.

### Q2 — Which informal phrases, and what are their formal alternatives?
Informal register is observable from the text, so a **flag** needs no external authority — "this reads
informally" is a statement about English. A **replacement** is drafting advice and does need one. That
asymmetry is deliberate (story 04, LER-1226).
**Needed:** a practitioner-reviewed list of informal phrases seen in real statements, each with the formal
alternative they would actually accept. The scope's own example of the register problem is the kind of thing
wanted, but a list of two or three is not a product.
**Until then:** informal flags ship `likely` and carry **no** `insertText` — they observe, they do not
propose.

### Q3 — Which completeness hints are legitimate beyond time-of-incident?
The scope gives one. The obvious siblings — date, place, who else was present — are our inference, ship as
`inference`, and are observations only.
**Needed:** confirmation of which omissions are worth prompting for, and confirmation that a *checklist* of
required narrative content is **not** wanted. No source in the corpus defines one, and a confident list of
what a statement must contain is drafting doctrine this project has no authority to assert.
**Until then:** one documented hint plus a small declared set of inferences, none of them proposing wording.

### Q4 — Should the assistant reach prose on forms other than MG5 and MG11?
The DoD names MG5 and MG11, so exactly five fields are declared narratives. But several other textareas are
plainly prose: MG3's `evidenceSummary`, `suspectAccount` and `strengthsWeaknesses`; MG15's `questionsAnswers`
(14 rows); MG16's `relevanceExplanation`; MG14's `identificationAccount`.
**Needed:** whether the assistant should extend to those, and in particular whether an assistant is
appropriate on a **record of what was said** (MG15's interview record, MG14's identification account) as
opposed to a statement being composed — suggesting a formal alternative for words a suspect actually used
would be wrong.
**Until then:** five declared narratives. Extending is one `narrative: true` per field plus a check; the
mechanism is already general, so this is cheap to answer late.

### Q5 — Is per-session dismissal the right lifetime?
The scope says dismissal holds "for that session". Persisting it was rejected because it would silently hide
a prompt from a colleague who opens the same draft later and never made that decision.
**Needed:** confirmation that a solicitor re-seeing a dismissed prompt after a reload is acceptable, or a
statement that dismissal should be per user and per draft (which would need a schema change and a decision
about visibility to other users of the same case).
**Until then:** per-session, in component state, not persisted. Story 10 (LER-1232).

---

## Decision-maker / architecture

### Q6 — Which "language AI service", and may a witness's narrative leave this system?
The scope presumes a language AI service without naming one. **This is the question with the largest
consequences in UC-06 and it is not an implementation choice.** Narrative text is a witness's account of a
criminal matter — case content, entered by a solicitor, on a document that may be served.
**Needed:** a decision on all of:
1. whether a hosted model may see narrative text at all, and under what data-processing terms;
2. if not, whether the in-process rules are the whole of the product (they are a working product — the
   panel needs no service);
3. if so, which model, hosted where, with what retention, and whether an audit obligation attaches to
   sending text out.
**Until then:** `LANGUAGE_ASSIST_URL` is unset, the module is not registered, and the panel runs entirely
from `libs/shared`. No narrative text leaves the deployment. This is a working default, not a stub.
**Related risk to state explicitly:** the staging instance runs behind `DemoAuthGuard` with no real
authentication. A staging deployment must never be pointed at a real model with real statements in it.

### Q7 — Should the audit trail be shown to the user, and does inserted wording need attribution on the file?
**Half answered by the scope, during the build.** The scope's UC-06 post-condition says *"All Insert
actions logged in the form audit trail with the suggestion text"*, so the audit row records
`{ formCode, fieldId, promptId, kind, suggestionText }` — the act **and** the wording the assistant
offered. The pack's original design recorded ids and a kind only; the scope is the source of truth and
won. What has not changed: the **narrative is never recorded**, because the suggestion text is the
assistant's own attributable wording rather than the witness's account, and a check asserts no phrase from
the narrative appears in the row.
**Needed:** whether that is sufficient, or whether a served document must show that a passage was
suggested rather than composed. This is a professional-conduct question, not a technical one, and the answer
could require the opposite of the current design (recording the wording, which we deliberately do not).
**Until then:** metadata only, and a check asserts the narrative text does not appear in the audit row.
**Note:** there is no user-facing audit trail view in the product yet; the rows are written and readable
only in the database. That is unchanged by this UC.

---

## Deviations found while building (recorded, not questions)

### D1 — The audit row carries the suggestion text
See Q7. The pack said metadata only; the scope's post-condition names the suggestion text explicitly.
Built to the scope. `docs/usecases/uc-06/prd.md` §8 and story LER-1230 are amended to match, each saying
what changed and why. The narrative is still never recorded.

### D2 — The degradation state shows the scope's notice rather than nothing
The pack's PRD §10 said an unavailable service renders "nothing"; the scope's Error Handling line says the
panel shows *"Language assistance temporarily unavailable"* and form editing continues unaffected. Built to
the scope. A quiet line inside the panel is not an error surfaced to the user, and the DoD line 4 check
asserts zero console errors, no snackbar and an unaffected save alongside it. Story LER-1234 amended.

### D3 — The assistance module stays registered when no service is configured
The pack said the module would not be registered with `LANGUAGE_ASSIST_URL` unset. As built it is
registered and inert: it makes **no outbound call**, so no narrative text leaves the deployment, and it
answers `200 { prompts: [], enabled: false }` so the client can latch off after one request. The
alternative — a 404 — puts a failed-resource error in the browser console, which contradicts DoD line 4
and the check that asserts zero console errors. The boundary that matters is the outbound one, and it is
never crossed by default.

### D4 — The panel's collapsed header is present before the panel opens
The scope says the panel "appears when a narrative field is focused", and the body does exactly that. A
one-line collapsed header sits beside every narrative beforehand, because a collapsible panel with no
visible handle is not collapsible, it is absent — and it is what makes the no-cursor state reachable,
where Insert is correctly disabled rather than guessing a position.

### D5 — The scope's assistance toggle is delivered, though no story named it
The scope's alt flow — disable assistance from the panel, suggestions hidden, informal flags cleared, for
the session only — was not one of the fifteen stories. It is built, with its own check. UC-03's hearsay and
opinion marks are deliberately left alone by it: they are not language assistance, and removing a
delivered behaviour through an unrelated toggle would be a defect.

### D6 — Nothing in the default build proposes wording, so DoD 3 is proven with a configured service
`STANDARD_PHRASES` ships empty and no informal alternative could be attributed, so `canProposeVerbatim`
leaves every in-process prompt observation-only — which is the epic's central rule working as designed.
The insert mechanic is therefore exercised through a **configured** assistance service, stubbed at the
browser boundary, whose prompt carries a source and so is entitled to propose. That is a supported
configuration rather than a test-only backdoor: the same code path runs when a real service is configured,
and the same stub proves the gate by having an unattributed prompt arrive with its wording stripped.
Answering Q1 or Q2 makes the default build propose wording with no code change.

### D7 — Insertable wording is not trimmed
Display text (a prompt's message, its source) is trimmed; wording meant to be spliced into prose is kept
byte-for-byte, minus control characters. A leading or trailing space is part of a proposal, and eating it
produces "in full.outside the shop" — found by the DoD 3 check while it was being written.

---

## Tooling limits (already known, restated so the next person does not re-discover them)

### T1 — `dueDate` cannot be set through the tasks-ml API
The endpoints accept the field and silently ignore it. Intended sequencing for UC-06 is recorded in
`human-instructions.txt` instead, and must be set in the DevOps Bot UI if dates are wanted. Sequence matters
more than the calendar: stage 1 must land first, because until narratives are declared and the renderer
honours the declaration there is nowhere for the panel to attach on MG5 — half of DoD line 1.

### T2 — Agent mode cannot be cleared through the API
`agentMode` is not writable by the API, so tickets are created with it off and it must stay off. If a ticket
ever shows the Agent toggle on, it has to be turned off in the DevOps Bot UI. Agent mode blocks on a
WhatsApp reply that may never come.

---

## The duplicate-block mapping — the client's original UC-06 tickets

Same as UC-05, and for the same reason. The client's backlog carried a UC-06 block, **LER-1109–1125**; this
pack created **LER-1223–1237** and delivered against those, leaving seventeen originals at *To Do*
describing finished work. Every original was closed on 20 Aug 2026 with an evidence comment naming its
delivering ticket.

| Client's original | Delivering ticket | Delivered by | Status |
|---|---|---|---|
| LER-1109 Isolated AI microservice | **LER-1233** (the boundary only) | `the assistance module has no write path to a draft` — the boundary ships, unconfigured by default; no model is wired | **Open — decision-maker (Q6)** |
| LER-1110 Constrained prompt | — | Nothing to prompt until Q6 is answered | **Open — depends on Q6** |
| LER-1111 Side panel on narrative focus | **LER-1225** | `DoD 1 — the panel appears for an MG5 narrative and lists prompts` (+ the MG11 half) | Done |
| LER-1112 Suggestion generation | **LER-1227** (the gate and shape) | `STANDARD_PHRASES` ships **empty** — the scope asks for phrasing and supplies none | **Open — practitioner (Q1/Q2)** |
| LER-1113 Informal language flags | **LER-1226** | `an informal phrase is marked in the text and listed in the panel` | Done |
| LER-1114 Amber highlight in field | **LER-1226** | same check (the mark *and* its panel entry); `turning assistance off hides suggestions and clears informal marks only` | Done |
| LER-1115 Completeness hints | **LER-1228** | `the scope's completeness hint fires only when no time is recorded` | Done |
| LER-1116 Insert button per suggestion | **LER-1229** | `a prompt that cannot attribute its wording may observe but not propose` | Done |
| LER-1117 Insert at cursor position | **LER-1229** | `DoD 3 — Insert splices at the cursor, leaves the caret after it, and is audited` | Done |
| LER-1118 No write path to any form | **LER-1231** + **LER-1233** | `the assistance module has no write path to a draft`; `DoD 2 — the narrative control is written in exactly one place` | Done |
| LER-1119 Dismiss suggestion | **LER-1232** | `a dismissed suggestion stays dismissed for the session and returns after reload` | Done |
| LER-1120 Dismissed items do not reappear | **LER-1232** | same check (ids derive from the phrase, never a character offset) | Done |
| LER-1121 Panel disable toggle | **LER-1232** + the scope's alt flow | `turning assistance off hides suggestions and clears informal marks only` | Done |
| LER-1122 Insert actions logged | **LER-1230** | `DoD 3 — …and is audited` (reads the row back from the database) | Done |
| LER-1123 Graceful degradation | **LER-1234** | `DoD 4 — an unavailable assistance service surfaces nothing to the user` | Done |
| LER-1124 Solicitor review of sample outputs | — | Practitioner time | **Open — human** |
| LER-1125 QA: Definition of Done checks | **LER-1237** | `e2e/uc06-legal-language.spec.ts` — 25 checks, all four criteria Covered | Done |

**Thirteen of the seventeen were already delivered.** The four that are open are the four this epic always
said it could not close alone: whether a witness's narrative may leave the deployment (Q6), what to prompt
it with, the phrasing itself (Q1/Q2), and a solicitor's eye on the output.
