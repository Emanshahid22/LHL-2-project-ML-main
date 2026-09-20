## Epic
UC-05 — Field Validation

## Overview
The product already refuses to save a malformed repeating group, already marks required fields, already
rejects an impossible date, and already reports a duplicate item reference. What it does not do is check
that a value is the *right shape* for the box it is in, or that two values are consistent with each other.

UC-05 adds those two things: **per-field format rules** declared in the template layer, and
**cross-field consistency rules** surfaced in their own panel rather than inline. It also closes the gap
the README has admitted since UC-01 — the declarative `validation` rules run only in the browser, so the
API enforces nothing the client chooses not to send.

The hard part is not the regular expressions. It is knowing which formats we are entitled to enforce. A
criminal case file carries references — URN, ASN, custody number, collar number — whose exact character
formats we have **not** sourced. A rule that rejects a valid URN is worse than no rule at all: it teaches
a solicitor to work around the product on a document that goes to court.

**Source of truth:** the UC-05 section of <https://lhl-agents.netlify.app/mg-forms-scope/>.

## Business Value / Goal
Validation is the cheapest place to catch a file error. An offence date after the charge date, a
transposed URN, an interview that ends before it starts — each is trivial to catch at the keyboard and
expensive to discover at court. UC-05 moves that catch to the earliest possible point, and records what
was flagged so a decision to proceed anyway is auditable.

The equally important half is restraint. Every rule this epic ships states where it came from, and a rule
whose source we cannot cite is **advisory** — it hints, it never blocks, and it says plainly that the
format is unverified. That is the scope's own instinct: it asks for the officer collar number to be
"flagged as 'Unverified format' if force unknown". This epic generalises that instinct into a mechanism.

Success = the four Definition of Done lines are proven across three form types; no rule blocks on a format
nobody has sourced; and the same rule set produces the same findings in the browser and in the API.

## Scope
**In scope:**
- A **named format registry** in `libs/shared`: each format carries its pattern, a user-facing hint, an
  example, a `provenance` and a source reference. Templates reference a format by name rather than
  carrying a raw regex, so a format is corrected in one place.
- A **severity model** — `error` vs `advisory` — with one rule that gives it teeth: a format may be
  `error` severity **only if** its provenance is `documented` with a cited source. Everything else is
  advisory, whatever a template asks for, and the conformance gate enforces it.
- **Cross-field consistency rules** declared on the field that owns them: date ordering against another
  field *or* against a case datum, and conditional requirement (field B becomes required when field A has
  a given value).
- A **Consistency Issues panel** below the form section, per the scope's explicit instruction that
  cross-field errors are *not* shown inline.
- **Client/server parity**: one pure rule engine, used by the renderer for display, by the API to record
  what was flagged, and by the future finalisation path to refuse. Plus a new **type-shape guard** at the
  API boundary, which is the one class of validation a draft save can safely reject.
- Real-time firing **on blur**, a **format hint** on date fields, and automatic clearing of an error when
  the value is corrected.

**Out of scope:**
- **Inventing any statutory format.** Where a format cannot be sourced it ships advisory, with an open
  question. This epic will not put a rejecting pattern on a URN.
- **Rejecting a draft save for a semantic rule.** A draft is allowed to be incomplete and inconsistent;
  that is what a draft is. Enforcement at the point of *finalisation* is UC-10's gate — this epic builds
  the engine and the hook, and the hook is unreachable until a finalise action exists.
- **Adding fields so a rule has somewhere to live.** Two of the scope's four named formats have no field
  to attach to (see below). Adding a box to a criminal-case document to satisfy a validation rule inverts
  the standing rule that a field needs evidence first.
- Legal-language and phrasing advice — **UC-06**. Sensitive-material rules — **UC-07**. Whole-form review
  and quality scoring — **UC-08**.

### Three findings that shape this epic
Established against the delivered templates before any code was written:

1. **No template has a CPS reference field.** `cpsReference` exists as a `CaseFieldPath` — a case datum —
   but no MG template declares a box for it. The scope's "CPS reference format" rule therefore has nothing
   to validate on a form today. The registry entry ships; nothing references it.
2. **No template has a collar-number field.** Collar numbers live *inside* composite free-text officer
   boxes ("Name, rank and collar number of the officer in the case"). A strict pattern over that box would
   reject a correctly completed field.
3. **Neither of the scope's named cross-field pairs exists on one form.** MG4 has `chargeDate` but no
   offence date; MG3 and MG5 have `offenceDate` but no charge date. MG11 has `statementDate`; no template
   has both a statement date and a hearing date. So the scope's rules are only expressible as **case datum
   vs form field**, using the paths UC-02 already resolves. That is how they are built.

## User Stories
1. **Named format registry with provenance** (LER-1207) — formats are data, with a source, not regexes in templates.
2. **Severity model: an unsourced rule cannot block** (LER-1208) — provenance decides severity, and the gate enforces it.
3. **Blur-time firing and automatic clearing** (LER-1209) — the scope's timing, and DoD line 4.
4. **Required-field validation across form types** (LER-1210) — DoD line 1, three MG forms.
5. **Date format hint and impossible dates** (LER-1211) — DoD line 2.
6. **URN and ASN formats, advisory pending sourcing** (LER-1212) — the honest treatment of an unsourced format.
7. **Officer collar number: 'Unverified format'** (LER-1213) — the scope's own wording, generalised.
8. **CPS reference format with no field to attach to** (LER-1214) — registry entry plus the recorded gap.
9. **Cross-field rule engine** (LER-1215) — ordering against a sibling field or a case datum.
10. **Consistency Issues panel** (LER-1216) — not inline, per the scope.
11. **Offence date after charge date** (LER-1217) — DoD line 3, case datum vs form field.
12. **Statement date vs hearing date, advisory** (LER-1218) — later statements are normal practice.
13. **Conditional requirement** (LER-1219) — a field becomes required because of another's value.
14. **Interview start and end ordering** (LER-1220) — the one same-form pair that exists today.
15. **Server-side parity and the type-shape guard** (LER-1221) — one engine, two callers, plus 422 on unstorable types.
16. **QA: Definition of Done checks** (LER-1222) — one check per DoD line, across three form types.

## Epic-level Acceptance Criteria
The scope's Definition of Done, verbatim:

- "Field validation catches all required field types — tested with a deliberately incomplete form across 3 different MG form types"
- "Date validation rejects DD/MM/YYYY format violations and impossible dates"
- "Cross-field check: offence date after charge date is flagged correctly in all tested cases"
- "Validation errors clear automatically when the field is corrected to a valid value"

Plus the repo's standing rules this epic must not break:

- **No invented format.** Every rule cites a source or ships advisory. Enforced by the conformance gate,
  not by good intentions.
- Additive-only template edits; no field id renamed; `npm run orphan-scan` clean.
- Every existing `data-testid` intact and the full suite green.
- Amber is advisory. Error red is Material's existing error token and is distinct from the red UC-07
  reserves for sensitive material — see PRD §11.

## Dependencies & Risks
- **Builds on UC-04's engine work.** `required`, `uniqueInGroup`, the group validators and
  `validateGroupValue`'s 422 already exist. UC-05 does not re-implement them; it generalises the layer
  they live in.
- **Depends on UC-02 for case data.** Both scope-named cross-field rules compare a form field against a
  case datum. Where the case cannot supply one unambiguously — UC-02 returns `ambiguous` for several
  offence dates — the rule must **not fire**, and must say why rather than guessing.
- **Risk: a wrong format rejecting correct data.** The single largest risk in this epic, mitigated by the
  provenance-decides-severity rule and by shipping URN/ASN/collar advisory.
- **Risk: validation read as approval.** A form with no validation errors is not a verified form. Most
  templates are `unverified`, and a green form must never imply otherwise (PRD §8).
- **Risk: cross-field rules that are merely unusual, not wrong.** A statement dated after the first
  hearing is normal. Such rules ship advisory; only a genuine impossibility (charged before the offence)
  is an error.
- **Blocked on nobody.** Every unsourced format ships advisory, so no story waits on a practitioner. The
  practitioner answers turn advisory rules into errors later — an upgrade, not a prerequisite.
