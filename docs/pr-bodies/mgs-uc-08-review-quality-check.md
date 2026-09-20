# UC-08 — Form Review & Quality Check

Branch `mgs/uc-08-review-quality-check` @ `c7b75a4`, cut from `ali-zulqarnain/mgs-forms` @ `9d47a9d`
(the PR #139 merge). Target: `ali-zulqarnain/mgs-forms`. Three commits: the authoring pack
(`c4518e1`), the delivering-ticket mapping (`ed66698`), the build (`c7b75a4`).

Scope source of truth: <https://lhl-agents.netlify.app/mg-forms-scope/> (UC-08). Client tickets
**LER-1141–1152** plus the two originals reserved for UC-08 since the UC-04/05 cycle — **LER-1104**
(cross-form rules) and **LER-1106** (advisory override with reason), both folded into the pack with
their live descriptions honoured. Delivering tickets **LER-1255–1268**; the client→delivering
mapping is recorded up front in `docs/usecases/uc-08/open-questions.md`.

## Summary

**Review & Finalise** runs a four-check quality suite server-side and presents every finding as a
grouped checklist — Blocking / Advisory / Could-not-complete — each row carrying its description,
the affected field, and **Jump to field**. Blocking issues have exactly one exit: fixing the form.
Advisories bypass only with a free-text reason recorded verbatim in the audit trail. **Finalise is
gated twice**: the button stays inert, and `POST /drafts/:id/finalise` re-runs the whole engine at
the boundary and refuses (409, audited) while any blocking issue, incomplete check, or
unacknowledged advisory stands — the UC-07 discipline applied to the last transition of a form's
life. A clean review sets `REVIEWED`; any edit reverts it (a review attests the values it saw);
`FINALISED` is read-only with the UC-09 handoff deliberately stubbed.

The engine **composes** the primitives the earlier use cases shipped — UC-01 completeness, UC-04
group completeness, UC-05's declared date rules, UC-07's activation and acknowledgement state — and
asserts only what the product knows. Four findings shaped it (recorded in the pack before any
code): MG5 has no structured witness field, so LER-1104's literal example is recorded as needing
evidence rather than faked with name-extraction (Q4); nothing new blocks a save; a review cannot
survive an edit; and the engine runs server-side because Check 3 needs the case's sibling drafts
and Check 4 the acknowledgement table.

## Definition of Done — quoted verbatim, with the checks that prove each

> **"Quality check catches all required field types across 3 different MG form types"**
- `Check 1 catches every required field type, across MG6, MG11 and MG3` — the test walks each
  template's own required list and separately asserts that text, textarea, date, select, checkbox
  AND repeating group were all exercised; every finding blocking (the scope's "red if not").
- `fixing a missing required field clears exactly its issue on the next run`.

> **"'Jump to field' links correctly navigate to and highlight the relevant field"**
- `Jump to field scrolls to, focuses and highlights the target on a flat form` — in-viewport,
  focused, highlighted, and the highlight fades (it announces, it does not decorate).
- `Jump reveals the MG11 wizard step that holds the field before highlighting it` — cross-step
  navigation, not just within the visible step.
- `a jump whose target the viewer cannot see lands on the sensitive section block` — the UC-07
  locked case gets the nearest honest destination.

> **"Advisory issues can be acknowledged and bypassed; blocking issues cannot"**
- Blocking half, at the API as the brief requires: `a real HTTP finalise attempt with blocking
  issues outstanding is refused and audited` — 409, status unchanged, `FINALISE_REJECTED` on the
  record — plus `blocking rows carry no acknowledgement control at all` (the distinction is
  structural, not a disabled button).
- Advisory half: `an advisory is bypassed only with a reason, which reaches the audit trail
  verbatim` — refused bare (409), refused with a whitespace reason (409), then finalised through
  the UI with the reason asserted **verbatim** in `ADVISORY_BYPASSED` (LER-1106's "written to the
  audit log", literally).

> **"Cross-reference consistency check correctly flags mismatched exhibit numbers across linked
> forms"**
- `an exhibit cited on one form but defined on no list is flagged, and clears when the list catches
  up` — two drafts on one case; the missing reference named in the advisory; a defined reference
  not flagged; the mismatch clears by completing MG12 without touching MG11.
- `URN divergence across one case's forms is blocking; agreement clears it` — one case, one URN.

## Beyond the DoD lines

- **Trigger & pre-condition (LER-1141):** one entry point; an empty draft cannot be reviewed —
  API 422 and a disabled trigger, both asserted.
- **Outcome logging (LER-1151):** `every run is audited — failing and passing alike, with
  per-check outcomes` — the COMPLETENESS_CHECKED principle at review scale.
- **REVIEWED lifecycle:** set by a clean run, reverts on edit with `reviewInvalidated: true` in the
  save's audit metadata; reviewed drafts stay on the work queue.
- **Check 4 (LER-1145):** blocks while MG6D handling is unconfirmed, clears the moment a UC-07
  confirmation exists — asserted both ways. Review also caught and fixed a real gap: a
  never-opened MG6D stores no key at all, which the engine now treats as the empty mandatory
  schedule it is.
- **Finalised state:** read-only in the UI AND at the API (409 on edit), `FORM_FINALISED` audited,
  UC-09 stub shown ("PDF generation arrives with UC-09") — nothing of UC-09 built.
- **Timeout honesty (Q5):** each check runs in its own 4s budget; the partial-results UI (guidance,
  per-check status, Finalise blocked) is proven via route interception, since a real timeout
  cannot be forced honestly in E2E; the server side of the same rule is the engine re-run every
  finalise performs.
- **Standalone drafts:** Check 3 reports clean *with a note* — "nothing to compare" is not
  "consistent".
- **`crossRef` declaration (LER-1104):** `{ vocabulary: 'exhibitReference', role: defines|cites }`,
  declared on exactly the two fields whose printed-form helpText documents the same "JS/1"
  convention (MG12 `exhibitEntries`, MG11 `exhibitsReferenced`); the parser honours only that
  convention and ignores prose. Conformance enforces vocabulary/role/type and — catalogue-wide —
  that a cited vocabulary is defined somewhere, with planted-defect self-tests both directions.

## What was deliberately NOT done

- **The MG5-witness rule** (LER-1104's own example): MG5 has no structured witness field, and this
  project neither invents boxes (rule 1) nor parses prose for names. Recorded as Q4 with the two
  honest ways it could become real.
- No PDF (UC-09), no archive (UC-10), no change to save-path semantics (a draft is still allowed
  to be wrong), no severity re-banding without a practitioner (Q3), no advisory persistence across
  runs (Q7 records why).

## Testing

```
npx playwright test                      213 passed  (dev.db, run 1)
npx playwright test                      213 passed  (dev.db, run 2)
npx playwright test                      213 passed  (freshly migrated + seeded throwaway DB,
                                                      API :3400 / web :4400, then torn down)
npm run conformance                      EXIT=0  self-tests: 68 passed (was 63; 5 planted-defect
                                                 tests for the crossRef rules)
npm run orphan-scan                      EXIT=0  27 drafts scanned, no orphaned values
npm run build (api + web)                EXIT=0
```

Suite 195 → **213** (+18 UC-08 checks). Every pre-existing check green; every pre-existing
`data-testid` intact. No migration: `REVIEWED` is a value in an existing string column. MG11 v5 and
MG12 v4 are annotation-only bumps — no field added, renamed or removed; orphan-scan clean.

Test hygiene: 691 suite-created drafts (with 1,590 audit rows and 48 acknowledgement rows) removed
via the E2E draft log; **dev.db verified back at 27 drafts / 66 audit rows / 0 acknowledgements**.
Worth knowing for review: the case-wide Check 3 is sensitive to what other suites leave on a seeded
case — UC-02 leaves an "(edited)" defendant name on Daniel Foster and UC-05 a `not-a-urn` on Liam
Okafor, which UC-08's engine **correctly flags as blocking** — so the UC-08 tests run their
case-linked scenarios on Sofia Renard (the unpolluted case) with run-unique exhibit tokens.

## Checklist

- [x] The four scope DoD lines quoted verbatim, each proven by named checks
- [x] DoD 3's blocking half proven by a real HTTP finalise attempt (409 + audited refusal)
- [x] Gating server-side: finalise re-runs the engine at the boundary; UI is presentation
- [x] Engine composes UC-01/04/05/07 primitives — no rule duplicated
- [x] Declared, never inferred: crossRef annotations; no NLP; MG5-witness rule recorded, not faked
- [x] Target dates carry no noFutureDate (UC-04 lesson respected in Check 2)
- [x] Every outcome audited via the append-only path; bypass reasons verbatim
- [x] Additive only; templateVersion bumps annotation-only; orphan-scan clean
- [x] Suite ×2 dev.db + ×1 fresh DB (213/213/213); conformance 68; both builds green
- [x] dev.db restored to 27/66/0; the 27 real drafts untouched
- [x] Targets `ali-zulqarnain/mgs-forms`, not `main` (and not the GitHub banner)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
