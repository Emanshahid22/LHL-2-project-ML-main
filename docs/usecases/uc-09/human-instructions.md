# Full-Stack / Codebase Task — UC-09 PDF Generation & Formatting

Authoritative build brief for the delivering tickets. Read `docs/usecases/uc-09/prd.md` first — the
architecture is decided there (clean rendering via Chromium; layout as data behind an interface; DoD 1
recorded open), and `docs/usecases/uc-09/open-questions.md` carries the deviations D1–D7 and the
questions Q1–Q7 that are decisions, not defects.

## Repos

- `consultancy-outfit/LHL-2-project-ML` — the only repo. Angular 20 web app (`apps/web`), NestJS 11
  API (`apps/api`), shared template/engine library (`libs/shared`) consumed by both. Node >= 20.
- Integration branch **`ali-zulqarnain/mgs-forms`**. The repo's `main` is a placeholder with
  unrelated history — never target it, never trust GitHub's "Compare & pull request" banner.

## Git Workflow

- Branch off the integration branch: `mgs/uc-09-pdf-generation` (working branch), stories land on it.
- **Project deviation from the org standard, stated on purpose:** branches are **UC-sized, not
  per-ticket** — one working branch carries the use case, tickets are commits/PR-sections mapped in
  the PR body. (The org default is one branch per ticket id.)
- Additive-only template and schema changes. Run `npm run orphan-scan` before anything that touches
  a field id; run the storage-key PII scan once it exists before anything that touches storage keys.

## Build Order

**Project deviation from the org standard (FE-mocks-first): shared engine → API → UI.**
1. `libs/shared`: `FormLayout` data + `LayoutBinding` interface + `CleanA4Binding`; the hoisted
   `isPractitionerVerified` predicate; page-count interpolation pure functions. Unit tests beside
   them (`libs/shared/test`, `node --test`).
2. Fixture decision first: execute the LER-1269 strategy before any baseline capture.
3. `apps/api`: render job queue + Chromium render, encryption + storage, endpoints, audit events,
   boot self-test + key gate. `tools/pii-scan` beside orphan-scan, wired into CI.
4. `apps/web`: generate/preview/download/DOCX UI on the finalised banner's stub, retry states.
5. Reference renders + pixel harness last, after everything upstream is stable.
After any `libs/shared` change: rebuild, restart the API, and curl a template to assert the field
count (HANDOVER §5 — the watcher does not pick up shared rebuilds).

## Backend Rules

- Rendering runs **off the request path** (job + poll). Hard 30 s timeout per render.
- The generate endpoint re-runs the UC-08 gate server-side; a client claim of a passing review is
  never trusted. 409 on refusal, audited.
- AES-256-GCM per document, random IV, env `DOCUMENT_MASTER_KEY`; the API **refuses to boot**
  without a well-formed key (the wording-integrity discipline). Decrypt only in the two streaming
  endpoints.
- No endpoint accepts layout, wording or filename input from a client. Filenames are derived at
  download time from DB metadata only.
- Page-count assertion failure fails the render — defective output is never stored.
- Audit events are writes-only, like every existing event; nothing updates or deletes one.

## Frontend Rules

- Every control carries a `data-testid`; existing testids are load-bearing — never rename.
- The draft-marking band is part of the rendered page (layout layer), not client chrome.
- Amber for the draft band and advisories; **red stays reserved for UC-07 sensitive material**.
  Design tokens only — never hardcode colour.
- Dates DD/MM/YYYY display / ISO storage via `IsoDateAdapter`, unchanged.
- Failure UI: reason + Retry; never imply the draft was touched.

## Third-Party Integrations

None. The renderer is the local Chromium Playwright already pins — no external PDF service, no
document API, deliberately: form content is criminal-case material and never leaves the process.
DevOps Bot tasks-ml is the ticket ledger (offset pagination; every write needs read-back;
`agentMode` cannot be set via API — flip in the UI).

## Full-Stack Coordination

- The render model is the single contract: template + values + case → `LayoutBinding` → HTML. The
  web preview shows exactly the stored bytes (decrypted stream), never a client-side re-render.
- The verification predicate is shared: header chip and draft band call the same
  `libs/shared` function — screen and paper must never disagree.
- The UC-10 stub (`archiveStatus: 'pending-uc10'`) is honest in both API and UI, like UC-08's
  UC-09 stub was.

## PR Requirements (target: ali-zulqarnain/mgs-forms)

- Full gate set before opening: both builds, `npm run conformance`, `npm run orphan-scan`,
  `tools/pii-scan`, `npm run test:unit`, full Playwright **×2 on dev.db + ×1 on a fresh throwaway
  DB** — kill anything on :3000/:4200 first and use `set -o pipefail` (HANDOVER §5, learned the
  hard way on 24 Aug).
- PR body committed to `docs/pr-bodies/<branch-slug>.md` on the branch AND printed in chat; quote
  the relevant DoD lines verbatim; state deviations D1–D7 where touched; record what was NOT built.
- Update `docs/acceptance-mapping.md` in the same PR (UC-09 section; move UC-03 #4 off Partial if
  the vulnerable-witness indicator now provably reaches the PDF).

## Ground Rules

1. **Never invent a form field or a layout box.** Structural reference is the seven genuine
   specimens only; MG1/MG3/MG15/MG16 get no fidelity claim. AI-reconstructed MG templates are never
   references — the criminaljusticehub.org.uk 2026/06 files are recorded AI recreations.
2. **Unverified means unverified — now on paper too.** Every rendered page is draft-marked while
   `verification !== 'verified'`. Nothing generated may read as filing-ready.
3. **The declaration constant does not change here.** LER-1072 builds interpolation; activation
   waits for the practitioner (Q1/LER-1200). Constant + SHA-256 move together, never separately.
4. **DoD 1 is open and stays open** until LER-1170 is signed by a human. Do not soften the
   non-claim in any UI text, PR body or status doc.
5. **No baseline before the fixture decision** (Q2/LER-1269) — a baseline over polluted fixtures is
   worse than none.
6. Clean up test data: snapshot ids before, `E2E_DRAFT_LOG`, delete only the difference; generated
   documents created by tests are deleted by tests.

## Definition of Done (scope document, quoted verbatim)

1. "PDF output matches official HMCTS MG form layout — verified against official template for all
   11 form types" — **recorded open (D6)**; delivered instead: specimen-structural checks,
   self-baseline pixel regression, open sign-off record.
2. "All MG form PDFs are encrypted at rest — verified via storage metadata"
3. "No defendant personal data appears in file names or storage paths — verified with an automated
   filename scan"
4. "DOCX 'Draft' header present on every generated Word document"
