# sensitive-rendering — MG6D on paper obeys UC-07's boundaries

_UC-09 PDF Generation & Formatting · epic: `docs/usecases/uc-09/epic.md` · PRD: `docs/usecases/uc-09/prd.md`_

_No client original (like `draft-marking.md`) — the scope never says what a RENDER does at UC-07's
boundary, and silence at a security boundary is not permission. Delivering ticket: **LER-2398** · build order: with LER-1155 (layout binding), stage 2._

## User Story
As the custodian of sensitive material, we want the PDF/DOCX render to obey exactly the boundaries
UC-07 enforces on screen, so that generating a document is never a way around the locked section.

## Acceptance Criteria
- Given a caller WITHOUT the Sensitive Material Access permission, when they generate a render of a
  draft whose sensitive section is active, then the output contains NO MG6D content — the same
  server-side redaction the DTO applies (`redactSensitiveValues`), applied to the render model
  before binding; the section renders as its locked placeholder (level named, never content).
- Given a permitted caller, when they generate, then MG6D renders under its red-band section header
  — and the generation is a UC-07 access: recorded through the existing audit actions with the
  document id in the metadata.
- Given a draft whose MG6D key is ABSENT (never opened — the stored truth for most drafts), when it
  renders, then the binding handles the absent key exactly like the engine does
  (`withDormantSensitiveSections`): an active-but-empty section renders as the mandatory-empty
  state; an inactive section renders nothing.
- Given any render, when logs, job rows, filenames and storage keys are inspected, then NO MG6D
  content appears in any of them — same discipline as audit metadata (ids and counts, never
  content), enforced by the PII/content scan's rules.
- Given the non-sensitive CSV export precedent (UC-07), when the PDF of a locked caller is compared
  with it, then both exclude the same rows — one shared definition of "sensitive", never two.

## Notes & Constraints
- Reuse `sensitiveFieldIds`, `redactSensitiveValues`, `withDormantSensitiveSections`,
  `isSensitiveSectionActive` — the render must not grow its own sensitivity logic.
- Red appears in the render ONLY for this section (the on-screen rule 6, on paper).
- The DOCX path obeys the same redaction — one render model feeds both formats.

## Definition of Done
- Delivered against the criteria; e2e covers permitted vs locked renders byte-differ only in the
  MG6D section, the absent-key render, and the no-content-in-logs/keys scan
- Full gate set green
