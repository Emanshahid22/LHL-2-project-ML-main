# Layout verification, D-F (provisional) — six specimen-matched templates flagged verified

**Branch** `mgs/layout-verification-d-f` → `ali-zulqarnain/mgs-forms`,
**stacked on** `mgs/mg11-declaration-adoption` (D-B) — merge that PR first;
this branch contains its commits. **Decision** D-F,
`docs/decisions/provisional-decision-register.md` · per-form record:
`docs/decisions/layout-verification-record.md`.

## D-F, verbatim (directed by Ali Zulqarnain, Consultancy Outfit, acting decision-maker, 26 Aug 2026)

> Mark layout verification for the SIX specimen-matched templates only:
> MG4, MG6, MG11, MG12, MG15, MG16. MG1, MG2, MG3, MG5, MG14 remain
> unverified (no specimen, partial match, or designation mismatch).

The six named templates' verification flag is set to `'verified'` on the
basis of the documented field-by-field comparison against the MoG 2011
archival specimens, **PROVISIONAL — practitioner ratification still
pending** via LER-1124 / LER-1077 / LER-1078 (open). Reversal path: flip
the flag back, recapture baselines.

## The six-vs-five split, and why

| Verified (provisional) | Evidence | Version |
|---|---|---|
| MG4 | MoG 2011 p52 — strong match, 6 accepted deltas | v3→v4 |
| MG6 | pp84–86 — section-for-section + the documented MG6C/D flattening | v5→v6 |
| MG11 | pp104–105 + the 2013 specimen — front strong + two-source declaration (D-B); **rear sections unmodelled, caveat on record** | v7→v8 |
| MG12 | p108 — match via documented table flattening | v4→v5 |
| MG15 | p111 — 14/18 fields box-for-box | v3→v4 |
| MG16 | p112 — strong match, table flattened | v3→v4 |

| Unverified (unchanged) | Why |
|---|---|
| MG1 | no specimen in any obtainable source (memo A1) |
| MG2 | designation mismatch — official MG2 is a different instrument (D-C) |
| MG3 | no specimen — the archived MoG copy is titled "no MG3" |
| MG5 | partial match only |
| MG14 | designation mismatch (D-C) |

Per-form accepted deltas: `docs/reference/mog-2011-template-deltas.md`,
row-by-row in `docs/decisions/layout-verification-record.md`.

## Sanity guard result (ran first, as directed)

The verification flag feeds **presentation only**: the per-page draft band
(`draftBand` null when verified), the body header line ("verified
template"), the web chip, and the consistency panel's not-sign-off caveat
— all through the single predicate `isTemplateUnverified`. Nothing
security-relevant keys on it (the "verification" hits in the documents
path are GCM integrity, unrelated). Conformance's sourcing tier keys on
the property's PRESENCE, not its value — all six already carried it, so no
conformance behaviour changed. **One deliberate non-change, flagged for
review:** the DOCX header "Draft — not the authoritative version" is
unconditional BY DESIGN — it marks the Word export's status against the
authoritative PDF (UC-09's scope-exact wording), not template
verification, and the uc09 suite pins it on MG12. Making it
verification-conditional would remove a scope-required marker, so it was
left; if the decision-maker wants it conditional, that is a separate,
recorded change.

## Tests

- Unit: the all-templates-banded check became the exact six-vs-five split
  through the predicate; the banner-absent lesson (absent property ⇒
  banded) retained as an explicit branch. **148/148.**
- uc09: the multi-page band check split — positive on **MG1** (unverified,
  paginating charges narrative; band on EVERY page) and negative on MG11
  (verified; NO band on any page; "verified template" header line in the
  PDF text).
- mg4-charge-sheet: MG4's flag assertion moved to 'verified'; the chip
  checks now assert absence on real MG4/MG11 and presence on **MG5**
  (explicit positive, kept per the directive) and **MG3** (the literal
  'unverified' branch).
- uc05: the not-sign-off caveat asserts absence on verified MG4 and
  presence via the browser-boundary unverified mock (no real unverified
  template carries a date-order rule to trip the panel naturally).
- Gates: conformance **68/0**, orphan-scan **clean** (metadata-only bumps,
  no id changes), pii-scan **clean**.
- Full battery (267 checks: 266 + the net-new uc09 negative band test):
  dev.db run 1 **267 passed, exit 0** · run 2 **267 passed, exit 0** ·
  fresh throwaway DB **267 passed, exit 0**. Run 1 executed while the
  decision-maker's live manual session was active: its preservation guard
  (log-based cleanup of test rows only + before/after count equality)
  detected his concurrent writes and HALTED the battery rather than
  continue against a live user — none of his data was touched. After he
  finished, the owed snapshot-guarded cleanup removed the 9 manual drafts
  and all their documents/versions by difference (baseline restored
  35/76/0/0/0/0, store empty), and runs 2 + fresh completed on the clean
  baseline with the strict check restored.

## Baseline recapture (PR #197 discipline)

Workflow run **32980661439** (ubuntu-latest ubuntu24 20260823.283.1) via
`capture-baselines/layout-verification-d-f`; review before commit: the
five unverified forms **byte-identical**, the six changed **only in the
header line** (version stamp + "verified template" replacing "unverified
template — see the draft band"; visually confirmed). Only the six pairs
committed (`7e341df`); sidecars carry the D-F template versions and the
capture run, with decision linkage in the record document. Throwaway
branches deleted.

## Ratification pending

D-F is PROVISIONAL. LER-1124 / LER-1077 / LER-1078 remain open for the
practitioner signature; rule 2's practitioner condition is exactly what
ratification supplies, and the register records that this decision
knowingly precedes it on the acting decision-maker's authority. Reversal
is a metadata flip + recapture.
