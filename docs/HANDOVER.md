# MGs Forms — project handover and status

Written 18 Aug 2026, on `ali-zulqarnain/mgs-forms` at `d92143e`. This is the full record of what
was done, how, why, and where the project is going. `CLAUDE.md` at the repo root is the short
version loaded into every Claude Code session; this file is the narrative behind it.

---

## 1. What this project is

A legal-document module for UK defence solicitors: guided completion of the standardised **MG
forms** that make up a police case file. Angular 20 + Material frontend, NestJS 11 + Prisma API,
and a framework-free `libs/shared` domain package holding the eleven form templates that both apps
consume — one source of truth for rendering, validation, auto-fill and (later) PDF layout.

Scope source of truth: <https://lhl-agents.netlify.app/mg-forms-scope/>. Jira project **LER** via
DevOps Bot. The GitHub repo (`consultancy-outfit/LHL-2-project-ML`) is **shared with other
workstreams**; this project's branches are namespaced (see README "Branch map").

## 2. What was done, how, and why — in order

### Phase 1 — MG16 mapping question (commit `d5178cf`)
**What:** asked to auto-fill MG16 `subjectName` from the defendant; instead documented why it must
stay unmapped. **Why:** a s.100 CJA 2003 notice concerns a *non-defendant*, so prefilling the
defendant would name the wrong person on a bad-character notice. **Later development:** research
(phase 8) suggests MG16 may be defendant-only and the current six fields may describe MoJ form
`ebc003` — meaning this premise may be false. Deliberately *not* reversed: it is a legal judgement,
parked in `docs/stories/LER-1039-open-questions.md`.

### Phase 2 — dashboard restructure + first-ever tests (`79d6965`)
**What:** form picker moved above the fold (was 1332px down a 2349px page); drafts became a work
queue (filter, sort, view-all, per-draft "N of M required" progress); **the repo's first test
suite** (Playwright, 55 checks) and harness. **Why:** UC-01's entry point was sinking off screen as
drafts accumulated; and the claimed "19 UC-01 / 33 UC-02 checks" turned out not to exist — the
client scope lists **4 acceptance criteria per UC**, so the suite was written from documented
behaviour and the discrepancy recorded rather than papered over.

### Phase 3 — GitHub + CI (`6865257`)
**What:** remote wired to the shared team repo, integration branch `ali-zulqarnain/mgs-forms`
(repo `main` is a placeholder with unrelated history — never target it); GitHub Actions running
install → seed → build → full E2E on every push. **Why:** nothing stopped a `libs/shared` change
silently breaking UC-01/02. **How:** Playwright `webServer` split to wait on both :3000 and :4200 —
a cold Nest raced the first request on clean runners.

### Phase 4 — coverage gaps closed (`3cf7644`) — **UC-01 and UC-02 completion point**
**What:** six documented behaviours had no test behind them (denied case-link banner, 409 stale
save, access control by list *and* by direct id, no-data note, failed-autofill degradation). All
six already worked; now guarded. Audit-trail writes verified directly in the DB
(`FORM_INITIATED`, `DRAFT_SAVED`, `AUTO_POPULATED` with documented metadata) since there is no read
read endpoint exists (audit read is unnumbered in the scope). **Why this is the completion marker:** a UC is not complete until proven.

### Phase 5 — UC-03: MG11 witness statement wizard (`7c36d24`)
**What:** four-step wizard (details / narrative / declaration / signature) as a shell *around* the
shared renderer (`visibleFieldIds`), never a fork. Declaration integrity: `MG11_DECLARATION`
constant + SHA-256 pin, **API refuses to boot on mismatch**, 422 on any client-supplied
`declarationText` or non-boolean confirmation. Hearsay/opinion flagging: five scope phrases,
word-boundary + case-insensitive, amber underlines via a backdrop div metric-matched behind a
transparent textarea, strictly non-blocking, phrases recorded in `DRAFT_SAVED` audit metadata.
Vulnerable witness: under-18-at-statement-date or special-measures selection reveals a field and a
persistent header chip; derived `isVulnerableWitness` stored in draft values for UC-09 PDF.
**Bugs found by verification, not review:** backdrop had to layer *above* the textarea for
tooltips (click-through except marks); declaration rendered twice (checkbox label *was* the
wording); required-asterisk gap in the renderer. **Known gap:** scope demands the declaration match
"current official verbatim wording" but never supplies it — wording is hash-pinned but needs
practitioner sign-off (Jira sub-task LER-1200 exists for exactly this).

### Phase 6 — acceptance mapping (`4fb7d9b`)
`docs/acceptance-mapping.md`: every scope criterion → covering checks. Result: 6 covered, 5
partial, 1 blocked (the declaration wording above). Corrects the 19/33 myth in writing.

### Phase 7 — visual redesign (`fe0825e`) and UK dates (`4af9caf`)
**Redesign:** one design system (`apps/web/src/styles/_tokens.scss` → `--mg-*` custom properties,
Material system tokens mapped to the same values); top nav with only real destinations; hero with
real counts only; per-form **inline SVG icons — deliberately not an icon font** (a failed font
renders icon *names* as text and pollutes assertions); amber = advisory, **red reserved for UC-07
sensitive material**. **Dates:** every date field DD/MM/YYYY via a custom `IsoDateAdapter`
(`DateAdapter<string>`), **not** `provideNativeDateAdapter` — Date objects in controls would change
what persists and silently kill every auto-fill badge (provenance compares `JSON.stringify` of the
stored ISO string). Storage stays ISO `YYYY-MM-DD`; 31/02/2026 is rejected, never rolled over;
weeks start Monday.

### Phase 8 — the template gap: research with adversarial verification
**Why it exists:** 9 of 11 templates were placeholders (README said so); the client never supplied
field definitions despite being asked. **How:** multi-agent research over official sources (Home
Office *Criminal casefiles* v2.0 June 2026, CPS DG6 + National File Standard, CPS legal guidance,
the 2011 Manual of Guidance and its annotated specimens), then independent verifiers attempting to
refute every claimed field. **Findings that changed the project:**
- **253 fields proposed, 238 documented** (a source shows the box exists).
- **MG2 is the Special Measures Assessment**, not an interview form (33/34 corroborated). Our MG2
  content belongs on MG15. MG2 is marked **"Not Disclosable"** — any defence-facing export must
  exclude it (product rule for UC-09 PDF output and UC-07 sensitive material).
- **MG14 is the Conditional Caution**, not an identification statement.
- **MG1 is not in the current MG suite at all** — 0/7 fields corroborated, verdict *not-usable*.
- **MG6** is "Case File Evidence and Information"; unused material is the separate MG6C/D/E.
- Part of the public "research" corpus is **AI-generated** (a criminaljusticehub .docx whose
  `dc:creator` is literally "Claude") — caught by our verifier; strike lists applied to MG14/MG15.
- The **Digital Case File** will absorb MG forms; NPCC has embargoed Manual of Guidance updates.
Outputs: `docs/mg-form-research-findings.md`, three practitioner CSVs in `docs/review/` (built for
Google Sheets; DevOps Bot has a `google-sheets` MCP so answers can be read back), and
`docs/answers/LER-1205-designation-mismatches.md` (posted to Jira, ticket closed).

### Phase 9 — template rebuilds (branches `LER-1031`–`LER-1039`)
Five rebuilt, four deliberately skipped, under fixed rules: **documented fields only** (guesses
become open questions), **additive-only ids** (live drafts store values under old ids; renaming
destroys data on the next autosave), `mapsTo` only where the case datum genuinely *is* the field,
every template `verification: 'unverified'` until a practitioner signs, every field carrying
`provenance`.

| Form | Fields | Note |
|---|---|---|
| MG4 (`LER-1034`) | 8 → 36 | strongest evidence (genuine specimen incl. its real "Charge acepted" typo); introduces the `verification`/`provenance` types + header chip — **merge first** |
| MG12 (`LER-1035`) | 5 → 7 | honest ceiling: 6 of 9 fields are a repeating 12-row table; no repeating-group type exists |
| MG16 (`LER-1039`) | 6 → 19 | both field sets coexist; `subjectName` untouched pending the ebc003 question |
| MG15 (`LER-1038`) | 9 → 18 | 3 AI-sourced fields struck; `interviewee` mapping risk documented |
| MG3 (`LER-1033`) | 6 → 59 | DG6 Annex 4 content spec; **no blank MG3 is published** — labels are reconstruction; may stay unverified forever; needs wizard-style UX |
| MG1/MG2/MG14/MG5 | skipped | not-usable / wrong form (decision-maker) / wrong form / never researched — each with an open-questions doc |

Suite on the stack: **104 checks green** (95 base + 9 MG4). On `mgs/uc-04-mg6-schedule`:
**122 checks green** (104 + 18 UC-04), with `npm run conformance` (25 self-tests, 11/11 templates)
and `npm run orphan-scan` (zero orphans) also green.

### Phase 10 — guardrails
- **`npm run orphan-scan`** (`guardrails-orphan-scan`, `ad665c4`): finds draft values stranded by
  id changes; knows deliberate derived keys (`isVulnerableWitness`); exit 1 gates migrations.
  Proven both directions. Current DB: **0 true orphans** — evidence the additive rule held.
- **`npm run conformance`** (`guardrails-conformance`, `fb93595`, in CI): structural rules for all
  templates, sourcing rules only for assessed ones; thresholds **measured** against MG11/MG5 and
  the rebuilds; 9 self-tests against planted defects; 11/11 pass.

### Phase 11 — DevOps Bot integration (how to work it)
It is an autonomous coder (Epic → Story → Task → PR; **never merges**). Learned the hard way:
1. `humanInstructions` is read first and was empty on **all 211 tickets** — nothing was runnable.
2. Its validator enforces `USER_STORY_FORMAT.md` — it correctly **rejected** LER-1034's
   two-fragment description; every one of the 201 stories has the same shape and will be rejected
   until given real As-a/Given-When-Then bodies (LER-1034's is `docs/stories/LER-1034-mg4-charge-sheet.md`).
3. `agentMode: true` waits on a **WhatsApp approval** that never came; runs time out to Backlog
   after 15 min. Fix per ticket: `agentMode=false`, or answer the WhatsApp.
**The bot has written zero code so far.** Ticket state: `docs/review/backlog-status.csv` maps all
211 (45 already delivered but still To Do, 150 not started). LER-1205 closed with the designation
answer; LER-1206 was accidentally flipped back to In Progress by a timer and should be re-Done.

### Phase 12 — branch map (`d92143e`)
Markers `mgs/uc-01-form-selection` + `mgs/uc-02-auto-population` → `3cf7644`,
`mgs/uc-03-mg11-wizard` → `7c36d24`; README documents roles and the UC-04-onwards convention
(`mgs/uc-NN-<slug>` working branch off integration; `LER-NNNN` tickets PR into it; UC branch PRs
into integration at DoD).

### Phase 13 — retrospective documentation packs for UC-01/02/03 (`mgs/docs-backfill-uc01-03`)
**What:** company-format packs authored for the three delivered use cases —
`docs/usecases/uc-01/`, `uc-02/`, `uc-03/` — each with `epic.md`, a 14-section `prd.md`, one story file
per delivering ticket, `human-instructions.txt` and `open-questions.md`, matching the UC-04 pack's shape.
**Why:** UC-04 was the first use case documented before it was built. UC-01–03 were built first and
documented only in the README and `acceptance-mapping.md`, so the delivered behaviour was recorded to a
lower standard than the unbuilt work. **Documentation only — no code changed, no tickets created.**
**How:** written as-built (against the source and the suite, not against intent), with **every acceptance
criterion citing a real E2E check by spec file and test name** — 143 citations, all validated by script
against the actual `test(...)` names. Where a criterion had no covering check it is recorded as a coverage
gap rather than given an invented citation.
**Findings worth acting on:**
- **All 53 tickets across the three UCs are still `To Do` in DevOps Bot**, verified live against the API —
  not `Done`. The work is delivered; the tracker disagrees. No status was changed (roadmap item 9).
- **Seven scope-vs-built deviations**, none previously written down: UC-02 does not flag non-mappable
  fields "Requires manual entry" and never locks confirmed values (both scope main-flow steps); UC-03
  flags five phrases rather than three and carries three extra step-1 fields; plus three smaller ones.
- 39 story files map to delivered tickets; 6 tickets in the UC-03 block were never delivered
  (LER-1062, 1068, 1071–1073, 1079) and 2 are human-blocked (LER-1077/1078).
**Story counts:** UC-01 12, UC-02 12, UC-03 16.

### Phase 14 — the Decision & Review Memo enters the repo (`mgs/docs-decision-memo`)
**What:** `docs/decisions/decision-and-review-memo.md` — the 19 August 2026 memo to the project
decision-maker and Senior Solicitor, carrying **decisions A1–A6** and a Section B practitioner review
agenda, with responses requested by **22 August**. The UC-01/02/03 packs previously recorded this memo as
missing from the repository; they now reference it, and each maps the items that land on it.
**Why it matters:** these six decisions are the ones nothing in the code can resolve, and the memo frames
the deadline around **UC-09** — PDF generation binds official layouts and cannot safely start while form
identities are open.
**The six, and where they land:**
- **A1** Does the product carry MG1 at all? → UC-01 (the reason its criterion #1 is Partial); blocks
  LER-1031 and the UC-09 binding for that slot.
- **A2** MG2 designation (Special Measures Assessment?) → UC-01 template scope, UC-02's single MG2
  mapping. **One live draft** — run `orphan-scan` first. Blocks LER-1032.
- **A3** MG14 designation (Conditional Caution?) → UC-01 template scope; identification evidence
  officially belongs on MG11, so it widens UC-03's review scope. **Three live drafts.** Blocks LER-1037.
- **A4** Is MG16 one form or two? → UC-02's subject-name rule. If MG16 is defendant-only, the memo states
  the un-prefilled rule "rests on a false premise and could be simplified".
- **A5** MG6 naming (MG6 vs MG6C/MG6D) → UC-09 layout binding and UC-07 naming; UC-04's mechanics are
  designation-independent, so nothing is blocked today.
- **A6** Ratify the delivered stack (Angular/NestJS/Prisma, 122 E2E checks) against the original
  Python/FastAPI/React plan. Recommended: ratify. Blocks nothing technically.
**Section B** is the practitioner review agenda — MG4, MG3, MG15, MG16, MG12, MG5/MG11, and the MG11
statutory declaration wording, which is the project's only **Blocked** acceptance criterion.
**Documentation only:** no code, no tickets, no ticket status changes.

### Phase 15 — UC-05 Field Validation pack authored and ticketed (`mgs/uc-05-field-validation`)
**What:** `docs/usecases/uc-05/` — epic, 14-section PRD, 16 stories, build brief, open questions — and
tickets **LER-1207..1222**, one per story. Documentation and tickets only; no code.
**Scoped as the delta**, not from scratch: PRD §3 tables what already exists (required, minLength/maxLength,
pattern, min/max, noFutureDate, uniqueInGroup, the 422 group and declaration guards, `isFieldValueComplete`)
so none of it is rebuilt. The new ground is per-field **formats**, **cross-field consistency**, and closing
the gap the README has admitted since UC-01 — the declarative rules never ran server-side.
**The design decision that shapes the epic:** a format may be `error` severity **only if** its provenance is
`documented` with a cited source; everything else is forced to **advisory** — hints, never blocks. Enforced
twice, at runtime and in the conformance gate. So URN, ASN, custody number, collar number and CPS reference
all ship advisory, because the research evidences the *boxes* and never their formats.
**Three findings established against the delivered templates before writing:**
- **No template has a CPS reference field** — `cpsReference` is a case datum only, so the scope's format rule
  has nothing on a form to validate.
- **No template has a collar-number field** — collar numbers sit inside composite officer boxes, so a
  pattern over them would reject correct input. No rule is applied, and a check asserts that.
- **Neither scope-named cross-field pair exists on one form** — MG4 has `chargeDate` and no offence date;
  MG11 has `statementDate` and no hearing date. Both rules are therefore built as **case datum vs form
  field**, through UC-02's `resolveCaseField`, with suppression when the case datum is `ambiguous`.
**API limitation found while loading:** `agentMode` cannot be set false — POST with `agentMode: false`
returns a ticket with it `true`, and PUT echoes `true` back. All 16 tickets have Agent mode ON and must be
turned off in the UI. Same class as `dueDate`. Also: POST requires `assigneeEmail` and an hours-format
`slaTarget`, neither of which matches what a GET returns.

### Phase 16 — UC-06 Legal Language Assistance pack authored and ticketed (`mgs/uc-06-legal-language`)
**What:** `docs/usecases/uc-06/` — epic, 14-section PRD, 15 stories, build brief, open questions — and
tickets **LER-1223..1237**, one per story. Documentation and tickets only; no code.
**Scoped as the delta over UC-03**, which already flags hearsay and opinion and draws them as amber marks.
UC-06 adds informal-language flags with a formal alternative, standard phrase suggestions, completeness
hints, a collapsible Legal Language Assistant panel, and insert-at-cursor. `detectNarrativeFlags`,
`segmentNarrative` and the highlight backdrop are reused, not rebuilt.
**The design decision that shapes the epic:** a prompt may carry insertable wording **only if** its
provenance is `documented` with a cited source. UC-05 downgraded unsourced rules to advisory; here
everything is already advisory, so the gate is on *proposing wording at all*. An unsourced phrase is one
button-press from becoming a witness's signed words — a worse failure than an invented field, because a
missing field is visibly empty and an invented phrase reads as authoritative. Enforced twice:
`canProposeVerbatim()` at runtime and the conformance gate.
**Consequently `STANDARD_PHRASES` ships EMPTY.** The scope asks for standard phrasing and supplies none, so
the shape, the gate and the tests land and a practitioner fills the registry in a data-only PR. That is the
single largest thing a human must supply for this UC to deliver its headline value (open question Q1).
**Three findings established against the delivered code before writing:**
- **The narrative treatment is MG11-wizard-only.** `NarrativeField` is referenced from `mg11-wizard.html`
  and nowhere else; MG5 goes through the flat `DynamicForm` and has no highlighting at all. The DoD names
  MG5 *and* MG11, so the component must be lifted into the shared renderer — engine work, and the largest
  single piece of the epic. Costing UC-06 as "a side panel" would under-scope it by most of its effort.
- **Not every textarea is a narrative** — 57 textareas exist across the eleven templates; MG11's
  `witnessAddress` and MG5's `chargesList` are not prose. So a template must *declare* `narrative: true`;
  the renderer must never infer prose from `type` or `rows`.
- **`NarrativePattern` has no notion of a replacement** — it carries `phrase`, `kind`, `explanation`. The
  scope requires a "suggested formal alternative", so the pattern gains an optional `suggestion` and the
  kind union gains `'informal'`. Additive; UC-03's five patterns keep working untouched.
**The boundary, not a vendor:** the scope presumes a "language AI service" without naming one. UC-06 ships
an isolated module with no Prisma client, no `DraftsService` and no draft write path, whose output is
untrusted data, optional behind `LANGUAGE_ASSIST_URL` and **unconfigured by default** — the in-process
rules supply the panel on their own. Whether a witness's narrative may leave the deployment at all is a
decision-maker question (open question Q6), and a staging instance behind `DemoAuthGuard` must never be
pointed at a real model with real statements.
**API limitation, unchanged since UC-05:** `agentMode` cannot be set false. POST with `agentMode: false`
returns a ticket with it `true`, and PUT returns 202 while a read-back still says `true`. All 15 tickets
have Agent mode ON and must be turned off in the UI. `dueDate` is still silently ignored, so the intended
sequencing lives in `human-instructions.txt`.

### Phase 17 — UC-06 Legal Language Assistance built (`mgs/uc-06-legal-language`)
**What:** the pack's fifteen stories delivered — declared narrative fields, the narrative treatment lifted
into the shared renderer, the collapsible Legal Language Assistant panel, informal-language flags,
completeness hints, provenance-gated phrase suggestions, insert-at-cursor, per-session dismissal, the
assistance service boundary and graceful degradation. **`e2e/uc06-legal-language.spec.ts` — 25 checks;
full suite 174, green twice; conformance 53 self-tests and 11/11 templates plus the new registry gate;
orphan-scan zero orphans.**
**The largest piece was engine work, as the pack predicted.** `NarrativeField` was referenced only from
`mg11-wizard.html`, so MG5's prose had no highlighting at all. `DynamicForm` now renders it for any field
declaring `narrative: true`, and the wizard still passes it explicitly — one component, two entry points.
MG5 and MG11 both bumped to `templateVersion: 4`; no field id changed.
**The rule that shaped it:** a prompt may carry insertable wording only when its provenance is
`documented` with a source (`canProposeVerbatim`), enforced at runtime and in the conformance gate.
**`STANDARD_PHRASES` therefore ships empty** — the scope asks for standard phrasing and supplies none, so
the shape, the gate and the tests landed and a practitioner fills the registry in a data-only change.
Informal flags observe and never propose. The consequence, stated rather than hidden: **in the default
build nothing is insertable**, so DoD line 3 is proven through a configured assistance service stubbed at
the browser boundary — the same code path a real service uses.
**Seven deviations from the pack, all recorded in `docs/usecases/uc-06/open-questions.md` D1–D7**, and the
scope won every one of them:
- The audit row records the **suggestion text** (`{ formCode, fieldId, promptId, kind, suggestionText }`),
  because the scope's post-condition says "with the suggestion text". The narrative is still never
  recorded, and a check asserts no phrase from it appears in the row. This answers half of open question Q7.
- Degradation shows the scope's own "Language assistance temporarily unavailable" line rather than nothing,
  with zero console errors, no snackbar and saving unaffected.
- The assistance module stays registered when unconfigured (inert, no outbound call), because a 404 would
  put a failed-resource error in the console and DoD line 4 forbids exactly that.
- The panel's collapsed header is visible before the body opens on focus; the scope's assistance on/off
  toggle is delivered though no story named it; insertable wording is not trimmed.
**The boundary:** `apps/api/src/language/` has no Prisma client, no drafts service and no mutating route,
asserted by a source-level test. Unconfigured by default, so no narrative text leaves the deployment —
whether it ever may is still open question Q6, and a `DemoAuthGuard` staging instance must never be pointed
at a real model.
**New audit action:** `LANGUAGE_SUGGESTION_INSERTED`. New endpoints: `POST /api/drafts/:id/language-insert`
(204, records only — a check asserts it does not touch the draft) and `POST /api/language/prompts` (always
200; failure is reported as data, never as a status).

## 3. Current state (verified)

_Last verified 24 Aug 2026, after PR #149 (Railway staging) and the remediation pass._

- **Integration branch:** `ali-zulqarnain/mgs-forms` @ **`19bc07a`** (the PR #149 merge). Suite
  **219/219** (216 + PR #184's three engine-remediation checks), run twice on the dev database and
  once on a freshly seeded throwaway one — on freshly
  started servers with per-run exit codes captured (see the §5 gotcha this added). `npm run conformance`
  **68 self-tests**, 11/11 templates and the UC-06 assistance registries. `npm run orphan-scan` zero
  orphans; the user's 27 real drafts untouched. In flight on top: `mgs/verification-banner-absent`
  (absent-verification banner fix, suite → 220), `mgs/build-safety-net` (noEmitOnError + orphan-scan and
  npm audit in CI), and this reconciliation branch.
- **UC-01 to UC-08 are all built and merged** (official titles; the scope document is the source of truth,
  <https://lhl-agents.netlify.app/mg-forms-scope/>):

  | UC | Title | Merged in | Spec |
  |---|---|---|---|
  | UC-01 | Form Selection & Initiation | early work + PR #115 | `uc01-form-selection.spec.ts` — 21 |
  | UC-02 | Auto-Population from Case File | early work + PR #115 | `uc02-autofill.spec.ts` — 23 |
  | UC-03 | MG11 Witness Statement Wizard | `7c36d24` | `uc03-mg11-wizard.spec.ts` — 21 |
  | UC-04 | MG6 Unused Material Schedule | PR #85 | `uc04-mg6-schedule.spec.ts` — 22 |
  | UC-05 | Field Validation | PR #85 | `uc05-field-validation.spec.ts` — 22 |
  | UC-06 | Legal Language Assistance | PR #109 | `uc06-legal-language.spec.ts` — 25 |
  | UC-07 | Sensitive Material Handling | PR #139 (+ fix in #148) | `uc07-sensitive-material.spec.ts` — 20 |
  | UC-08 | Form Review & Quality Check | PR #142 + fix PR #144 | `uc08-review-quality.spec.ts` — 20 |

  Plus `dashboard.spec.ts` 25, `mg4-charge-sheet.spec.ts` 9 (10 after the banner fix), `uk-dates.spec.ts`
  8. **Not started:** UC-09 PDF Generation & Formatting, UC-10 Form Archive & Case Attachment. **Also
  live:** Railway staging (PR #149) — single service, basic-auth gate, `docs/deployment/railway-staging.md`
  is the record; DoD #11 verified by volume inspection, DoD #12 explicitly not claimed (no PDFs exist).
- **Every delivered use case carries a documentation pack** — `docs/usecases/uc-01/` … `uc-08/`, each with
  an epic, a PRD, one story file per delivering ticket and open questions (UC-07/08's PRDs carry 10 of the
  org's 14 sections — recorded, not rewritten; UC-09's must carry all fourteen). All four scope criteria
  are mapped per UC in `docs/acceptance-mapping.md` (**28 Covered, 3 Partial, 1 Blocked** of 32).
- **Templates:** six rebuilt from sourced research and carrying full per-field provenance — MG3 (59
  fields), MG4 (36), MG6 (**48** top-level fields — rebuilt to the documented printed boxes by LER-1239,
  then UC-07 added the MG6D section; v5, 55 fields counting group columns, citations throughout), MG12
  (7), MG15 (18), MG16 (19). Five are not: MG1 (7), MG2 (9), MG5 (13), MG11 (15), MG14 (8). **None is
  practitioner-verified** — precisely: the six rebuilt templates read `verification: 'unverified'` and the
  five legacy ones carry **no verification property at all** ("not yet assessed"); both states show the
  header banner once `mgs/verification-banner-absent` merges (before it, absence silently showed none —
  that was a bug, found by the 24 Aug audit). Deliberate product statement, not an oversight.
- **Jira/DevOps Bot:** **194 of 303 LER tickets Done** (live read-back, 25 Aug — 191/274 on 24 Aug;
  since then: LER-1270..1272 fixed by PR #184 and closed with evidence, LER-1269 delivered by PR #187,
  and the 26 UC-09 delivering tickets **LER-2373..2398** loaded with humanInstructions at creation).
  UC-01..08's delivered
  work is closed with evidence comments; the client's original UC-05 (1094–1108), UC-06 (1109–1125),
  UC-07 (1126–1140) and UC-08 (1141–1152 + 1104/1106) blocks were delivered through our 1207–1268 and are
  1:1-mapped in the packs. LER-1107 closed 24 Aug (the UC-08 finalise gate is its criterion). Deliberately
  open: 1041 (needs LER-1199), 1071–1073 (page count — UC-09), the human-blocked set, LER-1269 (fixture
  debt), and **LER-1198, re-opened 24 Aug with evidence** that no official central template source exists
  (`docs/answers/template-sourcing-evidence-2026-08.md`). The full ledger is
  `docs/review/backlog-status.csv` (274 rows, refreshed 24 Aug).
- **Dev data:** the user's **27 real drafts** are preserved byte-identical; the suite logs and deletes only
  its own creations. Their fixture-pollution problem (two case-linked test values) is recorded in
  LER-1269 and must be decided before UC-09 captures any reference baselines.
- The audit trail (writes only, no read endpoint) is **not a numbered use case** in the client scope; the
  README's older "UC-08" label for it predates the scope document and is drift.
- The remote's `reverify-uc-04` branch belongs to the **sentencing workstream**, not this project — hence
  the `mgs/` prefix on our UC branches.

## 4. Standing decisions (do not silently reverse)

1. Unverified legal forms are **visibly marked and never filing-ready** — a plausible invented box
   on a criminal-case document is a professional-conduct risk, not a cosmetic bug.
2. **Additive-only** template changes until `templateVersion` is honoured or migration is designed.
3. MG16 `subjectName` stays unmapped until a practitioner rules on the ebc003 question.
4. MG11 and MG5 are the quality bar but are **not practitioner-verified either** — do not mark them
   `verified` because they look good; that is the exact failure the marker exists to catch.
5. Red is reserved for UC-07 sensitive material; advisory stays amber.
6. MG1 is retained despite not existing officially (UC-01 AC requires 11 forms; ~20 test fixtures
   use it) — never padded to look complete.

## 5. Gotchas that cost time (avoid re-learning)

- `templateVersion` is recorded but **not honoured** — `form-fill-page.ts` loads templates by
  `formCode` alone; old drafts render against the newest field set. README's contrary claim in the
  data-model section (added before this was discovered) still needs correcting.
- The nest watcher does **not** pick up `libs/shared` rebuilds — restart the API or it serves stale
  templates. **This is worse than it sounds, and it cost time on 20 Aug:** `tsc` emits output even when it
  reports type errors, so a failed intermediate build can leave a *partially written* `libs/shared/dist` in
  place, and the API will serve that half-template indefinitely without a single error in its log. The
  symptom was MG6 answering `templateVersion: 4` with **35 fields** while the source and a fresh `node -e`
  read said 47 — a version that looked new and a field set that was not.
  **So: after any `libs/shared` change, restart the API and then ASSERT what it serves** — e.g.
  `curl -s localhost:3000/api/form-templates/MG6 | ...` and check the field count, not just the startup
  banner. The MG11 declaration-integrity line proves the process is fresh; it does not prove the templates
  are. On 20 Aug the watcher also died without respawning, so `npm run start:api` had to be run by hand.
  The silent-corruption half of this gotcha is closed once `mgs/build-safety-net` merges
  (`noEmitOnError: true` — a failed build now writes nothing); the watcher-staleness half stands, so the
  restart-and-curl habit stays.
- **The throwaway-DB verification leg silently tests the wrong database if a dev server is already
  running.** Found 24 Aug: an orphaned `npm run dev` API from 19 Aug still held :3000; Playwright's
  `reuseExistingServer: true` reused it, so the API read/wrote dev.db while `db:setup` and the suite's
  direct-SQLite helper used the throwaway file — 18 audit-trail and permission checks failed with
  "missing" rows that were sitting in the other database. **Before the throwaway leg, kill anything on
  :3000/:4200** (`ss -ltnp | grep -E ':3000|:4200'`), and remember the concurrently wrapper can die while
  the nest child survives — check the port, not the process list. Related: never pipe
  `npx playwright test` into `tail`/`grep` without `set -o pipefail` — the filter's exit code masks the
  run's, and this exact combination made a failing throwaway leg look green twice in one day.
  **Two honest consequences:** (1) the "×1 fresh throwaway DB" lines in PR bodies #139–#149 are only as
  good as whether a server happened to be running at the time — those claims are now *uncertain*, not
  disproven; (2) this does NOT explain the #115/#148 CI divergences (a fresh CI runner has no orphan
  server) — that remains open. A convention that can be silently violated is not a gate: the planned
  fix is a setup guard that asserts the API under test actually uses the `DATABASE_URL` the run set,
  failing loudly otherwise (lands with the test-infrastructure branch).
- The sandbox permission classifier intermittently blocks git writes/network calls; when blocked,
  hand the exact command to the user rather than working around it.
- E2E runs create drafts: snapshot draft ids before, log created ids (`E2E_DRAFT_LOG`), delete only
  the difference. The user's own drafts must survive.
- Every `data-testid` is load-bearing; MG1 is the fixture form for ~20 assertions.
- DevOps Bot API: `devopsbot-be…/tasks-ml` (tickets, `co_` token in `Authorization`), pagination
  via `offset` (`page` is ignored); the orchestrator/approvals live on `devopsbot-ai…`.

## 6. Open questions and who must answer them

**These are now formally put in one place:** `docs/decisions/decision-and-review-memo.md` (19 Aug 2026),
Section A = decisions A1–A6 for the decision-maker, Section B = the practitioner review agenda, Section C
= sources. Responses requested by 22 Aug. The summary below stays as the narrative version.

**Practitioner (solicitor):** the 9-row `docs/review/mg-form-summary.csv` first (is each code even
the right form?), then per-form field review (~15 min/form), the MG11 declaration wording
(LER-1200), MG11/MG5 verification, and every `docs/stories/*-open-questions.md`.
**Decision-maker:** MG1 in or out of scope (conflicts with UC-01's "all 11 forms" AC); MG2/MG14
designation changes + fate of their live drafts (run `orphan-scan` first); MG16 identity (ebc003?);
whether MG3 ships at all. **Client:** **UC-09** (PDF Generation & Formatting) layout fidelity —
exact HMCTS/MG layout or clean rendering? Do not start UC-09 before this. Also: the full
requirements pack, if one exists beyond the scope document.

## 7. Roadmap

_Rewritten 24 Aug 2026. Items 5 and 6 of the previous list are done — UC-07 shipped in PR #139 and
UC-08 in PRs #142/#144 — and the agent-mode item collapsed to a footnote after the 24 Aug audit._

1. **Practitioner review — still the critical path.** It is what flips `verification` per form, and no
   amount of code substitutes for it. The agenda is `docs/decisions/decision-and-review-memo.md` Section B
   and the 9-row `docs/review/mg-form-summary.csv` (is each code even the right form?), then per-form field
   review at roughly 15 minutes a form. The memo's responses were requested by 22 Aug and are **overdue**;
   `docs/answers/template-sourcing-evidence-2026-08.md` now puts current-list evidence behind A1/A2/A3/A5.
2. **The MG11 declaration wording** (LER-1077 / LER-1200) — the project's only *Blocked* acceptance
   criterion, and it now has **evidence of a mismatch**: on 24 Aug the constant was diffed character by
   character against the genuine 2013 specimen (bbpolice.uk/uploads/MG11.pdf) and differs in three places,
   including the missing "(consisting of ___ page(s) each signed by me)" parenthetical that LER-1071–1073
   exist to fill. Details in `docs/answers/template-sourcing-evidence-2026-08.md` §3 and the acceptance
   mapping. A practitioner picks the wording; changing it means updating the constant and its hash
   together, with every existing MG11 draft affected.
3. **Answer the memo's A1–A6** — most consequentially MG1's scope (it conflicts with UC-01's "all 11 forms"
   criterion), the MG2/MG14 designation changes and their live drafts, and MG16's identity. Each is a
   decision, not a defect.
4. **Honour `templateVersion`** (or formally adopt forward-migration). It is recorded and not honoured
   today; the README's data-model section has been corrected to say so.
5. **UC-09 PDF Generation & Formatting** — the layout-fidelity question has an evidence-backed answer
   (clean rendering: there is no official source to be faithful to — LER-1198 was re-opened 24 Aug on
   exactly that evidence, and the scope's "HMCTS" naming is itself wrong, the forms are Home Office/NPCC).
   A UC-09 documentation pack is being authored; it unblocks the page-count tickets (LER-1071–1073), is
   what UC-03 #4 needs to move off *Partial*, and must settle LER-1269's fixture debt **before** any
   reference baseline is captured.
6. **UC-10 Form Archive & Versioning**, then the release block (LER-1188–1197: security review,
   accessibility pass, performance, UAT, staged release).
7. **Audit read endpoint** — writes exist and are asserted by reading the SQLite file directly (which is
   also why the throwaway-DB gotcha in §5 bites). Unnumbered in the scope.
8. **Fill the two empty-by-design registries** when a practitioner can cite the wording: UC-06's
   `STANDARD_PHRASES` (`open-questions.md` Q1) and the formal alternatives for informal flags (Q2). Both
   are data-only changes — the gate, the panel and the tests are already in place.
9. **Source the reference formats** (URN, ASN, custody number, collar number, CPS reference, postcode) to
   move UC-05's advisory rules to errors. One provenance change per format, and the URN change alone
   upgrades seven templates at once.
10. **DevOps Bot footnotes:** agent mode is off on LER-1269 (flipped in the UI 22–24 Aug, read-back
    confirms) and every other pre-existing agent-mode ticket is Done; the API still discards
    `agentMode` on POST and PUT, so any future ticket needs the same UI flip — which now means the
    **three defect tickets filed 24 Aug (LER-1270, LER-1271, LER-1272**, the unit-test tranche's
    library findings): all three landed `agentMode: true` and To Do, so **flip them off in the UI**.
    The throwaway probe **LER-1238** still cannot be deleted through the API (403) and needs deleting
    in the UI. Token rotation was raised and **declined (24 Aug, standing decision — do not
    re-raise)**.
