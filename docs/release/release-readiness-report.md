# Release-readiness report — Release-01 staging (filled 27 Aug 2026)

One section per release-phase ticket LER-1187–1193: the checks run, the results, and an honest
depth statement of what each pass does NOT establish. Standing context: every practitioner-facing
ruling is PROVISIONAL (`docs/decisions/provisional-decision-register.md`, D-A..D-J); no template is
practitioner-certified — six carry layout-only verification against the MoG 2011 specimen (D-F).

Deployment under test: Railway staging at base `74b01b3` (PR #211 + PR #214), font-fixed image
(`NIXPACKS_PKGS=chromium fontconfig dejavu_fonts`); the basic-auth shim was ON for these passes
and retired afterwards (D-K).

## ⚠ P1 defect found by HUMAN UAT that all 281 automated checks missed

Recorded here because the miss is as instructive as the find. **Defect:** with no session,
`/api/me` 401s and an unguarded `toSignal` in the app shell rethrew that error on **every
change-detection pass** — poisoning the whole logged-out app: the login form's `ngModel` never
synced (it POSTed empty strings), the failure message never rendered (a silently dead Sign-in
button), and Material's input wiring half-completed. **Why every automated check passed:** a
test-identity blind spot — every page test rides a logged-in storage state, the auth matrix and
the e2e global-setup log in via direct API, so **no automated test had ever typed into the login
form on a logged-out shell**. The first human to do so (Ali, first UAT attempt) hit it
immediately. **Fix:** `catchError(() => of(null))` on the shell's user stream (plus the same
guard on the one other unguarded `getCurrentUser` subscribe), and two new e2e tests that drive
the real form logged-out — wrong password must render the content-free message, correct password
must carry the typed values and land, and the logged-out shell must produce **zero** Angular
runtime errors, so this class fails loudly forever after. Suite: 281 → 283.

## LER-1187 · QA: Definition of Done checks — **complete, two gaps recorded**

**Run:** `docs/acceptance-mapping.md` re-verified against HEAD for UC-01–08 (the scope's 4
criteria per UC; statuses unchanged — the Blocked item remains the MG11 declaration wording,
which is a practitioner question, now materially advanced by D-B's specimen-corroborated
adoption). UC-09 and UC-10 are evidenced DoD-line-by-DoD-line in their PR bodies
(`docs/pr-bodies/mgs-uc-09-pdf-generation.md`, `docs/pr-bodies/mgs-uc-10-archive-case-attachment.md`)
and their delivering-ticket evidence comments. Release-01's three tickets are mapped in
`docs/pr-bodies/mgs-release-01-auth-rbac.md`.
**Gaps:** (1) the mapping table itself still covers UC-01–08 only — extension ticketed; (2) the
mapping's suite-count header was stale (219 vs 281) — fixed in this branch.
**Depth:** a documentation-and-evidence audit. It catches uncovered DoD lines; it cannot catch a
test asserting the wrong thing — that risk is carried by LER-1188's suite plus UAT.

## LER-1188 · Full regression test pass — **green**

**Run at the release base:** unit **157/157** · conformance **68 self-tests, 0 failures** ·
orphan-scan **clean** · pii-scan **clean** · `npm audit --omit=dev` **0 vulnerabilities** · full
e2e suite **281 passed (11.1 m)** on dev.db with the baseline (35/76/0/0/0/0 + 5 users) restored
after; the same suite passed 281×3 legs pre-merge on PR #211's branch. **Against the deployed staging instance:** a 28-check
behaviour probe — the three-layer surface, D-I credential behaviour, forced change end-to-end,
fresh templates (MG6 v6/48 fields), finalise→PDF→decrypt→DOCX, reopen→amend→v1/v2
lineage→redacting diff, the MG6D deny side with a valid body (403), CSRF negatives, logout
revocation — **all pass** (three initial failures were probe defects, re-verified correct:
`/api/me` is deliberately confined under mustChange; the confirmation enum; versions mint at
generation, not finalise).
**Depth:** serial, Chromium-only, single user; no cross-browser, no concurrency, no soak. The
staging probe is direct-API; the browser journey is UAT's (LER-1194).

## LER-1189 · Security review — **checklist complete; fast-follows stand**

**Proven on staging:** basic-auth shim + session boundary independent (basic-only → 401);
`/api/health` the only anonymous endpoint; dev credential refused (D-I); content-free identical
login failures with Argon2id comparable-time on unknown users; **cookie flags as designed —
`mgs_sid`: HttpOnly+Secure+SameSite; `XSRF-TOKEN`: Secure+SameSite, readable by design**;
CSRF-less mutation refused (403), including logout; forced-change confinement; session revocation
on logout; grant restricted to practitioner roles (409 otherwise); admin/content separation and
the 401/403 matrices (14 e2e tests, re-run green in every battery).
**Repo audit:** no hardcoded secrets beyond the documented dev fixture; key material only via
env; no ciphertext/db/session files tracked; `npm audit --omit=dev` clean.
**Boundary completeness:** `assertBoundaryComplete` refuses boot on any undeclared route —
mechanism code-reviewed; its refusal behaviour was exercised during stage-B development (boot
failure until DiscoveryModule wiring was correct).
**Incidents recorded (D-J):** an earlier candidate master key was transcript-exposed and NOT
used; one verification session id leaked to a transcript on 27 Aug and was revoked within a
minute. **Pre-production key rotation is mandatory** (`tools/rotate-document-key`).
**Fast-follows:** MFA (#7), email self-service reset (#5), CSP (helmet ships CSP off), DB-backed
rate limiter before multi-instance.
**Depth:** an implementer's checklist review — NOT a penetration test, NOT an independent audit.
It proves the boundary behaves as designed; it cannot prove the design has no blind spots. An
external review is the honest next step before real case data.

## LER-1190 · Accessibility pass — **heuristics run; one real finding, mitigated**

**Pass:** login route titled; `lang="en"`; keyboard focus lands on interactive elements with a
visible outline; submit reachable in tab order; dashboard images all alt'd or aria-hidden; all
buttons carry accessible names; nav and main landmarks present; exactly one h1.
**Finding (real, root cause CORRECTED after the P1 above):** the auth pages' Material inputs
rendered with no programmatic label association. This pass originally attributed that to
"Material 20 + template-driven forms wiring" — **that attribution was wrong.** The true cause was
the change-detection poisoning described in the P1 section: on a logged-out shell, Material's
directive wiring (ids, `label[for]`) never completed. With the CD fix in place the inputs wire
correctly (`mat-input-N` ids, labels associated) — verified. The explicit `aria-label`s added as
mitigation are **kept deliberately** as belt-and-braces. LER-2443 carries the correction.
**Depth:** heuristic and scripted — NOT WCAG 2.2 certification; no assistive-technology user; no
contrast computation (the token palette was designed to contrast targets, unverified by
measurement); form-fill pages beyond the dashboard were not swept.

## LER-1191 · Performance testing — **single-user timings, healthy**

On staging hardware (free-trial plan, shared vCPU, 1 GB container):
health **73–88 ms** · SPA index **71–89 ms** · login attempt incl. Argon2id **~140 ms** ·
form-templates **101–120 ms** · drafts list **82–88 ms** · **PDF generation ≈ 1 s** wall-clock
(0.9 s measured; ~33 KB output) · boot (migrations idempotent + seed + integrity gates) well
inside the 120 s healthcheck.
**Incident (material):** the first deployed image had no fonts — Chromium produced *valid-looking
but blank* 1.3 KB PDFs, caught because two versions that must differ hashed identically. Fixed by
adding `fontconfig dejavu_fonts` to the image; healthy PDFs are ~30–34 KB with distinct
per-version hashes. Runbook updated; the blank v1/v2 pair remains archived on staging as the
incident record.
**Depth:** single user, single instance, trial-plan hardware; no load, no concurrency, no SLA —
multi-user claims are meaningless on this deployment shape and were not attempted.

## LER-1192 · Storage audit — **clean**

`/data` holds exactly `mgforms.db`, `documents/`, `lost+found` — 316 KB of the 500 MB volume.
Every document file is `<sha256>.<kind>.enc` under an opaque path (**DoD #11 holds**; pii-scan
clean). The master key is present, shape-verified (44-char base64), **no ephemeral-key warning on
any boot**, and a document generated at 06:38 decrypted correctly at 07:0x — **after two
restarts and a full image rebuild** (GCM auth-tag verified at serve time). Deduplication is
by content hash with per-draft rows sharing cipher identity (designed, UC-10 condition #1);
4 document rows ↔ 3 files is correct, not an orphan. Railway's at-rest encryption remains a
Trust-Center citation (SOC 2 attested), not something we can inspect.
**Depth:** verifies this instance's posture; cipher implementation reviewed in code (AES-256-GCM,
verify-before-serve, 410 on integrity failure) but not independently cryptanalysed.

## LER-1193 · Audit trail review — **reconciled, zero PII, zero mutation**

The 27 Aug verification journey reconciles action-for-action against the trail: LOGIN_FAILED 1
(dev-credential probe) · USER_LOGIN/USER_LOGOUT · PASSWORD_CHANGED 1 (forced change) ·
FORM_INITIATED/DRAFT_SAVED · QUALITY_CHECK_COMPLETED · FORM_FINALISED · PDF_GENERATED ·
DOCUMENT_ARCHIVED (v1+v2 mints) · DOCUMENT_DOWNLOADED · DOCX_EXPORTED · FORM_REOPENED ·
SENSITIVE_ACCESS_DENIED 3 (the deny-side probes). **Zero PII in metadata** (checked against every
fixture name); **zero rows with updatedAt ≠ createdAt**; no update/delete code path exists.
**Caveats, honest:** (1) operator-minted sessions (used for machine verification, then revoked)
do not write USER_LOGIN — DB-level access bypasses application audit by nature; (2) append-only
is an application property — anyone with volume access can edit SQLite; claiming otherwise would
be dishonest.
**Depth:** one journey reconciled plus code inspection; not a tamper-resistance claim.

---

**LER-1194 (UAT)**: `docs/release/uat-script.md` — awaiting Ali's run and sign-off, which gates
basic-auth retirement. **LER-1195 (staged release)**: deployed and verified as above; complete
once UAT signs off and basic-auth retires. **LER-1196 (handover)**: `docs/release/handover.md` —
complete.
