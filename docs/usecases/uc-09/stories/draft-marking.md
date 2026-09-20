# Draft marking — unverified templates are unmistakable on paper

_UC-09 PDF Generation & Formatting · epic: `docs/usecases/uc-09/epic.md` · PRD: `docs/usecases/uc-09/prd.md`_

_No client original — new story raised by this pack (rule 2 applied to rendered output) · delivering ticket: **LER-2397** · build order: story 03 of 26, stage 1._

## User Story
As a defence practice, we want every page of every generated document visibly marked as a draft while its template is not practitioner-verified, so that a clean-looking PDF of an unsigned-off field set can never be mistaken for a filing-ready official form.

## Acceptance Criteria
- Given a template whose `verification !== 'verified'` (the literal `'unverified'` AND the absent "not yet assessed" state alike), when any PDF or DOCX is generated, then every page carries the draft band ("DRAFT — template not practitioner-verified" plus the chip's explanation) in the running header.
- Given the header chip and the draft band, when either evaluates verification, then both call the same `libs/shared` predicate (hoisted from the `mgs/verification-banner-absent` fix) — screen and paper cannot disagree.
- Given a template served as `verification: 'verified'` (browser-boundary stub — no real template is verified), when it renders, then no draft band appears — sign-off alone removes it, with no render change.
- Given the band, when styled, then it uses the advisory amber tokens; red stays reserved for UC-07.

## Notes & Constraints
- The band lives in the layout layer, not the template and not client chrome — the stored bytes carry it, so preview, download and archive copies are identical.
- This is the paper half of the banner bug fixed on 24 Aug; the absent-marker case is the regression that must be pinned here too.

## Definition of Done
- Delivered against the criteria; e2e checks for both unverified states and the stubbed verified state
- Unit test: the shared predicate's truth table (absent / 'unverified' / 'verified')
- Full gate set green; every existing `data-testid` intact
