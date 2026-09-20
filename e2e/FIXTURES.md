# E2E case fixtures — ownership and rules (LER-1269)

UC-08's cross-form Check 3 is **case-wide by design**: every draft on a case contributes its values,
and divergent case data (an edited defendant name, a malformed URN) is **correctly** flagged as
blocking on every later review of that case. That made the seeded cases a shared, slowly polluting
resource — UC-08 originally survived by hunting for "the last unpolluted case" (Sofia Renard) with
run-unique exhibit tokens. LER-1269 promotes that workaround into the pattern this file documents:

**A suite that WRITES case-divergent data owns a dedicated fixture case. No suite may read another
suite's fixture, and no suite may depend on another's leftovers.**

## Ownership table

| Case (defendant) | Owner | Why it exists |
|---|---|---|
| Daniel Foster | shared, READ-ONLY | auto-fill truth (values written by autofill equal the case, so they never diverge) |
| Marcus Bellamy | shared, READ-ONLY | two offences on different dates — the ambiguity fixture |
| Sofia Renard | shared, READ-ONLY | single offence + hearing, general read use |
| Liam Okafor | shared, READ-ONLY | no hearing, no CPS reference — the `no_data` fixture |
| Edward Whitfield | colleague-only | must never appear in the demo user's picker |
| **Theo Marchetti** | **uc02-autofill** | persists an edited defendant name (manual-edit + failed-autofill tests) |
| **Isla Fenwick** | **uc05-field-validation** | persists malformed URNs; single offence AND a hearing so both the ordering rule and the after-hearing advisory run |
| **Rowan Ashcroft** | **uc08-review-quality** | cross-form scenarios: run-unique exhibit citations, the self-corrected URN divergence |
| **Nadia Kowalczyk** | `uc09-pdf-generation.spec.ts` + reference renders | complete data; **nothing may write case-divergent values or attach throwaway noise here** — the pixel-diff baselines (tools/capture-reference-renders) derive from this fixture's values, statically |
| **Callum Whitmore** | **uc10-archive.spec.ts** | amendment lineages: reopen → finalise → regenerate cycles write full version histories on this case, and manual case-linking attaches standalone lineages to it |

## Rules

1. **Writes stay home.** A test that saves a value which diverges from the case record (names,
   URNs, references) runs on its owner's fixture — never on a shared case.
2. **Reads may share.** Read-only use of the original four demo cases is fine; auto-fill writes are
   read-equivalent because they write the case's own values.
3. **Run-unique tokens still apply** where a check is case-wide (UC-08's exhibit citations):
   dedicated ownership isolates suites from each other, tokens isolate runs from their own history
   between cleanups.
4. **Nadia Kowalczyk is frozen.** The UC-09 render baselines are only as stable as this case;
   treat any write to it as a defect.
5. **New writer, new fixture.** A future suite that needs to write case-divergent data adds its own
   case to `apps/api/prisma/seed.js` (marked in the LER-1269 block) and a row here — it does not
   borrow.

The 27 real drafts in dev.db (18 × 17 Aug + 9 × 18 Aug) remain inviolate throughout; suite runs
clean their own drafts via `E2E_DRAFT_LOG`.

## Fixture USERS (release-01 — the LER-1269 discipline extended to identities)

Sessions come from the real PKCE flow (`support/global-setup.ts`); the dev
credential is seed data, not a secret. Grant flips in tests use the admin
API or direct DB and must restore the seeded state.

| User | Role (seeded) | Grant | Owner / purpose |
|---|---|---|---|
| demo.solicitor@example.co.uk (Alex Marlowe) | Senior Solicitor | YES | the default actor — every suite's implicit identity; history preserved from the build phase |
| second.solicitor@example.co.uk (Priya Chandran) | Senior Solicitor | no | the standing second actor (COLLEAGUE); revoked-after-contribution tests toggle the grant and restore |
| paralegal.e2e@example.co.uk (Tunde Bakare) | Paralegal | no | release01-auth.spec.ts — the cannot-finalise matrix |
| readonly.e2e@example.co.uk (Rosa Delgado) | Read-Only | no | release01-auth.spec.ts — the read-only matrix; ruling #8's grant refusal |
| admin.e2e@example.co.uk (Ashwin Rao) | Administrator | no | release01-auth.spec.ts — admin actions + admin-cannot-read-content |

Rule: suites other than release01-auth may READ as these users but must not
change their roles, grants or credentials; throwaway users for lockout /
reset flows are created per-run and deleted with their audit rows.
