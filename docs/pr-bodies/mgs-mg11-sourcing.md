# feat(mg11): per-field sourcing from the genuine 2013 specimen — 12 documented, 1 likely, 2 inference

**Branch** `mgs/mg11-sourcing` → `ali-zulqarnain/mgs-forms` · **Stacked on
`mgs/verification-banner-absent` — merge that first.** (Giving MG11 the literal marker makes the
banner appear on it, which the old inverted test asserted must not happen; branch A replaces that
test, and this branch moves its absent-state fixture to MG5, which still has no marker.)

Repo rule 1, verbatim (CLAUDE.md): "**Never invent a form field.** Every field records `provenance`
(`documented`/`likely`/`inference`)." MG11's 15 fields predate the research programme and were the
largest block still carrying no provenance at all. This PR sources them against the genuine 2013
specimen — <https://www.bbpolice.uk/uploads/MG11.pdf>, the same source family as MG6's and MG14's
citations — and changes **nothing** about the field set.

## What changed

- `libs/shared/src/lib/form-templates.ts` — MG11 only, metadata only: `templateVersion` 5 → 6 (with
  the version comment), `verification: 'unverified'` (which deliberately moves MG11 into
  conformance's **structural+sourcing tier** — now 7 of 11 templates are assessed), and per-field
  `provenance`, with a printed-box citation on every documented field:
  - **Documented (12):** witnessName, witnessDob, witnessOccupation, witnessAddress, witnessPhone,
    statementDate, statementText, declarationConfirmed, signatureName, statementTakenBy,
    witnessConsentsCourt, specialMeasures. Where one field flattens several printed boxes (address +
    postcode; three phone boxes) or captures half a box (date-of-birth without place; date without
    time-and-place), the citation says so instead of rounding up.
  - **Likely (1):** specialMeasuresApplied — the specimen asks about assessment *need* (submit MG2),
    never about measures applied.
  - **Inference (2):** title (no printed Title box exists) and exhibitsReferenced (**the 2013 MG11
    has no exhibits box** — exhibits are cited inside the narrative by convention; the field is our
    structured convenience and what UC-08's crossRef reads). Neither claims a source it cannot cite.
- `docs/mg-form-research-findings.md` — a new **§ MG11** entry, explicitly labelled a sourcing pass
  rather than a rebuild: the specimen's identity, the 12/1/2 split, and the full list of printed
  boxes deliberately NOT modelled (URN box, the witness-consent tick block, ethnicity code,
  non-availability dates, parent/guardian block, and more — absence is allowed; adding any is its
  own decision). The Totals section notes this pass is excluded from the research programme's
  numbers.
- `e2e/mg11-sourcing.spec.ts` (new, 2 checks): the assessed state is pinned — version ≥ 6,
  `verification: 'unverified'`, 15/15 fields with valid provenance, **the inference set pinned to
  exactly `['exhibitsReferenced', 'title']` and likely to `['specialMeasuresApplied']`** (so none of
  the three can quietly acquire a claim it cannot cite), every documented field citing the 2013
  specimen; and the additive guard — every original field id survives.
- `e2e/mg4-charge-sheet.spec.ts` — the absent-marker regression test's fixture moves MG11 → MG5
  (MG11 now carries the literal marker) and additionally asserts MG11's chip on the wizard shell, so
  both unverified states stay covered.

## What deliberately did NOT change

- **No field added, renamed, removed or re-typed** — `npm run orphan-scan` clean; the 24 live MG11
  drafts are unaffected (`templateVersion` is recorded, not honoured, and v6 is metadata-only).
- **The declaration constant and its SHA-256** — untouched. Its three-way mismatch with this same
  specimen is a recorded practitioner decision (LER-1200;
  `docs/answers/template-sourcing-evidence-2026-08.md` §3), not a sourcing edit.
- **No verification upgrade** — `'unverified'` is a statement that the template is now *assessed*,
  not signed off (standing decision 4: MG11 is the quality bar and still not practitioner-verified).
- The unmodelled printed boxes stay unmodelled — recorded in the research findings, per rule 1's
  "write an open question instead".

## Verification

- `npm run conformance` — **MG11 PASS (structural+sourcing)**, 68 self-tests, 0 errors 0 warnings.
- `npm run orphan-scan` — no orphaned values.
- Targeted: `mg11-sourcing` + `uc03-mg11-wizard` + `mg4-charge-sheet` — 33/33.
- Both builds; full Playwright suite (219 on this branch: 216 + branch A's 1 + these 2) ×2 on dev.db
  + ×1 on a freshly seeded throwaway DB, fresh servers, pipefail — results quoted in the PR
  conversation.
