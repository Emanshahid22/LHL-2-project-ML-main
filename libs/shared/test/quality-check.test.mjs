// These tests run against the BUILT library (../dist/index.js) — deliberately:
// they test what actually ships, which pairs with libs/shared's noEmitOnError
// (a type error can no longer emit a dist these tests would then bless).
// The flip side: correctness depends on the root postinstall building
// libs/shared. If that postinstall is ever removed, these tests silently run
// against a STALE dist — the MG6/35-fields trap. CI builds before running them;
// locally, `npm run build -w @mgs/shared` after any src change.
/**
 * quality-check (UC-08) — the pure form-review engine: four checks, report
 * assembly, and the finalise-gate helpers. This file guards the properties the
 * review's authority rests on: issue ids are stable and derived from draft
 * state, severities land on the documented side of the blocking/advisory line,
 * an incomplete check always blocks finalisation, and an advisory can only be
 * cleared by a reasoned acknowledgement within the recorded cap.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVISORY_REASON_MAX_CHARS,
  GROUP_ROW_ID_KEY,
  QUALITY_CHECK_TIMEOUT_MS,
  QUALITY_CHECK_TITLES,
  SENSITIVE_MATERIAL_FLAG_KEY,
  advisoriesOf,
  assembleReport,
  checkCrossForm,
  checkDateLogic,
  checkRequiredCompleteness,
  checkSensitiveHandling,
  extractExhibitRefs,
  getFormTemplate,
  isFinaliseRequest,
  unacknowledgedAdvisories,
} from '../dist/index.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

let rowSeq = 0;
const row = (columns) => ({ [GROUP_ROW_ID_KEY]: `row-${++rowSeq}`, ...columns });

const field = (overrides) => ({
  id: 'field',
  label: 'Field',
  type: 'text',
  required: false,
  helpText: '',
  ...overrides,
});

const template = (fields, overrides = {}) => ({
  code: 'MG6',
  name: 'Fixture template',
  description: 'Unit-test fixture',
  templateVersion: 1,
  verification: 'unverified',
  fields,
  ...overrides,
});

// Shaped like the real MG6: an open schedule raising the sensitivity flag, the
// sensitive MG6D schedule it activates, and a requiredWhen pair.
const mg6ish = template([
  field({ id: 'urn', label: 'Unique reference number', required: true }),
  field({
    id: 'unusedMaterialItems',
    label: 'Unused material schedule',
    type: 'group',
    required: true,
    sensitivityFlag: { columnId: 'classification', whenValue: 'sensitive' },
    columns: [
      field({ id: 'itemReference', label: 'Item reference', required: true }),
      field({ id: 'description', label: 'Description', required: true }),
      field({ id: 'classification', label: 'Classification', type: 'select', required: true }),
    ],
  }),
  field({
    id: 'sensitiveScheduleItems',
    label: 'Sensitive material schedule',
    type: 'group',
    required: false,
    sensitive: true,
    section: 'MG6D — Sensitive material schedule',
    columns: [
      field({ id: 'description', label: 'Description', type: 'textarea', required: true }),
      field({ id: 'location', label: 'Location', required: true }),
    ],
  }),
  field({ id: 'underminesCase', label: 'Undermines the case?', type: 'select', required: true }),
  field({
    id: 'underminesDetail',
    label: 'If yes, give details',
    type: 'textarea',
    validation: { requiredWhen: { fieldId: 'underminesCase', equals: 'yes' } },
  }),
]);

const completeRow = row({ itemReference: 'DOC/1', description: 'Crime report', classification: 'non_sensitive' });
const sensitiveRow = row({ itemReference: 'INT/2', description: 'Intelligence log', classification: 'sensitive' });

const completeValues = () => ({
  urn: '01AB0123456/24',
  unusedMaterialItems: [completeRow],
  underminesCase: 'no',
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

// ── constants ────────────────────────────────────────────────────────────────

test('per-check timeout and advisory-reason cap hold their documented values', () => {
  assert.equal(QUALITY_CHECK_TIMEOUT_MS, 4000);
  assert.equal(ADVISORY_REASON_MAX_CHARS, 500);
});

test('every check id carries a human title', () => {
  assert.deepEqual(
    Object.keys(QUALITY_CHECK_TITLES).sort(),
    ['completeness', 'crossForm', 'dateLogic', 'sensitiveHandling'],
  );
  for (const title of Object.values(QUALITY_CHECK_TITLES)) {
    assert.equal(typeof title, 'string');
    assert.ok(title.length > 0);
  }
});

// ── extractExhibitRefs ───────────────────────────────────────────────────────

test('extractExhibitRefs: non-strings and blank text yield nothing', () => {
  assert.deepEqual(extractExhibitRefs(undefined), []);
  assert.deepEqual(extractExhibitRefs(null), []);
  assert.deepEqual(extractExhibitRefs(42), []);
  assert.deepEqual(extractExhibitRefs(''), []);
  assert.deepEqual(extractExhibitRefs('   \n  '), []);
});

test('extractExhibitRefs: leading token per line, uppercased, prose ignored', () => {
  const text = 'JS/1 — CCTV disc\n  js/3 knife\nThe witness produced a disc\nsee JS/9';
  // Only a LINE-LEADING token is a reference; "see JS/9" is prose.
  assert.deepEqual(extractExhibitRefs(text), ['JS/1', 'JS/3']);
});

test('extractExhibitRefs: convention bounds — 1-4 letters, 1-4 digits', () => {
  assert.deepEqual(extractExhibitRefs('ABCD/1234'), ['ABCD/1234']);
  assert.deepEqual(extractExhibitRefs('ABCDE/1'), []);
  assert.deepEqual(extractExhibitRefs('JS/12345'), []);
});

test('extractExhibitRefs: repeated citations are kept, not deduplicated', () => {
  assert.deepEqual(extractExhibitRefs('JS/1 disc\nJS/1 same disc'), ['JS/1', 'JS/1']);
});

// ── Check 1 — checkRequiredCompleteness ──────────────────────────────────────

test('completeness: a fully completed draft raises nothing', () => {
  assert.deepEqual(checkRequiredCompleteness(mg6ish, completeValues()), []);
});

test('completeness: a missing required field is blocking, with a stable id', () => {
  const values = completeValues();
  delete values.urn;
  const issues = checkRequiredCompleteness(mg6ish, values);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'completeness:required:urn');
  assert.equal(issues[0].severity, 'blocking');
  assert.equal(issues[0].fieldId, 'urn');
  assert.equal(issues[0].subjectLabel, 'Unique reference number');
});

test('completeness: whitespace-only text does not count as completed', () => {
  const issues = checkRequiredCompleteness(mg6ish, { ...completeValues(), urn: '   ' });
  assert.ok(issues.some((i) => i.id === 'completeness:required:urn'));
});

test('completeness: a required group with no rows is incomplete', () => {
  const issues = checkRequiredCompleteness(mg6ish, { ...completeValues(), unusedMaterialItems: [] });
  assert.ok(issues.some((i) => i.id === 'completeness:required:unusedMaterialItems'));
});

test('completeness: a half-filled row fails the whole required group', () => {
  const halfRow = row({ itemReference: 'DOC/9', description: '', classification: 'non_sensitive' });
  const issues = checkRequiredCompleteness(mg6ish, { ...completeValues(), unusedMaterialItems: [halfRow] });
  assert.ok(issues.some((i) => i.id === 'completeness:required:unusedMaterialItems'));
});

test('completeness: requiredWhen fires only while its trigger value holds', () => {
  const dormant = checkRequiredCompleteness(mg6ish, { ...completeValues(), underminesCase: 'no' });
  assert.deepEqual(dormant, []);

  const active = checkRequiredCompleteness(mg6ish, { ...completeValues(), underminesCase: 'yes' });
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'completeness:required-when:underminesDetail');
  assert.equal(active[0].severity, 'blocking');

  const satisfied = checkRequiredCompleteness(mg6ish, {
    ...completeValues(),
    underminesCase: 'yes',
    underminesDetail: 'Item INT/2 contradicts the identification evidence.',
  });
  assert.deepEqual(satisfied, []);
});

test('completeness: sensitive material recorded but MG6D never opened is blocking', () => {
  // The sensitive group's key is ABSENT — review sees stored values, and the
  // dormant-section normalisation must make that read as the empty mandatory
  // schedule it is.
  const values = { ...completeValues(), unusedMaterialItems: [completeRow, sensitiveRow] };
  const issues = checkRequiredCompleteness(mg6ish, values);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'completeness:sensitive-schedule:sensitiveScheduleItems');
  assert.equal(issues[0].severity, 'blocking');
  assert.equal(issues[0].subjectLabel, 'Sensitive material schedule');
});

test('completeness: a populated MG6D clears the sensitive-schedule finding', () => {
  const values = {
    ...completeValues(),
    unusedMaterialItems: [completeRow, sensitiveRow],
    sensitiveScheduleItems: [row({ description: 'Informant identity', location: 'Safe, CID office' })],
  };
  assert.deepEqual(checkRequiredCompleteness(mg6ish, values), []);
});

test('completeness: the same draft state produces the same issue ids', () => {
  const values = { ...completeValues(), urn: '', underminesCase: 'yes' };
  const a = checkRequiredCompleteness(mg6ish, values);
  const b = checkRequiredCompleteness(mg6ish, values);
  assert.deepEqual(a, b);
});

// ── Check 2 — checkDateLogic ─────────────────────────────────────────────────

const dateTemplate = template([
  field({ id: 'witnessDob', label: 'Date of birth', type: 'date' }),
  field({
    id: 'statementDate',
    label: 'Statement date',
    type: 'date',
    validation: {
      notBefore: { fieldId: 'witnessDob', message: 'A statement cannot be dated before the witness was born.' },
    },
  }),
  field({
    id: 'arrestDate',
    label: 'Arrest date',
    type: 'date',
    validation: { notAfter: { fieldId: 'chargeDate', severity: 'advisory', message: 'Arrest is usually on or before charge.' } },
  }),
  field({ id: 'chargeDate', label: 'Charge date', type: 'date' }),
  field({
    id: 'offenceStart',
    label: 'Offence start',
    type: 'date',
    validation: { notBefore: { casePath: 'offenceDate' } },
  }),
  field({
    id: 'hearings',
    label: 'Hearings',
    type: 'group',
    columns: [field({ id: 'hearingDate', label: 'Hearing date', type: 'date' })],
  }),
], { code: 'MG5' });

test('dateLogic: well-formed and empty dates raise nothing', () => {
  assert.deepEqual(
    checkDateLogic(dateTemplate, { witnessDob: '1990-06-15', statementDate: '2026-02-01', offenceStart: '' }),
    [],
  );
});

test('dateLogic: the IsoDateAdapter invalid sentinel is blocking', () => {
  const issues = checkDateLogic(dateTemplate, { statementDate: 'invalid' });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'dateLogic:invalid:statementDate');
  assert.equal(issues[0].severity, 'blocking');
  assert.match(issues[0].message, /does not hold a real date/);
});

test('dateLogic: a non-ISO shape (DD/MM/YYYY) is blocking', () => {
  const issues = checkDateLogic(dateTemplate, { statementDate: '01/02/2026' });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'dateLogic:invalid:statementDate');
});

test('dateLogic: a bad date inside a group row names the row and column', () => {
  const values = { hearings: [row({ hearingDate: '2026-03-01' }), row({ hearingDate: 'invalid' })] };
  const issues = checkDateLogic(dateTemplate, values);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'dateLogic:invalid:hearings.hearingDate.1');
  assert.equal(issues[0].fieldId, 'hearingDate');
  assert.equal(issues[0].subjectLabel, 'Hearings — Hearing date');
});

test('dateLogic: non-object rows are skipped, never thrown on', () => {
  assert.deepEqual(checkDateLogic(dateTemplate, { hearings: ['garbage', null, 7] }), []);
});

test('dateLogic: a declared error-severity ordering violation is blocking', () => {
  const issues = checkDateLogic(dateTemplate, { witnessDob: '1990-06-15', statementDate: '1989-01-01' });
  assert.equal(issues.length, 1);
  assert.ok(issues[0].id.startsWith('dateLogic:order:statementDate:'));
  assert.equal(issues[0].severity, 'blocking');
  assert.equal(issues[0].message, 'A statement cannot be dated before the witness was born.');
  assert.equal(issues[0].subjectLabel, 'Statement date');
});

test('dateLogic: a declared advisory-severity ordering violation stays advisory', () => {
  const issues = checkDateLogic(dateTemplate, { arrestDate: '2026-02-10', chargeDate: '2026-02-01' });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'advisory');
});

test('dateLogic: equality does not fail a non-strict rule', () => {
  assert.deepEqual(
    checkDateLogic(dateTemplate, { witnessDob: '1990-06-15', statementDate: '1990-06-15' }),
    [],
  );
});

test('dateLogic: an ambiguous case comparison surfaces as a suppression advisory', () => {
  const twoDates = caseWith([
    { id: 'o1', offenceDate: '2026-01-05T00:00:00.000Z', chargeWording: 'Theft' },
    { id: 'o2', offenceDate: '2026-01-07T00:00:00.000Z', chargeWording: 'Assault' },
  ]);
  const issues = checkDateLogic(dateTemplate, { offenceStart: '2026-01-06' }, twoDates);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'dateLogic:order:offenceStart:case:offenceDate');
  assert.equal(issues[0].severity, 'advisory');
  assert.match(issues[0].message, /^A date comparison could not run:/);
});

test('dateLogic: no linked case means silence, not a suppression', () => {
  assert.deepEqual(checkDateLogic(dateTemplate, { offenceStart: '2026-01-06' }, null), []);
  assert.deepEqual(checkDateLogic(dateTemplate, { offenceStart: '2026-01-06' }), []);
});

// ── Check 3 — checkCrossForm ─────────────────────────────────────────────────

const formA = template(
  [field({ id: 'caseUrn', label: 'URN', mapsTo: 'urn' }), field({ id: 'defName', label: 'Defendant', mapsTo: 'defendantName' })],
  { code: 'MG5' },
);
const formB = template(
  [field({ id: 'urn', label: 'URN', mapsTo: 'urn' }), field({ id: 'defendantName', label: 'Defendant', mapsTo: 'defendantName' })],
  { code: 'MG4' },
);
const lookup = (code) => ({ MG5: formA, MG4: formB }[code]);

test('crossForm: a standalone draft is clean with an honest note, not silently consistent', () => {
  const { issues, note } = checkCrossForm(formA, { caseUrn: '01AB0123456/24' }, null, lookup);
  assert.deepEqual(issues, []);
  assert.match(note, /Standalone form/);
});

test('crossForm: a case with no sibling drafts raises nothing and carries no note', () => {
  const { issues, note } = checkCrossForm(formA, { caseUrn: '01AB0123456/24' }, [], lookup);
  assert.deepEqual(issues, []);
  assert.equal(note, undefined);
});

test('crossForm: divergent URNs across a case are blocking and name both forms', () => {
  const siblings = [{ draftId: 'd2', formCode: 'MG4', values: { urn: '02CD0123456/24' } }];
  const { issues } = checkCrossForm(formA, { caseUrn: '01AB0123456/24' }, siblings, lookup);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'crossForm:mapsTo:urn');
  assert.equal(issues[0].severity, 'blocking');
  assert.equal(issues[0].fieldId, 'caseUrn');
  assert.match(issues[0].message, /01AB0123456\/24/);
  assert.match(issues[0].message, /02CD0123456\/24/);
  assert.match(issues[0].message, /MG5/);
  assert.match(issues[0].message, /MG4/);
});

test('crossForm: URN comparison ignores case and surrounding whitespace', () => {
  const siblings = [{ draftId: 'd2', formCode: 'MG4', values: { urn: '01AB0123456/24' } }];
  const { issues } = checkCrossForm(formA, { caseUrn: '  01ab0123456/24 ' }, siblings, lookup);
  assert.deepEqual(issues, []);
});

test('crossForm: a blank sibling value is no divergence', () => {
  const siblings = [{ draftId: 'd2', formCode: 'MG4', values: { urn: '   ' } }];
  const { issues } = checkCrossForm(formA, { caseUrn: '01AB0123456/24' }, siblings, lookup);
  assert.deepEqual(issues, []);
});

test('crossForm: divergent defendant names are their own blocking issue', () => {
  const siblings = [{ draftId: 'd2', formCode: 'MG4', values: { defendantName: 'John Smyth' } }];
  const { issues } = checkCrossForm(formA, { defName: 'John Smith' }, siblings, lookup);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'crossForm:mapsTo:defendantName');
});

test('crossForm: a sibling whose template is unknown is skipped, not fatal', () => {
  const siblings = [{ draftId: 'd2', formCode: 'MG99', values: { urn: '09ZZ0123456/24' } }];
  const { issues } = checkCrossForm(formA, { caseUrn: '01AB0123456/24' }, siblings, lookup);
  assert.deepEqual(issues, []);
});

// The exhibit vocabulary runs against the REAL templates: MG11 cites what
// MG12's list of record defines.
const MG11 = getFormTemplate('MG11');
const MG12 = getFormTemplate('MG12');
const realLookup = getFormTemplate;

test('crossForm: real MG11/MG12 declare the exhibit-reference vocabulary', () => {
  const cites = MG11.fields.find((f) => f.id === 'exhibitsReferenced');
  const defines = MG12.fields.find((f) => f.id === 'exhibitEntries');
  assert.deepEqual(cites.crossRef, { vocabulary: 'exhibitReference', role: 'cites' });
  assert.deepEqual(defines.crossRef, { vocabulary: 'exhibitReference', role: 'defines' });
});

test('crossForm: a citation with a matching definition on a sibling is clean', () => {
  const siblings = [{ draftId: 'd2', formCode: 'MG12', values: { exhibitEntries: 'JS/1 — CCTV disc (copy) — PC 4571 — PR/1 — store — attached' } }];
  const { issues } = checkCrossForm(MG11, { exhibitsReferenced: 'js/1 — CCTV disc' }, siblings, realLookup);
  assert.deepEqual(issues, []);
});

test('crossForm: a citation no exhibit list carries is advisory and names the ref', () => {
  const siblings = [{ draftId: 'd2', formCode: 'MG12', values: { exhibitEntries: 'JS/1 — CCTV disc' } }];
  const values = { exhibitsReferenced: 'JS/1 — CCTV disc\nJS/2 — knife' };
  const { issues } = checkCrossForm(MG11, values, siblings, realLookup);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'crossForm:exhibit:JS/2');
  assert.equal(issues[0].severity, 'advisory');
  assert.equal(issues[0].fieldId, 'exhibitsReferenced');
  assert.equal(issues[0].subjectLabel, 'Exhibits referred to');
});

test('crossForm: an undefined citation on a SIBLING names the form, not a local field', () => {
  const siblings = [{ draftId: 'd2', formCode: 'MG11', values: { exhibitsReferenced: 'AB/3 — coat' } }];
  const { issues } = checkCrossForm(MG12, { exhibitEntries: '' }, siblings, realLookup);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'crossForm:exhibit:AB/3');
  assert.equal(issues[0].fieldId, undefined);
  assert.equal(issues[0].subjectLabel, 'MG11 — Exhibits referred to');
  assert.match(issues[0].message, /on MG11/);
});

// ── Check 4 — checkSensitiveHandling ─────────────────────────────────────────

test('sensitiveHandling: a template with no sensitive section never fires', () => {
  assert.deepEqual(checkSensitiveHandling(formA, { [SENSITIVE_MATERIAL_FLAG_KEY]: true }, false), []);
});

test('sensitiveHandling: an inactive section never fires', () => {
  assert.deepEqual(checkSensitiveHandling(mg6ish, {}, false), []);
  // Activation is the derived boolean flag — a truthy string is not it.
  assert.deepEqual(checkSensitiveHandling(mg6ish, { [SENSITIVE_MATERIAL_FLAG_KEY]: 'true' }, false), []);
});

test('sensitiveHandling: active and unconfirmed is one blocking form-level issue', () => {
  const issues = checkSensitiveHandling(mg6ish, { [SENSITIVE_MATERIAL_FLAG_KEY]: true }, false);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'sensitiveHandling:unconfirmed:form');
  assert.equal(issues[0].severity, 'blocking');
  assert.equal(issues[0].fieldId, undefined);
  // The finding names the SECTION, never its content.
  assert.equal(issues[0].subjectLabel, 'MG6D — Sensitive material schedule');
});

test('sensitiveHandling: a recorded confirmation clears it', () => {
  assert.deepEqual(checkSensitiveHandling(mg6ish, { [SENSITIVE_MATERIAL_FLAG_KEY]: true }, true), []);
});

test('sensitiveHandling: a sensitive field without a section heading gets the fallback label', () => {
  const bare = template([field({ id: 's1', label: 'Secret box', sensitive: true })]);
  const issues = checkSensitiveHandling(bare, { [SENSITIVE_MATERIAL_FLAG_KEY]: true }, false);
  assert.equal(issues[0].subjectLabel, 'Sensitive material section');
});

// ── assembleReport / finalise gate ───────────────────────────────────────────

const issue = (severity, id = `x:${severity}:${Math.random()}`) => ({
  id,
  checkId: 'completeness',
  severity,
  subjectLabel: 'Fixture',
  message: 'fixture issue',
});
const check = (checkId, status, issues = []) => ({ checkId, status, issues });

test('assembleReport: all clean is ready to finalise', () => {
  const report = assembleReport([check('completeness', 'clean'), check('dateLogic', 'clean')]);
  assert.deepEqual(
    { blocking: report.blocking, advisory: report.advisory, incomplete: report.incomplete, ready: report.readyToFinalise },
    { blocking: 0, advisory: 0, incomplete: 0, ready: true },
  );
});

test('assembleReport: advisories do not block readiness; blocking issues do', () => {
  const advisoryOnly = assembleReport([check('crossForm', 'issues', [issue('advisory')])]);
  assert.equal(advisoryOnly.advisory, 1);
  assert.equal(advisoryOnly.readyToFinalise, true);

  const withBlocking = assembleReport([check('crossForm', 'issues', [issue('advisory'), issue('blocking')])]);
  assert.equal(withBlocking.blocking, 1);
  assert.equal(withBlocking.readyToFinalise, false);
});

test('assembleReport: an incomplete check blocks finalisation even with zero issues', () => {
  // The timeout path (Q2/Q5): a check over budget reports incomplete, and a
  // timeout must never become a bypass.
  const report = assembleReport([check('completeness', 'clean'), check('crossForm', 'incomplete')]);
  assert.equal(report.incomplete, 1);
  assert.equal(report.blocking, 0);
  assert.equal(report.readyToFinalise, false);
});

test('assembleReport: counts aggregate across all checks', () => {
  const report = assembleReport([
    check('completeness', 'issues', [issue('blocking'), issue('blocking')]),
    check('dateLogic', 'issues', [issue('advisory')]),
    check('crossForm', 'incomplete'),
    check('sensitiveHandling', 'incomplete'),
  ]);
  assert.deepEqual(
    { blocking: report.blocking, advisory: report.advisory, incomplete: report.incomplete },
    { blocking: 2, advisory: 1, incomplete: 2 },
  );
});

test('advisoriesOf: only advisories, from every check', () => {
  const report = assembleReport([
    check('completeness', 'issues', [issue('blocking', 'b:1'), issue('advisory', 'a:1')]),
    check('crossForm', 'issues', [issue('advisory', 'a:2')]),
  ]);
  assert.deepEqual(advisoriesOf(report).map((i) => i.id), ['a:1', 'a:2']);
});

test('isFinaliseRequest: accepts an empty body object and a well-formed ack list', () => {
  assert.equal(isFinaliseRequest({}), true);
  assert.equal(isFinaliseRequest({ advisoryAcknowledgements: undefined }), true);
  assert.equal(isFinaliseRequest({ advisoryAcknowledgements: [] }), true);
  assert.equal(isFinaliseRequest({ advisoryAcknowledgements: [{ issueId: 'a:1', reason: 'checked' }] }), true);
});

test('isFinaliseRequest: rejects non-objects and malformed acknowledgements', () => {
  assert.equal(isFinaliseRequest(null), false);
  assert.equal(isFinaliseRequest(undefined), false);
  assert.equal(isFinaliseRequest('finalise'), false);
  assert.equal(isFinaliseRequest({ advisoryAcknowledgements: 'yes' }), false);
  assert.equal(isFinaliseRequest({ advisoryAcknowledgements: [{}] }), false);
  assert.equal(isFinaliseRequest({ advisoryAcknowledgements: [{ issueId: 'a:1', reason: 7 }] }), false);
  assert.equal(isFinaliseRequest({ advisoryAcknowledgements: [null] }), false);
});

const twoAdvisoryReport = () =>
  assembleReport([check('crossForm', 'issues', [issue('advisory', 'crossForm:exhibit:JS/2'), issue('advisory', 'crossForm:exhibit:AB/3')])]);

test('unacknowledgedAdvisories: every advisory validly acknowledged leaves nothing', () => {
  const remaining = unacknowledgedAdvisories(twoAdvisoryReport(), [
    { issueId: 'crossForm:exhibit:JS/2', reason: 'Exhibit list arrives with the MG12 next week.' },
    { issueId: 'crossForm:exhibit:AB/3', reason: 'Confirmed with the OIC.' },
  ]);
  assert.deepEqual(remaining, []);
});

test('unacknowledgedAdvisories: a missing acknowledgement leaves that advisory', () => {
  const remaining = unacknowledgedAdvisories(twoAdvisoryReport(), [
    { issueId: 'crossForm:exhibit:JS/2', reason: 'Checked.' },
  ]);
  assert.deepEqual(remaining.map((i) => i.id), ['crossForm:exhibit:AB/3']);
});

test('unacknowledgedAdvisories: a reasonless override is not an override', () => {
  const remaining = unacknowledgedAdvisories(twoAdvisoryReport(), [
    { issueId: 'crossForm:exhibit:JS/2', reason: '' },
    { issueId: 'crossForm:exhibit:AB/3', reason: '   \n\t ' },
  ]);
  assert.equal(remaining.length, 2);
});

test('unacknowledgedAdvisories: the reason cap is inclusive at 500 characters', () => {
  const at = unacknowledgedAdvisories(twoAdvisoryReport(), [
    { issueId: 'crossForm:exhibit:JS/2', reason: 'x'.repeat(ADVISORY_REASON_MAX_CHARS) },
    { issueId: 'crossForm:exhibit:AB/3', reason: '⚖'.repeat(ADVISORY_REASON_MAX_CHARS) },
  ]);
  assert.deepEqual(at, []);

  const over = unacknowledgedAdvisories(twoAdvisoryReport(), [
    { issueId: 'crossForm:exhibit:JS/2', reason: 'x'.repeat(ADVISORY_REASON_MAX_CHARS + 1) },
    { issueId: 'crossForm:exhibit:AB/3', reason: 'Fine.' },
  ]);
  assert.deepEqual(over.map((i) => i.id), ['crossForm:exhibit:JS/2']);
});

test('unacknowledgedAdvisories: acknowledgements of unknown ids change nothing', () => {
  const remaining = unacknowledgedAdvisories(twoAdvisoryReport(), [
    { issueId: 'no:such:issue', reason: 'irrelevant' },
  ]);
  assert.equal(remaining.length, 2);
});

test('unacknowledgedAdvisories: blocking issues are never in the acknowledgement contract', () => {
  const report = assembleReport([check('completeness', 'issues', [issue('blocking', 'b:1')])]);
  assert.deepEqual(unacknowledgedAdvisories(report, []), []);
  assert.equal(report.readyToFinalise, false);
});
