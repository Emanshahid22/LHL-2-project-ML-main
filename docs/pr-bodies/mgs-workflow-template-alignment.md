# Workflow compliance: human-instructions on the org template, pack-template rules recorded

Branch `mgs/workflow-template-alignment` @ `a28f689`, cut from `ali-zulqarnain/mgs-forms` @
`4cbbdcd` (the PR #144 merge). Target: `ali-zulqarnain/mgs-forms`. One commit, documentation only —
six files (five human-instructions files + `CLAUDE.md`).

## Why

The `humanInstructions` field — the block DevOps Bot reads first and treats as authoritative — was
empty on every delivering ticket this project created (61 of them), while the packs all contained
the content in the org's "Full-Stack / Codebase Task" format. A Cowork-verified probe on the
throwaway LER-1238 established that `PUT /tasks-ml/{id}` accepts `humanInstructions` after all (the
long-standing "status + description only" contract was incomplete), which made a backfill possible.
Before pushing anything, the files themselves were brought fully onto the org template.

## Changes Made

### The five pushed human-instructions files (uc-04 … uc-08)
- Every file now carries **all nine of the standard's named sections**: Repos, Git Workflow, Build
  Order, Backend Rules, Frontend Rules, Third-Party Integrations, Full-Stack Coordination, PR
  Requirements, Ground Rules. uc-04/05 needed only Full-Stack Coordination; uc-06 gained Build
  Order and Full-Stack Coordination; uc-07/08 were restructured under the full heading set.
- **Nothing was replaced** — headings were added around the existing project-specific rules, which
  stand verbatim (the designation-independence rule, the never-invent-a-format rule, the
  never-invent-phrasing rule, the sensitive-material rules, the one-gate-one-place rule).
- The project's **two standing deviations are now stated where they bite**, instead of silently
  contradicted:
  - *Git Workflow*: branches are `mgs/uc-NN-<slug>`, not `<JIRA-TICKET-ID>` — the use case is the
    unit of work and review; per-ticket branches are cut only when a reviewer asks.
  - *Build Order*: shared engine → API → UI, the reverse of FE-mocks-first — `libs/shared` is the
    single source of truth both apps compile against, so the domain types must exist before either
    app can honestly mock or consume them.

### CLAUDE.md
- **Corrected tasks-ml write contract**: PUT honours `status`, `description` AND
  `humanInstructions`; the `agentMode` discard is field-specific (proven against both encodings and
  both auth styles on the same endpoint); every write 202s regardless and a humanInstructions-only
  write does not bump `version` — read-back is the only verification.
- **Ticket creation defaults**: set `humanInstructions` at `POST /tasks-ml` (as the UC-04 block
  did) so no backfill is ever needed again; `dueDate` stays omitted; `agentMode` stays untrusted.
- **Pack templates from UC-09 onward** (UC-01–08 recorded, not rewritten): the epic's seven exact
  headings and the PRD's fourteen numbered sections; the note that UC-08's PRD omitted Data Model &
  Schema, Data Flow & Integrations, Security & Performance, and Dependencies/Risks/Rollout; and
  that **UC-09's PRD must carry all fourteen** — Security & Performance is load-bearing there
  because UC-09's DoD claims AES-256 at rest and PII-free storage paths.

## The backfill (API operation, not part of this diff — recorded here for the audit trail)

After the files were aligned and committed, each UC's file was pushed to its delivering tickets —
`humanInstructions` only; no `status`, no `description` sent:

| Block | Tickets | Payload | Result |
|---|---|---|---|
| UC-04 | LER-1239 | uc-04 file, 9,128 chars | byte-exact on read-back |
| UC-05 | LER-1207–1222 (16) | uc-05 file, 12,695 chars | 16/16 byte-exact |
| UC-06 | LER-1223–1237 (15) | uc-06 file, 17,335 chars | 15/15 byte-exact |
| UC-07 | LER-1240–1254 (15) | uc-07 file, 8,200 chars | 15/15 byte-exact |
| UC-08 | LER-1255–1268 (14) | uc-08 file, 7,732 chars | 14/14 byte-exact |

**61/61 verified byte-exact by read-back** (the only trustworthy signal — every write 202s and
`version` does not increment on this field). LER-1238 skipped as instructed; statuses read back
unchanged; no other field touched. Nouman's evidence bundle gained the field-specific-discard
finding and the version-non-increment observation.

## Testing

Documentation-only diff: no code path changes. `git diff --stat` shows the five human-instructions
files and CLAUDE.md only. The backfill was verified ticket-by-ticket as above; the ledger after the
run is unchanged at 273 total / 190 Done / 83 To Do with statuses intact.

## Checklist

- [x] All nine standard sections present in every pushed file; existing rules kept verbatim
- [x] Both deviations stated explicitly in the sections they contradict
- [x] CLAUDE.md records the corrected write contract, creation defaults, and UC-09+ pack templates
- [x] 61/61 backfill read-backs byte-exact; LER-1238 skipped; no status/description sent
- [x] Docs-only diff; targets `ali-zulqarnain/mgs-forms`, not `main`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
