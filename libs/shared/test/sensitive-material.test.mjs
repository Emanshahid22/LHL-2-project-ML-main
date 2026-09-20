// These tests run against the BUILT library (../dist/index.js) — deliberately:
// they test what actually ships, which pairs with libs/shared's noEmitOnError
// (a type error can no longer emit a dist these tests would then bless).
// The flip side: correctness depends on the root postinstall building
// libs/shared. If that postinstall is ever removed, these tests silently run
// against a STALE dist — the MG6/35-fields trap. CI builds before running them;
// locally, `npm run build -w @mgs/shared` after any src change.
/**
 * sensitive-material (UC-07) — the single definition of what is sensitive,
 * what the handling wording says, and what may leave the building. This file
 * guards the containment properties: redaction removes rather than blanks,
 * the export excludes by the same declarations that activate the section, the
 * wording-hash pins match a live SHA-256 of the wording, and the dormant-
 * section normalisation keeps the server honest about never-opened schedules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  GROUP_ROW_ID_KEY,
  PII_PRACTICE_DIRECTION,
  PII_STEPS,
  PII_STEPS_SHA256,
  SENSITIVE_HANDLING_INSTRUCTIONS,
  SENSITIVE_HANDLING_NOTICE,
  SENSITIVE_HANDLING_SHA256,
  SENSITIVE_MATERIAL_FLAG_KEY,
  SENSITIVE_PERMISSION_LEVEL,
  buildNonSensitiveScheduleCsv,
  getFormTemplate,
  hasSensitiveSection,
  isSensitiveConfirmRequest,
  isSensitiveSectionActive,
  piiStepsCanonical,
  redactSensitiveValues,
  sensitiveFieldIds,
  sensitiveHandlingCanonical,
  sensitiveScheduleFindings,
  touchedSensitiveFieldIds,
  withDormantSensitiveSections,
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

// Shaped like the real MG6: the open schedule that raises the flag, and the
// sensitive MG6D schedule the flag activates.
const mg6ish = template([
  field({ id: 'urn', label: 'URN', required: true }),
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
    sensitive: true,
    section: 'MG6D — Sensitive material schedule',
    columns: [
      field({ id: 'description', label: 'Description', type: 'textarea', required: true }),
      field({ id: 'location', label: 'Location', required: true }),
    ],
  }),
]);

const plainTemplate = template([field({ id: 'urn', label: 'URN' })], { code: 'MG5' });

const nonSensitiveRow = () =>
  row({ itemReference: 'DOC/1', description: 'Crime report', classification: 'non_sensitive' });
const sensitiveRow = () =>
  row({ itemReference: 'INT/2', description: 'Intelligence log', classification: 'sensitive' });

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// ── wording pins ─────────────────────────────────────────────────────────────

test('the handling-instructions hash pin matches a live SHA-256 of the wording', () => {
  assert.equal(sha256(sensitiveHandlingCanonical()), SENSITIVE_HANDLING_SHA256);
});

test('the PII-steps hash pin matches a live SHA-256 of the wording', () => {
  assert.equal(sha256(piiStepsCanonical()), PII_STEPS_SHA256);
});

test('every handling sentence and PII step carries text AND a citation', () => {
  // Rule 1 applied to wording: an unattributable sentence must not exist here.
  for (const sentence of [...SENSITIVE_HANDLING_INSTRUCTIONS, ...PII_STEPS]) {
    assert.ok(sentence.text.trim().length > 0);
    assert.ok(sentence.source.trim().length > 0);
  }
  assert.ok(SENSITIVE_HANDLING_NOTICE.includes('not been verified by a practitioner'));
  assert.match(PII_PRACTICE_DIRECTION.url, /^https:\/\/www\.gov\.uk\//);
});

test('the canonical strings cover every sentence, so no edit can dodge the pin', () => {
  const handling = sensitiveHandlingCanonical();
  for (const s of SENSITIVE_HANDLING_INSTRUCTIONS) {
    assert.ok(handling.includes(s.text));
    assert.ok(handling.includes(s.source));
  }
  assert.ok(handling.includes(SENSITIVE_HANDLING_NOTICE));

  const pii = piiStepsCanonical();
  for (const s of PII_STEPS) assert.ok(pii.includes(s.text));
  assert.ok(pii.includes(PII_PRACTICE_DIRECTION.label));
  assert.ok(pii.includes(PII_PRACTICE_DIRECTION.url));
});

test('the permission level is the shared constant the guard and copy rely on', () => {
  assert.equal(SENSITIVE_PERMISSION_LEVEL, 'Sensitive Material Access');
});

// ── declarations and activation ──────────────────────────────────────────────

test('the real MG6 declares exactly one sensitive field: the MG6D schedule', () => {
  const MG6 = getFormTemplate('MG6');
  assert.deepEqual(sensitiveFieldIds(MG6), ['sensitiveScheduleItems']);
  assert.equal(hasSensitiveSection(MG6), true);
  const schedule = MG6.fields.find((f) => f.id === 'unusedMaterialItems');
  assert.deepEqual(schedule.sensitivityFlag, { columnId: 'classification', whenValue: 'sensitive' });
});

test('the stored flag key is the draft-values contract; renaming it strands drafts', () => {
  assert.equal(SENSITIVE_MATERIAL_FLAG_KEY, 'hasSensitiveMaterial');
});

test('activation needs BOTH a sensitive section and the derived boolean flag', () => {
  assert.equal(isSensitiveSectionActive(mg6ish, { [SENSITIVE_MATERIAL_FLAG_KEY]: true }), true);
  assert.equal(isSensitiveSectionActive(mg6ish, {}), false);
  assert.equal(isSensitiveSectionActive(mg6ish, { [SENSITIVE_MATERIAL_FLAG_KEY]: 'true' }), false);
  assert.equal(isSensitiveSectionActive(plainTemplate, { [SENSITIVE_MATERIAL_FLAG_KEY]: true }), false);
});

// ── redaction ────────────────────────────────────────────────────────────────

test('redaction REMOVES sensitive keys — absent, not blanked', () => {
  const values = {
    urn: '01AB0123456/24',
    sensitiveScheduleItems: [row({ description: 'Informant identity', location: 'CID safe' })],
    [SENSITIVE_MATERIAL_FLAG_KEY]: true,
  };
  const redacted = redactSensitiveValues(mg6ish, values);
  assert.equal('sensitiveScheduleItems' in redacted, false);
  assert.equal(redacted.urn, '01AB0123456/24');
  // The derived flag survives: the locked user must know the section exists.
  assert.equal(redacted[SENSITIVE_MATERIAL_FLAG_KEY], true);
  // The input is not mutated — the caller may still hold the full values.
  assert.equal('sensitiveScheduleItems' in values, true);
});

test('redaction on a template with no sensitive section changes nothing', () => {
  const values = { urn: 'x', note: 'y' };
  assert.deepEqual(redactSensitiveValues(plainTemplate, values), values);
});

test('touchedSensitiveFieldIds judges key PRESENCE, not the value', () => {
  assert.deepEqual(touchedSensitiveFieldIds(mg6ish, { sensitiveScheduleItems: undefined }), [
    'sensitiveScheduleItems',
  ]);
  assert.deepEqual(touchedSensitiveFieldIds(mg6ish, { sensitiveScheduleItems: [] }), [
    'sensitiveScheduleItems',
  ]);
  assert.deepEqual(touchedSensitiveFieldIds(mg6ish, { urn: 'x' }), []);
  assert.deepEqual(touchedSensitiveFieldIds(mg6ish, {}), []);
});

test('isSensitiveConfirmRequest accepts exactly the two acknowledgement kinds', () => {
  assert.equal(isSensitiveConfirmRequest({ kind: 'HANDLING_INSTRUCTIONS' }), true);
  assert.equal(isSensitiveConfirmRequest({ kind: 'PII_STEPS' }), true);
  assert.equal(isSensitiveConfirmRequest({ kind: 'handling_instructions' }), false);
  assert.equal(isSensitiveConfirmRequest({ kind: 'OTHER' }), false);
  assert.equal(isSensitiveConfirmRequest({}), false);
  assert.equal(isSensitiveConfirmRequest(null), false);
  assert.equal(isSensitiveConfirmRequest('PII_STEPS'), false);
});

// ── schedule findings and the dormant-section normalisation ─────────────────

test('scheduleFindings: nothing without a sensitivity-flag group', () => {
  assert.deepEqual(sensitiveScheduleFindings(plainTemplate, { urn: 'x' }), []);
});

test('scheduleFindings: nothing while no row is classified sensitive', () => {
  const values = { unusedMaterialItems: [nonSensitiveRow()], sensitiveScheduleItems: [] };
  assert.deepEqual(sensitiveScheduleFindings(mg6ish, values), []);
});

test('scheduleFindings: sensitive row + empty MG6D (key present) is the mandatory finding', () => {
  const values = { unusedMaterialItems: [sensitiveRow()], sensitiveScheduleItems: [] };
  const findings = sensitiveScheduleFindings(mg6ish, values);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].fieldId, 'sensitiveScheduleItems');
  assert.match(findings[0].message, /mandatory/);
  // The message names the schedule, never the material — redaction is not
  // weakened by a validation message.
  assert.ok(!findings[0].message.includes('Intelligence log'));
});

test('scheduleFindings: an ABSENT MG6D key is silent — a locked client must not guess', () => {
  const values = { unusedMaterialItems: [sensitiveRow()] };
  assert.deepEqual(sensitiveScheduleFindings(mg6ish, values), []);
});

test('scheduleFindings: a populated MG6D satisfies the mandatory rule', () => {
  const values = {
    unusedMaterialItems: [sensitiveRow()],
    sensitiveScheduleItems: [row({ description: 'Informant identity', location: 'CID safe' })],
  };
  assert.deepEqual(sensitiveScheduleFindings(mg6ish, values), []);
});

test('scheduleFindings: malformed rows are ignored, never trusted as sensitive', () => {
  const values = { unusedMaterialItems: ['garbage', null, 7], sensitiveScheduleItems: [] };
  assert.deepEqual(sensitiveScheduleFindings(mg6ish, values), []);
});

test('dormant normalisation: a never-opened MG6D reads as the empty schedule it is', () => {
  const values = { unusedMaterialItems: [sensitiveRow()] };
  const normalised = withDormantSensitiveSections(mg6ish, values);
  assert.deepEqual(normalised.sensitiveScheduleItems, []);
  // The original stored values are untouched.
  assert.equal('sensitiveScheduleItems' in values, false);
  // Composed, the server-side view now reports the mandatory-empty finding.
  assert.equal(sensitiveScheduleFindings(mg6ish, normalised).length, 1);
});

test('dormant normalisation: a present key — even an empty one — passes through untouched', () => {
  const values = { sensitiveScheduleItems: [] };
  assert.equal(withDormantSensitiveSections(mg6ish, values), values);
  const plain = { urn: 'x' };
  assert.equal(withDormantSensitiveSections(plainTemplate, plain), plain);
});

// ── the non-sensitive export ─────────────────────────────────────────────────

test('csv export: a template with no flagged open schedule yields null, not an empty file', () => {
  assert.equal(buildNonSensitiveScheduleCsv(plainTemplate, {}), null);
});

test('csv export: a flagged group that is itself sensitive is not exportable', () => {
  const onlySensitive = template([
    field({
      id: 'sensitiveScheduleItems',
      label: 'Sensitive material schedule',
      type: 'group',
      sensitive: true,
      sensitivityFlag: { columnId: 'classification', whenValue: 'sensitive' },
      columns: [field({ id: 'description', label: 'Description' })],
    }),
  ]);
  assert.equal(buildNonSensitiveScheduleCsv(onlySensitive, {}), null);
});

test('csv export: sensitive rows are excluded and the survivors renumbered', () => {
  const values = {
    unusedMaterialItems: [
      sensitiveRow(),
      row({ itemReference: 'DOC/1', description: 'Crime report', classification: 'non_sensitive' }),
    ],
    sensitiveScheduleItems: [row({ description: 'Informant identity', location: 'CID safe' })],
  };
  const result = buildNonSensitiveScheduleCsv(mg6ish, values);
  assert.equal(result.includedRows, 1);
  assert.equal(result.excludedSensitiveRows, 1);
  const lines = result.csv.split('\r\n');
  assert.equal(lines[0], 'Unused material schedule (non-sensitive items only)');
  assert.equal(lines[1], '#,Item reference,Description,Classification');
  // The surviving row is numbered by its position among the INCLUDED rows.
  assert.equal(lines[2], '1,DOC/1,Crime report,non_sensitive');
  assert.equal(lines[3], '');
  // Containment: nothing sensitive-declared and no excluded row content leaks.
  assert.ok(!result.csv.includes('Intelligence log'));
  assert.ok(!result.csv.includes('INT/2'));
  assert.ok(!result.csv.includes('Informant identity'));
  assert.ok(!result.csv.includes('Sensitive material schedule'));
});

test('csv export: row ids never leak — only declared columns are emitted', () => {
  const values = { unusedMaterialItems: [nonSensitiveRow()] };
  const result = buildNonSensitiveScheduleCsv(mg6ish, values);
  assert.ok(!result.csv.includes(GROUP_ROW_ID_KEY));
  assert.ok(!result.csv.includes('row-'));
});

test('csv export: RFC 4180 quoting for commas, quotes and newlines', () => {
  const values = {
    unusedMaterialItems: [
      row({
        itemReference: 'DOC/1',
        description: 'Crime report, "original", café — line1\nline2',
        classification: 'non_sensitive',
      }),
    ],
  };
  const { csv } = buildNonSensitiveScheduleCsv(mg6ish, values);
  assert.ok(csv.includes('"Crime report, ""original"", café — line1\nline2"'));
});

test('csv export: an empty schedule exports headers with zero counts', () => {
  const result = buildNonSensitiveScheduleCsv(mg6ish, {});
  assert.equal(result.includedRows, 0);
  assert.equal(result.excludedSensitiveRows, 0);
  const lines = result.csv.split('\r\n');
  assert.equal(lines[0], 'Unused material schedule (non-sensitive items only)');
  assert.equal(lines[1], '#,Item reference,Description,Classification');
  assert.equal(lines[2], '');
});

test('csv export: null and undefined cells become empty cells, not the word "null"', () => {
  const values = {
    unusedMaterialItems: [row({ itemReference: 'DOC/1', description: null, classification: 'non_sensitive' })],
  };
  const { csv } = buildNonSensitiveScheduleCsv(mg6ish, values);
  assert.ok(csv.split('\r\n').includes('1,DOC/1,,non_sensitive'));
});
