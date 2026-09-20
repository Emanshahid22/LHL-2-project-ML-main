## Epic
UC-02 — Auto-Population from Case File

> **Retrospective documentation of delivered work.** UC-02 was built, tested and closed before this
> pack existed. It is written here in the company Epic/PRD/Story format so delivered behaviour is
> documented to the same standard as work planned up-front (UC-04 was the first pack authored in
> advance — see `docs/usecases/uc-04/`). Nothing here is a request to build anything.
> Completion commit `3cf7644`, marker branch `mgs/uc-02-auto-population`.

## Overview
A case file already holds the defendant's name and date of birth, the URN, the court, the CPS reference,
the officer in the case and the offences. Re-typing those onto every MG form is both wasted time and a
transcription-error risk on a document that goes to court. UC-02 reads the linked case and fills the
fields that genuinely correspond to case data — then gets out of the way.

The hard part is not the filling. It is knowing when **not** to fill: never overwriting something a
human typed, never guessing when the case holds two possible answers, and never mapping a case datum
onto a field that merely looks similar.

**Source of truth:** the UC-02 section of <https://lhl-agents.netlify.app/mg-forms-scope/>.

## Business Value / Goal
Two kinds of value, and the second matters more. The obvious one is speed: eight of MG4's fields, five
of MG1's, six of MG3's come for free. The important one is accuracy — a defendant's date of birth typed
once and reused is a date of birth that cannot disagree with itself across a case file.

Against that sits the risk that makes this use case delicate: a confidently wrong prefill is worse than
a blank box, because a blank box gets filled in and a wrong one gets signed. So the design's centre of
gravity is restraint — every value is attributed, reversible and clearly marked as machine-supplied
until a human touches it.

Success = mapped fields fill from the case, the user can see exactly which ones did and undo any of
them, a manual value is never lost to a re-run, and ambiguity is reported rather than resolved.

## Scope
**In scope (as delivered):** reading the linked case (access-scoped); a typed field-to-case mapping
(`mapsTo`) in the shared template model; population on first open of an empty case-linked draft;
per-field **Auto-filled** badges with a Clear affordance; the population summary (*X of Y mappable
fields were filled*), dismissible; accept / edit / clear per field, where editing or clearing turns the
value manual; provenance recorded per field (source, value, case timestamp) and pruned when the value
stops matching; ambiguity reporting for conflicting case data; no-data reporting for absent case data;
detection that the case changed after population, with a **Re-run auto-fill** that never loses manual
work; the `AUTO_POPULATED` audit event; graceful degradation when population fails.

**Out of scope:**
- The case-management **integration layer** — the `Case` model is seeded fiction. Real integration is
  LER-1041, not started.
- **Writing to the case file.** UC-02 is read-only in both directions of the phrase: it reads the case,
  and no API path anywhere writes to `Case`.
- Manual import as a fallback when no case system is reachable (LER-1054, not started).
- Populating the MG11 witness fields. A witness is **not** the defendant — see the mapping rule below.
- PDF (UC-09), finalise/archive (UC-10).

### The mapping rule — a deliberate constraint, not an oversight
`mapsTo` is allowed **only where the case datum genuinely IS the field.** Not "is related to", not "is
usually the same person". Two consequences that look like missing features and are not:

- **MG11's witness name has no mapping.** An MG11 witness is not the defendant. Prefilling the
  defendant's name into a witness statement would put the wrong person's name on a signed statement.
- **MG16's `subjectName` has no mapping.** A s.100 CJA 2003 bad-character notice concerns a
  *non-defendant*, so the same hazard applies. Left unmapped pending a legal ruling
  (`docs/stories/LER-1039-open-questions.md`).

Signatures and officers who are not the OIC are never mapped either.

## User Stories
Each maps to the DevOps Bot ticket that delivered it. See `stories/`.

1. **Read linked case file** (LER-1042) — the case is readable only by users granted access.
2. **Field mapping** (LER-1043) — a typed path from field to case datum, resolved in one place.
3. **Pre-fill matching fields** (LER-1044) — population on first open, mapped fields only.
4. **Auto-filled badge** (LER-1045) — every machine-supplied value is visibly machine-supplied.
5. **Accept, edit or clear per field** (LER-1046) — the user is in charge of every value.
6. **Population summary** (LER-1047) — *X of Y* over mappable fields, dismissible.
7. **Non-mappable field flagging** (LER-1048) — a field the case cannot supply is left blank and said so.
8. **Ambiguous data handling** (LER-1049) — conflicting case data is reported, never guessed.
9. **Never overwrite existing values** (LER-1050) — a manual value survives every re-run.
10. **Detect post-population case change** (LER-1051) — a case edited after population is surfaced.
11. **Re-run population option** (LER-1052) — re-running fills the gaps and keeps manual work.
12. **Read-only guarantee on case file** (LER-1053) — nothing in the product writes to a case.

## Epic-level Acceptance Criteria
The scope's Definition of Done, verbatim:

- "Auto-population from a test case file correctly fills all matching fields without overwriting non-matching fields"
- "Auto-filled badge displayed on every pre-filled field"
- "Ambiguous field handling tested with a case file containing duplicate offence entries"
- "Re-run auto-population on case file update works without losing manually entered values"

Outcome in `docs/acceptance-mapping.md`: three **Covered**, one **Partial** — #2, because the badge is
asserted on a filled field rather than on every field a run filled, and the criterion says "every". See
`prd.md` §13 and `open-questions.md` G2.

Plus the repo's own rule this use case established:

- `mapsTo` only where the case datum genuinely is the field. A mapping that would name the wrong person
  is a defect even if it fills a box.

## Dependencies & Risks
- **Hard dependency on UC-01's template model.** `mapsTo` is a field on `FormFieldDefinition`; the
  badges render inside the same `DynamicForm`. UC-02 added no second renderer.
- **Risk, designed against: overwriting human work.** Mitigated by the pristine test — a field is
  fillable only while it is empty or still holds the exact value a previous run wrote. Asserted in both
  directions (a manual value survives; a cleared field refills).
- **Risk, designed against: guessing.** `resolveCaseField` returns `value | ambiguous | no_data`. Two
  offence dates produce `ambiguous` with a reason, never the first date.
- **Risk: date storage.** Provenance matching compares `JSON.stringify` of the stored value, so a
  `Date` object in a control instead of an ISO string would silently kill every badge. This is why
  `IsoDateAdapter` exists and why `provideNativeDateAdapter` must not be adopted (CLAUDE.md rule 7).
- **The case data is fiction.** Five seeded cases, one accessible only to a colleague so access control
  is testable, and one (Marcus Bellamy) with two offences so ambiguity is testable. Real case shapes may
  differ and may break assumptions about which fields are single-valued.
- **`Case` has no complexity, no case-type, no exhibit list.** Later use cases needing those (UC-04's
  completeness check) must not assume the case can supply them.
