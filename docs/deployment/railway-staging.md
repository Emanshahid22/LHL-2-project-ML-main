# Railway staging — deployment record and evidence

_Deployed 22 Aug 2026 from `ali-zulqarnain/mgs-forms` @ `19bc07a` (the PR #149 merge, which carries
the basic-auth gate, `railway.json` and `.railwayignore` from `4212f32`). Staging tracks the
integration branch: every future deploy is `railway up` from its HEAD, never from a feature branch._

## Environment

| | |
|---|---|
| Public URL | https://app-production-8ce7.up.railway.app |
| Railway project | `mg-forms-staging` · `e650014d-ca4a-47cc-b4ef-2e0f82d3a6b2` |
| Environment | `production` · `3682ea8b-d579-4b1b-8e1a-836560cd660b` |
| Service | `app` · `923f4589-f22f-4ec3-b07e-7ee384974b12` (single service: the API serves the Angular bundle — one origin, one auth gate, no CORS surface) |
| Volume | `app-volume` · `6db66dce-06b5-4e4b-97a6-a7802ed065a9`, mounted at `/data`, **500 MB** cap, status Ready |
| Plan | **Free trial** (one-time $5 credit, 30 days, 1 GB RAM, shared vCPU). Usage on deploy day: $0.0000 current / $0.0001 estimated. Do not upgrade without a decision. |
| Env vars set (names only) | `DATABASE_URL`, `STAGING_AUTH_USER`, `STAGING_AUTH_PASSWORD`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` |
| Basic-auth | user `mgs-staging`; the password lives ONLY in Railway → mg-forms-staging → service `app` → Variables. Never committed, never printed. |

Boot sequence (from `railway.json`): `prisma migrate deploy` → idempotent seed → serve. First boot
applied all 3 migrations; every restart since logs `No pending migrations to apply.` Both wording
integrity gates log **verified** on every boot (MG11 declaration; UC-07 sensitive-material wording)
— a hash-pinned wording that drifted in transit would refuse to boot, so those lines are part of
what each deploy proves.

## Deployed-instance verification (all against the public URL, 22 Aug 2026)

Every API check sent BOTH the basic-auth credentials AND `x-user-email` — a 401 from the staging
shim superficially resembles a successful refusal, so layers were probed separately.

| Check | Result |
|---|---|
| `GET /api/health` without credentials | **200** `{"status":"ok"}` |
| `GET /` without credentials | **401** + `WWW-Authenticate: Basic realm="MG Forms staging"` |
| `GET /api/me` without credentials | **401** |
| Wrong password | **401** |
| `GET /` with credentials | **200** (Angular index; SPA routes serve via fallback) |
| Served templates | **MG6 v5 / 48 fields · MG11 v5 · MG12 v4** — `libs/shared` built fresh, no stale dist |
| All 11 templates served | MG1, MG2, MG3, MG4, MG5, MG6, MG11, MG12, MG14, MG15, MG16 |
| **UC-07 two-layer probe** | PATCH touching `sensitiveScheduleItems` WITHOUT basic-auth → **401** (staging shim); WITH credentials but no recorded confirmation → **403**, body naming the missing confirmation — the 403 provably comes from the MG6D gate, not the shim |
| **UC-08 gate** | review 201 with 5 blocking issues → `POST /drafts/:id/finalise` → **409** |
| Non-sensitive CSV export | **200**; the sensitive row's description and reference absent; the non-sensitive row present |
| **Seed idempotency across a real restart** | redeploy `32ffebc9` replaced container `cd9c6ce3`; after it: 2 users (both resolvable), **5 distinct cases, 5 offences on the demo view — no duplication** |
| **Draft survival across the restart** | a case-linked MG12 draft created pre-restart still exists with its values byte-intact and its case link resolving, offences included; total drafts unchanged (the seed creates none) |

### Two honest side-effects of the boot seed, observed and code-derived

1. **`CaseOffence` ids are recreated on every boot** (the seed does a per-case
   `deleteMany`+`createMany`). Nothing persisted references them: drafts store values by field id,
   auto-fill provenance stores `{source, caseUpdatedAt, value, accepted}`, audit metadata stores
   counts and field ids. Offence ids appear only transiently in case DTOs, re-read on every call —
   the churn is harmless today, but any FUTURE feature that persists an offence id must not, or
   must change the seed first.
2. **`Case.updatedAt` bumps on every boot** (the upsert's `update: data` clause). Consequence:
   case-linked drafts auto-populated before a restart will show UC-02's advisory "case file has
   changed" banner after it. Advisory-only and honest (the seed did rewrite the case fields), but
   worth knowing before anyone reads that banner as a data problem on staging.

## LER-1202 — "provision cloud environment with encryption at rest" (evidence, not a closure)

LER-1202 reads **Done** in the tracker with no artefact. What this deployment actually evidences:

- **The substrate:** persistent storage is the Railway volume `app-volume`
  (`6db66dce-06b5-4e4b-97a6-a7802ed065a9`), 500 MB, mounted at `/data`, holding the single database
  file `mgforms.db`.
- **Railway's documented posture — cited, not asserted:** Railway's Trust Center
  (<https://trust.railway.com/> — where <https://railway.com/security> 301-redirects) lists
  **"Encryption-at-rest" as a declared Data Security control**, alongside **SOC 2 Type 2, SOC 3,
  HIPAA and GDPR** attestations. The control's implementation detail sits behind the Trust Center
  portal (SafeBase) rather than on the public page. Notably, the volumes reference page
  (<https://docs.railway.com/reference/volumes>) says **nothing about encryption** — so the Trust
  Center declaration and its SOC 2 attestation are the citable evidence, and anyone needing the
  implementation specifics (cipher, key management) must request the Trust Center's documents.
- **What would strengthen this:** the SOC 2 report via Trust Center access — a decision-maker
  request, not an engineering task.

**This does NOT close DoD #12** ("all MG form PDFs encrypted at rest"): no PDFs exist until UC-09
is built, so there is nothing whose encryption could be verified. This deployment establishes the
encrypted substrate those PDFs would land on, nothing more.

**LER-1202 has not been flipped or commented** — reported for a decision.

## DoD #11 — no defendant personal data in file names or storage paths (inspected)

Direct inspection of the deployed volume (`railway ssh -- ls -la /data`):

```
/data/mgforms.db      112 KB   (the SQLite database — opaque name)
/data/lost+found      16 KB    (filesystem housekeeping)
```

That is the entire persistent surface. The database file name is opaque; the mount path is `/data`;
`DATABASE_URL=file:/data/mgforms.db` contains no case data; the deploy context excluded the local
`dev.db` via `.railwayignore`; the instance holds ONLY the synthetic seed (two fictional users,
five fictional cases) plus the verification probes. No real case, defendant or witness data exists
in any seed, env var, file name, storage path or log. **DoD #11 holds on this deployment.**

## Operational notes

- Redeploy from integration HEAD: `git checkout ali-zulqarnain/mgs-forms && git pull && railway up --service app -c`.
- Restarts are zero-downtime (new container passes `/api/health` before the old drains) — when
  verifying "after a restart", confirm the new deployment id is SUCCESS first, or the reads hit the
  old container (this happened during verification and was caught).
- Maintenance item (recorded, not done): Railway warns that Config as Code (`railway.json`) is
  deprecated in favour of `.railway/railway.ts`, working until **2026-12-01** — migrate before then.
- Maintenance item (recorded, not done): the GitHub Actions CI runners warn `checkout@v4`,
  `setup-node@v4`, `cache@v4`, `upload-artifact@v4` are being moved onto Node 24 — bump the four
  actions a major each; the app's own Node floor is a separate decision.
