# MGs Forms — working notes for Claude Code

Guided completion of the UK **MG forms** (police case file) for defence solicitors.
Angular 20 + Material · NestJS 11 + Prisma (SQLite in dev) · `libs/shared` holds the eleven form
templates consumed by **both** apps — one source of truth for rendering, auto-fill and future PDF.

**Read `docs/HANDOVER.md` first** — full history, decisions and roadmap. This file is the short
version. Scope: <https://lhl-agents.netlify.app/mg-forms-scope/> · Jira project **LER**.

## Status

**UC-01 to UC-08 are all built, proven and merged** into `ali-zulqarnain/mgs-forms` (HEAD `19bc07a`,
the PR #149 Railway-staging merge; since then PR #184 — the UC-08 engine remediation for
LER-1270..1272 — and PR #185, the Railway staging record, have merged). Suite **219 checks**
(220 once `mgs/verification-banner-absent`
merges); `npm run conformance` 68 self-tests over 11/11 templates plus the UC-06 registries;
`npm run orphan-scan` zero orphans. Railway staging is live — `docs/deployment/railway-staging.md`.

| UC | Title (official, from the scope) | Merged | Spec |
|---|---|---|---|
| UC-01 | Form Selection & Initiation | early work + PR #115 | `uc01-form-selection.spec.ts` — 21 |
| UC-02 | Auto-Population from Case File | early work + PR #115 | `uc02-autofill.spec.ts` — 23 |
| UC-03 | MG11 Witness Statement Wizard | `7c36d24` | `uc03-mg11-wizard.spec.ts` — 21 |
| UC-04 | MG6 Unused Material Schedule | PR #85 | `uc04-mg6-schedule.spec.ts` — 22 |
| UC-05 | Field Validation | PR #85 | `uc05-field-validation.spec.ts` — 22 |
| UC-06 | Legal Language Assistance | PR #109 | `uc06-legal-language.spec.ts` — 25 |
| UC-07 | Sensitive Material Handling | PR #139 (+ fix in #148) | `uc07-sensitive-material.spec.ts` — 20 |
| UC-08 | Form Review & Quality Check | PR #142 + fix PR #144 | `uc08-review-quality.spec.ts` — 20 |

Each carries a documentation pack in `docs/usecases/uc-0N/` and is mapped criterion by criterion in
`docs/acceptance-mapping.md` (28 Covered, 3 Partial, 1 Blocked — the Blocked one is the MG11 declaration
wording, which needs a practitioner, not code, and now carries evidence of a three-way mismatch with the
2013 specimen: `docs/answers/template-sourcing-evidence-2026-08.md` §3).

**Not started**, with the **official** titles from the scope document
(<https://lhl-agents.netlify.app/mg-forms-scope/> — always the source of truth for numbering):
**UC-09 PDF Generation & Formatting**, UC-10 Form Archive & Case Attachment. Note the scope's "HMCTS"
naming for UC-09 is itself wrong — MG forms are Home Office/NPCC, and no official central template
source exists (LER-1198 re-opened on that evidence).

Beware numbering drift: PDF output is **UC-09**, not UC-05. The audit trail (writes only) is not a
numbered use case; the README's older "UC-08" label for it predates the scope.

**Templates:** six rebuilt from sourced research with full per-field provenance — MG3 (59 fields), MG4 (36),
MG6 (**48** top-level fields — LER-1239's rebuild plus UC-07's MG6D section; v5, 55 counting group columns),
MG12 (7), MG15 (18), MG16 (19). Five are not: MG1, MG2, MG5, MG11, MG14. **None is practitioner-verified** —
precisely: the six rebuilt read `verification: 'unverified'` and the five legacy ones carry **no
verification property at all** ("not yet assessed"); the header banner covers both states (the strict
`=== 'unverified'` check that silently skipped the five was a bug, fixed on
`mgs/verification-banner-absent`). Deliberate, not an oversight.

## Branches (shared repo — namespace everything)

- `ali-zulqarnain/mgs-forms` — **integration branch**. Never target the repo's `main` (placeholder,
  unrelated history).
- `mgs/uc-NN-<slug>` — UC markers (01–03, read-only) and UC working branches from UC-04 on.
- `LER-NNNN` — per-ticket branches (DevOpsBot convention: branch named exactly the ticket id).
- The old stacked merge order (`LER-1034 → 1035 → 1039 → 1038 → 1033 → guardrails-conformance`) is
  **spent** — all of it is merged. New work branches from `ali-zulqarnain/mgs-forms` directly.

## PR bodies are part of the audit record

Write every PR body to `docs/pr-bodies/<branch-slug>.md` **in the repo** (committed on the PR's own
branch), never only to the session scratchpad — `/tmp` is cleared with the session, and the body is
where the DoD quotes, the deviations and the not-built decisions live. ALSO print the body into the
chat so it can be copied without a file lookup. The bodies of PRs #139/#142/#144/#147 were rescued
from a live session into `docs/pr-bodies/`; earlier ones exist only on GitHub.

## Commands

```bash
npm run dev            # api :3000 + web :4200
npm run test:e2e       # Playwright — the whole suite
npm run conformance    # template house-style gate (also in CI)
npm run orphan-scan    # draft values stranded by template id changes; exit 1 = would strand data
                       # (orphan-scan and npm audit join CI once mgs/build-safety-net merges)
```

## Rules that must not be broken

1. **Never invent a form field.** Every field records `provenance` (`documented`/`likely`/
   `inference`). If evidence is missing, write an open question in `docs/stories/` instead. A
   plausible invented box on a criminal-case document is a professional-conduct risk.
2. **Unverified means unverified.** Templates carry `verification: 'unverified'` until a
   practitioner signs off; the form header says so and it must never read as filing-ready. MG11 and
   MG5 are the quality bar but are **not** practitioner-verified — do not mark them verified.
3. **Additive-only template edits.** Never rename or delete a field id: `valuesJson` is keyed by id
   and the renderer ignores unknown keys, so renaming silently strands user data on the next
   autosave (1.5 s). Run `npm run orphan-scan` before any id change.
4. **`mapsTo` only where the case datum genuinely IS the field.** An MG11 witness is not the
   defendant; MG16 `subjectName` stays unmapped pending a legal ruling. Never map signatures or
   officers who aren't the OIC.
5. **Preserve every `data-testid`** — the suite depends on them. MG1 is the fixture form for ~20
   assertions, so it cannot be deleted even though it is not in the current MG suite.
6. **Colour:** amber = advisory; **red is reserved for UC-07 sensitive material**. Design tokens
   only (`apps/web/src/styles/_tokens.scss`) — never hardcode colour.
7. **Dates:** DD/MM/YYYY display, **ISO `YYYY-MM-DD` storage** via `IsoDateAdapter`. Do not switch
   to `provideNativeDateAdapter` — Date objects in controls break auto-fill provenance matching.
8. **Legal/designation calls are not implementation choices.** MG2 → Special Measures Assessment,
   MG14 → Conditional Caution, MG16 → possibly `ebc003`: document and escalate, do not act.
9. **Clean up test data.** E2E creates drafts; snapshot ids before, log created ids via
   `E2E_DRAFT_LOG`, delete only the difference. The user's own drafts must survive.
10. **Never invent phrasing (UC-06).** A suggestion the user can Insert becomes the witness's signed
    words, so a prompt may carry `insertText` only when its provenance is `documented` with a real
    source — `canProposeVerbatim()` at runtime and `npm run conformance` in CI. `STANDARD_PHRASES`
    ships **empty** on purpose. This is rule 1 applied to wording rather than fields, and it is
    stricter: a missing field is visibly empty, while invented wording reads as authoritative.

## Gotchas

- **Narrative fields are declared, never inferred.** 57 textareas exist across the eleven templates and
  most are not prose (`witnessAddress`, `chargesList`). `narrative: true` on the field is what earns the
  highlight layer and the UC-06 assistant; conformance fails it on anything but a top-level textarea.
- **`NarrativeField` is reached two ways and must never be forked** — the MG11 wizard passes it
  explicitly, and `DynamicForm` renders it for any declared narrative (MG5's four prose boxes).
- **The nest watcher does not pick up `libs/shared` rebuilds** — restart the API or it serves stale
  templates. Worse: `tsc` emits despite type errors, so a failed build can leave a half-written
  `libs/shared/dist` that the API serves silently (MG6 once answered `templateVersion: 4` with 35 fields
  when the source said 47). The declaration-integrity line proves the PROCESS is fresh, not the templates —
  after any `libs/shared` change, curl the template and check the field count.
- `templateVersion` is recorded but **not honoured** (`form-fill-page.ts` loads by `formCode`), so
  old drafts render against the newest field set. README's data-model claim still says otherwise.
- MG11 uses a **wizard shell around** the shared renderer (`visibleFieldIds`) — never fork it.
- MG11's statutory declaration is a hash-pinned constant; the **API refuses to boot** on mismatch,
  and no endpoint accepts declaration wording from a client.
- The type system has **no repeating group** — tabular forms (MG12, MG6C/D) are flat
  approximations with a comment. Do not fake a table.
- Icons are hand-drawn inline SVG on purpose — an icon font that fails to load renders icon *names*
  as visible text and pollutes assertions.
- DevOps Bot: `humanInstructions` is authoritative and read first; its validator rejects stories
  without As-a intent + Given/When/Then; `agentMode: true` blocks on a WhatsApp reply that may never
  come. It opens PRs and **never merges**.
- tasks-ml API write contract (corrected 22 Aug 2026): `PUT /tasks-ml/{id}` honours `status`,
  `description` AND `humanInstructions` (JSON or multipart, raw or Bearer auth). `agentMode` is
  discarded under every encoding — a field-specific backend defect, not parsing or auth. Every
  write returns 202 whether or not it took, and a humanInstructions-only write does not bump
  `version`, so **read-back is the only verification**. Use `offset` pagination (`page` is
  ignored); DELETE returns 403.

## Ticket creation defaults (tasks-ml)

Set `humanInstructions` **at creation** (`POST /tasks-ml`), as the UC-04 block (LER-1080–1093) did —
the payload is the UC pack's `human-instructions` file, so no backfill run is ever needed again.
Continue to omit `dueDate` (silently ignored) and never rely on `agentMode` (defect above; created
tickets land `true` and need the UI toggle). `estimatedHours`, `slaTarget` and `points` are unset
across the whole project — whether to populate them is an open product question, not a default.

## Pack templates from UC-09 onward (do not rewrite UC-01–08)

Future packs use the org's exact section headings. **Epic** — seven sections:
`## Epic` · `## Overview` · `## Business Value / Goal` · `## Scope` · `## User Stories` ·
`## Epic-level Acceptance Criteria` · `## Dependencies & Risks`.
**PRD** — fourteen numbered sections:
1 Summary · 2 Scope requirements (verbatim) · 3 What already exists · 4 Mechanism ·
5 API surface · 6 Data Model & Schema · 7 Data Flow & Integrations · 8 Client ·
9 Security & Performance · 10 Failure modes · 11 Business rules · 12 E2E plan ·
13 Dependencies, Risks & Rollout · 14 Out of scope / deferred.
UC-08's PRD omitted Data Model & Schema, Data Flow & Integrations, Security & Performance, and
Dependencies/Risks/Rollout — recorded, not rewritten. **UC-09's PRD must carry all fourteen**:
Security & Performance is load-bearing there because UC-09's DoD claims AES-256 at rest and
PII-free storage paths, which need a designed answer, not a checkbox.
Human-instructions files carry the standard's named sections (Repos, Git Workflow, Build Order,
Backend Rules, Frontend Rules, Third-Party Integrations, Full-Stack Coordination, PR Requirements,
Ground Rules) with this project's two deviations stated explicitly in Git Workflow (UC-sized
branches, not per-ticket) and Build Order (shared engine → API → UI, not FE-mocks-first).
- The sandbox classifier intermittently blocks git writes and outbound calls — hand the exact
  command to the user rather than working around it.
- **Kill anything on :3000/:4200 before the throwaway-DB verification leg** — a leftover dev server gets
  reused (`reuseExistingServer: true`) and the suite's direct-SQLite helper then reads a different
  database than the API writes; and never pipe `npx playwright test` into `tail`/`grep` without
  `set -o pipefail`. Both bit on 24 Aug — full write-up in HANDOVER §5.
