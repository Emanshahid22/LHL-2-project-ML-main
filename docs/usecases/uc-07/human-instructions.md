# Full-Stack / Codebase Task — UC-07 Sensitive Material Handling

Repos (single monorepo; frontend, backend and shared domain package all live here)
- Monorepo: mgs-forms — https://github.com/consultancy-outfit/LHL-2-project-ML.git — path: /root/mgs-forms
  - apps/web  Angular 20 (standalone components, signals) + Angular Material
  - apps/api  NestJS 11 + Prisma (SQLite in dev)
  - libs/shared  framework-free domain package consumed by BOTH apps — templates, schedule engine and
    the new sensitive-material rules live here

## Git Workflow
- `git checkout ali-zulqarnain/mgs-forms && git pull origin ali-zulqarnain/mgs-forms`
- `git checkout -b mgs/uc-07-sensitive-material` — the UC working branch; do the work here
- implement, commit, then `git push origin mgs/uc-07-sensitive-material`
- open a PR into `ali-zulqarnain/mgs-forms` when the epic's Definition of Done is met
- do NOT target the repo's `main` — placeholder, unrelated history
- **Deviation from the org standard's `<JIRA-TICKET-ID>` branch naming**, stated rather than
  silently contradicted: branches here are `mgs/uc-NN-<slug>` because the USE CASE is the unit of
  work and review — one epic's stories land as one reviewable branch, and per-ticket LER-NNNN
  branches are cut off it only when a reviewer asks for one ticket separately.

## Read before writing any code
- `docs/usecases/uc-07/epic.md` and `prd.md` — §4 (mechanism), §5 (permission model), §6 (sourced
  wording) and §8 (business rules) are the contract; the scope's four DoD lines are quoted verbatim in
  the epic.
- `docs/usecases/uc-07/stories/` — one file per client ticket LER-1126–1140, with Given/When/Then.
- `docs/usecases/uc-07/open-questions.md` — F1–F4 are findings the design already absorbed; do not
  re-litigate them, and do NOT resolve Q1–Q7 by guessing.
- `CLAUDE.md` — all ten rules bite on this UC; rule 1 (never invent a field) and rule 6 (red is
  UC-07's) especially.
- `libs/shared/src/lib/schedule.ts` and the MG6 template in `form-templates.ts` — UC-04's engine that
  UC-07 builds on. Extend; never fork.
- `apps/api/src/drafts/drafts.service.ts` — `update()` is the write path the guard joins;
  `withDerivedFlags()` is the activation source of truth.
- `apps/api/src/integrity/declaration-integrity.ts` + `libs/shared/src/lib/mg11-declaration.ts` — the
  precedent for server-owned, hash-pinned wording.


## Build Order (shared library first — both apps compile against it)
- **Deviation from the org standard's frontend-mocks-first order**, stated rather than silently
  contradicted: the order here is shared engine → API → UI, because `libs/shared` is the single
  source of truth BOTH apps compile against — the domain types and rules must exist before either
  app can honestly mock or consume them, and a frontend mocked against guessed types would be
  rework, not progress.
1. `libs/shared`: the `sensitive: true` declaration, MG6 v5 with the cited MG6D columns, the
   sensitive-material module (constants, hash pins, redaction, export builder). Rebuild after every
   change.
2. `tools` + `libs/shared`: conformance learns the sensitive-declaration rules, planted defects
   both directions.
3. `apps/api`: additive migration (permission column, acknowledgements table), boot-time wording
   integrity, the PATCH guard + merge-preserve + redaction, confirmation and export endpoints,
   the new audit actions.
4. `apps/web`: sensitive-red tokens, the section component and session service, DynamicForm
   exclusion-until-confirmed, the export link.
5. Verify: `npm run build`, `npm run conformance`, `npm run orphan-scan`, `npm run test:e2e`
   (twice on dev.db, once on a fresh throwaway DB).

## Backend Rules
- Reuse existing modules/services/guards/Prisma models — don't duplicate. The migration is
  ADDITIVE; append-only tables stay append-only (no update/delete path, structurally checked).
- The endpoint is the boundary: redaction, the confirmation guard and merge-preserve live in the
  NestJS layer; 403 for authorisation failures, 422 for shape, and every refusal audited.
- Audit writes never break a user action (existing AuditService contract); metadata carries ids,
  counts and hashes — never case content.

## Frontend Rules
- Reuse the shared DynamicForm renderer; the sensitive section is a component AROUND its fields,
  never a fork of the schedule markup. Sensitive fields get NO form control until confirmation.
- Preserve every existing data-testid; add new ones for the section, gate, PII panel and export.
- Design tokens only; the sensitive red fills the slot reserved since UC-03 and appears ONLY on
  UC-07 surfaces. Handle loading/empty/error states; AA contrast, visible focus.

## Third-Party Integrations
- None. No new external services, no new credentials. The practice-direction link is a static
  official URL, opened `rel="noopener"` — nothing is fetched from it.
## Full-Stack Coordination
- `libs/shared` IS the contract: the API's DTOs and the client's types are the same exported
  definitions, so a shape change is one edit reviewed once — never two hand-kept copies.
- After ANY `libs/shared` change: rebuild it, restart the API, and curl a template to verify the
  served field count — tsc emits on type errors and the nest watcher serves stale dists silently
  (HANDOVER §5).
- Frontend and backend for a use case land together on the UC branch as one PR; a UI that ships
  ahead of its endpoint (or the reverse) is half a feature and reviews as one.

## PR Requirements (target: ali-zulqarnain/mgs-forms)
- Include: Summary, Changes Made, Testing (which paths, which checks, edge cases), Build Notes.
- Quote the scope's four Definition of Done lines verbatim and show the check that proves each —
  the API-bypass line by a REAL HTTP call.
- State what was deliberately NOT built (prosecutor boxes, uncited wording, permission-granting
  UI) and point at the open questions that record why.
- Checklist: both builds pass · conformance (with new self-tests) · orphan-scan zero ·
  full suite green ×2 dev.db + ×1 fresh DB · every existing data-testid intact ·
  test data cleaned (27 drafts / 66 audit rows restored) · targets ali-zulqarnain/mgs-forms.


## Ground Rules — THE MOST IMPORTANT ON THIS TICKET
1. **The endpoint is the boundary.** Every UI restriction must have a server twin. The confirmation gate
   is a NestJS-layer check on the draft write path, proven by a direct HTTP call in the suite — Angular
   form state is presentation.
2. **Never send locked content to the client.** Redact sensitive values server-side for users without
   the permission; a hidden-by-CSS section is not locked.
3. **Merge-preserve or you will eat user data.** The PATCH path replaces values wholesale; a locked
   user's autosave must not erase the sensitive schedule (open-questions F1). There is an E2E check for
   exactly this.
4. **Additive only.** MG6 goes v4 → v5 by adding fields; never rename or delete an id; run
   `npm run orphan-scan`; every new field carries `provenance` AND `source` (MoG v11 citations are in
   the PRD §4.1); `verification` stays `'unverified'`.
5. **No invented wording.** Instruction sentences and PII steps ship only with citations (PRD §6);
   everything else goes to open-questions.
6. **Red is UC-07's.** Fill the reserved token slot in `_tokens.scss`; tokens only; amber and the
   validation danger palette are untouched.
7. **Append-only stays append-only.** No update/delete path for audit events or acknowledgements —
   a structural check greps for it.
8. After ANY `libs/shared` change: restart the API AND curl the template to verify the served field
   count — `tsc` emits on type errors and the watcher serves stale dists silently (HANDOVER §5).

## Definition of Done
- The four scope DoD lines (epic) each proven by a named E2E check
- `npm run test:e2e` green (full suite, twice on dev.db, once on a fresh throwaway DB)
- `npm run conformance` (incl. new sensitive-declaration rules + self-tests) and `npm run orphan-scan`
  pass; both builds pass
- Every existing `data-testid` intact (UC-04's `sensitive-material-indicator` included)
- Test drafts cleaned from `apps/api/prisma/dev.db`; the 27 real drafts untouched
