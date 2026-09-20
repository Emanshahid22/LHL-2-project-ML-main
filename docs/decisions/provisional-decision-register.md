# Provisional decision register

Opened 26 Aug 2026 under the decision-maker's direction: *"The team is
unresponsive; we proceed on documented best judgment."* Every entry here is
**PROVISIONAL — awaiting ratification**; nothing in this file is a
practitioner sign-off, and the tickets that carry the human queue stay open
(LER-1170, LER-2390, LER-1198, LER-1200, LER-1124, LER-1077, LER-1078).

## Register integrity note

The instruction that opened this register (26 Aug 2026) said to record
decisions D-A through D-E "verbatim", but its placeholder for the D-A,
D-C, D-D and D-E texts arrived unfilled. Those entries were opened as
RESERVED rather than reconstructed — a register of decisions must never
contain words the decision-maker did not write. The decision-maker
supplied the four verbatim texts later the same day; they are inserted
below unaltered. D-B's directive text arrived with the opening
instruction and was recorded verbatim from the start.

## D-A — Layout fidelity baseline (PROVISIONAL)

**The decision, verbatim from the decision-maker (26 Aug 2026):**

> Layout fidelity for the 11 MGs Forms templates is certified provisionally
> against the Manual of Guidance 2011 ("The Prosecution Team Manual of
> Guidance", July 2011 edition), retrieved as an archival copy of the
> College of Policing library publication (provenance grade B,
> docs/reference/specimen-provenance.md), together with the per-form delta
> analysis in docs/reference/. Rationale: this is the most authoritative
> publicly obtainable source; no current official public template source
> exists (the live College URL has served a blank placeholder since June
> 2024; the current Manual is NPCC-restricted). MG1 and MG3 have no
> specimen in any obtainable source; for those two forms, fidelity evidence
> can only be practitioner confirmation of current use. This certification
> is PROVISIONAL: final sign-off requires a practising practitioner
> confirming the templates match forms in current real-world use (LER-1170,
> LER-2390, LER-1124, LER-1077, LER-1078 remain open for that signature).

**Evidence relied on:** `docs/reference/specimen-provenance.md` (graded
ledger; MoG 2011 grade B, sha256 `61e2805a…`) ·
`docs/reference/mog-2011-template-deltas.md` (per-form deltas; 9/11 codes
have specimens) · `docs/reference/README.md` (retrieval provenance incl.
the gutted live URL). **Status: PROVISIONAL — awaiting ratification.**
**Reversal path:** the certification is a register entry, not code — a
practitioner ruling supersedes it directly; render baselines recapture per
the CI workflow if any layout is then changed. **Tickets held open:**
LER-1170, LER-2390, LER-1124, LER-1077, LER-1078 (and LER-1198's re-scoped
remainder).

## D-B — MG11 declaration: adopt the specimen-corroborated wording (PROVISIONAL)

**The decision, verbatim from the decision-maker's instruction (26 Aug
2026):**

> IMPLEMENT D-B on branch mgs/mg11-declaration-adoption:
> a. Update the MG11 declaration constant to the specimen-corroborated
> wording (all three deltas: page-count parenthetical, "stated in it
> anything", the comma). New SHA-256 hash, startup verification updated,
> template version bump.
> b. Activate the dormant page-count trio (LER-1071–73's
> interpolation/assertion work) now that the parenthetical exists —
> including the deterministic page-count interpolation into the rendered
> declaration and its tests.
> c. Immutability handling: existing FINALISED/ARCHIVED drafts keep the
> declaration text they were signed with (the stored snapshot/render is
> the record — verify nothing re-renders old versions with the new
> constant; UC-10's version rows already pin contentHash, confirm the
> tamper/serve path is unaffected).

**Evidence relied on:**
- `docs/reference/specimen-provenance.md` — the graded source ledger; the
  wording adopted appears identically on **two independent genuine
  specimens**: the Manual of Guidance 2011 MG11 (grade B,
  `docs/reference/MoG-2011-july-archived.pdf` p104, sha256 `61e2805a…`)
  and the bbpolice.uk 2013 MG11 (grade C) — all three deltas agree
  (`docs/answers/template-sourcing-evidence-2026-08.md` §3;
  `docs/reference/mog-2011-template-deltas.md`, MG11 section).
- The adopted text is therefore **sourced, not invented** (rule 10: the
  provenance is documented with real citations).

**Status: PROVISIONAL — awaiting ratification** by practitioner sign-off
(LER-1077 wording review · LER-1078 output review · LER-1124 sample
outputs · LER-1200 the declaration ruling itself). The 2011/2013 specimens
are the latest citable revisions, not proof of the current one.

**Reversal path:** the constant and its SHA-256 pin move together in one
commit (`libs/shared/src/lib/mg11-declaration.ts`); reverting that commit
restores the prior wording and re-dormants the page-count trio
automatically (`declarationPageCountActive()` derives from the constant).
Already-generated documents are immutable stored bytes (UC-10 version rows
pin `contentHash`; serve never re-renders), so reversal affects only
future renders — no signed record changes in either direction.

**Tickets held open by this decision:** LER-1200 (ratification), LER-1077,
LER-1078, LER-1124 (practitioner reviews), LER-1170 / LER-2390 / LER-1198
(layout certification ruling — same evidence base, separate question).

## D-C — MG2 and MG14 designations (PROVISIONAL)

**The decision, verbatim from the decision-maker (26 Aug 2026):**

> The forms built as "MG2" and "MG14" implement the client scope's
> descriptions (taped-interview record and eyewitness/Turnbull-factor form
> respectively). Specimen evidence shows the official forms bearing those
> numbers are different instruments (MG2 = Witness Assessment for Special
> Measures; MG14 = Conditional Caution). Decision: the built forms are NOT
> renamed, renumbered, or altered — the client scope is the contract and
> unilaterally changing the product would be a larger breach than the
> mismatch. The discrepancy is recorded here, in
> docs/reference/specimen-provenance.md, and in the delta memos, and is
> escalated as a standing question for the client. Reversal path: a client
> ruling can rename/renumber via a template-metadata change and baseline
> recapture.

**Evidence relied on:** `docs/reference/mog-2011-template-deltas.md` (MG2
and MG14 sections — zero field overlap with the official instruments,
specimen-backed) · `docs/answers/template-sourcing-evidence-2026-08.md` §2
(June 2026 list agrees). **Status: PROVISIONAL — standing client question
(memo A2/A3, LER-1205).** **Reversal path:** as stated verbatim above.
**Tickets held open:** the memo A2/A3 questions ride the practitioner
queue (LER-1124/1077/1078).

## D-D — Field-level deltas on matched forms (PROVISIONAL)

**The decision, verbatim from the decision-maker (26 Aug 2026):**

> Where our templates' fields diverge from the MoG 2011 specimens
> (documented per-form in the delta analysis), NO realignment is performed.
> Rationale: the client scope defines the required content and is the
> contract; the MoG specimens serve as fidelity evidence, not as a
> superseding requirement. The deltas remain on record for the practitioner
> reviewer, who may direct specific realignments at sign-off. Reversal
> path: per-form template change + baseline recapture per the established
> workflow.

**Evidence relied on:** `docs/reference/mog-2011-template-deltas.md`
(MG4/MG5/MG6/MG12/MG15/MG16 sections). **Status: PROVISIONAL — deltas on
record for the practitioner reviewer.** **Reversal path:** as stated
verbatim above (additive-only template edits, rule 3, still bind any
realignment). **Tickets held open:** LER-1124/1077/1078 (the reviewer who
may direct realignments).

## D-E — Standing provisional interpretations reaffirmed (PROVISIONAL)

**The decision, verbatim from the decision-maker (26 Aug 2026):**

> (1) "Cloud storage" means the deployed environment's encrypted document
> store (AES-256-GCM, content-addressed) behind the opaque storageKey; a
> future external object store is an adapter change, not a rework. (2) The
> archive remains append-only with no deletion path until a
> practitioner/DPO rules on retention and erasure obligations; that ruling
> remains an open question on record. (3) The UC-06 assistance service
> remains an unconfigured text-in/prompts-out boundary; no legal phrasing
> is invented pending a product decision on a real service. Each stands
> until ratified or reversed by the client, and each carries its documented
> reversal path.

**Evidence relied on:** `docs/usecases/uc-10/open-questions.md` #1/#3
(cloud storage; retention/erasure) · UC-10 PR body deviations 2 ·
`docs/usecases/uc-06/` pack + rule 10 (assistance boundary). **Status:
PROVISIONAL — each stands until ratified or reversed by the client.**
**Reversal paths:** (1) storage adapter behind `storageKey`; (2) a ruled
retention/erasure mechanism would be new, ticketed work; (3) configuring a
real assistance service is a deployment/product change. **Tickets held
open:** the retention/erasure ruling (open-questions #3, practitioner/DPO)
and the UC-06 service product decision (LER-1109/1110/1112).

## D-F — Layout verification marked on the six specimen-matched templates (PROVISIONAL)

**The decision, directed by Ali Zulqarnain (Consultancy Outfit), the acting
decision-maker in the client's absence, 26 Aug 2026:**

> The six named templates' verification flag is set to 'verified' on the
> basis of the documented field-by-field comparison against the MoG 2011
> archival specimens: **MG4, MG6, MG11, MG12, MG15, MG16** (per-form delta
> memos: `docs/reference/mog-2011-template-deltas.md`, sections MG4 /
> MG6 / MG11 / MG12 / MG15 / MG16). **MG1, MG2, MG3, MG5, MG14 remain
> unverified** — no specimen (MG1, MG3), partial match (MG5), or
> designation mismatch (MG2, MG14 — see D-C).

**MG11 caveat, recorded honestly:** MG11's match is FRONT-strong (all
front boxes correspond; the declaration is specimen-corroborated by two
independent sources per D-B) while the specimen's REAR sections — the
witness contact grid, non-availability dates, the six-row consent grid,
parent/guardian block — are largely unmodelled by our template
(delta memo, MG11 section). The 'verified' flag therefore certifies the
MODELLED field set against the specimen, with the rear-section gap on
record for the practitioner reviewer.

**Evidence relied on:** the per-form delta memos cited above ·
`docs/reference/specimen-provenance.md` (MoG 2011, grade B, sha256
`61e2805a…`) · the D-B two-specimen declaration corroboration ·
`docs/decisions/layout-verification-record.md` (the per-form sign-off
record for this decision). **Status: PROVISIONAL — practitioner
ratification still pending via LER-1124 / LER-1077 / LER-1078, which stay
open.** **Reversal path:** flip the flag back (template metadata change +
version bump), recapture baselines per the CI capture workflow. **Note on
rule 2:** the project rule "unverified means unverified… until a
practitioner signs off" is knowingly superseded for these six by the
acting decision-maker's provisional certification; the practitioner
condition is exactly what ratification supplies, and until then every
document remains reversible and the register is the record.

## D-G — Release-phase role model (PROVISIONAL)

**The decision, verbatim from the decision-maker (Ali Zulqarnain,
Consultancy Outfit, acting decision-maker, 26 Aug 2026):**

> Role model: (1) SOLICITOR — create/edit/finalise forms, generate
> documents, own personal archive, link cases. (2) SENIOR SOLICITOR —
> everything Solicitor has, plus visibility/oversight of advisory bypasses
> and future practitioner-verification actions. (3) SENSITIVE MATERIAL
> ACCESS — a stackable GRANT, not a role, assignable on top of either
> role; it is the existing UC-07 sensitiveMaterialAccess predicate made
> real. (4) ADMIN — manages users, roles, and grants; NO automatic access
> to case content or sensitive material (separation of duties in a law
> firm). Reversal path: roles are data, not code — the client can
> rename/amend at ratification.

**Recorded conflict, flagged at planning (not resolved here):** client
ticket **LER-1014** names FOUR roles — "Administrator, Senior Solicitor,
Paralegal and Read-Only — Four roles per scope document" — while the
public scope document itself specifies no role list at all (verified
26 Aug: its only auth text is the "user is authenticated" pre-condition
and UC-07's permission-level flow). D-G's model and the ticket's list
diverge (no Paralegal, no Read-Only; Solicitor instead). Because roles
are DATA under this decision, the divergence is reconcilable at
ratification without code change; the release-01 pack carries it as the
top human ruling (`docs/usecases/release-01-auth/open-questions.md` #1).

**Evidence relied on:** LER-1013/1014/1015 ticket texts (read in full,
26 Aug) · the scope's auth extract (no explicit password policy, OAuth
implementation, RBAC matrix or role hierarchy) · the existing
architecture's swap point (global APP_GUARD DemoAuthGuard, documented as
replaceable without downstream change; `sensitiveMaterialAccess` already
the UC-07/09/10 predicate). **Status: PROVISIONAL — awaiting
ratification.** **Reversal path:** as stated verbatim — roles are data.
**Tickets held open by this decision:** none closed by it; LER-1013/1014/
1015 are the delivering scope of release-01 stage 1.

## D-G AMENDMENT — ticket precedence on the role list (PROVISIONAL)

**Ruled by the decision-maker, 26 Aug 2026 (ruling #1 of the release-01
pack), verbatim:**

> ROLE LIST — the ticket wins (our own D-C logic: the client's ticket is
> the contract; D-G was written before we read LER-1014's text). Ship the
> ticket's four roles under the ticket's exact names: ADMINISTRATOR
> (user/role/grant management, password resets; NO access to case content
> or sensitive material — the D-G4 separation stands), SENIOR SOLICITOR
> (the full practitioner: everything incl. finalise, advisory-bypass with
> reasons, bypass-oversight listing, reopen/amend), PARALEGAL (prepares:
> create/edit drafts, run reviews, autofill, personal archive, case
> linking — CANNOT finalise, CANNOT advisory-bypass; generation allowed
> for drafts they own since output is draft-marked), READ-ONLY (view
> forms/documents/version history only; no
> create/edit/finalise/generate/link). The Sensitive Material Access GRANT
> stacks per #8. Record in the register: D-G amended — role names and
> count per LER-1014 verbatim; capability assignments are our documented
> interpretation, provisional.

**Status: PROVISIONAL** — the names and count are LER-1014's contract
text; the capability assignments are the documented interpretation,
reversible as data.

## D-H — Release-01 auth rulings #2–#9 (PROVISIONAL)

**Ruled by the decision-maker, 26 Aug 2026, verbatim:**

> #2 OAUTH2 SHAPE — approved as proposed: self-hosted authorization-code
> + PKCE, BFF-style, HttpOnly/Secure/SameSite session cookie, tokens
> never in browser JS, Argon2id, content-free failures, rate limiting,
> per-session CSRF, helmet.
>
> #3 SESSIONS — approved: 8h idle / 12h absolute; logout destroys the
> server-side session row.
>
> #4 PASSWORD POLICY — approved NCSC-style: minimum length 12, no
> composition rules, no forced rotation, deny-list check against
> known-breached passwords (bundled offline list), rate-limited attempts
> with content-free lockout messaging.
>
> #5 PASSWORD RESET — approved: admin-initiated reset in v1 (no SMTP
> exists). Admin sets a single-use temporary password; user forced to
> change on next login; both events audited. Email-based self-service is
> a fast-follow ticket, documented.
>
> #6 ADMIN SURFACE — minimal admin UI ships in v1, exactly four actions:
> list users, create user, assign/revoke role and grant, reset password.
> Nothing else (no content views — enforced and tested). Rationale:
> without SMTP or a client, seed-only provisioning would make UAT and
> handover impossible.
>
> #7 MFA — fast-follow, not v1. Documented in the register with rationale
> (BFF sessions + rate limiting + strong policy acceptable for staged
> release; MFA before production go-live is listed in the security-review
> checklist).
>
> #8 GRANT ON READ-ONLY — NO. The sensitive grant stacks on Senior
> Solicitor and Paralegal only. Least privilege: Read-Only exists for
> oversight of ordinary material; MG6D exposure needs an active
> practitioner role. Default-deny where the ticket is silent.
>
> #9 BYPASS OVERSIGHT — minimum interpretation approved: Senior Solicitor
> gets the read-only listing of advisory bypasses with their verbatim
> reasons. No approve/reject workflow in v1 (that's Husnain's still-open
> Q8 — note the linkage).

**Status: PROVISIONAL — each per the standing best-judgment directive;
ratification remains with the client/practitioner queue.** MFA joins the
security-review checklist (LER-1189) for pre-production; #9's linkage to
the open Q8 is noted for LER-1197 (Husnain sign-off).

## D-I — Deployed-environment seeding never uses the dev credential (PROVISIONAL)

**Ruled by Ali Zulqarnain, 26 Aug 2026 (standing best-judgment directive).**

Staging and production seeding never uses the documented dev credential.
The seed honours `SEED_USER_PASSWORD` when set: every fixture credential
is created with that value and **`mustChange: true`**, so the first
sign-in forces a real choice and `DEV_PASSWORD` never works in a deployed
environment. When unset, dev/e2e behaviour is unchanged. The seeded
administrator (`admin.e2e@`, or a renamed staging admin) provisions real
users through the ruled admin surface (D-H #5/#6): temporary passwords,
forced change, both ends audited. The deployed seed password lives only
in the platform's variable store, shared out-of-band, and is itself
burned by the forced change on first sign-in.

Implementation: `apps/api/prisma/seed.js` (branch
`docs/release-01-staging-prep`); proof — both paths seeded onto throwaway
databases: unset → 5 credentials, `mustChange` all false, dev password
verifies; set → 5 credentials, `mustChange` all true, the set password
verifies and the dev password is refused. The credential upsert's empty
update clause keeps both paths idempotent across reboots.

**Status: PROVISIONAL — ratification with the client queue.**

## D-J — Staging secrets generated in-place, never printed (PROVISIONAL)

**Ruled by Ali Zulqarnain, 27 Aug 2026 (standing best-judgment directive).**

The earlier candidate master key was exposed in a chat transcript and was
**NOT used**. Staging's `DOCUMENT_MASTER_KEY` and `SEED_USER_PASSWORD` were
generated in-place and piped directly into the Railway variable store in a
single command each — never printed, echoed, logged, committed, or repeated
in any transcript, file, or output. Verification is by behaviour only: the
variable's presence and shape (44-char base64 for the key), a clean boot
with no ephemeral-key warning, and the dev credential refused at login.
Ali reads `SEED_USER_PASSWORD` from the Railway dashboard himself for UAT;
it burns at each account's forced first-sign-in change.

**A pre-production key rotation is MANDATORY** — on the LER-1189 security
checklist and the handover fast-follow list — using
`tools/rotate-document-key` (which requires both old and new keys; rotation
re-encrypts nothing by itself).

Session-hygiene note, same authority: one machine-verification session id
was accidentally printed to the transcript by a harness error on 27 Aug;
it was revoked within one minute of exposure and all verification sessions
were swept (revoked) after use. Recorded here for the audit trail.

**Status: PROVISIONAL — ratification with the client queue.**

## D-K — Basic-auth shim retired ahead of the UAT gate (PROVISIONAL)

**Ruled by Ali Zulqarnain, 27 Aug 2026 (standing best-judgment directive).**

The staging basic-auth shim was retired **before** the runbook's UAT-sign-off
gate because it was blocking UAT itself: the shim challenged every path except
`/api/health`, and a real browser's credential cache does not attach the
`Authorization` header uniformly across navigations, `fetch()` calls and
lazy-chunk module imports — any header-less request drew a fresh
`WWW-Authenticate` challenge, looping the credential dialog and leaving the
page body blank. Diagnosis evidence: with correct credentials every layer
behaved (the app's own 401s carry **no** challenge header); without the header
every non-health path challenged, including `/api/*` and static chunks.

As executed: `STAGING_AUTH_USER`/`STAGING_AUTH_PASSWORD` deleted, service
redeployed (boot 08:15:41, no gate line). **The real session boundary
(LER-1015, matrix-proven) is the sole gate.** The login page and static bundle
are publicly reachable **by design**; every content endpoint answers 401
without a challenge header until a session exists. Verified end-to-end
post-retirement: anonymous browser routes to a rendered `/login` with zero
challenged responses; full PKCE login + forced change + finalise + PDF
generate/decrypt-download (34,288 bytes — fonts and key intact after the
redeploy); ten content endpoints spot-checked unauthenticated, all clean 401s.
Basic-auth remains available to re-enable at any time by setting the two
variables again (the shim code ships in `main.ts`, dormant without them).

Side-effect recorded: the verification burned `demo.solicitor@`'s seed
password (forced change to a machine value, never printed). Recovery is the
ruled admin flow: sign in as `admin.e2e@` and reset demo's password — which is
exactly the UAT B-block exercise.

**Status: PROVISIONAL — ratification with the client queue.**
