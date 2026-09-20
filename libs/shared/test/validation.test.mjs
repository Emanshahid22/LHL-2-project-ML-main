// These tests run against the BUILT library (../dist/index.js) — deliberately:
// they test what actually ships, which pairs with libs/shared's noEmitOnError
// (a type error can no longer emit a dist these tests would then bless).
// The flip side: correctness depends on the root postinstall building
// libs/shared. If that postinstall is ever removed, these tests silently run
// against a STALE dist — the MG6/35-fields trap. CI builds before running them;
// locally, `npm run build -w @mgs/shared` after any src change.
/**
 * validation (UC-05) — the single definition of validity the renderer and the
 * API both consume. This file guards the module's legal-safety property above
 * all: a format whose provenance is not 'documented'-with-citation must never
 * reach error severity, whatever a template asks for — a rule that rejects a
 * valid URN teaches a solicitor to work around the product on a court
 * document. It also pins format matching per registry entry, cross-field
 * ordering, ambiguity suppression, and the stable finding order.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_FORMATS,
  GROUP_ROW_ID_KEY,
  countFindings,
  crossFieldFindings,
  effectiveSeverity,
  formatFindings,
  isBlockingFormat,
  isConditionallyRequired,
  severityFor,
  validateFieldFormat,
  validateForm,
  validateRequiredWhen,
} from '../dist/index.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

const field = (overrides) => ({
  id: 'field',
  label: 'Field',
  type: 'text',
  required: false,
  helpText: '',
  ...overrides,
});

const template = (fields, overrides = {}) => ({
  code: 'MG5',
  name: 'Fixture template',
  description: 'Unit-test fixture',
  templateVersion: 1,
  verification: 'unverified',
  fields,
  ...overrides,
});

const caseWith = (offences) => ({
  id: 'case-1',
  urn: '01AB0123456/24',
  defendantName: 'John Smith',
  offenceSummary: '',
  courtName: null,
  nextHearingAt: null,
  cpsReference: null,
  officerInCase: null,
  defendantAddress: null,
  defendantDob: null,
  offences,
  updatedAt: '2026-02-01T00:00:00.000Z',
});

// ── the provenance cap (legal safety) ────────────────────────────────────────

test('registry: exactly the eight named formats exist', () => {
  assert.deepEqual(
    Object.keys(FIELD_FORMATS).sort(),
    ['asn', 'collarNumber', 'cpsReference', 'custodyNumber', 'email', 'postcode', 'telephone', 'urn'],
  );
});

test('registry: error severity exists ONLY for documented formats carrying a citation', () => {
  for (const [name, def] of Object.entries(FIELD_FORMATS)) {
    const sourced = typeof def.source === 'string' && def.source.trim() !== '';
    const entitled = def.provenance === 'documented' && sourced;
    assert.equal(
      severityFor(def),
      entitled ? 'error' : 'advisory',
      `${name}: severity must follow provenance`,
    );
  }
  // The registry's current split, pinned: only the two published-notation
  // checks may block; every unsourced case-file reference is advisory.
  const errors = Object.entries(FIELD_FORMATS)
    .filter(([, def]) => severityFor(def) === 'error')
    .map(([name]) => name)
    .sort();
  assert.deepEqual(errors, ['email', 'telephone']);
});

test('severityFor: documented WITHOUT a citation is an assertion, not documentation', () => {
  const base = { pattern: '^x$', hint: 'h', example: 'x' };
  assert.equal(severityFor({ ...base, provenance: 'documented' }), 'advisory');
  assert.equal(severityFor({ ...base, provenance: 'documented', source: '   ' }), 'advisory');
  assert.equal(severityFor({ ...base, provenance: 'documented', source: 'RFC 0000' }), 'error');
  assert.equal(severityFor({ ...base, provenance: 'likely', source: 'RFC 0000' }), 'advisory');
  assert.equal(severityFor({ ...base, provenance: 'inference', source: 'RFC 0000' }), 'advisory');
  assert.equal(severityFor(undefined), 'advisory');
});

test('effectiveSeverity: a template cannot smuggle a blocking rule onto an unsourced format', () => {
  const smuggle = field({ id: 'urn', validation: { format: 'urn', severity: 'error' } });
  assert.equal(effectiveSeverity(smuggle), 'advisory');
  assert.equal(isBlockingFormat(smuggle), false);
});

test('effectiveSeverity: a documented format defaults to error and may be downgraded', () => {
  assert.equal(effectiveSeverity(field({ validation: { format: 'email' } })), 'error');
  assert.equal(
    effectiveSeverity(field({ validation: { format: 'email', severity: 'advisory' } })),
    'advisory',
  );
  assert.equal(isBlockingFormat(field({ validation: { format: 'email' } })), true);
  assert.equal(isBlockingFormat(field({ id: 'plain' })), false);
});

test('a failed unsourced format yields an ADVISORY finding even when the template asked for error', () => {
  const smuggle = field({ id: 'urn', label: 'URN', validation: { format: 'urn', severity: 'error' } });
  const finding = validateFieldFormat(smuggle, 'not-a-urn');
  assert.equal(finding.kind, 'format');
  assert.equal(finding.severity, 'advisory');
  assert.equal(finding.fieldId, 'urn');
  assert.equal(finding.message, FIELD_FORMATS.urn.hint);
});

// ── format matching per registry entry ───────────────────────────────────────

test('every registry entry accepts its own published example', () => {
  for (const [name, def] of Object.entries(FIELD_FORMATS)) {
    assert.ok(new RegExp(def.pattern).test(def.example), `${name} rejects its own example`);
  }
});

const formatCases = {
  telephone: {
    pass: ['020 7946 0123', '+44 (0)20 7946 0123', '0123456'],
    fail: ['123456', 'call me maybe', '0'.repeat(21)],
  },
  email: {
    pass: ['j.smith@police.uk', 'a@b.c', 'a@b.c.d.e.f'],
    // The domain allows at most 1+4 dotted labels; empty labels and spaces fail.
    fail: ['no-at', 'a@b', 'a@b..c', 'a b@x.y', `${'x'.repeat(65)}@x.y`, 'a@b.c.d.e.f.g'],
  },
  postcode: {
    pass: ['SE1 9AA', 'se19aa', 'EC1A 1BB'],
    fail: ['SE1', '12345', 'SE1 9AAA'],
  },
  urn: {
    pass: ['01AB0123456/24', '01ab012345/24', '01AB01234567/24'],
    fail: ['AB010123456/24', '01AB01234/24', '01AB0123456-24', '01AB0123456/2024'],
  },
  asn: {
    pass: ['01/AB/01234/24', 'ABC-123'],
    fail: ['AB/12', 'a'.repeat(25), '01 AB 01234'],
  },
  custodyNumber: {
    pass: ['CU/12345/24', '1234'],
    fail: ['ABC', 'CU 12345'],
  },
  collarNumber: {
    // The number alone: "PC 1234" is a rank plus a number, which is what the
    // composite officer boxes hold — and why no field carries this format.
    pass: ['1234', 'AB12'],
    fail: ['PC 1234', 'X', '12345678901'],
  },
  cpsReference: {
    pass: ['01/AB/123456/24'],
    fail: ['01/AB/12345/24', '01AB12345624', '01/AB/123456'],
  },
};

for (const [name, { pass, fail }] of Object.entries(formatCases)) {
  test(`format ${name}: accepts documented shapes, rejects near-misses`, () => {
    const f = field({ id: name, label: name, validation: { format: name } });
    for (const value of pass) {
      assert.equal(validateFieldFormat(f, value), null, `${name} should accept "${value}"`);
    }
    for (const value of fail) {
      assert.notEqual(validateFieldFormat(f, value), null, `${name} should reject "${value}"`);
    }
  });
}

test('format checking leaves emptiness to `required` and ignores non-strings', () => {
  const f = field({ id: 'phone', validation: { format: 'telephone' } });
  assert.equal(validateFieldFormat(f, ''), null);
  assert.equal(validateFieldFormat(f, '   '), null);
  assert.equal(validateFieldFormat(f, undefined), null);
  assert.equal(validateFieldFormat(f, null), null);
  assert.equal(validateFieldFormat(f, 1234567), null);
  assert.equal(validateFieldFormat(field({ id: 'plain' }), 'anything'), null);
});

// ── requiredWhen ─────────────────────────────────────────────────────────────

const conditional = field({
  id: 'underminesDetail',
  label: 'If yes, give details',
  type: 'textarea',
  validation: { requiredWhen: { fieldId: 'underminesCase', equals: 'yes' } },
});

test('requiredWhen: fires only on an exact trigger match with an empty target', () => {
  assert.equal(validateRequiredWhen(conditional, { underminesCase: 'no' }), null);
  assert.equal(validateRequiredWhen(conditional, { underminesCase: 'Yes' }), null);
  assert.equal(validateRequiredWhen(conditional, {}), null);
  assert.equal(
    validateRequiredWhen(conditional, { underminesCase: 'yes', underminesDetail: 'Item 3.' }),
    null,
  );

  const finding = validateRequiredWhen(conditional, { underminesCase: 'yes' });
  assert.equal(finding.kind, 'required-when');
  assert.equal(finding.severity, 'error');
  assert.equal(finding.fieldId, 'underminesDetail');
  assert.equal(finding.relatedFieldId, 'underminesCase');
});

test('requiredWhen: the message speaks in labels when a labeller is supplied, ids otherwise', () => {
  const labels = { underminesDetail: 'If yes, give details', underminesCase: 'Undermines the case?' };
  const labelled = validateRequiredWhen(conditional, { underminesCase: 'yes' }, (id) => labels[id]);
  assert.match(labelled.message, /If yes, give details/);
  assert.match(labelled.message, /Undermines the case\?/);

  const bare = validateRequiredWhen(conditional, { underminesCase: 'yes' });
  assert.match(bare.message, /underminesDetail/);
});

test('isConditionallyRequired mirrors the trigger exactly', () => {
  assert.equal(isConditionallyRequired(conditional, { underminesCase: 'yes' }), true);
  assert.equal(isConditionallyRequired(conditional, { underminesCase: 'Yes' }), false);
  assert.equal(isConditionallyRequired(field({ id: 'plain' }), { underminesCase: 'yes' }), false);
});

// ── cross-field ordering ─────────────────────────────────────────────────────

const orderTemplate = template([
  field({ id: 'startDate', label: 'Interview start', type: 'time' }),
  field({
    id: 'endDate',
    label: 'Interview end',
    type: 'time',
    validation: { notBefore: { fieldId: 'startDate', strict: true, message: 'The interview must end after it starts.' } },
  }),
  field({ id: 'chargeDate', label: 'Charge date', type: 'date' }),
  field({
    id: 'arrestDate',
    label: 'Arrest date',
    type: 'date',
    validation: { notAfter: { fieldId: 'chargeDate', severity: 'advisory', message: 'Arrest is usually on or before charge.' } },
  }),
  field({
    id: 'statementDate',
    label: 'Statement date',
    type: 'date',
    validation: { notBefore: { casePath: 'offenceDate' } },
  }),
]);

test('ordering: fires only when both operands hold values', () => {
  assert.deepEqual(crossFieldFindings(orderTemplate, { endDate: '11:00' }), []);
  assert.deepEqual(crossFieldFindings(orderTemplate, { startDate: '11:00' }), []);
  assert.deepEqual(crossFieldFindings(orderTemplate, {}), []);
});

test('ordering: a strict notBefore fails on equality, with the declared message', () => {
  const findings = crossFieldFindings(orderTemplate, { startDate: '11:00', endDate: '11:00' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'order');
  assert.equal(findings[0].severity, 'error');
  assert.equal(findings[0].fieldId, 'endDate');
  assert.equal(findings[0].message, 'The interview must end after it starts.');
  assert.equal(findings[0].suppressed, undefined);
});

test('ordering: a satisfied rule is silent', () => {
  assert.deepEqual(crossFieldFindings(orderTemplate, { startDate: '11:00', endDate: '11:01' }), []);
  assert.deepEqual(
    crossFieldFindings(orderTemplate, { arrestDate: '2026-02-01', chargeDate: '2026-02-01' }),
    [],
  );
});

test('ordering: declared severity stands for ordering rules — they are not registry-capped', () => {
  // Contrast with formats: ordering severity is the template author's call,
  // because some orderings are impossible and others merely unusual.
  const findings = crossFieldFindings(orderTemplate, { arrestDate: '2026-02-10', chargeDate: '2026-02-01' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'advisory');
  assert.equal(findings[0].message, 'Arrest is usually on or before charge.');
});

test('ordering: an unambiguous case operand is compared and named', () => {
  const oneOffence = caseWith([{ id: 'o1', offenceDate: '2026-01-05T00:00:00.000Z', chargeWording: 'Theft' }]);
  const findings = crossFieldFindings(orderTemplate, { statementDate: '2026-01-01' }, oneOffence);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'order');
  assert.equal(findings[0].severity, 'error');
  assert.match(findings[0].message, /offenceDate/);
  const clean = crossFieldFindings(orderTemplate, { statementDate: '2026-01-06' }, oneOffence);
  assert.deepEqual(clean, []);
});

test('ordering: an ambiguous case datum SUPPRESSES the comparison, as an advisory explanation', () => {
  const twoOffences = caseWith([
    { id: 'o1', offenceDate: '2026-01-05T00:00:00.000Z', chargeWording: 'Theft' },
    { id: 'o2', offenceDate: '2026-01-07T00:00:00.000Z', chargeWording: 'Assault' },
  ]);
  // Suppression explains a silence whatever the value would have compared as.
  for (const statementDate of ['2026-01-01', '2026-01-06', '2026-01-31']) {
    const findings = crossFieldFindings(orderTemplate, { statementDate }, twoOffences);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].suppressed, true);
    assert.equal(findings[0].severity, 'advisory');
    assert.equal(findings[0].relatedFieldId, 'case:offenceDate');
    assert.match(findings[0].message, /could not be checked/);
  }
});

test('ordering: a case with no offences, or no case at all, is silent — not suppressed', () => {
  const noOffences = caseWith([]);
  assert.deepEqual(crossFieldFindings(orderTemplate, { statementDate: '2026-01-01' }, noOffences), []);
  assert.deepEqual(crossFieldFindings(orderTemplate, { statementDate: '2026-01-01' }, null), []);
  assert.deepEqual(crossFieldFindings(orderTemplate, { statementDate: '2026-01-01' }), []);
});

// ── assembly: order, counts ──────────────────────────────────────────────────

const assemblyTemplate = template([
  field({ id: 'ownerEmail', label: 'Email', validation: { format: 'email' } }),
  field({ id: 'caseUrn', label: 'URN', validation: { format: 'urn' } }),
  field({ id: 'startDate', label: 'Start', type: 'date' }),
  field({
    id: 'endDate',
    label: 'End',
    type: 'date',
    validation: { notBefore: { fieldId: 'startDate' } },
  }),
  field({ id: 'underminesCase', label: 'Undermines?', type: 'select' }),
  field({
    id: 'underminesDetail',
    label: 'Details',
    type: 'textarea',
    validation: { requiredWhen: { fieldId: 'underminesCase', equals: 'yes' } },
  }),
]);

const everythingWrong = {
  ownerEmail: 'not-an-email',
  caseUrn: 'not-a-urn',
  startDate: '2026-02-02',
  endDate: '2026-02-01',
  underminesCase: 'yes',
};

test('validateForm: formats first, then cross-field, each in template order', () => {
  const findings = validateForm(assemblyTemplate, everythingWrong);
  assert.deepEqual(
    findings.map((f) => `${f.kind}:${f.fieldId}`),
    ['format:ownerEmail', 'format:caseUrn', 'order:endDate', 'required-when:underminesDetail'],
  );
});

test('validateForm: two runs over the same values agree exactly', () => {
  const a = validateForm(assemblyTemplate, everythingWrong);
  const b = validateForm(assemblyTemplate, everythingWrong);
  assert.deepEqual(a, b);
});

test('validateForm: the sensitive-schedule finding joins as error severity', () => {
  const sensitiveTemplate = template([
    field({
      id: 'unusedMaterialItems',
      label: 'Unused material schedule',
      type: 'group',
      sensitivityFlag: { columnId: 'classification', whenValue: 'sensitive' },
      columns: [field({ id: 'classification', label: 'Classification', type: 'select' })],
    }),
    field({
      id: 'sensitiveScheduleItems',
      label: 'Sensitive material schedule',
      type: 'group',
      sensitive: true,
      columns: [field({ id: 'description', label: 'Description' })],
    }),
  ], { code: 'MG6' });
  const values = {
    unusedMaterialItems: [{ [GROUP_ROW_ID_KEY]: 'row-1', classification: 'sensitive' }],
    sensitiveScheduleItems: [],
  };
  const findings = validateForm(sensitiveTemplate, values);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'sensitive-schedule');
  assert.equal(findings[0].severity, 'error');
  assert.equal(findings[0].fieldId, 'sensitiveScheduleItems');
});

test('countFindings: suppressed findings are counted apart, never as failures', () => {
  const findings = [
    { kind: 'format', severity: 'error', fieldId: 'a', message: '' },
    { kind: 'format', severity: 'advisory', fieldId: 'b', message: '' },
    { kind: 'order', severity: 'advisory', fieldId: 'c', message: '', suppressed: true },
  ];
  assert.deepEqual(countFindings(findings), {
    validationErrorCount: 1,
    validationAdvisoryCount: 1,
    validationSuppressedCount: 1,
  });
  assert.deepEqual(countFindings([]), {
    validationErrorCount: 0,
    validationAdvisoryCount: 0,
    validationSuppressedCount: 0,
  });
});
