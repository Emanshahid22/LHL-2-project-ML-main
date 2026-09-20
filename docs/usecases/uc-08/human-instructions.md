# Full-Stack / Codebase Task — UC-08 Form Review & Quality Check

Repos (single monorepo; frontend, backend and shared domain package all live here)
- Monorepo: mgs-forms — https://github.com/consultancy-outfit/LHL-2-project-ML.git — path: /root/mgs-forms
  - apps/web  Angular 20 (standalone components, signals) + Angular Material
  - apps/api  NestJS 11 + Prisma (SQLite in dev)
  - libs/shared  framework-free domain package consumed by BOTH apps — the quality engine lives here

## Git Workflow
- `git checkout ali-zulqarnain/mgs-forms && git pull origin ali-zulqarnain/mgs-forms`
- `git checkout -b mgs/uc-08-review-quality-check` — the UC working branch
- implement, commit, `git push origin mgs/uc-08-review-quality-check`, PR into
  `ali-zulqarnain/mgs-forms` when the epic's DoD is met
- NEVER the repo's `main`, and never GitHub's "Compare & pull request" banner (it targets main)
- **Deviation from the org standard's `<JIRA-TICKET-ID>` branch naming**, stated rather than
  silently contradicted: branches here are `mgs/uc-NN-<slug>` because the USE CASE is the unit of
  work and review — one epic's stories land as one reviewable branch, and per-ticket LER-NNNN
  branches are cut off it only when a reviewer asks for one ticket separately.

## Read before writing any code
- `docs/usecases/uc-08/epic.md` and `prd.md` — §4 (engine), §5 (API), §8 (business rules) are the
  contract; the four DoD lines are quoted verbatim in the epic.
- `docs/usecases/uc-08/stories/` — one file per client ticket (LER-1141–1152 + 1104 + 1106).
- `docs/usecases/uc-08/open-questions.md` — F1–F4 are absorbed findings; do NOT resolve Q1–Q7 by
  guessing, and do NOT attempt the MG5-witness rule (Q4).
- `libs/shared/src/lib/validation.ts`, `schedule.ts`, `sensitive-material.ts` — the primitives the
  engine composes. Reuse; never duplicate a rule.
- `apps/api/src/drafts/drafts.service.ts` — `update()` (REVIEWED reversion joins it), the UC-07
  guard pattern the finalise gate mirrors, and the audit contract.


## Build Order (shared library first — both apps compile against it)
- **Deviation from the org standard's frontend-mocks-first order**, stated rather than silently
  contradicted: the order here is shared engine → API → UI, because `libs/shared` is the single
  source of truth BOTH apps compile against — the domain types and rules must exist before either
  app can honestly mock or consume them, and a frontend mocked against guessed types would be
  rework, not progress.
1. `libs/shared`: the quality engine (`quality-check.ts`, pure — the four checks composing the
   UC-01/04/05/07 primitives) and the `crossRef` declaration on MG11/MG12. Rebuild after every
   change.
2. `tools` + `libs/shared`: conformance learns the crossRef rules (field- and catalogue-level),
   planted defects both directions.
3. `apps/api`: review and finalise endpoints, the REVIEWED lifecycle, the new audit actions —
   the finalise gate re-runs the engine at the boundary.
4. `apps/web`: the Review & Finalise trigger, the checklist panel, jump-to-field (wizard reveal
   included), advisory acknowledgement, the finalised read-only state and UC-09 stub.
5. Verify: `npm run build`, `npm run conformance`, `npm run orphan-scan`, `npm run test:e2e`
   (twice on dev.db, once on a fresh throwaway DB).

## Backend Rules
- Reuse existing modules/services/Prisma models; no migration (REVIEWED is a value in an existing
  string column). Nothing new rejects a SAVE — the gate is the finalise transition only.
- Every refusal audited (FINALISE_REJECTED), every run audited (QUALITY_CHECK_COMPLETED — pass or
  fail), every bypass audited with the verbatim reason (ADVISORY_BYPASSED); metadata is ids,
  counts and reasons, never field values. Audit writes never break a user action.
- The trail is written only AFTER a guarded transition has won (the finalise audit-order rule).

## Frontend Rules
- Reuse the shared renderer and the consistency-panel precedent; blocking rows carry NO
  acknowledgement control (structural, not a disabled button). Preserve every existing
  data-testid; add new ones for the panel, issues, jump, reasons and finalise.
- Blocking uses the existing danger tokens, advisory amber; UC-07's sensitive red only where the
  section itself renders. AA contrast, visible focus, loading/empty/error states.

## Third-Party Integrations
- None. No new external services, no new credentials.
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
- Quote the scope's four Definition of Done lines verbatim with the checks that prove each —
  DoD 3's blocking half by a REAL HTTP finalise attempt asserting 409.
- State plainly what was NOT built and why (the MG5-witness rule, Q4) so Done cannot be
  over-read.
- Checklist: both builds pass · conformance (with new self-tests) · orphan-scan zero ·
  full suite green ×2 dev.db + ×1 fresh DB · every existing data-testid intact ·
  dev.db restored to 27/66/0 · targets ali-zulqarnain/mgs-forms.

## Ground Rules — THE MOST IMPORTANT ON THIS TICKET
1. **One gate, one place.** Nothing new rejects a SAVE — the gate is the finalise transition, and
   it exists twice: the inert button AND the 409 from `POST /drafts/:id/finalise`, re-running the
   engine at the boundary. A gate that trusts the client's last report is not a gate.
2. **Assert only what the product knows.** Cross-form participation is a DECLARED `crossRef`
   annotation; reference parsing follows the convention the printed form's own helpText documents;
   no NLP, no invented rules, no invented fields (F1/Q4).
3. **Reuse the primitives.** Check 1/2 are compositions of UC-01/04/05/07 functions. A duplicated
   rule drifts.
4. **Severity follows semantics** (Q3's table). Target dates keep no `noFutureDate` — the UC-04
   lesson; the engine evaluates declared rules only.
5. **A timeout is not a bypass.** An incomplete check shows partial results, tells the user to
   verify manually, and blocks finalisation (Q5).
6. **Every refusal is on the record.** QUALITY_CHECK_COMPLETED on every run (pass or fail),
   ADVISORY_BYPASSED with the verbatim reason, FINALISE_REJECTED with why, FORM_FINALISED —
   all through the existing append-only path; metadata carries ids/counts/reasons, never values.
7. **Additive only.** `DraftStatus` gains `'REVIEWED'` (string column, no migration);
   `crossRef` is a new optional field property; every existing `data-testid` and all 195 existing
   checks stay green.
8. After ANY `libs/shared` change: restart the API AND curl a template to verify the served field
   count (HANDOVER §5 — tsc emits on type errors; the watcher serves stale dists silently).

## Definition of Done
- The four scope DoD lines (epic) each proven by named E2E checks — DoD 3's blocking half by a
  REAL HTTP finalise attempt asserting 409
- `npm run test:e2e` green (full suite ×2 on dev.db, ×1 on a fresh throwaway DB)
- `npm run conformance` (incl. new crossRef rules + self-tests) and `npm run orphan-scan` pass;
  both builds pass
- dev.db cleaned back to 27 drafts / 66 audit rows
