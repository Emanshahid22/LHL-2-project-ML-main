# docs(uc-09): authoring pack — epic, 14-section PRD, 26 stories, open questions

**Branch** `mgs/uc-09-pdf-generation-pack` → `ali-zulqarnain/mgs-forms` · Documentation only — no
code, no tickets. **Delivering tickets are NOT created until this pack is reviewed** (the review is
the point of the PR).

## What this is

The UC-09 documentation pack, authored to the org template in full: a seven-section epic, a PRD
carrying **all fourteen** sections (UC-08's shipped ten; the omission was recorded, not repeated —
§9 Security & Performance is load-bearing here because the AES-256 and PII-free-path DoD lines need
a designed answer), one story per planned delivering ticket (26), nine-section human-instructions
with the project's two standing deviations stated in Git Workflow and Build Order, and open
questions carrying the deviations (D1–D7) and decisions (Q1–Q7).

## The architecture (decided on evidence, recorded as deviations)

**Clean rendering, not facsimile**, through the Playwright Chromium already in the toolchain over
HTML/CSS Paged Media. There is no official template source to be faithful to (LER-1198 re-opened on
that evidence; MG forms are Home Office/NPCC, not HMCTS — the scope's own naming is corrected in
§2), and a facsimile of an unverified field set would read as filing-ready, which rule 2 forbids.
Field-value-to-layout binding sits behind a `LayoutBinding` interface with layout declared as data,
so an overlay coordinate map is a second implementation rather than a rewrite. Every rendered page
is draft-marked while `verification !== 'verified'` — the same predicate as the header chip.

**UC-09 DoD 1 / Global DoD #8 is recorded explicitly OPEN** (D6), in the style of the Railway
record's DoD #12 non-claim: delivered instead are structural checks against the seven genuine
specimens, self-baseline pixel regression on all eleven, and a sign-off record (LER-1170) that only
a human closes. Genuine specimens only, ever — the AI-reconstructed 2026/06 files remain recorded as
a provenance defect and are never references.

## Scope decisions worth a reviewer's attention

- **D1**: LER-1154's WeasyPrint/Jinja2 is superseded by Chromium print-to-PDF (no Python runtime in
  a TypeScript monorepo; same authoring model). Also flagged upstream as a provenance signal: the
  UC-09 client block was specced against a stack this project never used.
- **D3**: pixel-diff (LER-1017/1156/1157) is self-baseline regression, not official-template
  comparison — the objective half that is buildable.
- **D4**: LER-1164's "auto-store to archive" is an honest UC-10 stub, the UC-08→UC-09 stub pattern.
- **D7**: encryption is application-level AES-256-GCM with an env master key, limits stated (no
  KMS on Railway); the API refuses to boot without a well-formed key.
- **LER-1018 and LER-1017 join UC-09** from the foundation block; **LER-1071–1073** (page count)
  return from their UC-03 deferral — the interpolation mechanism is built but activates only on the
  practitioner-approved declaration wording (Q1/LER-1200, the 2013-specimen mismatch).
- **LER-1269 is story 01**: no reference baseline is captured before the fixture-debt decision.
- One new story with no client original: **draft marking** (rule 2 on paper).

## Q1–Q8 need answers before or during the build

Declaration wording (practitioner); fixture strategy (decision-maker); whether UC-05 format errors
should gate generation; whether `finalising` should trigger the sparseness check (both 24 Aug wiring
findings); key management for release; the download filename convention (URN in or out); whether
MG1 renders at all (memo A1); and **where Chromium's memory lives** — measured 24 Aug at 618 MB RSS
idle / 762 MB peak with default flags, which does not fit safely in the current 1 GB Railway
container beside the API: plan upgrade, tuned-and-re-measured flags, or a separate render worker
(Q8 — gates deployment, not design).

## Verification

Docs only — `git status` over `apps/`, `libs/`, `e2e/`, `tools/` and root configs is empty. Full
gate set run regardless, per the pipeline; results quoted in the PR conversation. Memory
measurement for the runtime-Chromium question (raised by the coordinating session) recorded in the
pack before this PR opened: see PRD §13 / open-questions.
