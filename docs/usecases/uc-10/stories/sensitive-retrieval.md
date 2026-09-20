# sensitive-retrieval — MG6D at the widened retrieval boundary

_UC-10 Form Archive & Case Attachment · epic: `docs/usecases/uc-10/epic.md` · PRD: `docs/usecases/uc-10/prd.md`_

_No client original — the scope never says what RETRIEVAL does at UC-07’s boundary · delivering ticket: to be created after pack review · build order: story 11 of 16, stage 2._

## User Story
As the UC-07 boundary's keeper, we want a stored version that contains rendered MG6D content to be served only to callers holding `sensitiveMaterialAccess`, so that case attachment widens the audience without widening the permission.

## Acceptance Criteria
- Given a version minted with `containsSensitive: true`, when a case-access holder WITHOUT the permission requests download/preview, then 403 with an audit row — regardless of case access.
- Given a permitted caller, when they download it, then it serves and audits `SENSITIVE_SECTION_VIEWED` (`via: 'document-download'`) alongside `DOCUMENT_DOWNLOADED`.
- Given the diff (LER-1183), when sensitive fields changed between versions, then unpermitted callers see them redacted by the shared `redactSensitiveValues` — one redaction truth, never a fork.

## Notes & Constraints
- No client original — the scope is silent at this security boundary, and silence is not permission (UC-09 sensitive-rendering precedent, LER-2398). Decision flagged for veto in open-questions #4.
- `containsSensitive` recorded at mint from the render model; never derived by decrypting stored bytes.

## Definition of Done
- e2e: permitted/revoked matrix on a sensitive-bearing version; diff redaction check.
