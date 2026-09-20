## Epic
UC-06 — Legal Language Assistance

## Overview
MG5 and MG11 carry the prose a case turns on: a case summary a prosecutor reads, and a witness's account
in their own words. UC-03 already flags the two phrasings that most often get a statement picked apart —
hearsay and opinion — and draws them as amber underlines in the narrative.

UC-06 widens that from *warning* to *assistance*: a collapsible **Legal Language Assistant** panel beside
the narrative that flags informal language with a suggested formal alternative, offers standard phrasing
for common evidential descriptions, and points out what the account has not recorded yet. Every suggestion
has an **Insert** button and nothing is ever applied without the user pressing it.

**Source of truth:** the UC-06 section of <https://lhl-agents.netlify.app/mg-forms-scope/>.

## Business Value / Goal
A witness statement is rewritten by whoever reads it next — the prosecutor, the defence, the court. The
cheapest place to get the wording right is while it is being typed. Two kinds of value:

1. **Fewer avoidable rewrites.** "He was off his head" in a statement is not wrong about the facts; it is
   wrong for the document. Flagging it with a formal alternative fixes it in seconds instead of a phone
   call a fortnight later.
2. **Fewer gaps.** The scope's own example — *"You have not recorded the time of the incident"* — is the
   kind of omission nobody notices until the statement is served.

Against that sits the risk that shapes the whole epic: **a suggestion is drafting advice on a court
document.** An invented "standard phrase" inserted verbatim into a witness statement is worse than an
invented form field, because it becomes the witness's words. So the epic's centre of gravity is restraint:
every suggestion is advisory, nothing is ever auto-applied, and no phrase ships unless its wording can be
attributed.

Success = the panel appears for MG5 and MG11 narratives, suggestions are only ever inserted by an explicit
user action, that action is audited, and the panel disappears quietly when the service behind it is down.

## Scope
**In scope:**
- A **declared narrative field**: templates say which fields carry prose, so the assistant attaches to a
  statement and never to an address or a charge list.
- **Generalising the narrative treatment to the flat renderer**, so MG5's narratives get what MG11's has
  (see the finding below).
- A collapsible **Legal Language Assistant** panel, opening when a narrative field takes focus.
- **Informal-language flags**: a third flag kind beside hearsay and opinion, each carrying a suggested
  formal alternative, drawn with the amber highlight UC-03 already built.
- **Standard phrase suggestions** from a registry where every entry carries provenance and a source.
- **Completeness hints** derived from the narrative — the scope's time-of-incident example plus a small
  declared set.
- **Insert at cursor**, never automatic, with the insertion recorded in the audit trail.
- **Per-session dismissal** of individual suggestions.
- An **isolated language-assistance service boundary** with **no write path to the draft**, and graceful
  degradation to nothing when it is unavailable.

**Out of scope:**
- **Inventing phrasing or drafting rules.** Anything whose wording cannot be attributed does not ship as a
  suggestion. This is the epic's hard line, not a preference.
- **Auto-correction, auto-formatting or "fix all".** The scope says suggestions are never auto-applied;
  a bulk-apply affordance is the same thing wearing a hat.
- **Spell-check**, which UC-03 already delivers as the browser's own.
- **Blocking anything.** Saving, navigating and completing stay unaffected — the UC-03/UC-05 rule.
- Whole-form review and scoring — **UC-08**. Sensitive material — **UC-07**. PDF — **UC-09**.
- Translation, plain-English rewriting of the whole narrative, or tone scoring.

### Three findings that shape this epic
Established against the delivered code before anything was written:

1. **The narrative treatment is MG11-wizard-only.** `NarrativeField` — the textarea with the amber
   highlight backdrop, word count and flag summary — is referenced only from `mg11-wizard.html`. MG5 goes
   through the flat `DynamicForm`, so its five textareas have no highlighting at all. The DoD requires the
   panel for **MG5 and MG11**, so UC-06 has to lift that component into the shared renderer. This is
   engine work, not panel work, and it is the largest single piece.
2. **Not every textarea is a narrative.** MG11's `witnessAddress` and MG5's `chargesList` are textareas
   but not prose; flagging "I think" in an address is nonsense. So a template must *declare* a field as a
   narrative rather than the renderer inferring it from `type` or `rows` — the same discipline UC-04 used
   for `group` and UC-05 for validation rules, and it keeps form codes out of the renderer.
3. **UC-03's pattern type has no notion of a replacement.** `NarrativePattern` carries `phrase`, `kind`
   and `explanation`. The scope requires informal flags to come with "a suggested formal alternative", so
   the pattern gains an optional suggestion — additive, and UC-03's five patterns keep working untouched.

## User Stories
1. **Declared narrative fields** (LER-1223) — templates say which fields carry prose.
2. **Narrative treatment in the flat renderer** (LER-1224) — MG5 gets what MG11 has.
3. **The Legal Language Assistant panel** (LER-1225) — collapsible, opens on focus.
4. **Informal-language flags with a formal alternative** (LER-1226) — a third flag kind, amber.
5. **Standard phrase suggestions, provenance-gated** (LER-1227) — nothing unattributed ships.
6. **Completeness hints** (LER-1228) — what the account has not recorded.
7. **Insert at cursor** (LER-1229) — the only route from suggestion to text.
8. **Insert is audited** (LER-1230) — DoD line 3.
9. **Nothing is ever auto-applied** (LER-1231) — DoD line 2, asserted directly.
10. **Per-session dismissal** (LER-1232) — dismissed stays dismissed for the session.
11. **The assistance service boundary** (LER-1233) — isolated, constrained, no write path.
12. **Graceful degradation** (LER-1234) — DoD line 4, no errors surfaced.
13. **Assistance never blocks** (LER-1235) — the UC-03/UC-05 rule, restated and proven.
14. **Panel accessibility** (LER-1236) — keyboard reachable, announced, focus never stolen.
15. **QA: Definition of Done checks** (LER-1237) — one check per DoD line.

## Epic-level Acceptance Criteria
The scope's Definition of Done, verbatim:

- "Legal language assistance suggestions appear correctly in the side panel for MG5 and MG11"
- "Suggestions are never auto-applied — verified by automated test that confirms text field is unchanged without a user Insert action"
- "Insert action correctly places text at cursor position and logs the action in the audit trail"
- "Panel degrades gracefully when language AI service is unavailable — no errors surfaced to user"

Plus the repo's standing rules this epic must not break:

- **No invented phrasing.** A suggestion whose wording cannot be attributed does not ship. Enforced by the
  conformance gate, not by good intentions.
- Additive-only template edits; no field id renamed; `npm run orphan-scan` clean.
- Every existing `data-testid` intact and the full suite green.
- Amber is advisory; **red stays reserved for UC-07 sensitive material**.

## Dependencies & Risks
- **Builds directly on UC-03.** `detectNarrativeFlags`, `segmentNarrative` and the highlight backdrop are
  reused, not rebuilt. UC-03's five patterns must keep behaving identically — a check asserts it.
- **Risk, and the reason for the provenance gate: an invented phrase becomes the witness's words.** A
  wrong validation rule shows a wrong hint; a wrong *suggestion* can end up inserted verbatim into a
  signed statement. Mitigated by shipping only attributable phrasing and by never auto-applying.
- **Risk: the panel reads as approval.** A narrative with no suggestions is not a good statement — the
  assistant only knows the patterns it has been given. The panel must say so, as UC-05's consistency panel
  does for unverified templates.
- **Risk: the service becomes a write path.** If assistance can reach the draft other than through a user
  pressing Insert, the "never auto-applied" guarantee is only as good as the next refactor. The boundary
  is therefore structural — see PRD §5 and §11 — and asserted by a test.
- **Depends on nobody, blocked by nobody.** Where phrasing cannot be sourced the registry ships without
  it, so no story waits on a practitioner. Practitioner answers *add* suggestions later; they are not a
  prerequisite.
- **Open: which service.** The scope says "language AI service" without naming one. Whether that is a
  local rules engine, a hosted model, or both is a decision-maker question — PRD §5 defines the boundary
  so the answer can change without touching the UI.
