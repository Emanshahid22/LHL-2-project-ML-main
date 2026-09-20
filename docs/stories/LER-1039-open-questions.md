# LER-1039 (MG16) — open questions for a practitioner

MG16's research is `usable-as-draft`: 15 fields, 11 `documented`, 3 `likely`, 1 `guess`. The
documented boxes have been added. **Nothing was deleted or remapped**, because the most important
question here is a legal one.

## The question that matters most

**Is MG16 the information form, the notice form, or both?**

The sourced field set describes a **police-to-CPS information form** — BC/DO type ticks, brief charge
details, the material relied on, an officer-completing block, and a CPS-use panel for the reviewing
lawyer.

The six fields this template already carried — `subjectName`, `subjectType`, `gateway`,
`convictionsRelied`, `relevanceExplanation`, `noticeDate` — describe something different: a **notice
of intention to adduce** bad character evidence, with a statutory gateway and a defendant /
non-defendant distinction. The research indicates that is the separate **MoJ form `ebc003`**, not MG16.

Both sets now sit on this template, which is honest but not final. **A decision-maker must choose:**

1. MG16 is the information form → the original six move to a new `ebc003` template.
2. MG16 covers both → the template stays as it is and the sections are relabelled.
3. Something else entirely.

## The consequence for a decision already committed

If MG16 is **defendant-only**, as the research indicates, then the reasoning in commit `d5178cf` is
wrong. That commit documents why `subjectName` is deliberately unmapped: a s.100 notice concerns a
**non-defendant**, so prefilling the defendant would name the wrong person. There is also a UC-02
check asserting MG16 `subjectName` never auto-fills.

If there is no non-defendant version of MG16, that hazard does not arise on this form and
`defendantName` could be mapped safely.

**This has NOT been changed.** `subjectName` is still unmapped, still carries its comment, and the
check still passes. Reversing a legal judgement needs someone qualified, and the research says the real
s.100 hazard belongs to MG15 `personInterviewed` — who may be a vulnerable witness rather than the
suspect — which is a different form and a different ticket.

## Field left out

**"Stage of submission"** (select) was the one field marked `guess`. Not written. **Is there such a box,
and what are its options?** — e.g. pre-charge, post-charge, pre-trial.

## Fields marked `likely` that need confirming

- `otherThanConvictions` — bad character material that is not a previous conviction.
- `documentationAttached` — the "relevant documentation attached" tick.
- `signatureName` — whether the form carries a signature block at all.
- The six original fields are all now marked `likely`, pending the question above.

## Duplication to resolve

`defendantName` (documented) and `subjectName` (original) may name the **same person**. Both are
present because neither could be removed safely. **Confirm whether they are one box or two** — if one,
`subjectName` should be retired once the drafts holding its values are resolved.

## Other questions from the research

- Which boxes are mandatory in practice, and whether the CPS-use panel is ever completed by police.
- Whether time limits under CrimPR Part 21 are tracked on this form or elsewhere.
