# UC-10 — Form Archive & Case Attachment — Epic

## Epic

Every generated MG form document lands in a per-case archive (or the user's
personal archive when standalone), versioned append-only through amendment
cycles, retrievable but never editable in the past tense.

## Overview

UC-09 left every generated document carrying `archiveStatus: 'pending-uc10'`
— an honest stub (deviation D4) marking exactly where this use case begins.
UC-10 completes the lifecycle: on PDF generation the document is filed under
an "MG Forms" folder in the case's Documents section (V1, "Original");
re-opening a finalised form mints a new editable copy while the original
locks; the amended copy passes back through UC-08's quality gate and UC-09's
generation, producing V2 ("Amendment 1"), V3, and so on. Prior versions stay
downloadable forever — no user action deletes a version — but can never be
re-opened for editing. Standalone forms live in a personal archive and can
be linked to a case later. A version drawer lists every version with its
metadata and download link; a field-level diff shows exactly what changed
between any two versions; the archive is searchable by case, form type,
date and status.

## Business Value / Goal

A defence solicitor's paper trail is the case. Today a generated PDF is a
one-off download; nothing records which version went to whom, what an
amendment changed, or where the authoritative current copy lives. UC-10
makes the archive the system of record: the current version is always the
case's primary entry, the history is complete and append-only (a
professional-conduct requirement for criminal-case documents), and the
provenance of every change is inspectable. This is also Global DoD #9
("Version history correctly preserves all prior versions on amendment")
made real.

## Scope

- Auto-attach on generation to the case Documents section, "MG Forms"
  folder; document entry metadata (form type, version, created date/by,
  status).
- Reopen-for-amendment: new editable copy, original locked; amendments
  re-run UC-08 and UC-09; engine-assigned version numbers V2, V3…; labels
  "Original", "Amendment 1", ….
- Version history drawer: per-version metadata + download link; prior
  versions read-only; append-only (no deletion by any user action).
- Field-level diff between any two versions.
- Personal archive for standalone forms; manual case-linking later; search
  by case, form type, date, status.
- Out of scope: external case-management-system attachment (its API docs
  ticket is still open — see Dependencies), retention/erasure policy
  (needs a data-protection ruling, flagged in `open-questions.md`).

## User Stories

One story per client ticket, `docs/usecases/uc-10/stories/LER-11NN.md`,
keys LER-1172 through LER-1186 (fifteen), plus one no-client-original story
(`sensitive-retrieval.md`) covering the UC-07 boundary at archive
retrieval, on the UC-09 `sensitive-rendering` precedent: case attachment
widens who can reach a stored document, and the scope is silent at that
security boundary — silence is not permission.

## Epic-level Acceptance Criteria

- Version history preserves all prior versions through **3 amendment
  cycles** (DoD line 1, tested exactly so).
- Prior versions download but never re-open for editing (DoD line 2) —
  enforced at the API, not the interface.
- Standalone manual case-linking works from the archive view (DoD line 3).
- The case Documents section shows the correct current version as the
  primary entry (DoD line 4).
- No defendant personal data in file names or storage paths (Global DoD
  #11 — `tools/pii-scan` extended to archive surfaces).
- Every archive/attach/reopen/link write lands in the audit trail; document
  retrieval of sensitive-bearing versions re-checks the UC-07 permission.

## Dependencies & Risks

- **UC-09 document store** (merged, PRs #194/#197): content-addressed
  AES-256-GCM storage, verify-then-serve, `archiveStatus` stub. UC-10 builds
  on it and must not weaken any of its properties.
- **External case file system**: "Obtain case management system API docs
  and test access" is still open in the tracker — UC-10 attaches to the
  INTERNAL case model only; external CMS attachment is out of scope and
  flagged in `open-questions.md`.
- **"Cloud storage" wording**: the store is the encrypted volume of the
  deployed environment (LER-1202, Done, provisioned "cloud environment with
  encryption at rest"); recorded as an interpretation, not silently assumed.
- **Retention/erasure**: append-only versus data-protection erasure needs a
  human ruling — flagged now, not at PR time.
- **Risk — lineage integrity**: a forked lineage (two open amendment copies
  of one form) would make "the current version" ambiguous; the reopen
  endpoint refuses while an open amendment exists (409), and the E2E suite
  proves it.
- **Risk — values snapshots**: the diff needs per-version value snapshots;
  they contain what drafts already contain (including sensitive MG6D
  values), so the diff API applies the same caller-scoped redaction as
  every other read (UC-07 rules).
