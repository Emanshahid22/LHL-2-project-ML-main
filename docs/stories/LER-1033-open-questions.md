# LER-1033 (MG3) — open questions for a practitioner

Verdict `usable-as-draft`: 59 fields, **57 verified verbatim against CPS Director's Guidance on
Charging (DG6) Annex 4**. The content is authoritative. **The presentation is not.**

## The standing caveat

**No blank MG3 is published anywhere.** The Manual of Guidance states the MG3 is *"strictly a
communication between the police and CPS"*, so unlike MG4 there is no specimen to read printed labels
off.

What is authoritative is the **content specification** in DG6 Annex 4 — what information the referral
must carry. Every **label, section name and ordering** in this template is our reconstruction of that
specification.

So this template may stay `unverified` **indefinitely**, and that is not a failure of the work.

**Questions:**

- **Does a defence solicitor ever complete an MG3?** It is a police-to-CPS document. If not, it should
  be *hidden* rather than shipped — carrying a form nobody in the product's audience fills in is worse
  than not carrying it.
- If it is shipped, are the section names and ordering right? We chose: Case and suspect details ·
  Referral · Offence and proposed charges · The investigation · Victims and witnesses · Other
  considerations · Disclosure and assurance · Certification and contact · Prosecutor's decision (CPS
  use).
- Should the CPS-use panel be shown to a police or defence user at all, or hidden until a decision
  comes back?

## The UX problem this creates

At **59 fields** this is by far the longest template — MG11 has 15, MG5 has 13. The flat renderer will
present it as a very long single-column form.

That is a real usability problem, but **not one to solve by trimming the form**: the field set is what
DG6 requires. The MG11 wizard is the pattern for breaking a long form into steps, and MG3 is the next
strongest candidate for it. Raised as a separate concern, not fixed here.

## Existing fields relabelled

Three original ids were kept but **relabelled** to match the DG6 specification. Ids are unchanged, so
no stored value is lost, but users of existing drafts will see different wording:

| id | was | now |
|---|---|---|
| `evidenceSummary` | Summary of key evidence | **Factual summary** |
| `bailStatus` | Bail / custody status | **Suspect status** |
| `suspectAccount` | Suspect's account / interview position | **Suspect's account and understanding of the defence case** |

**Confirm the relabelling is right**, particularly `evidenceSummary` → "Factual summary": DG6
distinguishes the factual summary from the analysis of strengths and weaknesses, which is now its own
field (`strengthsWeaknesses`).

## Fields marked `likely`

- `prosecutorGrade` — the reviewing lawyer's grade.
- `decisionDate` — the date of the decision. DG6 implies a date and time; we model date only, since
  the type system has no combined field. **Is the time needed?**

## Other questions from the research

- Which boxes are mandatory in practice, as against merely specified.
- Whether the Threshold Test rationale needs its own structured boxes for each statutory condition
  rather than one free-text field.
- How the MG3 relates to the Digital Case File — DG6 lists much of this as "provided digitally", so the
  form may be a fallback rather than the norm.
