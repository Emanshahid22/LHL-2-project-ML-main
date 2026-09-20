# Fix — render-regression environment pinning (deviation 12, final resolution)

**Branch** `fix/render-regression-pinned-container` → `ali-zulqarnain/mgs-forms` ·
**Follows** PR #194 (UC-09) · **Closes out** UC-09 deviation 12.

## The process breach, stated plainly

**PR #194 was merged while its CI was red.** The render-regression step was
failing on every run at the time of merge, and the E2E suite — which sits
after it in the job — had therefore **never executed in CI**. Nothing about
the merge made that red disappear; the base branch `ali-zulqarnain/mgs-forms`
has carried a failing required check since. This PR exists to restore a green
base, and this section exists so the audit record says how it got red: the
merge was performed before the CI verdict was acted on, out of process. The
correct sequence — fix, re-run, merge on green — resumes here.

## Why render-regression was still red after the font embed

Deviation 12 landed in two halves:

1. **PR #194's first run** drifted 1–4% on all 11 baselines because
   `font-family: serif` resolved to different faces on the dev VPS vs
   ubuntu-latest. Fixed in `86f6780`: the exact DejaVu Serif Book/Bold bytes
   are embedded as `@font-face` under the private family `'MGS Render
   Serif'`, no fallbacks, `document.fonts.ready` awaited. That was correct
   and stays — it removed the **font-selection** variable.
2. **PR #194's second run** (with the embed) still drifted 1–4% on all 11 —
   smaller (MG1 9975→9528 differing pixels) but present. With the font bytes
   now identical everywhere, the residual drift is **rasterization
   variance**: FreeType/fontconfig hinting and antialiasing differ between
   the VPS and the runner (and potentially the Chromium builds differ).
   Cross-environment pixel comparison cannot be made deterministic by
   shipping assets alone.

## The fix: one authoritative capture environment

**Preferred path (pinned Playwright container) was not available**: the VPS
has no container runtime (`docker`, `podman`, `nerdctl` all absent), so
baselines cannot be produced locally inside the image CI would use. The
implemented path is the documented fallback: **CI's own runner class is the
authoritative capture environment.**

- **New workflow `capture-reference-renders.yml`** captures the 11 baselines
  on ubuntu-latest using steps that mirror `ci.yml`'s path to its
  render-regression step (same runner class, same lockfile-pinned toolchain,
  same `npx playwright install --with-deps chromium`). It self-checks by
  recapturing and pixel-diffing in-run (zero drift required), publishes the
  result to a `<branch>-results` branch and uploads an artifact.
- **The committed baselines in `e2e/reference-renders/` were produced by that
  workflow** (run id in every sidecar's new `capturedOn` field), reviewed
  visually against the outgoing VPS-captured set, and committed here.
- **Local `npm run render-regression` is now ADVISORY; CI is the gate.**
  A local run diffs a VPS-rasterized candidate against runner-rasterized
  baselines — 1–4% antialiasing drift is expected and does not indicate a
  regression. Stated in the tool headers (`tools/pixel-diff`,
  `tools/capture-reference-renders`) and in `ci.yml`'s step comment.
- **The font embed stays.** The two halves compose: the embed fixed *which
  glyphs*, this PR fixes *how they are rasterized*. Without the embed the
  runner-captured baselines would still be hostage to whatever face
  fontconfig picks after an image update.

## Deviations from the ideal, stated

- **No API token on the dev VPS** (SSH-only GitHub access), so:
  - `workflow_dispatch` exists on the capture workflow but cannot be invoked
    from the VPS; the working trigger is a push convention — push any
    `capture-baselines/**` branch at the commit to capture from.
  - Captured baselines come back as a `<branch>-results` **branch** (fetched
    over SSH), not only as an artifact.
  - CI verdicts are read back via a new **outcome-mirror step** in `ci.yml`:
    the job pushes its status (plus the render-regression and E2E step
    outcomes) to a `refs/ci/<branch>/<run>/<verdict>` ref. Refs under
    `refs/ci/` are invisible to normal clones and safe to prune.
- **Runner-image drift remains possible**: `ubuntu-latest` rolls, and a
  future image bump could shift rasterization again. That failure mode is
  visible (render-regression fails loudly) and recoverable (re-run the
  capture workflow, review, commit) — the same recapture-as-deliberate-act
  policy that already existed. The pinned-container path removes this
  residual too; it stays open until the environment offers a container
  runtime or the team accepts pinning a runner version.
- **`ci.yml` timeout 20→40 min**: this PR triggers the first-ever CI
  execution of the full 248-check E2E suite (~9 min on the dev box, plus
  install/audit/build on a 2-core runner). Disclosed here rather than
  slipped in.
- **Bootstrap CI run on the throwaway capture branch is red by design**: the
  capture branch carried the old VPS baselines, so its `CI` run fails
  render-regression exactly as the base does. The fix branch itself is
  pushed only after the new baselines are in, so its first run is the
  proving run.

## Not touched

- **No product code.** Renderer, API, UI, templates, storage — all
  untouched. Changes are CI workflows, tool provenance/comments, and the
  baseline PNGs/sidecars themselves.
- **Page geometry and layout**: unchanged (layout stays v2, embedded font
  unchanged), so PDF page counts are unaffected by this PR.
- The instruction stands: if the first CI E2E run surfaces a real product
  defect, it gets reported before anything is changed.

## Verification

- Capture workflow run `32888319061` on ubuntu-latest (image ubuntu24
  20260823.283.1): 11/11 captured, in-run self-check (recapture +
  pixel-diff) passed with zero drift before the results were published —
  `capturedOn` in every `e2e/reference-renders/*.json` sidecar records the
  run.
- Visual review of new vs outgoing baselines: identical layout — all 11 PNG
  dimensions byte-match (the embedded font pins geometry), and the diff
  images show magenta on letterforms only: pure glyph-antialiasing variance,
  no structural change.
- Local advisory pixel-diff of new baselines vs outgoing (quantifying the
  environment delta this PR removes from CI): 3.9–4.8% differing pixels per
  form, all confined to text rasterization.
- The outcome-mirror mechanism proved itself on the bootstrap branch before
  the fix was in: its CI run mirrored
  `refs/ci/capture-baselines/uc09-bootstrap/32888319114/failure-rr-failure-e2e-skipped`
  — the expected red (old VPS baselines vs runner candidates), which is also
  one more confirmation of the diagnosis.
- CI on this branch: **green** — run `32888635760` mirrored
  `refs/ci/fix/render-regression-pinned-container/32888635760/success-rr-success-e2e-success`:
  the job succeeded, render-regression passed against the runner-captured
  baselines, and the 248-check E2E suite passed **its first execution in CI
  ever**. (The commit adding this verdict paragraph is docs-only and triggers
  one further run.)

## Ticket map

Deviation 12 belongs to UC-09 (PR #194, LER-2373–2398 evidence trail). This
PR is the remediation record for that deviation; no new tickets are claimed
by it.
