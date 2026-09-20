## Epic

UC-09 — PDF Generation & Formatting. The scope's official title
(<https://lhl-agents.netlify.app/mg-forms-scope/>; PDF output is UC-09, not UC-05 — the numbering
drift is recorded in CLAUDE.md).

## Overview

A finalised form becomes a document: rendered to PDF through the Chromium already in the toolchain,
previewed in the browser, exported to a draft-labelled DOCX on request, stored encrypted with a
PII-free storage identity, and handed to the UC-10 archive through a stub the way UC-08 stubbed this
use case. The MG11 declaration finally gets its page count — counted by the renderer, interpolated
into the declaration text, and asserted against the actual output.

One decision shapes everything here, and it was made on evidence rather than taste: **clean
rendering, not facsimile.** There is no official central source for blank MG forms (gov.uk carries
one guidance document and no templates; the Manual of Guidance is under NPCC embargo —
`docs/answers/template-sourcing-evidence-2026-08.md`), so pixel-exactness has no referent; and a
faithful-looking facsimile of a field set no practitioner has signed off **reads as filing-ready**,
which standing rule 2 forbids. The scope's own naming compounds the problem: MG forms are Home
Office / NPCC forms, not HMCTS. The scope's DoD #1 ("matches official HMCTS MG form layout") is
therefore recorded as **explicitly open** — the same honest non-claim the Railway record made for
Global DoD #12 — and what is buildable instead is built: structural verification against the genuine
specimens that do exist, self-baseline pixel regression so our own output cannot drift, and a
client/practitioner sign-off record (LER-1170) that stays open until a human signs.

## Business Value / Goal

The product's output today is a screen. Solicitors need a document: reviewable in the browser,
printable, attachable to a case file, safe at rest. UC-09 is also where three standing debts land —
the declaration's page-count parenthetical (the 2013 specimen's wording the constant currently
omits), UC-03 #4's "persists to PDF" half, and the fixture-debt decision (LER-1269) that must be
settled before any reference baseline is captured or the polluted dev.db values are baked into the
expected images.

## Scope

In: the Generate PDF action gated on a passing review; a Chromium print-to-PDF render pipeline over
HTML/CSS Paged Media; per-form **layout declared as data** behind a binding interface (an overlay
coordinate map is then a second implementation, not a rewrite); automatic pagination; the MG11
page-count pipeline (count → interpolate → assert, LER-1071–1073); in-browser preview with scroll,
zoom and download; DOCX export carrying the "Draft — not the authoritative version" header;
application-level AES-256 encryption at rest (a platform attestation was already judged
insufficient for LER-1202); content-hash + case-UUID storage identity with download-time filename
generation; the storage-key PII scan as a repo tool and CI step (LER-1018), so Global DoD #11 is
evidenced rather than asserted; the pixel-difference harness (LER-1017) and regression gate
(LER-1157) against **our own** reference renders; a UC-10 archive stub; draft marking on every page
of every render while the template's `verification !== 'verified'` — the same predicate as the
form-header chip; failure retry with the draft preserved; and the LER-1269 fixture-debt settlement
as an explicit pre-baseline story.

Out: real archive/versioning (UC-10); any change to the MG11 declaration constant (practitioner
decision, LER-1077/1200 — the interpolation story builds the mechanism and keeps the current
wording until that decision); partial-generation attachment handling (the scope's "large
attachment" alt-flow — no attachment feature exists in the product to attach); real cloud KMS (key
management is documented as an env-supplied master key with its limits stated, see PRD §9);
facsimile layouts.

## User Stories

26 stories, one per planned delivering ticket — `stories/` in this pack. Client originals
LER-1153–1171 map 1:1 (two re-scoped on sourcing evidence: 1155 "bind eleven HMCTS templates" →
declare eleven layouts as data; 1164 auto-store → the UC-10 stub), joined by the two foundation
tickets this use case makes real (LER-1017 pixel harness, LER-1018 PII scan), the three deferred
page-count tickets (LER-1071–1073), the LER-1269 fixture-debt settlement, and one new story for
draft marking (rule 2 applied to paper). The map with per-story status lives in
`open-questions.md`.

## Epic-level Acceptance Criteria

The scope's UC-09 Definition of Done, quoted verbatim:

1. "PDF output matches official HMCTS MG form layout — verified against official template for all
   11 form types"
2. "All MG form PDFs are encrypted at rest — verified via storage metadata"
3. "No defendant personal data appears in file names or storage paths — verified with an automated
   filename scan"
4. "DOCX 'Draft' header present on every generated Word document"

DoD 1 is **open by evidence**: no official template exists to verify against, and four forms (MG1,
MG3, MG15, MG16) have no genuine specimen at all. What this epic ships instead and proves: structural
verification against the seven genuine specimens (MG2, MG4, MG5, MG6, MG11, MG12, MG14 — bbpolice.uk
2010/11 and 2013, the same specimens the template rebuild verified), self-baseline pixel regression,
and the open sign-off record. AI-reconstructed templates are never acceptable references (standing
rule; the criminaljusticehub.org.uk 2026/06 files are recorded AI recreations). DoD 2–4 are delivered
and verified in-repo.

## Dependencies & Risks

- **UC-08** — Generate PDF is gated on a passing review; the finalise gate and REVIEWED status
  exist and are proven. Done.
- **LER-1269 fixture debt** — MUST be settled before reference renders are captured, or the
  polluted dev.db values (Daniel FOSTER (edited), not-a-urn) become the expected images, exactly as
  they broke UC-08's case checks. A pre-baseline story in this pack forces the ordering.
- **Practitioner decisions that gate content, not code:** the declaration wording (the 2013
  specimen's parenthetical — mechanism built here, wording change only on sign-off); the layout
  sign-off itself (LER-1170).
- **Runtime Chromium** — Playwright is currently a devDependency and staging sets
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`. Rendering in production needs Chromium in the deploy image,
  and the memory number is now measured (24 Aug, default flags): **618 MB RSS idle after launch,
  762 MB peak during renders** — which does not fit safely beside the API in the current 1 GB
  Railway free-trial container. Deployment decision required before build (open question Q8:
  plan upgrade / tuned flags re-measured / separate render worker); PRD §13 carries the detail.
- **Key management** — AES-256 with an env-supplied master key is honest but limited (no rotation
  story, no HSM). Documented, not hidden; the storage audit (LER-1192) verifies what is actually
  claimed.
- **The render is the new heavy path** — pagination and pixel-diff make the suite slower; budgeted
  in the E2E plan (PRD §12), and the unit-test layer (tranche 1 landed; tranche 2 proposed) keeps
  logic feedback in seconds.
