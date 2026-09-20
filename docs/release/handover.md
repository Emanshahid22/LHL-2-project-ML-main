# Handover & documentation (LER-1196)

Four parts. The audience is whoever takes this system on when this delivery window closes —
assume they have the repo and nothing else. Written 27 Aug 2026, against the Release-01 staging
deployment (base `74b01b3`).

## 1 · Administrator guide

The Administrator account exists to manage people, not content. It holds exactly one capability
(`admin.users`) and **no content access — a tested property**, not a convention: every content
endpoint answers 403 to an Administrator, proven route-by-route in `e2e/release01-auth.spec.ts`.

**Signing in.** Use your email and password at the login page. A freshly seeded or freshly reset
account lands on the forced password-change screen and can do nothing else until a new password is
chosen (minimum 12 characters; no composition rules; known-breached choices are refused with an
explanation).

**The four actions** (all under Administration in the nav, all audited):

1. **List users** — name, email, roles, sensitive-material grant state.
2. **Create a user** — name, email, role, and a temporary password you convey out-of-band. The
   account is created with a forced change: the temporary password works exactly once, to set a
   real one.
3. **Change a role / the sensitive-material grant** — the four roles are Administrator, Senior
   Solicitor, Paralegal, Read-Only (their meanings are in the user guide). The grant can sit only
   on Senior Solicitor or Paralegal accounts; the API refuses it elsewhere (409), and refuses a
   role change that would strand a grant ("revoke the grant first").
4. **Reset a password** — issues a new temporary password, sets the forced change, and **revokes
   the account's live sessions immediately**. Both the reset and the eventual change are audited.

**What is deliberately absent in v1**: MFA (fast-follow), email self-service reset (fast-follow),
user deletion (reset the password and downgrade the role instead — history stays attributable),
and any admin view of forms, cases, documents or the archive.

## 2 · User guide (practitioners)

**Roles.** *Senior Solicitor* — everything a practitioner can do, including finalise, advisory
bypass, reopening for amendment, and the bypass-oversight listing. *Paralegal* — prepares forms:
create, edit, review, auto-fill, archive views and case linking, and document generation on their
own drafts; cannot finalise and cannot bypass an advisory. *Read-Only* — sees dashboards, drafts,
documents and the archive; changes nothing. Sessions last 8 hours idle / 12 hours absolute;
signing out ends the session server-side, immediately.

**The form pipeline, as a matter flows:**

- **Starting (UC-01)** — pick the form from the dashboard; forms open against a case or
  standalone. Every template header states its verification status honestly: six templates are
  layout-verified against the MoG 2011 specimen (a provisional, layout-only claim — D-F), five are
  not; none is practitioner-certified yet.
- **Auto-fill (UC-02)** — case-sourced values arrive badged with their provenance and are yours to
  accept or reject; nothing silently overwrites, witness identity fields never auto-fill from the
  defendant record, and a "case file has changed" banner is advisory, not an error.
- **MG11 wizard (UC-03)** — a stepped statement flow. Hearsay/opinion phrasings are highlighted
  with an explanation on hover; flags never block saving, navigating or completing. The statutory
  declaration is fixed wording (hash-pinned server-side) — no one, including the server, can vary
  it per statement.
- **MG6 schedule (UC-04)** and **validation (UC-05)** — schedule rows are tabular; validation is
  amber and advisory except where the scope demands a stop; formats are stated next to the field
  (dates display DD/MM/YYYY).
- **Language assistance (UC-06)** — offers prompts and questions, never insertable wording. That
  is a legal-safety rule: a suggested sentence would become the witness's signed words.
- **Sensitive material (UC-07)** — marking a schedule row sensitive activates the MG6D section for
  grant holders only, behind a fresh confirmation on every access. Colleagues without the grant
  see a locked notice naming the level and who holds access — the content itself never reaches
  their browser, their exports, or their diffs. Red styling is reserved for this feature alone.
- **Review & finalise (UC-08)** — run Review to get the quality issues with jump-to-field;
  finalise is refused while blocking issues stand; advisory issues can be bypassed only with a
  recorded reason, and every bypass appears verbatim in the Senior oversight listing.
- **Documents (UC-09)** — PDF and DOCX generate from finalised forms; files are AES-256-GCM
  encrypted at rest under names that carry no case information; the DOCX always carries the
  "Draft — not the authoritative version" header by scope design.
- **Archive & amendment (UC-10)** — a case's Documents section shows the current version of each
  form; the history drawer lists every version (Original, Amendment 1, …), each read-only,
  byte-intact and downloadable; reopen creates an editable amendment copy and supersedes the
  original; the field-level diff between versions redacts sensitive values on both sides before
  comparing. **Versions mint at document generation** — an amendment that is finalised but never
  generated has no archived version yet.

## 3 · Operations runbook

- **Deploy/redeploy**: `docs/deployment/release-01-staging-runbook.md` — env vars, Chromium,
  migrations, seed safety (D-I), verification checklist, basic-auth retirement, rollback.
  Environment identifiers and the 22 Aug baseline: `docs/deployment/railway-staging.md`.
- **Fonts are part of the image contract**: PDF text renders only if the image can load the
  embedded render font — `NIXPACKS_PKGS` must include `chromium fontconfig dejavu_fonts`. A
  fontless image produces *valid-looking but blank* PDFs (~1.3 KB; a healthy MG12 is ~30 KB).
  The 27 Aug deployment hit exactly this; the readiness report (LER-1191/1192) records it.
- **Key rotation** (`DOCUMENT_MASTER_KEY`): `tools/rotate-document-key` re-encrypts the store —
  it needs BOTH the old and new keys (`OLD_DOCUMENT_MASTER_KEY`/`NEW_DOCUMENT_MASTER_KEY`);
  rotation without re-encryption loses every existing document. **A pre-production rotation is
  mandatory (D-J)** because the first staging key's lifecycle included a chat-adjacent workflow.
- **Backups**: the persistent surface is `/data` (SQLite `mgforms.db` + `documents/` ciphertext).
  Back up both together — documents without the database (or either without the key) are opaque.
- **Sessions**: server-side rows; an operator can revoke any user's sessions via the admin reset,
  or all of a user's rows directly in the database (`authSession.revokedAt`).
- **Deadline**: Railway Config-as-Code (`railway.json`) sunsets **2026-12-01** — migrate to
  `.railway/railway.ts` before then.
- **CI**: outcome mirror at `refs/ci/<branch>/<run>/<status>-rr-<outcome>-e2e-<outcome>` (read
  with `git ls-remote origin 'refs/ci/*'`); render-regression baselines recapture ONLY via the
  `capture-baselines/**` push workflow.

## 4 · Fast-follow list (committed, ordered)

Security and auth:
1. **Pre-production key rotation** — mandatory per D-J, using `tools/rotate-document-key`.
2. **MFA** — ruling #7; on the LER-1189 checklist.
3. **Email self-service password reset** — ruling #5's fast-follow.
4. **CSP** — helmet ships `contentSecurityPolicy: false`; an Angular-compatible policy needs
   designing and testing.
5. **Rate limiter to the database** — required before any multi-instance deployment.

Platform and process:
6. **CI parallelisation** — the suite is serial (workers:1) over one SQLite file; ~12 min and
   growing. Parallelising needs per-worker databases.
7. **Full-depth QA passes** — the readiness report's depth statements name what was NOT done:
   no penetration test, no load test, no WCAG certification, heuristic-only accessibility. Each
   deserves its full-depth successor before real case data.
8. **Practitioner verification & ratification** — D-A..D-J are all PROVISIONAL; the ratification
   queue (LER-1124/1077/1078/1170/2390, Husnain's Q8) stands. Layout verification (D-F) is not
   practitioner sign-off.
9. **Acceptance-mapping extension** — `docs/acceptance-mapping.md` covers UC-01–08; UC-09/UC-10
   criteria live in their PR bodies and should be folded into the table.

Pre-pivot backlog (18 tickets, To Do; 21 minus LER-1013/1014/1015 which closed with Release-01 —
triage before building, several are superseded):
- Engine track: LER-1001 (shared field blocks), 1003 (rule primitives), 1004/1005 (schema
  compilers), 1007 (repeating sub-sections — the known flat-approximation gap), 1008 (layout
  binder), 1009 (core schema), 1010 (JSONB payload), 1011 (append-only constraint), 1012 (audit
  write path — largely delivered; reconcile rather than build).
- Process track: LER-996 (placeholder), 997/998/999 (confirm dependencies/scope/stack — overtaken
  by events), 1016 (pipeline setup — CI exists; reconcile).
- Template rebuilds: LER-1031 (MG1), 1032 (MG2), 1037 (MG14) — blocked on specimen sourcing, the
  same evidence bar as the six rebuilt templates.
