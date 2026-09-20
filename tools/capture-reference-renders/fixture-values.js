/**
 * Sanctioned, DETERMINISTIC values for the 11 reference renders (LER-1156).
 *
 * Everything here is synthetic and derives from the FROZEN UC-09 fixture —
 * Nadia Kowalczyk, 07ST0990011/26 (e2e/FIXTURES.md: reserved for exactly
 * this) — or is neutral filler. Nothing is ever read from a live database, a
 * clock or a random source: the same inputs must render the same pixels
 * forever, or the regression gate is comparing noise.
 *
 * Values are generated per template from its own field definitions (so a
 * template change naturally flows into its baseline — reviewed via the
 * pixel diff), with fixture-specific overrides where a field means something.
 */

/** The frozen fixture's identity — synthetic (e2e/FIXTURES.md). */
const FIXTURE = {
  urn: '07ST0990011/26',
  defendantName: 'Nadia Kowalczyk',
  courtName: 'Weyford Magistrates Court',
  officerInCase: 'DC 5521 Marsh',
  date: '2026-05-12',
};

function fillField(f) {
  switch (f.type) {
    case 'date':
      return FIXTURE.date;
    case 'time':
      return '10:30';
    case 'number':
      return 2;
    case 'checkbox':
      return true;
    case 'select':
      return f.options?.[0]?.value ?? '';
    case 'group':
      return [
        Object.fromEntries([
          ['__id', 'ref-row-1'],
          ...(f.columns ?? []).map((c) => [c.id, fillField(c)]),
        ]),
      ];
    case 'textarea':
      return f.narrative
        ? 'On the date shown I attended the address and observed the events described in this reference render. ' +
            'This paragraph exists to exercise the narrative layout, including a citation of exhibit NK/1, ' +
            'across more than one line of print output.'
        : 'NK/1 — reference exhibit — DC 5521 Marsh';
    default: {
      if (f.mapsTo === 'urn') return FIXTURE.urn;
      if (f.mapsTo === 'defendantName') return FIXTURE.defendantName;
      if (f.mapsTo === 'courtName') return FIXTURE.courtName;
      if (f.mapsTo === 'officerInCase') return FIXTURE.officerInCase;
      return `Reference value (${f.id})`;
    }
  }
}

/** Deterministic values for one template. */
function valuesFor(template) {
  const values = {};
  for (const f of template.fields) {
    values[f.id] = fillField(f);
  }
  // The MG6 sensitive schedule stays DORMANT in baselines: reference renders
  // are committed to the repo, and a red-band section would put (synthetic)
  // "sensitive" content into every checkout's diff churn for no layout gain —
  // the locked/permitted/absent renders are e2e's job, not the baseline's.
  if (values.unusedMaterialItems) {
    values.hasSensitiveMaterial = false;
    delete values.sensitiveScheduleItems;
    for (const row of values.unusedMaterialItems) {
      if ('classification' in row) row.classification = 'non-sensitive';
    }
  }
  return values;
}

/** Forms with NO genuine specimen behind them (docs/answers/
 *  template-sourcing-evidence-2026-08.md): their baselines are self-referents
 *  only — a drift gate, never a fidelity claim (D2/D6). */
const SELF_REFERENT_ONLY = ['MG1', 'MG3', 'MG15', 'MG16'];

module.exports = { FIXTURE, valuesFor, SELF_REFERENT_ONLY };
