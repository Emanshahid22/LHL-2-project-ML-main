# LER-1038 (MG15) — open questions for a practitioner

Verdict `usable-with-caveats`: 17 researched fields, **14 corroborated**. Three were not, and are
handled as absent rather than written.

## Fields deliberately NOT written

The uncorroborated material traces to a document whose `dc:creator` metadata reads literally
**"Claude"** — an AI recreation of a form, not a specimen. Anything resting only on it is treated as
absent.

1. **"Signature (other) — typed name"** — not written. **Does the form carry a second signature block?**
2. **The certification "Date"** — not written; the interview date already exists. **Is there a separate
   certification date?**
3. **"Interview reference no(s)."** as a single box — the verifier reports the real form carries **two**
   boxes, so it is written as `audioTapeReferences` and `visualImageReferences`, both marked `likely`.
   **Confirm there are two boxes and these are their labels.**
4. **The "Voluntary Interview" record type** — not offered, same source. **Should it be an option?** The
   three current options are contemporaneous notes, made as soon as practicable afterwards, and pocket
   notebook entry.

## The mapping risk worth a decision

`interviewee` ("Person interviewed") keeps `mapsTo: 'defendantName'`, so the defendant's name prefills.

An interview under caution is normally of the suspect, so that is right in the common case. But the
research warns the interviewee **may be a witness** — and if so, the prefilled name is the wrong
person. This is the same hazard the MG11 witness-name field avoids by staying unmapped.

It was **not** removed, because auto-fill only writes to empty fields, badges what it wrote, and offers
a Clear action — so the value is visible and correctable rather than silent. **But confirm the mapping
should stay.** If MG15 is used for witness interviews, it should be removed.

Related: the research suggests the genuine s.100 non-defendant hazard belongs here rather than on MG16,
where it is currently documented. See `docs/stories/LER-1039-open-questions.md`.

## Content that belongs here from elsewhere

The repo's **MG2** currently holds interview content — tape references, start and end times, officers
present, interview summary — which the research says belongs on **MG15**. That content was not moved:
MG2 is a separate ticket (LER-1032), it holds a live draft, and moving values between forms is a
migration rather than a template edit. **Confirm the content should move, and whether the existing MG2
draft's values come with it.**

## Other questions

- Which boxes are mandatory in practice, particularly Police Exhibit No. and number of pages.
- Whether "Duration of interview" is calculated or entered — it is its own box on the form because
  breaks mean it is not simply end minus start.
- Whether the record is exhibited in its own right in every case, or only when contested.
