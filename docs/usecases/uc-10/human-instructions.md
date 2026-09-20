# Full-Stack / Codebase Task — UC-10 Form Archive & Case Attachment

Guided archive-and-versioning layer over the merged UC-09 document pipeline:
append-only version history per form lineage, case Documents attachment,
personal archive with later case-linking, drawer + per-version download +
field-level diff, all inside the existing UC-07 sensitive boundary.

## Repos

- `consultancy-outfit/LHL-2-project-ML` — the working monorepo
  (`apps/web` Angular 20, `apps/api` NestJS 11 + Prisma/SQLite,
  `libs/shared` framework-free).
- Integration branch `ali-zulqarnain/mgs-forms`. The repo's `main` is a
  placeholder with unrelated history — never target it.

## Git Workflow

- **Deviation from the org standard, stated:** UC-sized branches, not
  per-ticket. One branch `mgs/uc-10-archive-case-attachment` carries the
  whole use case; the client's ticket keys (LER-1172–1186) are delivered
  against via stories and evidence comments, not one branch each.
- Conventional commits; every commit green on `npm run test:unit`,
  `npm run conformance`, `npm run orphan-scan`.
- PR body committed at `docs/pr-bodies/mgs-uc-10-archive-case-attachment.md`
  on the branch AND printed in chat (audit record).

## Build Order

- **Deviation from the org standard, stated:** shared engine → API → UI,
  not FE-mocks-first — the version/lineage/diff logic is data machinery the
  UI must never reimplement.
- Stage 1: schema (additive: `lineageId`, `amendedFromId`,
  `ArchivedVersion`) + shared diff/label logic + unit tests
  (stories LER-1177, LER-1182).
- Stage 2: API — mint-on-generate, reopen, locks, link, personal archive,
  serve-time sensitive re-check (LER-1172, 1174, 1175, 1176, 1181, 1184,
  1185, sensitive-retrieval).
- Stage 3: retrieval + UI — Documents section, drawer, per-version
  download, diff view, search (LER-1173, 1178, 1179, 1180, 1183, 1186).

## Backend Rules

- Additive-only schema changes (project rule 3); run `npm run orphan-scan`
  before merge.
- Version minting in the SAME transaction as the UC-09 document-store step;
  no version row without stored bytes, no stored bytes re-encrypted.
- Every archive write audited: `DOCUMENT_ARCHIVED`, `FORM_REOPENED`,
  `CASE_LINKED` (+ existing download/integrity actions). Reads are not
  audited (writes-only trail).
- All locks enforced at the API (409), never only in the UI.
- No DELETE surface on versions; no endpoint accepts a version number.
- PII rules: nothing case-derived in filenames, storage keys, labels, audit
  metadata or search params — extend `tools/pii-scan` to the archive
  surfaces and keep it fail-closed in CI.

## Frontend Rules

- Standalone Angular + Material, signals; design tokens only; amber =
  advisory, red reserved for UC-07 sensitive UI (rule 6).
- Dates DD/MM/YYYY display, ISO storage via `IsoDateAdapter` (rule 7).
- Preserve every existing `data-testid`; new surfaces get their own.
- Prior versions get NO edit affordance anywhere; the API refusing is the
  guarantee, the UI not offering is the courtesy.
- The Documents section and drawer display DTO fields verbatim — no client
  derivation of version numbers or labels.

## Third-Party Integrations

- None new. Storage stays the UC-09 encrypted store ("cloud storage"
  interpretation: `open-questions.md` #1). External case-management-system
  attachment is BLOCKED on its open API-docs ticket (`open-questions.md`
  #2) and out of scope.

## Full-Stack Coordination

- The renderer is UNTOUCHED: UC-10 never re-renders old bytes, and the
  render-regression baselines (CI-authoritative since PR #197; local runs
  advisory) must not change in this UC. If a baseline drifts, something is
  wrong — stop.
- After any `libs/shared` change, restart the API and curl a template
  (stale-dist trap, HANDOVER gotcha).
- The frozen Nadia Kowalczyk UC-09 fixture is read-only for this suite: the
  new spec gets its OWN fixture case, registered in `e2e/FIXTURES.md`.

## PR Requirements (target: ali-zulqarnain/mgs-forms)

- One PR from `mgs/uc-10-archive-case-attachment`; audit-ready body quoting
  the four UC-10 DoD lines VERBATIM plus Global DoD #9/#11/#12, with every
  deviation and not-built item stated (the open-questions file is the
  seed list).
- Evidence per client ticket key posted to tasks-ml after push (read-back
  verified); status flips ONLY after Ali's merge.
- CI must be green before merge — PR #194's merged-while-red breach is not
  a precedent, it is the counter-example (recorded in PR #197's body).

## Ground Rules

- dev.db baseline before any test writes: **35 drafts / 76 audit / 0 acks /
  0 docs / 0 jobs** — verify first, abort on mismatch. `E2E_DRAFT_LOG`
  cleanup discipline; snapshot ids before, delete only the difference.
- Kill anything on :3000/:4200 before the fresh-DB verification leg;
  `set -o pipefail` when piping Playwright.
- tasks-ml: offset pagination only; `agentMode` write defect — never rely
  on it; no `dueDate`; read-back is the only verification.
- Human rulings queue EARLY: `open-questions.md` #1–#4 go to the human
  queue at pack review, not at PR time.
- Never invent fields or wording (rules 1/10); legal calls escalate
  (rule 8) — retention/erasure is one (`open-questions.md` #3).

## Definition of Done (scope document, quoted verbatim)

> - Version history correctly preserves all prior versions on amendment —
>   tested through 3 amendment cycles
> - Prior versions are accessible for download but cannot be re-opened for
>   editing
> - Standalone form manual case-linking works correctly from the archive
>   view
> - Case file Documents section shows the correct current version as the
>   primary entry
