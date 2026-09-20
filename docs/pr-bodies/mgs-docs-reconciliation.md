# docs(reconciliation): make the records tell the truth about UC-07, UC-08 and the 24 Aug audit

**Branch** `mgs/docs-reconciliation` → `ali-zulqarnain/mgs-forms` · Documentation and ledger only — no
code. The same shape as PR #131 ("make the tracker and the docs tell the truth about UC-01..06"), one
delivery cycle later: the 24 Aug dual audit found the drift running in the unusual direction — the code
ahead of its own records — across five documents. Merge after `mgs/verification-banner-absent` and
`mgs/build-safety-net`, which this PR describes as merged-or-in-flight by name.

No DoD line is delivered here; the PR exists so the DoD claims already made elsewhere read true.

## docs/acceptance-mapping.md

- **UC-07 and UC-08 sections added** — all eight of their scope-DoD criteria mapped, every one
  **Covered**, each citing its covering checks by test name. Summary moves **19/4/1 → 28 Covered /
  3 Partial / 1 Blocked** of 32.
- **UC-04 #4 Partial → Covered**: its reason ("UC-07 does not exist, so 'triggers UC-07 handling' has
  no handler to observe") is obsolete — the handler exists and is tested.
- **UC-03 #3 reason rewritten**: the finalise action exists now, so "submitted" is no longer
  structurally untestable; still Partial because no check finalises a *flagged* statement and asserts
  the flags reach that submission's audit record.
- **UC-03 #1 (the Blocked criterion) now carries evidence**: the constant was diffed character by
  character against the genuine 2013 specimen (bbpolice.uk/uploads/MG11.pdf) on 24 Aug and **differs in
  three places** (the missing page-count parenthetical, "in it anything" vs "anything in it", a comma).
  Recorded as evidenced-mismatch, decision pending — practitioner owns the wording (LER-1077/1200),
  UC-09 owns the page-count design. Nothing in code was touched.
- Two **new wiring findings recorded, deliberately not fixed** (they are decisions, not typos):
  1. the finalise gate runs the UC-08 quality engine, whose four checks do not include format
     validation — a draft with a hard sourced-format error can finalise; required fields do block;
  2. `shouldRunCompletenessCheck`'s `finalising` trigger is implemented in the pure function but no
     API call site passes it, so the scope's "fires on finalise" half of UC-04 #3 is still unwired.
- Header: suite 216 (217 with the banner fix), HEAD `19bc07a`, scope range UC-01–UC-08; the
  "six Partial rows" prose that contradicted the table's 4 is gone.

## docs/HANDOVER.md

- **§3 rewritten** to the state verified 24 Aug: UC-01..08 merged with the per-UC table, 216/216 ×3
  (fresh servers, exit codes captured), conformance 68, Railway staging live, **191 of 274 tickets
  Done** (live read-back), templates six-rebuilt/five-not with the precise verification wording (five
  legacy templates carry **no** `verification` property — the "every one reads 'unverified'" claim was
  untrue of the code), MG6 at 48 top-level fields / v5.
- **§5 gained the day's two verification gotchas**: an orphaned dev server makes the throwaway-DB leg
  silently test the wrong database (`reuseExistingServer` + the suite's direct-SQLite helper), and
  piping Playwright into `tail`/`grep` without `pipefail` masks failures — both bit on 24 Aug. The tsc
  gotcha now notes `noEmitOnError` closes its silent-corruption half once `mgs/build-safety-net` merges.
- **§7 roadmap rewritten**: UC-07/UC-08 items retired; the declaration item carries the mismatch
  evidence; the UC-09 item records the evidence-backed fidelity answer (clean rendering — there is no
  official source to be faithful to, and "HMCTS" is the wrong authority for MG forms) plus the LER-1269
  fixture-debt precondition; the agent-mode item collapsed to a footnote (LER-1269 flipped off in the
  UI, everything else Done; token rotation declined 24 Aug as a standing decision).

## CLAUDE.md and README.md

Status table + counts refreshed (216/217, 68 self-tests, UC-07/08 rows, UC-09/10 as the only
not-started), MG6 47 → 48 top-level fields, MG11 `templateVersion` 4 → 5 with the UC-08 annotation,
the verification-wording claim corrected, the throwaway-DB/pipefail gotcha added, and README's UC
table gains the UC-07/08 rows.

## docs/review/backlog-status.csv

Regenerated from a **live API pull, 24 Aug**: 242 → **274 rows** (the old file ended at LER-1239 and
was missing LER-1238 entirely), 32 stale statuses corrected (the UC-07/08 flips, 1104/1106/1107,
1040/1055), curated rows for LER-1240..1269, and LER-1198's row now reads **re-opened** (below).

## docs/answers/template-sourcing-evidence-2026-08.md (new)

Records, for the decision-maker: no official central source for blank MG forms exists (gov.uk page
carries guidance only; the Manual of Guidance is under NPCC embargo); the June 2026 official list has
no MG1, MG02 = Special Measures Assessment, MG14 = Conditional Caution, MG06C/D separate — evidence
for memo A1/A2/A3/A5 and LER-1205; the MG11 declaration mismatch; and the standing genuine-specimens-
only rule (the criminaljusticehub.org.uk 2026/06 files are AI recreations — never references).
**No designation was changed** (rule 8).

## Ticket writes done alongside (read-back verified)

- **LER-1198 re-opened** (Done → To Do) with the evidence comment — "obtain official HMCTS templates"
  is probably not completable as written and its Done was misleading UC-09 planning.
- **LER-1205** evidence comment added (stays Done).
- **Three defect tickets filed — LER-1270, LER-1271, LER-1272** (the unit-test tranche's library
  findings: shape-only date validity in Check 2; display labels keyed into acknowledgement issue ids;
  a half-filled sensitive schedule row reviewing clean — the last promoted to High). Rows added to
  the CSV; all three need the agent-mode UI flip (the API discards the field).
- Context from the same day, done before this PR: LER-1107 flipped Done with evidence (the UC-08
  finalise gate is its criterion, delivered and race-proven in PRs #142/#144).

## Also touched

`docs/usecases/uc-05/open-questions.md` (dated addenda: 1104/1106/1107 delivered by UC-08) and
`docs/usecases/uc-04/epic.md` (dated addendum: UC-07 now consumes the flag) — the original reasoning
is kept visible, the update is bracketed and dated.

## Verification

Documentation and CSV only — `git status` over `apps/`, `libs/`, `e2e/`, `tools/` and the root configs
is empty. Gates run regardless, per the pipeline: both builds, conformance 68/68, orphan-scan clean,
full Playwright ×2 on dev.db + ×1 on a fresh throwaway DB (fresh servers, pipefail) — results quoted
in the PR conversation.
