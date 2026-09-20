// These tests run against the BUILT library (../dist/index.js) — deliberately:
// they test what actually ships (see sensitive-material.test.mjs header for
// the stale-dist trap this pairs with).
/**
 * archive-version (UC-10) — the version-minting rules and the field-level
 * diff. Guards the Phase-1 review conditions at the unit layer:
 *  - condition 1: numbers/labels are per-EVENT rules with no content input
 *    at all — nothing here can suppress a mint because bytes deduplicated;
 *  - condition 4: the diff is inside the UC-07 boundary — an unpermitted
 *    caller's sides are redacted BEFORE diffing, so a sensitive value can
 *    never surface as "changed from X to Y", and the permitted caller's
 *    diff reports sensitive involvement for the audit write.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORM_TEMPLATES,
  GROUP_ROW_ID_KEY,
  SENSITIVE_MATERIAL_FLAG_KEY,
  diffArchivedValues,
  nextVersionNumber,
  planVersionMint,
  shouldMintVersion,
  sensitiveFieldIds,
  versionLabel,
} from '../dist/index.js';

const MG6 = FORM_TEMPLATES.find((t) => t.code === 'MG6');
const MG1 = FORM_TEMPLATES.find((t) => t.code === 'MG1');
const SENSITIVE_ID = sensitiveFieldIds(MG6)[0]; // 'sensitiveScheduleItems'

// ---------------------------------------------------------------- labels --

test('versionLabel: cycle 0 is "Original", cycle N is "Amendment N" (scope step 7)', () => {
  assert.equal(versionLabel(0), 'Original');
  assert.equal(versionLabel(1), 'Amendment 1');
  assert.equal(versionLabel(3), 'Amendment 3');
});

test('versionLabel: refuses non-integer and negative cycles loudly', () => {
  assert.throws(() => versionLabel(-1));
  assert.throws(() => versionLabel(1.5));
});

// --------------------------------------------------------------- numbers --

test('nextVersionNumber: first mint is V1', () => {
  assert.equal(nextVersionNumber([]), 1);
});

test('nextVersionNumber: monotonic max+1, never a reissue across gaps', () => {
  assert.equal(nextVersionNumber([1, 2, 3]), 4);
  // Append-only history can carry a gap (a retried transaction); a number
  // must never be reissued into it.
  assert.equal(nextVersionNumber([1, 3]), 4);
  assert.equal(nextVersionNumber([2]), 3);
});

test('nextVersionNumber: refuses non-positive and non-integer inputs', () => {
  assert.throws(() => nextVersionNumber([0]));
  assert.throws(() => nextVersionNumber([1, -2]));
  assert.throws(() => nextVersionNumber([1.5]));
});

test('planVersionMint: pairs number and label from one call — the API cannot fork them', () => {
  assert.deepEqual(planVersionMint({ existingNumbers: [], cycle: 0 }), {
    versionNumber: 1,
    label: 'Original',
  });
  assert.deepEqual(planVersionMint({ existingNumbers: [1], cycle: 1 }), {
    versionNumber: 2,
    label: 'Amendment 1',
  });
  // Condition 1 at the type level: the plan takes NO content input — there
  // is no argument through which byte-identity could suppress a mint.
  assert.deepEqual(planVersionMint({ existingNumbers: [1, 2, 3], cycle: 3 }), {
    versionNumber: 4,
    label: 'Amendment 3',
  });
});

// ------------------------------------------------------------------ diff --

const PERMITTED = { sensitivePermitted: true };
const UNPERMITTED = { sensitivePermitted: false };

test('diff: changed, added and removed fields carry template labels and values', () => {
  const fieldA = MG1.fields[0];
  const fieldB = MG1.fields[1];
  const from = { [fieldA.id]: 'one', [fieldB.id]: 'kept' };
  const to = { [fieldA.id]: 'two', extraKey: 'new' };
  const diff = diffArchivedValues(MG1, from, to, PERMITTED);
  const byId = Object.fromEntries(diff.entries.map((e) => [e.fieldId, e]));
  assert.deepEqual(byId[fieldA.id], {
    fieldId: fieldA.id,
    label: fieldA.label,
    kind: 'changed',
    from: 'one',
    to: 'two',
    sensitive: false,
  });
  assert.equal(byId[fieldB.id].kind, 'removed');
  // Unknown-id drift: label falls back to the id, honestly.
  assert.equal(byId['extraKey'].kind, 'added');
  assert.equal(byId['extraKey'].label, 'extraKey');
  assert.equal(diff.containsSensitiveChanges, false);
});

test('diff: template field order first, unknown ids after, internal keys never', () => {
  const fieldA = MG1.fields[0];
  const fieldB = MG1.fields[1];
  const from = { zzzUnknown: 'x', [SENSITIVE_MATERIAL_FLAG_KEY]: false };
  const to = {
    zzzUnknown: 'y',
    [fieldB.id]: 'b',
    [fieldA.id]: 'a',
    [SENSITIVE_MATERIAL_FLAG_KEY]: true,
  };
  const diff = diffArchivedValues(MG1, from, to, PERMITTED);
  assert.deepEqual(
    diff.entries.map((e) => e.fieldId),
    [fieldA.id, fieldB.id, 'zzzUnknown'],
  );
  // The derived machine flag is not form content and never appears.
  assert.ok(!diff.entries.some((e) => e.fieldId === SENSITIVE_MATERIAL_FLAG_KEY));
});

test('diff: blank-to-blank transitions are not reported', () => {
  const fieldA = MG1.fields[0];
  const diff = diffArchivedValues(MG1, { [fieldA.id]: '' }, {}, PERMITTED);
  assert.deepEqual(diff.entries, []);
});

test('diff: group rows equal in content but differing in internal row ids are equal', () => {
  const group = MG6.fields.find((f) => f.type === 'group' && f.sensitive !== true);
  const row = (id, extra) => ({ [GROUP_ROW_ID_KEY]: id, ...extra });
  const from = { [group.id]: [row('r1', { a: 1 })] };
  const to = { [group.id]: [row('r2', { a: 1 })] };
  const diff = diffArchivedValues(MG6, from, to, PERMITTED);
  assert.deepEqual(diff.entries, []);
});

test('diff: a genuine group content change is reported once, on the group', () => {
  const group = MG6.fields.find((f) => f.type === 'group' && f.sensitive !== true);
  const from = { [group.id]: [{ a: 1 }] };
  const to = { [group.id]: [{ a: 2 }] };
  const diff = diffArchivedValues(MG6, from, to, PERMITTED);
  assert.equal(diff.entries.length, 1);
  assert.equal(diff.entries[0].fieldId, group.id);
  assert.equal(diff.entries[0].kind, 'changed');
});

// ------------------------------------------- UC-07 boundary (condition 4) --

test('diff: unpermitted caller — sensitive change is invisible, not redacted-in-place', () => {
  const from = { [SENSITIVE_ID]: [{ item: 'Informant register' }] };
  const to = { [SENSITIVE_ID]: [{ item: 'Surveillance log' }] };
  const diff = diffArchivedValues(MG6, from, to, UNPERMITTED);
  // Redaction removes the keys BEFORE diffing: no entry exists at all, so a
  // sensitive value cannot leak as "changed from X to Y".
  assert.deepEqual(diff.entries, []);
  assert.equal(diff.containsSensitiveChanges, false);
});

test('diff: unpermitted caller — non-sensitive changes still show alongside hidden sensitive ones', () => {
  const fieldA = MG6.fields.find((f) => f.type !== 'group' && f.sensitive !== true);
  const from = { [fieldA.id]: 'x', [SENSITIVE_ID]: [{ item: 'secret A' }] };
  const to = { [fieldA.id]: 'y', [SENSITIVE_ID]: [{ item: 'secret B' }] };
  const diff = diffArchivedValues(MG6, from, to, UNPERMITTED);
  assert.deepEqual(
    diff.entries.map((e) => e.fieldId),
    [fieldA.id],
  );
  const text = JSON.stringify(diff);
  assert.ok(!text.includes('secret A') && !text.includes('secret B'));
});

test('diff: permitted caller — sensitive change is visible, flagged, and reported for the audit', () => {
  const from = { [SENSITIVE_ID]: [{ item: 'Informant register' }] };
  const to = { [SENSITIVE_ID]: [{ item: 'Surveillance log' }] };
  const diff = diffArchivedValues(MG6, from, to, PERMITTED);
  assert.equal(diff.entries.length, 1);
  assert.equal(diff.entries[0].sensitive, true);
  assert.equal(diff.containsSensitiveChanges, true);
});

test('diff: permitted caller with no sensitive involvement does not flag an audit', () => {
  const fieldA = MG6.fields.find((f) => f.type !== 'group' && f.sensitive !== true);
  const diff = diffArchivedValues(MG6, { [fieldA.id]: 'x' }, { [fieldA.id]: 'y' }, PERMITTED);
  assert.equal(diff.containsSensitiveChanges, false);
});

// ------------------------------------------------ mint decision (cond. 1) --

test('shouldMintVersion: first generation always mints', () => {
  assert.equal(shouldMintVersion({ latest: null, draftId: 'd1', contentHash: 'h1' }), true);
});

test('shouldMintVersion: the same current draft re-serving unchanged content does NOT mint', () => {
  const latest = { draftId: 'd1', contentHash: 'h1' };
  assert.equal(shouldMintVersion({ latest, draftId: 'd1', contentHash: 'h1' }), false);
});

test('shouldMintVersion: a DIFFERENT draft minting identical bytes STILL mints (row-level identity)', () => {
  const latest = { draftId: 'd1', contentHash: 'h1' };
  assert.equal(shouldMintVersion({ latest, draftId: 'd2', contentHash: 'h1' }), true);
});

test('shouldMintVersion: the same draft with changed content mints the next version', () => {
  const latest = { draftId: 'd1', contentHash: 'h1' };
  assert.equal(shouldMintVersion({ latest, draftId: 'd1', contentHash: 'h2' }), true);
});
