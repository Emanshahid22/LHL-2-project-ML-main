# UC-09 — PDF Generation & Formatting

Target: `ali-zulqarnain/mgs-forms` ← `mgs/uc-09-pdf-generation`

Delivers UC-09 end to end: a shared render model bound from the same template
definitions and predicates the screen uses, Chromium print-to-PDF off the
request path, AES-256-GCM at rest with content-addressed opaque storage keys,
a hand-rolled draft-labelled DOCX, the preview/download/retry client, three
new tools (`pii-scan`, `pixel-diff`, `capture-reference-renders`, plus
`rotate-document-key`), 11 committed reference baselines with provenance
sidecars, two new CI gates, 17 new unit tests and a 24-check e2e spec.

Delivering tickets **LER-2373–2398** (map at the end); pack:
`docs/usecases/uc-09/` (epic · 14-section PRD · 27 stories).

---

## Phase 0 — the Q8 gate (ran first, before any render code)

Decision ratified 25 Aug: tune Chromium flags and re-measure. Measured on the
heaviest realistic case (real MG3 template, 59 fields fully filled + an MG11
with a ~50 KB narrative and 14-row schedules), peak RSS of the whole process
tree sampled at 50 ms across 3 runs per profile:

| Profile | Peak RSS (3 runs) |
|---|---|
| default full Chromium | 392 / 391 / 393 MB |
| **tuned `chrome-headless-shell`** | **142 / 155 / 154 MB** |

Tuned flags: `--single-process --no-zygote --disable-gpu
--disable-dev-shm-usage --renderer-process-limit=1 --disable-extensions
--no-first-run --disable-background-networking
--js-flags=--max-old-space-size=192`. With the API's ~130 MB, the tuned total
≈ 285 MB against the 1 GB trial container — **~739 MB headroom**, far above
the 200 MB stop line. **Verdict: proceed; no plan upgrade needed.** Numbers
recorded in the PRD §13; the flags are the production render profile
(`CHROMIUM_RENDER_ARGS`), and one browser is launched per job and closed
after, on a depth-1 queue — at most one Chromium exists at any moment.

## Definition of Done — the scope's four lines, verbatim

> **(1) "PDF output matches official HMCTS MG form layout — verified against
> official template for all 11 form types."**

**OPEN — deliberately.** No official template source exists to verify
against: MG forms are Home Office/NPCC (not HMCTS — the scope's own naming
error, recorded in the PRD), no official central source has been found
(LER-1198 re-opened and re-scoped on that evidence), and the criminaljusticehub
2026/06 files are AI recreations that may never be references
(`docs/answers/template-sourcing-evidence-2026-08.md`). What ships instead is
the honest version: clean A4 renders claiming **structure, never facsimile**,
with per-form provenance sidecars (`e2e/reference-renders/*.json`) that say
so — `selfReferentOnly: true` for the four forms with no genuine specimen
(MG1/MG3/MG15/MG16). DoD 1 remains open against LER-1170 and the LER-1198
work; nothing in this PR claims or implies otherwise.

> **(2) "All MG form PDFs are encrypted at rest — verified via storage
> metadata."**

**Delivered and verified.** AES-256-GCM per document: random 96-bit IV per
file, auth tag on the row (a tampered file fails authentication and the
endpoint answers **410 + audit**, proven e2e on a real byte-flipped file).
The DB row records cipher/iv/authTag/contentHash — the storage metadata the
DoD names. Verified three ways: e2e reads the stored bytes (no `%PDF`, no
`PK`, and the decrypted stream hashes back to the row's contentHash);
`tools/pii-scan` checks magic bytes and cipher metadata on every stored file
and row (self-tests + CI step); DOCX is encrypted identically. Stated limits
(story D7, not hidden): one env-supplied master key, no KMS/HSM on Railway,
rotation = re-encrypt via `tools/rotate-document-key` (dry-run mode;
refuses to re-sign a file whose plaintext no longer matches its contentHash).

> **(3) "No defendant personal data appears in file names or storage paths —
> verified with an automated filename scan."**

**Delivered and verified.** `storageKey =
documents/<caseId|standalone>/<contentHash>.<kind>.enc` — opaque by
construction, with a write-time shape invariant in the service. Readable
filenames exist ONLY in the download response header, derived from row
metadata (`<formCode>-draft-<yyyymmdd>.<ext>`, LER-1167), never stored.
The automated scan is `tools/pii-scan` (LER-1018): self-tests first (a
planted leaky key must fail), then a live walk of every document row, stored
file and derived filename against personal-data patterns drawn from the same
database — defendant name/address tokens, DOB in five renderings, URNs, user
names/emails — plus the opaque-shape rule (a merely "clean" key of the wrong
shape still fails). Runs in CI after db:setup and inside the e2e suite over
rows the suite really created.

> **(4) "DOCX 'Draft' header present on every generated Word document."**

**Delivered and verified.** The scope's exact wording — **"Draft — not the
authoritative version"** — is pinned as a shared constant and written into a
real Word HEADER PART (`word/header1.xml`) referenced as the section default,
which is Word's own mechanism for "on every page"; it is not a paragraph that
scrolls away. E2E parses the stored OOXML parts and asserts the wording, the
header relationship and the content-type override. The DOCX is generated from
the SAME render model as the PDF (never by converting the PDF), so the pair
cannot disagree — including about redaction.

## What this PR does (mechanism, in one pass)

`POST /drafts/:id/pdf` re-runs UC-08's engine server-side (409 unless
`readyToFinalise`; a client claim is never trusted), enqueues, returns a job
id; the client polls `GET /pdf-jobs/:id`. The job builds ONE render model
from the CALLER's view — `withDormantSensitiveSections` then
`redactSensitiveValues` **before binding**, so a locked caller's model never
contains MG6D content — renders the PDF under the Phase 0 Chromium profile
with the draft band as a running header on EVERY page
(`verification !== 'verified'`, the shared predicate; absent verification
counts), builds the DOCX from the same model, normalises Chromium's embedded
timestamps so identical content hashes identically, counts pages from the
PDF's own page tree, encrypts, stores, audits (`PDF_GENERATED` /
`PDF_RETRIED` / `PDF_FAILED` / `DOCUMENT_DOWNLOADED` / `DOCX_EXPORTED` /
`DOCUMENT_INTEGRITY_FAILED`; a permitted caller's render of an active MG6D is
also a recorded UC-07 access with the document id). Failure writes a fixed
content-free reason, `retryable: true`, and touches nothing (LER-1169).
Tables repeat their header row on every page and never split a row
(LER-1163); exhibit citations in a narrative hyperlink to entries the same
document defines — via UC-08's `extractExhibitRefs` module, one convention,
inline matching added in the same file — and a dangling reference stays plain
text. MG11's declaration renders from the hash-pinned constant only; the
vulnerable-witness marker reads the PERSISTED flag. The MG11 page-count trio
ships as a **dormant mechanism**: interpolation activates only when the
pinned wording carries the parenthetical (LER-1200's practitioner decision —
wording unchanged here), and an interpolated count that disagrees with the
actual count FAILS the render.

## Not built / open — stated, not hidden

- **DoD 1 fidelity claim** — open (above). LER-2390/LER-1170 stays open.
- **MG11 page-count interpolation live** — mechanism shipped dormant, gated
  on LER-1200; pinned declaration NOT changed.
- **UC-10 archive integration** (scope flow step 6) — UC-10 does not exist;
  every document row carries `archiveStatus: 'pending-uc10'`, surfaced in the
  metadata DTO (the UC-08-banner-stub precedent, honest and visible).
- **Partial-PDF-on-large-attachment alt flow** — no attachment mechanism
  exists anywhere in the system; there is nothing to partially render. Out of
  scope per PRD §14.
- **Staging redeploy** — Railway's image was built with
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` and carries no Chromium, no
  `DOCUMENT_MASTER_KEY` and no `DOCUMENT_STORE_DIR`. Deploying UC-09 needs:
  install `chromium-headless-shell` at build, set a real 32-byte base64
  `DOCUMENT_MASTER_KEY`, set `DOCUMENT_STORE_DIR=/data/documents`. A deploy
  task, not part of this PR.

## Deviations & interpretations (all of them)

1. **D1 (pack, ratified 25 Aug):** Chromium print-to-PDF, not the client
   ticket's WeasyPrint/Jinja2 Python stack. "The SAME Angular templates the
   screen uses" is honoured at the level that matters and is stated plainly:
   ONE truth of what a form is — the shared `FormTemplate` definitions and
   predicates feed screen and paper; the render model is bound server-side
   (`CleanA4Binding`, per the pack's own PRD §4), not by driving the SPA.
2. **DOCUMENT_MASTER_KEY absent → ephemeral key + loud warning** (story
   letter said refuse to boot). Malformed → boot refusal, exactly as
   specified. Refusing on ABSENT would have broken every existing dev/CI boot
   path; the ephemeral key keeps the invariant that matters — bytes on disk
   are never plaintext — while making the missing configuration impossible to
   miss. Deployed environments must set the key.
3. **Verify-then-serve vs "never buffering whole files" (PRD §9):** GCM only
   authenticates at end-of-stream, and a response that has sent headers
   cannot become an honest 410 — so documents are decrypted in memory before
   serving (they are form-sized; sizeBytes is on the row). The story's
   410-plus-audit line won over the PRD's no-buffering line, and the trade is
   recorded here.
4. **Rule 5 (testids) — one retirement:** `uc09-stub` existed to mark the
   absence of UC-09; the absence is over. Its single assertion (uc08 spec)
   now checks the real control (`generate-pdf`). Every other testid is
   preserved; the suite grew, nothing else moved.
5. **LER-1156/1157 capture medium:** baselines are full-page screenshots of
   the print HTML at A4 width through the same pinned Chromium — the running
   band and page footers are print-engine chrome asserted on real PDFs in
   e2e, and page-count drift is asserted from the PDF page tree. Pixel drift
   of the BODY is what the gate owns. `pixel-diff` decodes and diffs inside
   Chromium itself (canvas `getImageData`) — no new native imaging
   dependency, per LER-1017's note.
6. **sensitive-rendering story, CSV-parity AC:** the locked PDF mirrors the
   SCREEN boundary (the schedule row is visible with its classification cell;
   the MG6D section is locked), while the CSV mirrors the DISCLOSURE boundary
   (flagged rows wholly excluded). One shared DEFINITION of sensitive —
   `sensitiveFieldIds` + the declared `sensitivityFlag` — two products. MG6D
   content reaches neither, which e2e asserts; the story's literal
   "exclude the same rows" conflated the two boundaries and is corrected
   here rather than contorted around.
7. **Failed-render e2e:** the renderer cannot be made to fail
   deterministically from outside the process, so the failed STATE is planted
   as the exact row the failure path writes, and retry semantics
   (PDF_RETRIED, draft byte-identical, next generation succeeds) are then
   exercised for real; the client's failure UI is exercised by intercepting
   one poll response and letting the retry flow hit the real backend.
8. **`GET /documents/:id/docx` resolution:** `:id` is the PDF row; the paired
   DOCX is resolved through the job that produced both (`PdfJob.
   docxDocumentId` — one column beyond PRD §6's list, so the pair produced
   from one render model stays linked without guessing).
9. **Generation gate vs advisories:** 409 on blocking issues or incomplete
   checks (`readyToFinalise`); advisories do NOT block generation of a
   draft-banded document — acknowledgements belong to FINALISATION, where
   they are audited verbatim (UC-08's contract, unchanged).
10. **Storage rows are per draft; ciphertext files are content-addressed.**
    Two drafts with identical content share one file; each has its own row
    carrying the file's cipher identity. An existing file is NEVER
    re-encrypted in place — re-signing it would orphan every prior row's
    auth tag (a real bug found and fixed during the build, below).
11. **LER-1165's unit line** (encrypt/decrypt round-trip + tamper-fails)
    lands as `rotate-document-key --self-test` (round-trip, tampered-byte,
    wrong-key — over the exact storage layout) plus the e2e tamper case;
    `document-crypto.ts` itself is API-side code the `node --test` harness
    has no compiled artifact for.
12. **Reference-baseline determinism across environments:** baselines were
    captured on this box (DejaVu fonts, the pinned Playwright Chromium) and
    re-render 0-pixel-identical locally. The first CI run is the
    cross-environment determinism check; if ubuntu-latest's font stack
    differs, the gate fails visibly and a recapture-policy decision is
    needed — that is the gate doing its job, recorded here in advance.

## Build notes (what was found on the way)

- **Page counter validated against poppler:** `countPdfPages` (page-tree
  `/Count` cross-checked with `/Type /Page` objects) agrees with `pdfinfo`
  on 1-page and 91-page renders; disagreement between the two reads throws
  rather than guessing.
- **Chromium output is deterministic except its timestamps** (probe: two
  renders of identical content differ ONLY in CreationDate/ModDate).
  `normalizePdfDates` replaces them in place, same byte length, so xref
  offsets survive — this is what makes content-addressed storage real.
- **Determinism exposed an IV-pairing bug** the first suite run caught:
  writing a twin file again under the same key while keeping the first row
  made GCM fail (file's IV ≠ row's IV). Fixed by never re-encrypting an
  existing file (deviation 10); the crash path it exposed (decipher erroring
  before handlers attach, killing the process) is gone with verify-then-serve.
- **db-guard earned its keep:** one throwaway-DB verification leg reused an
  orphaned dev-server on :3000 (the nest WATCHER respawns its child after a
  kill — the exact HANDOVER §5 incident); the guard failed loudly at the top
  of the run instead of producing 30 phantom failures to chase. Kill the
  watcher tree, not the child.
- **Exhibit links are real PDF link annotations** (verified: 300 citations →
  300 `/Subtype /Link` annotations; the e2e asserts exactly 1 for one defined
  citation with a dangling ref present).
- The eight `{}` drafts of 25 Aug 13:19 in dev.db (one per form code, an
  interrupted run's residue from before this branch) were left untouched;
  every draft this build created was logged and deleted, and dev.db ends at
  its pre-build state (35 drafts / 76 audit rows / 0 acks / 0 documents).

## Verification (all on this exact tree)

- `npm run test:unit` — **128 pass, 0 fail** (17 new render-model tests)
- `npm run conformance` — 68 self-tests, 0 errors 0 warnings
- `npm run orphan-scan` — 0 orphans
- `npm run pii-scan` — 7 self-tests passed, clean
- `node tools/pixel-diff --self-test` — 2 self-tests passed
- `node tools/rotate-document-key --self-test` — 3 self-tests passed
- `npm run render-regression` — 11 baselines compared, 0 failures
- Full e2e ×2 on dev.db: **248 passed, exit 0** · **248 passed, exit 0**
- Full e2e ×1 on a fresh throwaway DB: **248 passed, exit 0**
- dev.db before = after every run: 35 drafts / 76 audit rows / 0
  acknowledgements / 0 documents / 0 jobs. (The 35-draft working baseline is
  27 real drafts + 8 empty `{}` drafts left by a prior session's interrupted
  run on 25 Aug 13:19 — kept deliberately; they are not this branch's to
  delete.)
- An earlier battery iteration had one real failure the suite CAUGHT: the
  tamper check corrupting a content-addressed file that later identical-
  content tests share — fixed by isolating its content (`ff66d1b`), and the
  suite grew from 247 to 248 checks (uc09 spec: 24).

## Post-CI amendment — deviation 12 resolved (PR #194's first run)

CI failed exactly as deviation 12 predicted: all 11 baselines drifted 1–4% on
ubuntu-latest because the print CSS said `font-family: serif` and fontconfig
resolved it to a different face there than on the capture box (DejaVu Serif
here). Recapture policy decided: **rendering is now font-self-contained.**

- The exact DejaVu Serif Book/Bold files (the faces `serif`/`serif:bold`
  resolved to at capture time; free licence, copy shipped beside the asset)
  are embedded as base64 `@font-face` sources under the private family
  **"MGS Render Serif"** — generated asset at
  `libs/shared/assets/fonts/dejavu-embedded.css` (982 KB, regenerable via
  `tools/generate-embedded-font-css`). The layout (now **v2**) names ONLY
  that family — no generic fallback, so no machine's fonts can leak in;
  italic is synthesised by Chromium from the embedded regular,
  deterministically. The API fails a render loudly if the asset is missing.
- Fixing this surfaced a real race: `setContent(waitUntil: 'load')` can
  resolve before a data-URI font finishes loading, and a print that races it
  uses the last-resort face. Both render paths (PDF pipeline and baseline
  capture) now await `document.fonts.ready` before printing/screenshotting.
- It also exposed a brittle assertion, not a product fault: pdftotext
  swallows the hyphen when a token wraps AT a hyphen, and wrap positions
  shift with each run's unique marker widths — so the sensitive-marker
  assertions now compare hyphen/whitespace-normalised text on BOTH sides
  (positive and negative, so a wrapped marker can neither fail a presence
  check nor evade an absence check).
- All 11 baselines recaptured from the same frozen fixture; sidecars record
  the embedded font and why. Local proof: `render-regression` 11/11 zero
  drift, run twice; page counts for all 11 renders byte-for-byte unchanged
  from pre-embed (embedded DejaVu = the face already in use locally, so
  metrics are identical); uc09 spec 25/25; full battery re-run below.

## Ticket map (delivering ↔ client)

LER-2373↔1153 · 2374↔1154 · 2375↔1155 · 2376↔1156 · 2377↔1157 · 2378↔1158 ·
2379↔1159 · 2380↔1160 · 2381↔1161 · 2382↔1162 · 2383↔1163 · 2384↔1164 ·
2385↔1165 · 2386↔1166 · 2387↔1167 · 2388↔1168 · 2389↔1169 · 2390↔1170 ·
2391↔1171 · 2392↔1017 · 2393↔1018 · 2394↔1071 · 2395↔1072 · 2396↔1073 ·
2397↔draft-marking · 2398↔sensitive-rendering

🤖 Generated with [Claude Code](https://claude.com/claude-code)
