## User Story
As a defence solicitor completing a case file, I want the MG4 template to carry the real boxes of the
Charge Sheet, so that what I fill in on screen matches the form the court and CPS actually work from.

## Acceptance Criteria
- Given the MG4 template today has 8 fields against MG11's 15 and MG5's 13, when the template is
  rebuilt from `docs/mg-form-research-findings.md`, then MG4 carries the fields marked **documented**
  there (36 of its 37 researched fields are documented; 1 is "likely"; none are guesses).
- Given every existing MG4 field id (`defendantName`, `defendantAddress`, `chargeWording`,
  `chargeDate`, `chargingOfficer`, `courtName`, `hearingDate`, `bailConditions`), when the template is
  changed, then none of those ids is renamed or removed — there is a live MG4 draft whose values are
  stored under them and renaming an id destroys the value on the next autosave.
- Given a field is added, when it is written, then it carries `provenance` reflecting the research
  confidence, and any field the research marks "guess" is left out and recorded as an open question
  instead.
- Given no practitioner has signed MG4 off, when the template is saved, then it is marked
  `verification: 'unverified'` and is not presented anywhere as filing-ready.
- Given the field set has changed, when the template is saved, then `templateVersion` is bumped from
  1 to 2.
- Given a case datum genuinely is the field's value, when `mapsTo` is set, then it uses only a valid
  `CaseFieldPath`; the existing five mappings (`defendantName`, `defendantAddress`, `charges`,
  `courtName`, `nextHearingAt`) are preserved, and nothing that is not the defendant is mapped to
  defendant data.
- Given a date box cannot be in the future, when it is added, then it carries
  `validation: { noFutureDate: true }` and renders through the shared UK datepicker as DD/MM/YYYY.
- Given the templates are the single source of truth, when the change is complete, then
  `npm run build -w @mgs/shared`, `npm run build` and `npm run test:e2e` (95 checks) all pass and no
  existing `data-testid` has changed.
- Given the API caches templates at startup, when `libs/shared` is rebuilt, then the API is restarted
  before the change is verified through the UI.

## Notes & Constraints
- Only MG4. Do not touch the other ten templates.
- Field sets come from `docs/mg-form-research-findings.md` (MG4 section: 37 fields, verdict
  *usable-as-draft*, fabrication risk *low*, all 37 corroborated by an independent verifier against a
  genuine specimen). `docs/review/mg-field-review.csv` holds the same data in tabular form.
- Edit `libs/shared/src/lib/form-templates.ts`; the type system is
  `libs/shared/src/lib/form-template.types.ts`. Field types available: text, textarea, date, time,
  number, select, checkbox. **There is no repeating group** — MG4's charge list must be approximated
  flatly with a comment, not faked as a table.
- MG11 and MG5 in the same file are the quality bar for `helpText` depth and validation coverage.
- The research notes the real form's printed heading is "CHARGE(S)", that the Manual of Guidance calls
  it the "Charge record", and that CPS CMS calls it "MG 4 - Charges" — the verifier even confirmed a
  genuine typo ("Charge acepted") on the specimen. Use the official naming, not the typo.

## Definition of Done
- Delivered against the acceptance criteria above
- `npm run test:e2e` green (95 checks) and both builds pass
- Any drafts created while testing deleted from `apps/api/prisma/dev.db`
- PR opened into `ali-zulqarnain/mgs-forms` — never merged
