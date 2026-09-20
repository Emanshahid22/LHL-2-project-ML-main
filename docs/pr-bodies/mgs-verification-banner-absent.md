# fix(verification): the "unverified" label also covers templates with no verification marker

**Branch** `mgs/verification-banner-absent` → `ali-zulqarnain/mgs-forms`

## The bug

UC-01's epic-level acceptance criterion, verbatim (`docs/usecases/uc-01/epic.md:94`):

> A template whose field set is not practitioner-verified must be visibly marked and must never read as
> filing-ready.

The data model makes `verification` optional — `docs/usecases/uc-01/prd.md:114`, and
`libs/shared/src/lib/form-template.types.ts:325`:

```ts
type TemplateVerification = 'verified' | 'unverified';   // absent = not yet assessed
```

Both UI surfaces tested the literal instead of the criterion:

- `apps/web/src/app/features/form-fill/form-fill-page.html` — the header chip rendered on
  `template()?.verification === 'unverified'`.
- `apps/web/src/app/features/form-fill/form-fill-page.ts:130` — `templateUnverified()`, which feeds the
  consistency panel's "passing these checks is not sign-off" caveat, used the same strict equality.

So the five legacy templates that carry **no marker at all** — MG1, MG2, MG5, MG11, MG14 — showed no
chip and no caveat. "Not yet assessed" is even further from sign-off than "assessed, unverified", yet it
was the only state that read as filing-ready. Worse, the suite asserted the wrong behaviour as correct:
`e2e/mg4-charge-sheet.spec.ts` had a test literally named *"a verified template shows no indicator"*
whose fixture was MG11 — an unverified template.

## The fix

One condition, one source of truth: `templateUnverified()` now returns true for any loaded template
whose `verification !== 'verified'`, and the header chip's `@if` uses the computed rather than
duplicating the comparison. The consistency-panel caveat was already bound to the same computed, so it
is fixed by construction. The chip tooltip's claim that the field set was "sourced from official
guidance" was also wrong for the legacy templates (nothing sourced them — that is the point) and now
says only what is true of both states.

No template, field id, `data-testid` or API surface changed. `verification` values were not touched —
nothing was marked verified (HANDOVER §4 standing decision 4).

## Regression checks

- **Absent-marker case (the bug):** *"a template with no verification marker is labelled too"* — MG11
  (which is also the wizard-shell form, so the wizard path is covered) must show the
  `unverified-template` chip. This replaces the inverted test that asserted MG11 must NOT be labelled.
- **Verified case:** *"only a practitioner-verified template loses the label"* — no real template is
  verified (deliberately), so the branch is exercised at the browser boundary: the template response is
  re-served with `verification: 'verified'` via `page.route`, and the chip must disappear. Same
  boundary-stub pattern as UC-06 deviation D6.
- The literal-string case keeps its existing check (*"the unverified indicator shows on the form
  header"*, MG4).

Suite: 216 → **217** (one test replaced by two).

## Verification

- `npm run build` — both apps build clean.
- `npm run conformance` — 68 self-tests, 11/11 templates, 0 errors 0 warnings.
- `npm run orphan-scan` — no orphaned values.
- Full Playwright suite: **217/217 ×2 on dev.db and 217/217 ×1 on a freshly seeded throwaway DB**,
  exit codes captured per run (0/0/0), all three runs on freshly started servers.

### Verification incident worth recording (pipeline, not this change)

The first throwaway-DB attempt reported 18 failures — all of them audit-trail and permission
assertions. Root cause was **not** this branch and **not** the product: an orphaned `npm run dev` API
from 19 Aug still held :3000, `reuseExistingServer: true` reused it, so the API wrote dev.db while
`db:setup` and the suite's direct-DB helper used the throwaway file. Two lessons, both going into the
docs PR: (1) kill anything on :3000/:4200 before the throwaway leg, or the leg silently tests the
wrong database; (2) never pipe `npx playwright test` into `tail`/`grep` without `pipefail` — the
filter's exit code masks the run's.

## Not in this PR

- No decision on whether the five legacy templates should gain an explicit `verification: 'unverified'`
  literal — that edit is additive and safe, but the docs treat "absent = not yet assessed" as meaningful
  (`form-template.types.ts:326`), and collapsing the two states is a modelling decision, not a bug fix.
- CLAUDE.md / HANDOVER still claim "every template reads `verification: 'unverified'`", which is untrue
  of the code (five have no marker). That is doc drift, handled in the reconciliation PR, not here.
