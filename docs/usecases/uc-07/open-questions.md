# UC-07 — open questions

Raised during authoring, against the scope document, the client tickets (LER-1126–1140), the Manual of
Guidance v11 and the delivered code of UC-01..06. **None of these blocks the build** — each has a
recorded default the build ships with, and answering a question later changes data or copy, not
architecture. Add to this file rather than blocking a ticket.

---

## Client-ticket → delivering-ticket mapping

The client ticketed UC-07 as **LER-1126–1140**. Stories in `stories/` are **named by those keys** and the
delivering tickets (Phase B, created via the tasks-ml API) are recorded here and in each story header as
they are created — the UC-05/UC-06 duplicate-block lesson applied from the start
(`docs/usecases/uc-05/open-questions.md`).

| Client original | Story | Delivering ticket |
|---|---|---|
| LER-1126 | MG6D auto-activation | **LER-1240** |
| LER-1127 | Restricted access banner | **LER-1241** |
| LER-1128 | Handling instructions pre-populated | **LER-1242** |
| LER-1129 | Confirmation before editing | **LER-1243** |
| LER-1130 | Confirmation not bypassable in UI | **LER-1244** |
| LER-1131 | Confirmation not bypassable at API | **LER-1245** |
| LER-1132 | PII reminder panel | **LER-1246** |
| LER-1133 | Practice direction link | **LER-1247** |
| LER-1134 | Exclude sensitive items from exports | **LER-1248** |
| LER-1135 | Access logging | **LER-1249** |
| LER-1136 | Access log immutability | **LER-1250** |
| LER-1137 | Step-up acknowledgement per access | **LER-1251** |
| LER-1138 | Locked section for unauthorised users | **LER-1252** |
| LER-1139 | Required permission level shown | **LER-1253** |
| LER-1140 | QA: Definition of Done checks | **LER-1254** |

---

## Findings that changed the design (recorded, not questions)

### F1 — The draft write path replaces `valuesJson` wholesale
`PATCH /drafts/:id` stores what the client sends, whole. Combine that with server-side redaction for
locked users and the locked user's next autosave would **erase the sensitive schedule**. The build
therefore merge-preserves: sensitive keys absent from an update keep their stored values; sensitive keys
present demand permission plus a recorded confirmation. An E2E check proves a locked user's autosave
leaves MG6D intact.

### F2 — `DynamicForm` builds a control for every field and autosave sends them all
If MG6D fields joined the FormGroup at build time, every autosave by anyone would carry their keys and
trip the API guard. So sensitive fields are excluded from the base form and their controls are added only
on confirmation — which is also the honest implementation of "not bypassable in UI": pre-confirmation
there is no control to write to.

### F3 — No export existed
"Sensitive items are excluded from any non-sensitive schedule export" had nothing to be true of. UC-07
builds the minimal export it constrains (CSV over HTTP, audited) so the exclusion is provable. PDF stays
UC-09's.

### F4 — MG6D is officially a separate form
The Manual of Guidance v11 lists MG06D as its own form ("Schedule of Relevant Sensitive Unused
Material"). The scope specifies a *section within MG6 handling*, and the scope is the source of truth for
behaviour — but the designation dispute is already escalated (LER-1205,
`docs/answers/LER-1205-designation-mismatches.md`). Everything keys off the `sensitive: true` field
declaration, never the form code, so a later split moves the fields wholesale without behaviour change.

---

## Open questions (defaults recorded; answers change data/copy, not architecture)

### Q1 — Which practice direction should the PII panel link to?
The scope requires "a link to the relevant practice direction" without naming it. The build links to the
official gov.uk **Criminal Procedure Rules and Practice Directions** index — a real, stable, verifiable
destination — and labels it as the rules index, not as a specific direction. **Needed from a
practitioner:** the exact rule/practice-direction reference the firm treats as governing PII procedure,
which then becomes the link text and target. Changing it is one constant (`PII_PRACTICE_DIRECTION`).

### Q2 — Permission-level naming, and who "in the firm" holds it
The build names the level **Sensitive Material Access** (a constant, `SENSITIVE_PERMISSION_LEVEL`) and
answers "who has it" by listing the names of users holding the flag — in the demo, Alex Marlowe. Real
firms will have a policy (a designated disclosure lead? a partner?) and possibly a different name for the
level. Assignment today is a seeded column; there is deliberately no UI to grant it, because granting
access to sensitive material is exactly the kind of act that should not ship without a decision on who
may perform it.

### Q3 — Handling-instructions wording needs a practitioner
The read-only block contains only sentences attributable to the Manual of Guidance v11 and the Home
Office criminal-casefiles standard (PRD §6), and closes with an explicit unverified notice. Real handling
instructions likely also cover storage, copying and marking (the research notes GSCP chequered banding) —
none of which is specified verbatim in a source we hold, so none of it ships. The block's wording is
hash-recorded on every acknowledgement, so a future wording change is distinguishable in the audit trail.

### Q4 — What happens to MG6D content when the trigger clears, and should the MAIN schedule mask sensitive rows?
Default shipped: when the last sensitive row is unclassified, the section deactivates (UC-04's flag is
deliberately un-latching) but stored MG6D values are preserved dormant and return on reactivation —
deleting a user's typed content as a side effect of a dropdown change would be worse. Also: the main
unused-material schedule (MG6C-analogue) remains fully visible to the draft owner including rows
CLASSIFIED sensitive — UC-04 built it that way and UC-07 gates only the MG6D detail section. Whether the
classification itself (or the row) should be masked for users without the permission is a practitioner /
policy call.

### Q5 — The prosecutor's MG6D boxes
The real MG6D carries the prosecutor's decisions (agree sensitive; PII application needed). This tool's
user is not the prosecutor, so those boxes are not on the form. If a decision-maker wants them recorded
(e.g. as received correspondence), that is a new story, not a default.

### Q6 — PII acknowledgement cadence
The scope says the PII acknowledgement is "per-user, persisted"; client ticket LER-1137's step-up wording
("required on each access, not once per session") is applied to the **handling-instructions
confirmation**, which is the editing gate. Default shipped: PII acknowledgement is persisted per user per
draft and shown as acknowledged once any row exists; the handling confirmation is demanded fresh on every
access. If the firm wants the PII acknowledgement stepped-up too, it is the same mechanism switched on.

### Q7 — Export format and audience
The scope constrains what the export must NOT contain, not what it is. Default: CSV of the non-sensitive
schedule rows (reference, description, type, classification omitted-by-construction? — no: classification
column is included and every exported row reads non-sensitive by definition), owner-accessible, audited.
Whether disclosure practice wants a different shape (or the UC-09 PDF as the only export) is open.

### D1 — 403, not 422, for guard rejections
Shape problems stay 422 (the house style for malformed requests). Missing permission and missing/foreign
confirmation are authorisation failures: 403, with `SENSITIVE_ACCESS_DENIED` audited. The DoD asks for
"rejection", and 403 names the reason honestly.

### D2 — Viewing vs editing gate
The scope gates *editing* on the confirmation ("before the section can be edited"). A permitted user
therefore sees existing MG6D content read-only before confirming; the GET that delivered it is the
audited view. Locked users get neither content nor the choice.

### D3 — Progress denominator unchanged
The MG6D group is `required: false` statically; "mandatory when active" is delivered as an
`error`-severity consistency finding rather than by mutating the progress denominator, whose static
semantics UC-01's checks pin.
