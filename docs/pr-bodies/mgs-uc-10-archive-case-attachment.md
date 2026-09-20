# UC-10 — Form Archive & Case Attachment

**Branch** `mgs/uc-10-archive-case-attachment` → `ali-zulqarnain/mgs-forms` ·
**Pack** `docs/usecases/uc-10/` (epic · PRD · 16 stories · human instructions ·
open questions) · **Delivering tickets** LER-2423–2438 (map at the end).

The final use case of the MGs Forms scope: every generated document lands in
an append-only, versioned archive — attached to its case's Documents section
or held in the personal archive until manually linked — with reopen-for-
amendment, a version history drawer, per-version downloads, a field-level
diff inside the UC-07 boundary, and search.

## Definition of Done — the scope's four lines, verbatim

> - Version history correctly preserves all prior versions on amendment —
>   tested through 3 amendment cycles
> - Prior versions are accessible for download but cannot be re-opened for
>   editing
> - Standalone form manual case-linking works correctly from the archive view
> - Case file Documents section shows the correct current version as the
>   primary entry

**DoD 1** — the e2e check `three amendment cycles: every prior version
present, downloadable, byte-intact, labelled, PII-free` runs Original →
Amendment 1 → 2 → 3 (V4 exists) and after EVERY cycle asserts the full
history via the API: presence, download, `sha256(bytes) == contentHash`,
correct labels, PII-free filename AND storage key per version.
**DoD 2** — enforced at the API, not the interface: every mutating endpoint
409s on a superseded version (edit/autofill/review/finalise/generate/
reopen), proven by direct-API e2e checks that bypass the UI; the UI's
disabled form and superseded banner are labelled courtesy in the code.
**DoD 3** — the archive view's Link-to-case dialog drives
`POST /archive/lineages/:id/link`; whole-lineage attachment, `CASE_LINKED`
audited, 409 already-linked / 404 inaccessible-case surfaced content-free;
e2e covers API and UI paths.
**DoD 4** — `GET /cases/:id/documents` returns ONE primary entry per
lineage and it is always the CURRENT version; the e2e asserts V2 primary
with V1 only in the drawer.

Applicable Global DoD: **#9** (version history — DoD 1 above), **#11** (no
defendant personal data in file names or storage paths — asserted per
version in e2e; `tools/pii-scan` extended to version-aware filenames,
version labels and lineage ids, fail-closed in CI), **#12** (encrypted at
rest — UC-10 stores no new document bytes; versions reference UC-09's
AES-256-GCM content-addressed files, never re-encrypted or moved).

## What this PR does (mechanism, in one pass)

Additive schema (`lineageId`/`amendedFromId` on FormDraft; append-only
`ArchivedVersion` with unique `(lineageId, versionNumber)` and denormalised
`contentHash`). On every successful generation the version mints **in the
same transaction** as the UC-09 document rows; number and label come only
from the shared `planVersionMint` (no endpoint accepts either), and
`shouldMintVersion` implements the one no-mint case — the same current
draft re-serving its own unchanged latest version. **Version identity is
row-level, not content-level** (review condition 1): an identical-content
amendment still mints, pointing at the same immutable twin file with shared
cipher identity. Reopen (`POST /drafts/:id/reopen`) copies values wholesale,
carries the lineage, supersedes the source to `ARCHIVED` in the same
transaction, and fork-guards one-open-amendment-per-lineage. Amendments are
first-class drafts: UC-08's gate and UC-09's generation run in full
(LER-1176 is a proof-test). The diff (`GET .../diff`) runs the shared
`diffArchivedValues` under the caller's real permission — redaction
precedes comparison for unpermitted callers, so a sensitive value can never
surface as "changed from X to Y"; a permitted sensitive diff audits
`SENSITIVE_SECTION_VIEWED` via `'version-diff'`. Serve-time re-check: a
version minted `containsSensitive` answers 403 to any caller without the
permission NOW — revoked-after-contribution included, case access
regardless. Case-holder read scope: case access grants the version list and
non-sensitive downloads (`accessibleLineage`/`accessibleDocument`), never
the UC-07 boundary. UI: case Documents section ("MG Forms" folder, current
version primary), version drawer (scope's exact fields + withheld state
naming the level, never content), archive view with LER-1186's four
server-side filters and the link dialog, diff view rendering only what the
endpoint returned (transient signal, refetched per compare), superseded
banner + form-disable courtesy locks, reopen action on the finalised
banner. Audit: `DOCUMENT_ARCHIVED`, `FORM_REOPENED`, `CASE_LINKED` on every
write; reads unaudited except the permitted sensitive diff (per stage-2
instruction 6).

## Not built / open — stated, not hidden

- **External case-management-system attachment** — its API-docs ticket is
  still open; UC-10 attaches to the internal case model only
  (`open-questions.md` #2, escalated at Phase 1).
- **Retention / erasure vs append-only** — needs a practitioner/DPO ruling
  (`open-questions.md` #3, flagged at Phase 1); LER-1182 built exactly as
  ticketed.
- **UC-09's LER-2390 / LER-1170 stay open** (DoD-1 fidelity ruling) —
  unaffected by this PR.
- **Scope's client-side "PDF generated locally" storage-failure fallback**
  — contradicts the encrypted-store design; the UC-09 job retry
  (`PDF_RETRIED`) is the failure path (PRD §10).
- **"Retried automatically on next login"** — attachment cannot fail
  independently of the mint transaction in this architecture and no login
  lifecycle exists; the honest equivalent is the always-visible unlinked
  state with the link action (PRD §10, `open-questions.md` #5).

## Deviations & interpretations (all of them)

1. **Row-level version identity** (Phase-1 review condition 1) — PRD §4/§6
   amended at the gate; `planVersionMint` takes no content input by
   construction; unit-pinned matrix in `shouldMintVersion` tests.
2. **"Cloud storage" = the deployed environment's encrypted store**
   (`open-questions.md` #1; LER-1202 provisioned and Done). No S3-class
   service introduced; a future adapter sits behind the opaque `storageKey`.
3. **Sensitive retrieval at the widened boundary** — scope silent; the
   LER-2398 precedent applied: deny + document (`sensitive-retrieval`
   story, LER-2438). Decision was listed for veto at Phase 1 (#4).
4. **Multiple versions inside one cycle share a label** (edited and
   regenerated before finalising): disambiguated by number and date —
   PRD §11 interpretation. Labels derive from the amendment cycle exactly
   as scope step 7 words them.
5. **'Amendment in progress' status** means a REOPENED copy is open; an
   original still in DRAFT reports `Final` (the scope's step-2 wording for
   the Documents entry).
6. **Diff viewer has no scope sentence** — LER-1183's ticket is the
   requirement (`open-questions.md` #6).
7. **Three uc09 checks updated to the post-UC-10 truth** they had pinned
   (commit `0002a71`): the `pending-uc10` stub assertion became the
   'attached' real-state check, and two filename regexes gained `-v<N>`;
   the PII negative assertions were untouched.
8. **Reopen UI action added** on the finalised banner (stage-3 list didn't
   name it, LER-1174's user story does — without it the flow is API-only);
   flagged in the stage-3 report for review.
9. **Error-copy drive-by**: the four status-guard messages moved to
   `lockedReason()` — fixing the "a archived form" grammar and naming the
   supersession, content-free.
10. **`CurrentUserDto` gains `sensitiveMaterialAccess`** for the withheld
    presentation only; every access is re-checked server-side.
11. **Generation guard ordering** (stage-2 requirement): the ARCHIVED
    generation guard shipped one commit before anything could set the
    status — no point in branch history has the state without the guard.
12. **agentMode lands `true` on created tickets** (the known field-specific
    write defect) — LER-2423–2438 need the manual UI toggle, queued.

## Verification (all on this exact tree)

- Unit: **147/147** (128 pre-UC-10 + 15 stage-1 + 4 mint-matrix).
  Conformance **68 self-tests, 0 errors**; orphan-scan **clean, exit 0**;
  pii-scan **clean, exit 0** (version-aware filenames, labels and lineage
  ids included).
- Full e2e suite (266 checks: 248 pre-UC-10 + 18 uc10):
  dev.db run 1 **266 passed, exit 0** · dev.db run 2 **266 passed, exit 0**
  · fresh throwaway DB **266 passed, exit 0**. One earlier battery failure —
  the dashboard nav check pinning two destinations — was the suite catching
  the new /archive link, updated to the intent-preserving truth
  (`14a9c57`).
- dev.db working baseline 35 drafts / 76 audit rows (27 real + 8 empty
  `{}` kept deliberately) verified before each leg and restored after;
  document store empty; render baselines untouched (no render-path change —
  render-regression stays CI-authoritative per PR #197).

## Ticket map (delivering ↔ client)

LER-2423↔1172 · 2424↔1173 · 2425↔1174 · 2426↔1175 · 2427↔1176 ·
2428↔1177 · 2429↔1178 · 2430↔1179 · 2431↔1180 · 2432↔1181 · 2433↔1182 ·
2434↔1183 · 2435↔1184 · 2436↔1185 · 2437↔1186 ·
2438↔sensitive-retrieval (no client original — the LER-2398 precedent).

Client originals get evidence-comment references at reconciliation, after
merge — the UC-09 pattern; nothing flips before Ali merges.
