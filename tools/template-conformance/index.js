#!/usr/bin/env node
/**
 * template-conformance — CI gate over the MG templates.
 *
 *   npm run conformance
 *
 * Self-tests the checker against synthetic bad templates first (a gate that
 * cannot catch a planted defect is decoration), then scores every real
 * template. Exit 1 on any error-severity finding, so CI goes red on regression.
 */
const assert = require('node:assert');
const {
  FORM_TEMPLATES,
  checkTemplate,
  checkAllTemplates,
  checkAssistanceRegistries,
  checkCrossRefVocabulary,
  STANDARD_PHRASES,
} = require('../../libs/shared/dist/index.js');

// ── self-tests ───────────────────────────────────────────────────────────────
const base = {
  code: 'MG1',
  name: 'X',
  description: 'X',
  templateVersion: 1,
  fields: [],
};
const field = (over = {}) => ({
  id: 'a',
  label: 'A label',
  type: 'text',
  required: true,
  helpText: 'Enough help text to clear the structural and sourcing floors easily.',
  ...over,
});
const rules = (t) => checkTemplate(t).filter((f) => f.severity === 'error').map((f) => f.rule);

assert(rules({ ...base, fields: [field(), field()] }).includes('unique-ids'), 'duplicate id missed');
assert(
  rules({ ...base, fields: [field({ mapsTo: 'notAPath' })] }).includes('maps-to'),
  'invalid mapsTo missed',
);
assert(
  rules({ ...base, fields: [field({ type: 'select', options: [] })] }).includes('select-options'),
  'optionless select missed',
);
assert(rules({ ...base, fields: [field({ helpText: '' })] }).includes('help-text'), 'empty help missed');
assert(
  rules({ ...base, fields: [field({ required: false })] }).includes('has-required'),
  'no-required missed',
);
// Sourcing tier: only fires when verification is set…
assert(
  !rules({ ...base, fields: [field()] }).includes('provenance'),
  'sourcing rules must not apply to unassessed templates',
);
assert(
  rules({ ...base, verification: 'unverified', fields: [field()] }).includes('provenance'),
  'missing provenance missed on assessed template',
);
assert(
  rules({
    ...base,
    verification: 'unverified',
    fields: [field({ provenance: 'documented' })],
  }).includes('validation-coverage'),
  'low validation coverage missed',
);
// …and a genuinely good assessed template passes.
assert.deepStrictEqual(
  rules({
    ...base,
    verification: 'unverified',
    fields: [field({ provenance: 'documented', validation: { maxLength: 10 } })],
  }),
  [],
  'a conforming assessed template must produce no errors',
);

// Repeating groups (UC-04): the columns are half the form, so a planted defect
// inside one must fail exactly as a top-level one does.
const group = (columns, over = {}) =>
  field({ id: 'g', type: 'group', label: 'A group', columns, ...over });
const col = (over = {}) => ({ ...field({ id: 'c' }), ...over });

assert(rules({ ...base, fields: [group([])] }).includes('group-columns'), 'columnless group missed');
assert(
  rules({ ...base, fields: [field({ columns: [col()] })] }).includes('group-columns'),
  'columns on a non-group missed',
);
assert(
  rules({ ...base, fields: [group([col(), col()])] }).includes('unique-ids'),
  'duplicate column id missed',
);
assert(
  rules({ ...base, fields: [group([col({ id: '__id' })])] }).includes('reserved-id'),
  'column shadowing the row identifier missed',
);
assert(
  rules({ ...base, fields: [group([col({ type: 'group', columns: [col()] })])] }).includes('group-nesting'),
  'nested group missed',
);
assert(
  rules({ ...base, fields: [group([col({ mapsTo: 'urn' })])] }).includes('group-maps-to'),
  'mapsTo on a column missed',
);
assert(
  rules({ ...base, fields: [group([col({ type: 'select', options: [] })])] }).includes('select-options'),
  'optionless select column missed',
);
assert(
  rules({ ...base, fields: [group([col({ required: false })])] }).includes('group-columns'),
  'group with no required column missed',
);
assert(
  rules({ ...base, fields: [group([col({ helpText: '' })]) ] }).includes('help-text'),
  'column with no helpText missed',
);
assert(
  rules({
    ...base,
    fields: [group([col()], { sensitivityFlag: { columnId: 'nope', whenValue: 'x' } })],
  }).includes('sensitivity-flag'),
  'sensitivityFlag on a column that does not exist missed',
);
assert(
  rules({
    ...base,
    fields: [
      group([col({ type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] })], {
        sensitivityFlag: { columnId: 'c', whenValue: 'not-an-option' },
      }),
    ],
  }).includes('sensitivity-flag'),
  'sensitivityFlag value outside the column options missed',
);
assert(
  rules({ ...base, fields: [field({ sensitivityFlag: { columnId: 'a', whenValue: 'x' } })] }).includes(
    'sensitivity-flag',
  ),
  'sensitivityFlag on a non-group missed',
);
assert(
  rules({ ...base, fields: [field({ validation: { uniqueInGroup: true } })] }).includes('unique-in-group'),
  'uniqueInGroup outside a group missed',
);
assert(
  rules({ ...base, fields: [group([col()], { complexityFieldId: 'nope' })] }).includes(
    'complexity-field',
  ),
  'complexityFieldId pointing at no field missed',
);
// Sourcing reaches into columns as well.
assert(
  rules({
    ...base,
    verification: 'unverified',
    fields: [
      field({ provenance: 'documented', validation: { maxLength: 10 } }),
      group([col({ validation: { maxLength: 10 } })], { provenance: 'documented' }),
    ],
  }).includes('provenance'),
  'column with no provenance missed on an assessed template',
);
// …and a well-formed group passes clean.
assert.deepStrictEqual(
  rules({
    ...base,
    verification: 'unverified',
    fields: [
      group([col({ provenance: 'documented', validation: { maxLength: 10 } })], {
        provenance: 'documented',
      }),
    ],
  }),
  [],
  'a conforming group must produce no errors',
);

// UC-05 validation rules. Severity-follows-provenance is the rule the whole
// epic rests on, so it gets a planted defect in both directions.
const dateField = (over = {}) => field({ id: 'd', type: 'date', ...over });
assert(
  rules({ ...base, fields: [field({ validation: { format: 'notAFormat' } })] }).includes('format-registry'),
  'unknown format name missed',
);
assert(
  rules({
    ...base,
    fields: [field({ validation: { format: 'urn', severity: 'error' } })],
  }).includes('format-severity'),
  "error severity on an unsourced ('inference') format missed — the whole point of the gate",
);
assert(
  !rules({
    ...base,
    fields: [field({ validation: { format: 'telephone', severity: 'error' } })],
  }).includes('format-severity'),
  'error severity on a sourced format must be permitted',
);
assert(
  !rules({ ...base, fields: [field({ validation: { format: 'urn' } })] }).includes('format-severity'),
  'an advisory unsourced format must pass',
);
// Cross-field ordering.
assert(
  rules({ ...base, fields: [dateField({ validation: { notBefore: {} } })] }).includes('order-operand'),
  'ordering rule with neither operand missed',
);
assert(
  rules({
    ...base,
    fields: [dateField({ validation: { notBefore: { fieldId: 'x', casePath: 'urn' } } })],
  }).includes('order-operand'),
  'ordering rule naming both operands missed',
);
assert(
  rules({
    ...base,
    fields: [dateField({ validation: { notAfter: { fieldId: 'nope' } } })],
  }).includes('order-target'),
  'ordering rule pointing at a missing field missed',
);
assert(
  rules({
    ...base,
    fields: [dateField({ validation: { notAfter: { casePath: 'notAPath' } } })],
  }).includes('order-target'),
  'ordering rule with an invalid casePath missed',
);
assert(
  rules({
    ...base,
    fields: [field({ id: 'a', validation: { notBefore: { casePath: 'offenceDate' } } })],
  }).includes('order-type'),
  'ordering rule on a non-date field missed',
);
assert(
  rules({
    ...base,
    fields: [
      dateField({ id: 'd', validation: { notBefore: { fieldId: 't' } } }),
      field({ id: 't', type: 'time' }),
    ],
  }).includes('order-type'),
  'ordering rule comparing a date against a time missed',
);
assert(
  rules({
    ...base,
    fields: [field({ validation: { requiredWhen: { fieldId: 'nope', equals: 'yes' } } })],
  }).includes('required-when-target'),
  'requiredWhen pointing at a missing field missed',
);
// ...and a well-formed set of UC-05 rules passes clean.
assert.deepStrictEqual(
  rules({
    ...base,
    fields: [
      dateField({ id: 'from' }),
      dateField({ id: 'to', validation: { notBefore: { fieldId: 'from' } } }),
      field({ id: 'ref', validation: { format: 'urn' } }),
      field({ id: 'why', validation: { requiredWhen: { fieldId: 'ref', equals: 'yes' } } }),
    ],
  }),
  [],
  'a conforming UC-05 rule set must produce no errors',
);
// Per-field citations (MG6's v4 rebuild is the first field set to carry them).
assert(
  rules({ ...base, fields: [field({ provenance: 'documented', source: '   ' })] }).includes('field-source'),
  'a source that is only whitespace missed — it reads as sourced and cites nothing',
);
assert(
  rules({ ...base, fields: [field({ source: 'A real citation.' })] }).includes('field-source'),
  'a source with no provenance missed',
);
assert(
  !rules({
    ...base,
    fields: [field({ provenance: 'documented', source: 'A real citation.', validation: { maxLength: 10 } })],
  }).includes('field-source'),
  'a properly cited field must pass',
);

// UC-06 language assistance. Two rules, and the second is the one the epic
// rests on: a prompt may only propose wording it can attribute.
assert(
  rules({ ...base, fields: [field({ narrative: true })] }).includes('narrative-type'),
  'narrative on a non-textarea missed',
);
assert(
  rules({
    ...base,
    fields: [group([col({ type: 'textarea', narrative: true })])],
  }).includes('narrative-column'),
  'narrative on a group column missed',
);
assert(
  !rules({ ...base, fields: [field({ type: 'textarea', narrative: true })] }).includes(
    'narrative-type',
  ),
  'narrative on a textarea must be permitted',
);

const assistanceRules = (input) =>
  checkAssistanceRegistries(input)
    .filter((f) => f.severity === 'error')
    .map((f) => f.rule);
const informal = (over = {}) => ({
  phrase: 'kicked off',
  kind: 'informal',
  explanation: 'Reads informally.',
  ...over,
});
const phrase = (over = {}) => ({
  id: 'p1',
  trigger: 'cctv',
  message: 'Consider the standard wording.',
  insertText: 'Some wording.',
  provenance: 'documented',
  source: 'A real citation.',
  ...over,
});
const hint = (over = {}) => ({
  id: 'h1',
  message: 'Something is not recorded.',
  absentPattern: 'somepattern',
  provenance: 'inference',
  ...over,
});

assert(
  assistanceRules({ informal: [informal({ suggestion: 'Write this instead.' })] }).includes(
    'assistance-source',
  ),
  'a formal alternative with no source missed — the whole point of the UC-06 gate',
);
assert(
  assistanceRules({
    informal: [
      informal({
        suggestion: 'Write this instead.',
        suggestionProvenance: 'likely',
        suggestionSource: 'A citation.',
      }),
    ],
  }).includes('assistance-source'),
  "a formal alternative claiming 'likely' provenance must still be refused",
);
assert(
  !assistanceRules({
    informal: [
      informal({
        suggestion: 'Write this instead.',
        suggestionProvenance: 'documented',
        suggestionSource: 'A citation.',
      }),
    ],
  }).includes('assistance-source'),
  'a properly sourced formal alternative must be permitted',
);
assert(
  assistanceRules({ informal: [informal({ kind: 'hearsay' })] }).includes('assistance-kind'),
  'a non-informal pattern in the informal registry missed',
);
assert(
  assistanceRules({ phrases: [phrase({ provenance: 'inference', source: undefined })] }).includes(
    'assistance-source',
  ),
  'an unattributed standard phrase missed',
);
assert(
  assistanceRules({ phrases: [phrase({ provenance: 'documented', source: '   ' })] }).includes(
    'assistance-source',
  ),
  'a standard phrase citing whitespace as its source missed',
);
assert(
  assistanceRules({ phrases: [phrase({ trigger: '' })] }).includes('assistance-trigger'),
  'a standard phrase with no trigger missed',
);
assert(
  assistanceRules({ phrases: [phrase({ trigger: 'a*' })] }).includes('assistance-trigger'),
  'a trigger that matches the empty string missed',
);
assert(
  assistanceRules({ hints: [hint({ absentPattern: '(x)?' })] }).includes('assistance-trigger'),
  'a completeness pattern that matches everything missed',
);
assert(
  assistanceRules({ hints: [hint({ provenance: 'documented' })] }).includes('assistance-source'),
  "a hint claiming 'documented' with no source missed",
);
assert(
  assistanceRules({ hints: [hint(), hint()] }).includes('assistance-id'),
  'duplicate hint ids missed',
);
// ...and the registries as they actually ship pass clean.
assert.deepStrictEqual(
  assistanceRules(),
  [],
  'the shipped assistance registries must produce no errors',
);
// The scope asks for standard phrasing and supplies none, so this ships empty on
// purpose. If it is ever filled, every entry must be sourced — asserted above.
assert.deepStrictEqual(
  STANDARD_PHRASES.filter((p) => p.provenance !== 'documented' || !p.source),
  [],
  'a standard phrase shipped without provenance documented + a source',
);

// UC-07 sensitive material. The declaration drives redaction, the API guard
// and the export exclusion, so a declaration the checker cannot police would
// let one bad template edit quietly disable all three.
const flagGroup = (over = {}) =>
  group(
    [col({ type: 'select', options: [{ value: 'ns', label: 'Non-sensitive' }, { value: 's', label: 'Sensitive' }] })],
    { sensitivityFlag: { columnId: 'c', whenValue: 's' }, ...over },
  );
const sensitiveGroup = (over = {}) =>
  group([col({ id: 'sc' })], { id: 'sg', sensitive: true, section: 'MG6D', ...over });

assert(
  rules({ ...base, fields: [flagGroup(), group([col({ sensitive: true })], { id: 'sg' })] }).includes(
    'sensitive-column',
  ),
  'a sensitive group column missed — the section owns whole fields',
);
assert(
  rules({ ...base, fields: [flagGroup(), sensitiveGroup({ section: undefined })] }).includes(
    'sensitive-section',
  ),
  'a sensitive field with no section heading missed',
);
assert(
  rules({
    ...base,
    fields: [flagGroup(), field({ id: 'sf', sensitive: true, section: 'MG6D', mapsTo: 'urn' })],
  }).includes('sensitive-maps-to'),
  'mapsTo on a sensitive field missed — auto-fill must never write into a gated section',
);
assert(
  rules({
    ...base,
    fields: [
      flagGroup(),
      field({ id: 's1', sensitive: true, section: 'A' }),
      field({ id: 's2', sensitive: true, section: 'B' }),
    ],
  }).includes('sensitive-section'),
  'sensitive fields spanning two section headings missed',
);
assert(
  rules({
    ...base,
    fields: [flagGroup(), sensitiveGroup(), field({ id: 'n1', section: 'MG6D' })],
  }).includes('sensitive-section'),
  'a non-sensitive field inside the sensitive section heading missed',
);
assert(
  rules({ ...base, fields: [sensitiveGroup()] }).includes('sensitive-trigger'),
  'a sensitive section with no sensitivityFlag group to activate it missed',
);
// ...and a well-formed sensitive template passes clean.
assert.deepStrictEqual(
  rules({ ...base, fields: [flagGroup(), sensitiveGroup()] }),
  [],
  'a conforming sensitive template must produce no errors',
);

// UC-08 cross-form reference declaration. The vocabulary is what makes Check 3
// honest, so a bad declaration must fail the build, not surface at review time.
assert(
  rules({ ...base, fields: [field({ crossRef: { vocabulary: 'nope', role: 'cites' } })] }).includes(
    'cross-ref-vocabulary',
  ),
  'an unknown crossRef vocabulary missed',
);
assert(
  rules({ ...base, fields: [field({ crossRef: { vocabulary: 'exhibitReference', role: 'lists' } })] }).includes(
    'cross-ref-role',
  ),
  'an invalid crossRef role missed',
);
assert(
  rules({
    ...base,
    fields: [field({ type: 'date', crossRef: { vocabulary: 'exhibitReference', role: 'cites' } })],
  }).includes('cross-ref-type'),
  'crossRef on a non-text field missed',
);
assert(
  checkCrossRefVocabulary([
    { ...base, fields: [field({ type: 'textarea', crossRef: { vocabulary: 'exhibitReference', role: 'cites' } })] },
  ])
    .map((f) => f.rule)
    .includes('cross-ref-vocabulary'),
  'a cited vocabulary nothing defines missed (catalogue rule)',
);
assert.deepStrictEqual(
  checkCrossRefVocabulary([
    {
      ...base,
      fields: [
        field({ id: 'cite', type: 'textarea', crossRef: { vocabulary: 'exhibitReference', role: 'cites' } }),
        field({ id: 'def', type: 'textarea', crossRef: { vocabulary: 'exhibitReference', role: 'defines' } }),
      ],
    },
  ]),
  [],
  'a cited-and-defined vocabulary must pass the catalogue rule',
);

console.log(`self-tests: 68 passed\n`);

// ── the real catalogue ───────────────────────────────────────────────────────
const findings = [...checkAllTemplates(FORM_TEMPLATES), ...checkAssistanceRegistries()];
const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');

console.log(
  `template-conformance — ${FORM_TEMPLATES.length} templates scored` +
    ` + the UC-06 assistance registries (${STANDARD_PHRASES.length} standard phrase(s))`,
);
for (const t of FORM_TEMPLATES) {
  const own = findings.filter((f) => f.templateCode === t.code);
  const tier = t.verification !== undefined ? 'structural+sourcing' : 'structural only';
  console.log(
    `  ${t.code.padEnd(5)} ${own.filter((f) => f.severity === 'error').length === 0 ? 'PASS' : 'FAIL'}` +
      `  (${tier}${own.length ? `; ${own.length} finding(s)` : ''})`,
  );
}

for (const f of errors) {
  console.log(`\nERROR  [${f.templateCode}${f.fieldId ? ` · ${f.fieldId}` : ''}] ${f.rule}: ${f.message}`);
}
for (const f of warnings) {
  console.log(`warn   [${f.templateCode}${f.fieldId ? ` · ${f.fieldId}` : ''}] ${f.rule}: ${f.message}`);
}

console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length > 0 ? 1 : 0);
