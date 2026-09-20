# chore(build): type errors can no longer emit; orphan-scan and npm audit join CI

**Branch** `mgs/build-safety-net` → `ali-zulqarnain/mgs-forms`

HANDOVER §5's standing gotcha, verbatim:

> `tsc` emits despite type errors, so a failed build can leave a half-written `libs/shared/dist` that
> the API serves silently

The 20 Aug incident it records — MG6 answering `templateVersion: 4` with **35 fields** while the
source said 47 — is the failure this PR makes impossible, plus two CI gates that until now ran only
on memory.

## 1. `noEmitOnError: true` in `libs/shared/tsconfig.json`

One line. Proven by injecting a deliberate type error and rebuilding: `tsc` exits non-zero and
`dist/index.js` is **byte-identical** afterwards (`cmp` clean) — no emission, so the API can never
again serve a half-written template set after a failed build. The watcher-staleness half of the
gotcha (nest not watching `libs/shared`) still stands and still needs the restart-and-curl habit;
this PR removes only the silent-corruption half.

## 2. Orphan scan in CI

`npm run orphan-scan` runs after `db:setup`, exit 1 on any stranded draft value. Honestly stated: on
CI's fresh database this mostly proves the tool's template/derived-key wiring still loads — the
load-bearing run against real drafts stays in the local pre-PR pipeline on dev.db (rule 3). CLAUDE.md
previously claimed orphan-scan was "in CI"; as of this PR that claim is true.

## 3. `npm audit --audit-level=high` in CI — and the fix that lets it land green

Adding the gate exposed that it would fail on day one: **GHSA-ggr8-5vv4-36mx** (deepmerge-ts stack
exhaustion, high), reached via `prisma → @prisma/config → deepmerge-ts@7.1.5` (pinned exactly, so no
in-range fix exists, and every current prisma release is inside the vulnerable range — `--omit=dev`
doesn't help because `@prisma/client` pulls the CLI in).

Resolution: a root `package.json` **`overrides`** forcing `deepmerge-ts@^8.0.0` (the advisory's fixed
line) — resolves to 8.0.2, `npm audit` now reports **0 vulnerabilities**. The override's blast radius
was verified, not assumed:

- `prisma generate` + `prisma migrate deploy` + seed ran clean on a throwaway database
  (`@prisma/config` is exactly the config-loading path that consumes deepmerge-ts);
- the full gate set below ran on the overridden tree.

The CI step's comment says what to do when it fires again: a new advisory gets the same
override-and-verify treatment, **not** a severity-level downgrade. (The fallback considered and not
taken: gating at `critical` with the high finding as a tracked exception — rejected because a clean
fix existed and verified green.)

## Not in this PR

- No unit-test step — that arrives with the unit-testing tranche (its own branch and review).
- No change to the nest watcher's blindness to `libs/shared` — documented, not fixable from tsconfig.
- No GitHub Actions major bumps (the Node-24 warnings) — separate maintenance item.

## Verification

- Injected-type-error proof: build fails, dist byte-identical (see §1).
- `npm audit --audit-level=high` — **0 vulnerabilities, exit 0** (was: 3 high).
- `npm run db:setup` against a fresh throwaway DB under the override — migrations + seed clean.
- `npm run build` (both apps), `npm run conformance` (68 self-tests, 0 errors), `npm run orphan-scan`
  (no orphans) — all green on the overridden tree.
- Full Playwright suite: **216/216 ×2 on dev.db + 216/216 ×1 on a freshly seeded throwaway DB**,
  `set -o pipefail`, fresh servers, per-run exit codes 0/0/0 — all on the overridden tree.
