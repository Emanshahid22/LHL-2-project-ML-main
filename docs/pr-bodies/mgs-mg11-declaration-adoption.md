# MG11 declaration adoption (D-B, provisional) — and the page-count trio goes live

**Branch** `mgs/mg11-declaration-adoption` → `ali-zulqarnain/mgs-forms` ·
**Decision** D-B, `docs/decisions/provisional-decision-register.md` —
**PROVISIONAL, awaiting ratification** (LER-1200 · LER-1077 · LER-1078 ·
LER-1124 all stay open) · **Activates** LER-1071–1073's dormant mechanism.

## The evidence this stands on

The adopted wording is printed **identically on two independent genuine
specimens**: the Manual of Guidance 2011 MG11 (grade B — official document,
archival copy; `docs/reference/MoG-2011-july-archived.pdf` p104, sha256
`61e2805a…`) and the bbpolice.uk 2013 MG11 (grade C). Both carry all three
deltas from our previous constant, recorded first in
`docs/answers/template-sourcing-evidence-2026-08.md` §3 and corroborated in
`docs/reference/mog-2011-template-deltas.md`:

1. the page-count parenthetical *"(consisting of ___ page(s) each signed by
   me)"*;
2. the word order *"stated **in it anything**"* (ours read "anything in it");
3. the comma in *"…false**,** or do not believe to be true."*

The wording is **sourced, not invented** (rule 10 satisfied with real
citations). It is still a 2011/2013-era wording: current-use confirmation is
exactly what ratification is for, and the register records the reversal
path — one commit reverts the constant + hash pin and the trio re-dormants
automatically, because `declarationPageCountActive()` derives from the
constant itself.

## What changed

- `MG11_DECLARATION` → the two-specimen wording; `MG11_DECLARATION_SHA256`
  re-pinned (`335ff916…`); the API's boot refusal moves with the pair. No
  endpoint accepts declaration wording from a client — unchanged.
- **MG11 templateVersion 6 → 7.** No field added, renamed or removed (the
  declaration is never a field value); orphan-scan clean.
- **The LER-1071–1073 trio activates by construction**: the render pipeline
  now interpolates the document's ACTUAL page count into the declaration,
  re-renders, and **refuses to emit** a document whose declared count
  differs from its actual count (`renderWithPageCountAssertion` — the
  mechanism UC-09 shipped dormant, unchanged; only the constant moved).
- Tests moved from pinning dormancy to pinning activation: unit
  (interpolation fills the blank, idempotent at the same count, non-carrying
  text untouched; 148/148) and e2e (the declaration renders verbatim WITH
  the document's own page count; no un-interpolated `___` may reach a
  document). The uc03 wizard checks and the hash self-check import the
  constant and move with it.

## Immutability analysis (D-B item c — code-verified)

- **Serve never re-renders**: `openDocument` decrypts and streams STORED
  bytes; verify-then-serve (GCM authTag) pins exactly the old bytes, so the
  tamper path is unaffected by any constant change.
- **UC-10 version rows pin `contentHash`** — the archived record of every
  signed statement is immutable; the per-version download serves the bytes
  minted then.
- **A post-change regeneration of a FINALISED MG11 mints a NEW append-only
  version** (content differs → `shouldMintVersion` mints; prior versions
  and their bytes untouched). Superseded (ARCHIVED) drafts cannot generate
  at all (409). Nothing anywhere rewrites an existing document.
- Unsigned DRAFT MG11s simply render the new wording on their next
  generation — nothing signed has changed under anyone.

## The baseline recapture (render change, PR #197 discipline)

MG11's reference baseline changes and was **recaptured on the CI runner,
never locally**: `capture-baselines/mg11-declaration` → workflow run
**32969108175** (ubuntu-latest ubuntu24 20260823.283.1) → results branch →
review → commit `af40839`. Review before committing: **all ten other
forms' PNGs came back byte-identical** to the committed baselines (no
runner drift), and only MG11's pixels differ — the new declaration with
its un-interpolated blank (the baseline is the HTML body; interpolation is
the PDF pipeline's act and is e2e-asserted there). Only MG11's PNG +
sidecar are committed; the other twenty files are untouched. Throwaway
capture branches deleted.

## Verification (this exact tree)

- Unit **148/148** · conformance **68, 0 errors** · orphan-scan **clean**
  · pii-scan **clean**.
- MG11-relevant specs (uc03 wizard + uc09 + mg11-sourcing): **48/48**
  before the baseline commit.
- Full suite: dev.db run 1 **266 passed** · run 2 **266 passed** · fresh
  throwaway DB **266 passed**; dev.db baseline 35/76/0/0/0/0 verified
  restored; store empty.
- Render-regression is CI-authoritative (PR #197); the local run is
  advisory by design.

## Tickets

- **LER-1200** — provisional-adoption comment posted and read back;
  ratification still required. (Tracker status was already `Done` before
  this work — noted, not changed; the ratification queue lives on
  LER-1077/1078/1124 regardless.)
- **LER-1071 / LER-1072 / LER-1073** — the mechanism they delivered dormant
  is now live; their Done status gains its activation evidence here.
- **D-A / D-C / D-D / D-E** — reserved in the register awaiting the
  decision-maker's verbatim text; deliberately not reconstructed.
