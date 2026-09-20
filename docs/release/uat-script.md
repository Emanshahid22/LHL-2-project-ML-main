# UAT script — Release-01 staging (Ali Zulqarnain, 30–45 min)

Every use case end-to-end through real login. Record **Pass / Fail + notes** per step; any Fail
stops the basic-auth retirement (runbook step 7) until triaged. Credentials arrive out-of-band
(runbook step 3); the basic-auth prompt still appears first during UAT — that is expected.

Fixture accounts: **admin.e2e@** (Administrator, Ashwin Rao) · **demo.solicitor@** (Senior
Solicitor with sensitive grant, Alex Marlowe) · **second.solicitor@** (Senior Solicitor, no grant)
· **paralegal.e2e@** (Paralegal) · **readonly.e2e@** (Read-Only).

## A · Authentication (5 min)

| # | Step | Expected | P/F · notes |
|---|---|---|---|
| A1 | Open the staging URL | Login page — no dashboard content visible before sign-in | |
| A2 | Sign in with a wrong password | One neutral message ("email address or password is not correct"); no hint whether the account exists | |
| A3 | Repeat a wrong password 5× quickly | Rate-limit message ("wait a minute") | |
| A4 | Sign in correctly as demo.solicitor@ | Dashboard loads; your name in the header | |
| A5 | First sign-in on a freshly seeded/reset account | Forced password-change screen; nothing else reachable until changed; min 12 chars enforced, a known-breached choice refused | |
| A6 | Sign out | Back to login; browser Back does not reveal content; API calls refused | |

## B · Roles at the edges (7 min)

| # | Step | Expected | P/F · notes |
|---|---|---|---|
| B1 | Sign in as admin.e2e@ | Admin page only: list users, create user, change role/grant, reset password. **No** Dashboard/Cases/Archive data — every content view refused | |
| B2 | As admin: create a throwaway user (Paralegal, temp password) | Appears in list; audited | |
| B3 | As admin: reset demo.solicitor@'s password | Temp password issued; demo's next sign-in forces a change | |
| B4 | Sign in as readonly.e2e@ | Can open dashboards/drafts read-only; every edit/create/generate control absent or refused naming the missing permission | |
| B5 | Sign in as paralegal.e2e@ | Can create/edit/generate own drafts; **Finalise is refused**; no oversight, no admin | |
| B6 | As demo (Senior): open Oversight | Bypass listing with verbatim reasons; read-only — no approve/reject controls exist | |

## C · The form pipeline, UC-01 → UC-08 (15 min, as demo.solicitor@)

| # | UC | Step | Expected | P/F · notes |
|---|---|---|---|---|
| C1 | UC-01 | New form → pick MG11 against a seeded case | Draft opens; header carries the verification banner (MG11 reads verified for layout, still provisional) | |
| C2 | UC-02 | Check auto-filled fields | Case-sourced values badged with provenance; witness fields NOT auto-filled; accept/reject works | |
| C3 | UC-03 | Walk the MG11 wizard to the narrative; type "I was told that he ran" | Hearsay flag highlights the phrase; hover explains why; saving is never blocked | |
| C4 | UC-03 | Complete the wizard | Declaration step shows the two-specimen wording with the page-count line; progress honest | |
| C5 | UC-04 | New MG6 → add unused-material rows | Schedule table behaves; row add/edit/remove; autosave indicator | |
| C6 | UC-05 | Enter an invalid URN / bad date | Field-level message, amber advisory styling, format stated | |
| C7 | UC-06 | In an MG5 narrative, open language assistance | Prompts only — **no insertable phrasing appears anywhere** (STANDARD_PHRASES ships empty) | |
| C8 | UC-07 | On the MG6, mark a row sensitive | Red styling (reserved for UC-07); MG6D section demands the handling confirmation before content shows | |
| C9 | UC-07 | Sign in as second.solicitor@ (no grant); open that MG6 | Locked section naming the level and who holds access; the sensitive content NEVER renders; non-sensitive export excludes the row | |
| C10 | UC-08 | Back as demo: run Review on an incomplete draft; try Finalise | Issues listed with jump-to-field; finalise refused (409-backed) while blockers stand; advisory bypass demands a reason and lands in Oversight (B6) | |

## D · Documents & archive, UC-09 → UC-10 (8 min, as demo.solicitor@)

| # | UC | Step | Expected | P/F · notes |
|---|---|---|---|---|
| D1 | UC-09 | Finalise a small completed draft (MG12); generate PDF | Job completes; PDF downloads and opens; layout sane; DOCX carries the unconditional draft header | |
| D2 | UC-09 | Check the filename | No defendant/witness names in filename or URL | |
| D3 | UC-10 | Find the finalised form in the case's Documents section | "MG Forms" folder; current version is the primary entry | |
| D4 | UC-10 | Reopen → amend a field → finalise again | New version minted; history drawer lists both; prior version read-only | |
| D5 | UC-10 | Diff v1 → v2 | Only the amended field shown changed; on a sensitive-bearing form the diff never exposes sensitive values | |
| D6 | UC-10 | As paralegal: link a standalone archived form to a case | Link succeeds (Paralegal holds archive.link) | |

## E · Close-out (5 min)

| # | Step | Expected | P/F · notes |
|---|---|---|---|
| E1 | As admin: delete/disable nothing — verify the throwaway user from B2 can be role-changed | Role change refused while a grant sits on a non-practitioner target; otherwise applies | |
| E2 | Audit spot-check: ask for the day's trail (admin cannot; demo's own actions visible where surfaced) | Login/reset/finalise/bypass events present with the acting user | |
| E3 | Overall: anything that felt wrong, slow, or misleading | Free notes | |

**Sign-off:** UAT ☐ passed ☐ failed — date · signature. Pass authorises runbook step 7
(basic-auth retirement).
