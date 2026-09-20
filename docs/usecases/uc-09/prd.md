# UC-09 — PDF Generation & Formatting — PRD (as planned)

All fourteen org sections present — UC-08's PRD shipped with ten and that omission is recorded, not
repeated; §9 here is load-bearing because two Global DoD lines (encryption at rest, PII-free paths)
need a designed answer, not a checkbox.

## 1. Summary

Render a reviewed form to PDF with the Chromium already in the toolchain, preview it in the browser,
offer a draft-labelled DOCX, store both encrypted under a PII-free identity, and hand off to UC-10
through a stub. Clean rendering, not facsimile — decided on sourcing evidence
(`docs/answers/template-sourcing-evidence-2026-08.md`): no official template source exists, "HMCTS"
is the wrong authority for MG forms, and a faithful-looking facsimile of an unverified field set
would read as filing-ready, which standing rule 2 forbids. Every rendered page is marked as a draft
while its template's `verification !== 'verified'` — the same predicate as the form-header chip.
The scope's layout-match DoD is recorded **explicitly open**, in the style of the Railway record's
DoD #12 non-claim.

## 2. Scope requirements (verbatim)

> **Description.** Final form rendered as a correctly formatted PDF matching the official HMCTS MG
> form layout — correct field positions, fonts, borders, and header/footer. PDF is the authoritative
> output; DOCX also available. Generated files are encrypted at rest.
> **Actors.** Authenticated legal professional; PDF generation service; document storage service.
> **Pre-conditions.** Form has passed quality check (UC-08) with no blocking issues. PDF generation
> service available.
> **Main Flow.** (1) User clicks "Generate PDF" from the review screen. (2) PDF generation service
> renders the form using the official HMCTS MG form template for the specific form type. (3)
> Generated PDF displays in an in-browser preview. (4) User can scroll through the preview and zoom;
> download button available. (5) DOCX option: "Download as Word" button generates an editable DOCX —
> labelled as "Draft — not the authoritative version" in the document header. (6) PDF stored in the
> case document archive (UC-10) automatically on generation. (7) PDF encrypted at rest using
> AES-256; defendant personal data not included in the file name or storage path.
> **Alt Flow.** Form spans multiple pages (e.g., a lengthy MG11 narrative): PDF pagination is
> handled automatically. Exhibit references in the narrative are hyperlinked within the PDF to the
> corresponding entry in the exhibits section where the format allows.
> **Error Handling.** PDF generation fails — user notified with a retry option; draft data is
> preserved. Partial PDF generated (e.g., due to a large attachment): warning shown; user offered
> the option to generate without the attachment and add it manually.
> **Post-conditions.** PDF generated, previewed, and stored in the case archive. DOCX available for
> download. Both files encrypted at rest. File names contain no defendant personal data.
> **Definition of Done.** (1) PDF output matches official HMCTS MG form layout — verified against
> official template for all 11 form types. (2) All MG form PDFs are encrypted at rest — verified via
> storage metadata. (3) No defendant personal data appears in file names or storage paths — verified
> with an automated filename scan. (4) DOCX "Draft" header present on every generated Word document.

Two corrections of the scope's own terms, recorded here rather than silently adopted: MG forms are
**Home Office / NPCC**, not HMCTS; and the client-original mechanism ticket (LER-1154) names
**WeasyPrint and Jinja2**, a Python stack this TypeScript monorepo does not contain — superseded by
Chromium print-to-PDF over the same HTML/CSS Paged Media authoring model (deviation D1 in
`open-questions.md`).

## 3. What already exists

- **UC-08's gate and stub**: `POST /drafts/:id/finalise` (409 while blocking issues stand), the
  REVIEWED/FINALISED statuses, and the finalised banner's explicit "PDF generation arrives with
  UC-09" stub — the exact seam this use case fills.
- **Chromium**: Playwright pins it for the suite; the same binary renders print CSS. Nothing else in
  the stack can produce paginated PDF without a new runtime (deviation D1).
- **The shared template layer**: every field, section, narrative declaration and provenance record —
  the renderer's single source of truth. `isVulnerableWitness` is already persisted in draft values
  precisely so PDF output would not have to re-derive it (UC-03 #4 has waited for this).
- **The verification predicate**: the header chip's `verification !== 'verified'` test
  (`mgs/verification-banner-absent`) — hoisted to `libs/shared` here so screen and paper cannot
  disagree about what is unverified.
- **Genuine specimens**: bbpolice.uk 2010/11 and 2013 forms for MG2, MG4, MG5, MG6, MG11, MG12,
  MG14 — already verified during the template rebuild; the only acceptable structural references.
- **The audit write path**: generation, retry, download and export events extend the existing trail.
- **LER-1269's inventory** of dev.db fixture pollution — the reason baselines wait for a decision.

## 4. Mechanism

A `RenderService` in the API composes: template + draft values + case → **layout binding** →
HTML/CSS (Paged Media: `@page` size/margins, running header/footer, page-break rules) → Chromium
`page.pdf()` → post-checks (page-count assertion; PII scan of the storage key) → encrypt → store →
audit. Rendering runs **off the request path**: `POST /drafts/:id/pdf` enqueues and returns a job
id; the client polls job status (no websocket infrastructure exists, and none is added for this).

**Layout as data behind an interface.** `FormLayout` (per form: page geometry, section order, box
styles, header/footer content) is declared as data in `libs/shared`, versioned like templates. A
`LayoutBinding` interface maps (template, layout, values) → render model; the one shipped
implementation is `CleanA4Binding`. An overlay coordinate map over a scanned official form — if an
official source ever materialises — is then a **second implementation, not a rewrite**.

**Draft marking.** While `verification !== 'verified'`, every page carries a running header band:
"DRAFT — template not practitioner-verified" plus the same explanation as the header chip. This is
rule 2 on paper: the render must never read as filing-ready until a practitioner signs the field set
off. The marking is in the layout layer, not the template, so sign-off flips it without a render
change.

**MG11 page count** (LER-1071–1073): Chromium reports the true page count post-pagination; the
declaration line interpolates it ("consisting of N page(s)") **only when the practitioner-approved
wording carries the parenthetical** — until LER-1200 is decided, the mechanism exists behind the
same hash-pin discipline and the shipped wording is unchanged; a render-time assertion fails
generation if the interpolated count and the actual page count disagree (a statement declaring three
pages while four generate is defective output, not a warning).

**Sensitive material on paper (UC-07's boundary, unchanged by format).** The render model is
built from the caller's OWN view: for a caller without the Sensitive Material Access permission the
same server-side redaction the DTO applies (`redactSensitiveValues`) runs before binding, so the
locked section renders as its placeholder (level named, never content) — generating a document is
never a way around the lock. A permitted caller's MG6D renders under its red-band section header,
and the generation is recorded as a UC-07 access. The binding handles the ABSENT MG6D key — the
stored truth for any never-opened section — exactly like the review engine
(`withDormantSensitiveSections`), and **no MG6D content ever reaches a log line, job row, filename
or storage key** (ids and counts only, the audit-metadata discipline; the PII/content scan enforces
it). One shared definition of "sensitive" feeds screen, CSV export, PDF and DOCX — never a second
parser. See `stories/sensitive-rendering.md`.

**DOCX**: generated from the same render model (not by converting the PDF), with the scope's exact
header text "Draft — not the authoritative version" on every page header. PDF remains the
authoritative output.

## 5. API surface

- `POST /drafts/:id/pdf` — start generation. 409 unless the draft's latest review passes UC-08's
  gate (re-run server-side; a client claim is never trusted). Returns `{ jobId }`. Audited.
- `GET /pdf-jobs/:jobId` — status: `queued | rendering | done | failed` (+ document id or a
  user-readable failure and `retryable: true`). Failure never mutates the draft (LER-1169).
- `GET /documents/:id/preview` — decrypted stream, inline content-disposition, for the in-browser
  preview. Access-checked like the draft it came from.
- `GET /documents/:id/download` — decrypted stream; filename generated at download time from DB
  metadata (LER-1167), never stored.
- `GET /documents/:id/docx` — the draft-labelled DOCX.
- No endpoint accepts layout, wording or filename input from a client — the layout is data in the
  repo, the declaration stays hash-pinned, filenames are derived server-side.

## 6. Data Model & Schema

New table `GeneratedDocument`: `id` (uuid), `draftId`, `caseId?`, `formCode`, `templateVersion`,
`kind` (`pdf | docx`), `contentHash` (sha-256 of plaintext), `storageKey` (derived — see §9),
`cipher` (`aes-256-gcm`), `iv`, `authTag`, `sizeBytes`, `pageCount`, `renderedBy`, `createdAt`.
`PdfJob`: `id`, `draftId`, `status`, `failureReason?`, timestamps. Bytes live on the existing volume
under `/data/documents/`; the DB row is the only place a document's identity is human-decodable.
Migration is additive; no existing table changes. Audit events: `PDF_GENERATED`, `PDF_RETRIED`,
`PDF_FAILED`, `DOCUMENT_DOWNLOADED`, `DOCX_EXPORTED` — writes only, like every other audit event.

## 7. Data Flow & Integrations

Draft values never leave the process: template + values + case flow into the render inside the API;
the only integration is the local Chromium (launched per job, closed after; no long-lived browser).
The UC-10 stub records the would-be archive attachment (`archiveStatus: 'pending-uc10'` on the
document row) exactly the way UC-08's banner stubbed UC-09 — visible, honest, no fake archive UI. No
third-party service receives form content; there is no external PDF API, deliberately (the module's
data is criminal-case material).

## 8. Client

The finalised banner's UC-09 stub becomes the entry point: **Generate PDF** (enabled only on a
finalised or clean-reviewed draft — the API re-checks regardless), progress state from job polling,
then an inline preview (`<iframe>` on the preview endpoint — scroll and zoom are the browser's own,
plus explicit zoom controls per LER-1160), a download button, and **Download as Word** beside it
with the draft label explained. Failure shows the reason and a Retry button; the form data is
untouched. The draft-marking band is part of the rendered page, not client chrome, so what is
previewed is byte-for-byte what is stored. All controls carry `data-testid`s; red is not used (the
draft band uses the advisory amber tokens — red stays reserved for UC-07 sensitive material).

## 9. Security & Performance

**Encryption at rest (Global DoD #12, UC-09 DoD 2).** Application-level AES-256-GCM per document:
random 96-bit IV per file, key = env `DOCUMENT_MASTER_KEY` (32 bytes, base64). Platform attestation
was already judged insufficient for LER-1202, so the claim is made where we can verify it: the
storage audit checks stored bytes are ciphertext (no `%PDF` magic), the DB row records cipher/IV,
and decrypt happens only in the two streaming endpoints. **Stated limits, not hidden:** single
master key, rotation requires re-encrypting (a tool ships with the story), no HSM/KMS on Railway —
if the client needs managed keys, that is a hosting decision recorded for LER-1192's audit.
GCM's auth tag also gives integrity: a tampered file fails decryption rather than serving altered
content — worth having on a criminal-case document store.

**PII-free storage identity (Global DoD #11, UC-09 DoD 3).** `storageKey =
documents/<caseUuid|standalone>/<contentHash>.<kind>.enc` — nothing human-meaningful, by
construction. Enforced, not asserted: the **storage-key PII scan** (LER-1018) ships as
`tools/pii-scan` beside orphan-scan — it walks every storage key and download-filename template and
fails on personal-data patterns (names from seeded/case data, DOB-like dates, anything matching the
defendant fields), with self-tests like conformance's. CI runs it; the Railway volume inspection
that evidenced DoD #11 for staging becomes a repeatable check instead of a one-off.

**Access control** rides the existing guard (and inherits its known weakness — DemoAuthGuard trusts
a header; OAuth2/RBAC are LER-1013/1014 in the release block; recorded, not solved here). Documents
are reachable only through draft-scoped access checks; the preview/download endpoints are audited.

**Performance.** Rendering is off the request path (§4) — a slow render never blocks a save.
One Chromium per job, hard timeout (30 s), queue depth 1 worker to start (SQLite is the bottleneck
anyway); measured in LER-1191's performance pass. Preview streams decrypt without buffering whole
files in memory. The suite's render checks reuse one warm browser via Playwright, keeping wall-clock
sane (§12).

## 10. Failure modes

- Render crash/timeout → job `failed` with reason; draft untouched; Retry re-enqueues (LER-1168/69).
- Page-count assertion fails → generation **fails** (defective output is never stored), audited.
- PII scan match on a would-be storage key → generation fails loudly — a bug, not a warning.
- Missing/malformed `DOCUMENT_MASTER_KEY` → API refuses to boot (same discipline as the wording
  integrity gates) rather than storing plaintext silently.
- Decrypt failure (tamper/corruption) → 410 with an honest message; audited.
- Chromium missing in the deploy image → health-checkable at boot (a render self-test on startup),
  not discovered on first user click.
- The scope's "partial PDF due to a large attachment" flow is **out of scope** — no attachment
  feature exists to attach (§14).

## 11. Business rules

1. Clean rendering; no facsimile claim anywhere (rule 2 + sourcing evidence). Genuine specimens
   only as structural references; AI-reconstructed forms are never references.
2. Every page of every render is draft-marked while `verification !== 'verified'`, via the shared
   predicate the header chip uses.
3. PDF is authoritative; DOCX always carries the scope's exact draft-header wording.
4. Generation is gated on UC-08's server-side re-check — a client cannot claim a passing review.
5. The declaration wording does not change here; interpolation activates only with the
   practitioner-approved wording (LER-1200), and count-vs-actual disagreement fails the render.
6. No defendant personal data in any storage key or stored filename; readable filenames exist only
   at download time.
7. Reference baselines are captured only after LER-1269's fixture decision is executed.
8. Failure preserves the draft, always.
9. Renders obey UC-07's boundaries: a locked caller's document carries no MG6D content, an absent
   key renders like the engine reads it, and no sensitive content reaches logs, filenames or
   storage keys (`stories/sensitive-rendering.md`).

## 12. E2E plan (and the unit layer)

New `e2e/uc09-pdf-generation.spec.ts` (~22 checks): gate (generate refused without a passing
review, API-level); happy path (job → preview visible → download; bytes at rest are not `%PDF`;
DB row carries cipher metadata); draft marking present on every page for an unverified template and
absent when the template is served as verified (browser-boundary stub, the banner-fix precedent);
DOCX draft header on page 1 and page N; pagination (long MG11 narrative → multi-page, page-count
assertion agrees); the declaration interpolation mechanism behind its flag; retry path (induced
failure → draft byte-identical → retry succeeds); PII-free path (create for a case with a known
defendant name → no storage key contains it — plus the tool's own run); exhibit hyperlink
best-effort; UC-10 stub visible and honest; audit rows for generate/retry/download/export;
standalone (case-less) drafts render; sensitive-boundary checks (a locked caller's render and a
permitted caller's render byte-differ only in the MG6D section; the absent-key render; the
no-MG6D-content scan over logs, keys and filenames).

**Unit layer** (the tranche-2 pattern, in the same `node --test` harness tranche 1 established):
layout bindings are pure — binding output for a fixture template/values snapshot; filename
generator property tests (never contains any defendant field value, any date-of-birth shape);
page-count interpolation (0/1/N, missing count fails); encrypt/decrypt round-trip + tamper fails;
PII-scan rule self-tests. Logic feedback in seconds; the e2e run proves the wiring.

Fixture note: render checks use Sofia Renard or per-suite dedicated cases per the LER-1269
decision — never the polluted baselines.

## 13. Dependencies, Risks & Rollout

**Q8 RESOLVED (25 Aug 2026, Phase 0 measurement, decision ratified: tune-and-remeasure).** The
tuned profile — the `chrome-headless-shell` binary Playwright already ships plus
`--single-process --no-zygote --disable-gpu --disable-dev-shm-usage --renderer-process-limit=1
--disable-extensions --no-first-run --disable-background-networking
--js-flags=--max-old-space-size=192` — peaked at **142/155/154 MB RSS across three runs** printing
the heaviest realistic case (MG3's 59 fields fully filled plus an MG11 with a ~50 KB narrative and
14-row schedules; ~60 KB PDFs). Default full Chromium measured 393 MB peak on the same case. With
the API's ~130 MB, the tuned total ≈ 285 MB against the 1 GB trial container — ~739 MB headroom,
comfortably above the 200 MB stop-line, so no plan upgrade and no worker split. These flags are the
production render profile.

Depends on: UC-08 (done); LER-1269 decision (**executed** — PR #187); practitioner wording
(LER-1200) for interpolation activation only — the mechanism does not wait. Risks: **Chromium
memory, measured 24 Aug and plan-changing** — with default flags the browser process tree idles at
**618 MB RSS after launch and peaked at 762 MB** across an 8-page and a 25-page render (renders
themselves are cheap: 49/78 ms, 39/67 KB outputs; dev-box numbers, same order expected in a
container). Beside the API's ~130 MB on the current 1 GB Railway free-trial container that leaves no
safe headroom, even with the per-job launch-render-close model. **Decide before building (Q8):**
upgrade the Railway plan, tune Chromium down (headless-shell + `--single-process`/
`--disable-dev-shm-usage` etc. — re-measure before relying on it), or run rendering as a separate
worker service. Also: image size and cold start (mitigated by off-request rendering and a boot
self-test; measure the image before/after); key management honesty (§9); suite wall-clock growth
(one warm browser, budgeted); the sign-off record (LER-1170) staying open indefinitely — it gates
DoD 1's claim, deliberately, and is listed in every status report until a human signs. Rollout:
land behind the existing staging basic-auth gate; `DOCUMENT_MASTER_KEY` set in Railway before
deploy; volume space check (500 MB — PDFs accumulate; the storage audit watches it); no schema
changes to existing tables so rollback is dropping two additive tables.

## 14. Out of scope / deferred

UC-10's real archive, versioning and case attachment (stub only); attachment handling and the
"partial PDF" alt-flow (no attachments exist in the product); overlay/facsimile layout
implementation (interface ready, no referent to implement against); declaration wording change
(practitioner); managed key service (hosting decision); DOCX fidelity beyond the draft-labelled
export (PDF is authoritative); print-shop niceties (bleed, CMYK) — screen-and-office printing only.
