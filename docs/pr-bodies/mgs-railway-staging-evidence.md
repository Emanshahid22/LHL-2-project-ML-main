# Staging deployment record: Railway evidence for LER-1202, DoD #11/#12

Branch `mgs/railway-staging-evidence`, cut from `ali-zulqarnain/mgs-forms` @ `19bc07a` (the PR #149
merge — the commit that was deployed). Target: `ali-zulqarnain/mgs-forms`. One commit, one new file:
`docs/deployment/railway-staging.md`. Documentation only.

## Summary

MG Forms staging is live on Railway's free trial at `https://app-production-8ce7.up.railway.app` —
project `mg-forms-staging`, single service `app` (the API serves the Angular bundle: one origin, one
basic-auth gate, no CORS surface), volume `app-volume` (500 MB) at `/data` holding
`file:/data/mgforms.db`. This PR commits the deployment record: identifiers, the full
deployed-instance verification table (gate 401s, MG6 v5/48 · MG11 v5 · MG12 v4 template freshness,
the UC-07 two-layer 401-then-403 probe, the UC-08 409, CSV-export exclusion, seed idempotency and
draft survival across a real container replacement), the day-one usage meter ($0.0000), and two
honestly-reported boot-seed side effects (offence-id churn — nothing persisted references them; and
`Case.updatedAt` bumping, which re-raises UC-02's advisory case-changed banner after restarts).

## The evidence questions

- **LER-1202** (reads Done, no artefact): the record captures the volume's identifiers and
  configuration, and CITES Railway's posture rather than asserting it — the Trust Center
  (<https://trust.railway.com/>) declares an "Encryption-at-rest" Data Security control with SOC 2
  Type 2 / SOC 3 / HIPAA / GDPR attestations, while the public volumes doc page says nothing about
  encryption; implementation specifics require Trust Center access. **LER-1202 was not flipped or
  commented** — the decision is Ali's.
- **DoD #12** is explicitly NOT closed by this deploy: no PDFs exist until UC-09, so the record
  states this establishes only the encrypted substrate.
- **DoD #11**: the deployed storage was inspected directly (`/data` holds `mgforms.db` + the
  filesystem's `lost+found`, nothing else); no case data appears in any file name, path, env var,
  seed or log. Holds.

## Checklist

- [x] Documentation only — one new file
- [x] No secret value in the diff (the basic-auth password lives only in Railway variables)
- [x] Encryption posture cited to its sources, with what each source does and does not say
- [x] LER-1202 not flipped; DoD #12 explicitly not claimed
- [x] Targets `ali-zulqarnain/mgs-forms`, not `main`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
