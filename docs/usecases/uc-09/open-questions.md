# UC-09 — open questions, deviations and the ticket map

## Ticket map (client originals → this pack's stories → delivering tickets)

Delivering tickets are created **after this pack is reviewed** (the UC-07/08 convention), with
`humanInstructions` set at creation. Stories are named by their client original where one exists.

| Client original | Story | Re-scope? | Delivering ticket |
|---|---|---|---|
| LER-1153 Generate PDF action | `stories/LER-1153.md` | — | **LER-2373** |
| LER-1154 Render pipeline | `stories/LER-1154.md` | **D1** — Chromium, not WeasyPrint/Jinja2 | **LER-2374** |
| LER-1155 Bind eleven HMCTS templates | `stories/LER-1155.md` | **D2** — eleven layouts declared as data | **LER-2375** |
| LER-1156 Reference renders captured | `stories/LER-1156.md` | **D3** — self-baselines; after LER-1269 | **LER-2376** |
| LER-1157 Pixel-difference regression | `stories/LER-1157.md` | **D3** | **LER-2377** |
| LER-1158 Automatic pagination | `stories/LER-1158.md` | — | **LER-2378** |
| LER-1159 In-browser preview | `stories/LER-1159.md` | — | **LER-2379** |
| LER-1160 Preview scroll, zoom and download | `stories/LER-1160.md` | — | **LER-2380** |
| LER-1161 Exhibit reference hyperlinking | `stories/LER-1161.md` | best-effort per scope wording | **LER-2381** |
| LER-1162 DOCX export | `stories/LER-1162.md` | — | **LER-2382** |
| LER-1163 DOCX draft watermark and label | `stories/LER-1163.md` | — | **LER-2383** |
| LER-1164 Auto-store to case archive | `stories/LER-1164.md` | **D4** — UC-10 stub | **LER-2384** |
| LER-1165 AES-256 encryption at rest | `stories/LER-1165.md` | **D7** — application-level, limits stated | **LER-2385** |
| LER-1166 PII-free storage naming | `stories/LER-1166.md` | — | **LER-2386** |
| LER-1167 Download-time filename generation | `stories/LER-1167.md` | — | **LER-2387** |
| LER-1168 Generation failure retry | `stories/LER-1168.md` | — | **LER-2388** |
| LER-1169 Draft preserved on failure | `stories/LER-1169.md` | — | **LER-2389** |
| LER-1170 HMCTS layout sign-off | `stories/LER-1170.md` | **D6** — stays open until a human signs | **LER-2390** |
| LER-1171 QA: Definition of Done checks | `stories/LER-1171.md` | DoD 1 recorded open | **LER-2391** |
| LER-1017 Pixel-difference test harness (foundation) | `stories/LER-1017.md` | joins UC-09 | **LER-2392** |
| LER-1018 Storage-key PII scan (foundation) | `stories/LER-1018.md` | joins UC-09 | **LER-2393** |
| LER-1071 Page count from renderer (deferred, UC-03) | `stories/LER-1071.md` | — | **LER-2394** |
| LER-1072 Page count interpolation (deferred, UC-03) | `stories/LER-1072.md` | activation gated on LER-1200 | **LER-2395** |
| LER-1073 Page count assertion (deferred, UC-03) | `stories/LER-1073.md` | — | **LER-2396** |
| LER-1269 Fixture-debt strategy (pre-work) | `stories/LER-1269.md` | **must land before LER-1156** | delivers itself — built on `mgs/ler-1269-fixtures` |
| — (no client original) | `stories/draft-marking.md` | new — rule 2 on paper; ticket to create | **LER-2397** |
| — (no client original) | `stories/sensitive-rendering.md` | new — UC-07's boundary on paper; the scope is silent at a security boundary and silence is not permission | **LER-2398** |

## Deviations (recorded, with reasons — the UC-06 D-numbering convention)

- **D1 — Render stack.** LER-1154 names WeasyPrint + Jinja2: a Python stack in a TypeScript
  monorepo. Superseded by Chromium print-to-PDF (Playwright's binary, already pinned) over the same
  HTML/CSS Paged Media authoring model the ticket describes. No new runtime, one rendering engine
  for screen and paper.
- **D2 — "Official HMCTS templates" do not exist.** No official central source for blank MG forms
  (gov.uk carries guidance only; Manual of Guidance under NPCC embargo;
  `docs/answers/template-sourcing-evidence-2026-08.md`), and MG forms are Home Office/NPCC, not
  HMCTS. LER-1155 becomes: declare eleven `FormLayout`s as data behind the `LayoutBinding`
  interface; structural reference is the seven genuine specimens only (MG2, MG4, MG5, MG6, MG11,
  MG12, MG14 — bbpolice.uk 2010/11 + 2013). MG1, MG3, MG15, MG16 get **no fidelity claim**.
  AI-reconstructed templates are never references (the criminaljusticehub.org.uk 2026/06 files are
  recorded AI recreations — provenance defect).
- **D3 — Pixel-diff is self-regression, not official-template comparison.** With no official
  referent, LER-1156/1157/1017 capture **our own** reference renders (after the LER-1269 decision)
  and fail the build on drift. This converts "matches the layout" into the objective half that is
  buildable — "has not changed since the render a human signed off".
- **D4 — LER-1164 is a stub.** UC-10's archive does not exist; the document row records
  `archiveStatus: 'pending-uc10'` and the UI says so — the UC-08 → UC-09 stub pattern, one link
  down the chain.
- **D5 — The "partial PDF / large attachment" alt-flow is out of scope.** No attachment feature
  exists anywhere in the product; there is nothing to attach or omit. Recorded rather than
  invented.
- **D6 — UC-09 DoD 1 (and Global DoD #8) is recorded OPEN.** The scope requires verification
  "against official template for all 11 form types"; there is no official template for any, and no
  genuine specimen for four. What ships: structural checks against the seven specimens,
  self-baseline pixel regression, and LER-1170's sign-off record that stays open until the client
  or a practitioner signs. Same honesty pattern as the Railway record's DoD #12 non-claim.
- **D7 — Encryption is application-level AES-256-GCM with an env master key.** A platform
  attestation was already judged insufficient (LER-1202); Railway offers no KMS. Limits stated in
  PRD §9 (single key, manual rotation tool, no HSM); the storage audit verifies exactly what is
  claimed and nothing more.

## Open questions

- **Q1 — Declaration parenthetical (practitioner, LER-1200/1077).** The 2013 specimen's declaration
  includes "(consisting of ___ page(s) each signed by me)"; the shipped constant omits it (found
  24 Aug, three-way mismatch — `docs/answers/template-sourcing-evidence-2026-08.md` §3). LER-1072
  builds the interpolation mechanism but activates it only on the approved wording. Who signs, and
  which wording?
- **Q2 — Fixture strategy (decision-maker, LER-1269).** Per-suite dedicated seeded cases, a reset
  step for case-linked drafts, or pin tests to the polluted baseline? Blocks LER-1156. The pack
  recommends per-suite dedicated cases (Sofia-Renard pattern promoted to policy) — decide, don't
  default.
- **Q3 — Should UC-05 format errors gate generation?** The finalise gate runs UC-08's quality
  engine, which does not include format validation — a draft with a hard sourced-format error can
  finalise and would render. Recorded in the acceptance mapping 24 Aug; a product call, not a bug
  fix.
- **Q4 — Should `finalising` trigger the schedule-sparseness check?** The pure function supports it;
  no API call site passes it (the other 24 Aug wiring finding). Natural to settle while wiring the
  generate gate.
- **Q5 — Key management for release.** Env master key acceptable for the release block, or does
  LER-1192's storage audit require managed keys (a hosting change)?
- **Q6 — Download filename convention.** Proposed `MG11-<URN>-<date>.pdf` — a URN is a case
  reference, not defendant personal data, and the name exists only at download time. Confirm the
  client reads DoD 3 the same way.
- **Q7 — Does MG1 render?** MG1 does not exist on the current official list (memo A1, unanswered).
  Until ruled, it renders like the others, draft-marked; if A1 removes it, the layout is one data
  file to delete.
- **Q8 — Where does Chromium's memory live?** Measured 24 Aug (dev box, default flags): the browser
  tree idles at **618 MB RSS** after launch, **762 MB peak** during renders — beside the API's
  ~130 MB that does not fit safely in the current 1 GB Railway free-trial container, even
  launch-render-close. Options, decide before build: (a) Railway plan upgrade; (b) tune Chromium
  down (headless-shell, `--single-process`, `--disable-dev-shm-usage` — **re-measure**, do not
  assume); (c) a separate render-worker service. Raised by the coordinating session on 24 Aug;
  the render code is identical under all three, so the choice gates deployment, not design.
