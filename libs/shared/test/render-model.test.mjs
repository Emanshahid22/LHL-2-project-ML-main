/**
 * UC-09 render model + layout binding + page-count mechanism.
 *
 * These guard the DOCUMENT boundary decisions: redaction happens before
 * binding (a locked caller's model never CONTAINS MG6D content), absent-key
 * normalisation matches the engine, the declaration renders from the pinned
 * constant, exhibit links only land on entries that exist, the draft band
 * follows the shared unverified predicate, and the MG11 page-count trio ships
 * dormant while the pinned wording carries no parenthetical.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRenderModel,
  CleanA4Binding,
  CLEAN_A4_LAYOUT,
  declarationPageCountActive,
  DOCX_DRAFT_HEADER_TEXT,
  DRAFT_BAND_TEXT,
  exhibitAnchorId,
  FORM_TEMPLATES,
  isTemplateUnverified,
  MG11_DECLARATION,
  SENSITIVE_EMPTY_STATEMENT,
  SENSITIVE_LOCKED_PLACEHOLDER,
  SENSITIVE_PERMISSION_LEVEL,
  withDeclaredPageCount,
} from '../dist/index.js';

const mg6 = FORM_TEMPLATES.find((t) => t.code === 'MG6');
const mg11 = FORM_TEMPLATES.find((t) => t.code === 'MG11');
const mg12 = FORM_TEMPLATES.find((t) => t.code === 'MG12');

const SENSITIVE_ROW = {
  __id: 'r1',
  description: 'CHIS contact log — SECRET-MARKER',
  location: 'Safe 4',
  sensitivityReason: 'informant identity',
};
const ACTIVE_VALUES = {
  hasSensitiveMaterial: true,
  unusedMaterialItems: [{ __id: 'a', description: 'log', classification: 'sensitive' }],
  sensitiveScheduleItems: [SENSITIVE_ROW],
};

const flatText = (model) => JSON.stringify(model);
const allBlocks = (model) => model.sections.flatMap((s) => s.blocks);

// ── the unverified predicate and the band ──

test('isTemplateUnverified: absent verification is unverified (the banner-absent lesson)', () => {
  assert.equal(isTemplateUnverified({ verification: undefined }), true);
  assert.equal(isTemplateUnverified({ verification: 'unverified' }), true);
  assert.equal(isTemplateUnverified({ verification: 'verified' }), false);
});

// D-F (provisional, docs/decisions/layout-verification-record.md): six
// specimen-matched templates are flagged 'verified'; the other five stay
// unverified. One predicate drives both truths — pin the exact split.
const DF_VERIFIED = ['MG4', 'MG6', 'MG11', 'MG12', 'MG15', 'MG16'];

test('the D-F six render WITHOUT the band; the other five render WITH it — one predicate', () => {
  for (const t of FORM_TEMPLATES) {
    const m = buildRenderModel(t, {}, { sensitivePermitted: true });
    if (DF_VERIFIED.includes(t.code)) {
      assert.equal(m.unverified, false, t.code);
      assert.equal(m.draftBand, null, t.code);
    } else {
      assert.equal(m.unverified, true, t.code);
      assert.equal(m.draftBand, DRAFT_BAND_TEXT, t.code);
    }
  }
});

test('the unverified branch still bands through the same predicate (banner-absent lesson holds)', () => {
  const unversioned = { ...mg12, verification: undefined };
  const m = buildRenderModel(unversioned, {}, { sensitivePermitted: true });
  assert.equal(m.unverified, true);
  assert.equal(m.draftBand, DRAFT_BAND_TEXT);
});

// ── UC-07 on paper ──

test('locked caller: model contains the placeholder and zero MG6D content', () => {
  const m = buildRenderModel(mg6, ACTIVE_VALUES, { sensitivePermitted: false });
  const locked = allBlocks(m).filter((b) => b.kind === 'sensitiveLocked');
  assert.equal(locked.length, 1);
  assert.equal(locked[0].text, SENSITIVE_LOCKED_PLACEHOLDER);
  assert.ok(locked[0].text.includes(SENSITIVE_PERMISSION_LEVEL), 'names the level');
  assert.ok(!flatText(m).includes('SECRET-MARKER'), 'never the content');
  assert.ok(!flatText(m).includes('Safe 4'));
});

test('permitted caller: MG6D renders under a sensitive section', () => {
  const m = buildRenderModel(mg6, ACTIVE_VALUES, { sensitivePermitted: true });
  const sens = m.sections.filter((s) => s.sensitive);
  assert.equal(sens.length, 1);
  assert.ok(flatText(m).includes('SECRET-MARKER'));
});

test('dormant section (flag off / absent) renders nothing at all, either caller', () => {
  for (const permitted of [true, false]) {
    const m = buildRenderModel(mg6, { unusedMaterialItems: [] }, { sensitivePermitted: permitted });
    assert.equal(m.sections.filter((s) => s.sensitive).length, 0);
    assert.equal(allBlocks(m).filter((b) => b.kind === 'sensitiveLocked').length, 0);
  }
});

test('active section with ABSENT key renders the mandatory-empty statement (engine parity)', () => {
  const m = buildRenderModel(
    mg6,
    { hasSensitiveMaterial: true, unusedMaterialItems: ACTIVE_VALUES.unusedMaterialItems },
    { sensitivePermitted: true },
  );
  const notice = allBlocks(m).find((b) => b.kind === 'notice');
  assert.equal(notice?.text, SENSITIVE_EMPTY_STATEMENT);
});

// ── MG11: pinned declaration, vulnerable flag, exhibit links ──

test('declaration block is the pinned constant, never a stored value', () => {
  const m = buildRenderModel(
    mg11,
    { declarationText: 'FORGED WORDING', declarationConfirmed: true },
    { sensitivePermitted: false },
  );
  const decl = allBlocks(m).find((b) => b.kind === 'declaration');
  assert.equal(decl.text, MG11_DECLARATION);
  assert.ok(!flatText(m).includes('FORGED WORDING'));
});

test('vulnerable marker reads the PERSISTED flag, not a re-derivation', () => {
  assert.equal(
    buildRenderModel(mg11, { isVulnerableWitness: true }, { sensitivePermitted: false })
      .vulnerableWitness,
    true,
  );
  // Inputs that WOULD derive true do not count unless the flag was persisted.
  assert.equal(
    buildRenderModel(
      mg11,
      { witnessDob: '2015-01-01', statementDate: '2026-01-01' },
      { sensitivePermitted: false },
    ).vulnerableWitness,
    false,
  );
  assert.equal(
    buildRenderModel(mg12, { isVulnerableWitness: true }, { sensitivePermitted: false })
      .vulnerableWitness,
    false,
    'MG11-only',
  );
});

test('narrative citations link only to entries that exist; dangling refs stay plain', () => {
  const m = buildRenderModel(
    mg11,
    {
      statementText: 'I produce JS/1 and mention XX/99 which is not listed.',
      exhibitsReferenced: 'JS/1 kitchen knife\nprose line, not a ref\nAB/2 photos',
    },
    { sensitivePermitted: false },
  );
  const narrative = allBlocks(m).find((b) => b.fieldId === 'statementText');
  const linked = narrative.runs.filter((r) => r.linkTo);
  assert.deepEqual(
    linked.map((r) => [r.text, r.linkTo]),
    [['JS/1', exhibitAnchorId('JS/1')]],
  );
  const list = allBlocks(m).find((b) => b.fieldId === 'exhibitsReferenced');
  assert.equal(list.kind, 'table');
  assert.deepEqual(
    list.rows.map((r) => r.anchorId ?? null),
    [exhibitAnchorId('JS/1'), null, exhibitAnchorId('AB/2')],
    'refs anchor, prose lines do not',
  );
});

test('MG12 exhibit list (textarea, the flat table stand-in) anchors ref lines', () => {
  const entries = mg12.fields.find((f) => f.crossRef?.role === 'defines');
  assert.equal(entries.type, 'textarea', 'no repeating group is faked for MG12');
  const m = buildRenderModel(
    mg12,
    { [entries.id]: 'JS/1 — CCTV disc — PC 4571 Hughes\nnot a reference line' },
    { sensitivePermitted: false },
  );
  const table = allBlocks(m).find((b) => b.fieldId === entries.id);
  assert.equal(table.kind, 'table');
  assert.deepEqual(
    table.rows.map((r) => r.anchorId ?? null),
    [exhibitAnchorId('JS/1'), null],
  );
});

test('narrative run boundaries reassemble to the original text', () => {
  const text = 'Before JS/1 middle JS/1 after.';
  const m = buildRenderModel(
    mg11,
    { statementText: text, exhibitsReferenced: 'JS/1 knife' },
    { sensitivePermitted: false },
  );
  const narrative = allBlocks(m).find((b) => b.fieldId === 'statementText');
  assert.equal(narrative.runs.map((r) => r.text).join(''), text);
  assert.equal(narrative.runs.filter((r) => r.linkTo).length, 2);
});

// ── scalar display rules ──

test('dates display DD/MM/YYYY; checkboxes Yes/No; selects show labels; empties stay empty', () => {
  const t = {
    code: 'MG12',
    name: 'x',
    description: '',
    templateVersion: 1,
    fields: [
      { id: 'd', label: 'D', type: 'date', required: false, helpText: '' },
      { id: 'c', label: 'C', type: 'checkbox', required: false, helpText: '' },
      {
        id: 's',
        label: 'S',
        type: 'select',
        required: false,
        helpText: '',
        options: [{ value: 'v1', label: 'Label One' }],
      },
      { id: 'e', label: 'E', type: 'text', required: false, helpText: '' },
    ],
  };
  const m = buildRenderModel(t, { d: '2026-07-14', c: true, s: 'v1' }, { sensitivePermitted: false });
  const [d, c, s, e] = allBlocks(m);
  assert.equal(d.text, '14/07/2026');
  assert.equal(c.text, 'Yes');
  assert.equal(s.text, 'Label One');
  assert.equal(e.text, '');
  assert.equal(e.empty, true, 'absence stays visible — never invented');
});

// ── page-count trio (ACTIVE since D-B — the adopted wording carries the
// parenthetical, so the mechanism LER-1071-73 shipped dormant now runs) ──

test('page-count interpolation is ACTIVE: the adopted declaration carries the parenthetical (D-B)', () => {
  assert.equal(declarationPageCountActive(), true);
});

test('withDeclaredPageCount fills the pinned declaration blank with the actual count', () => {
  const done = withDeclaredPageCount(MG11_DECLARATION, 7);
  assert.ok(done.includes('(consisting of 7 page(s) each signed by me)'));
  assert.ok(!done.includes('___'), 'no blank survives interpolation');
  // Re-interpolating an already-filled declaration is idempotent at the
  // same count — the render pipeline's second pass must not mangle it.
  assert.equal(withDeclaredPageCount(done, 7), done);
});

test('withDeclaredPageCount leaves non-carrying wording untouched', () => {
  const plain = 'This statement is true to the best of my knowledge and belief.';
  assert.equal(withDeclaredPageCount(plain, 7), plain);
});

// ── layout binding + DOCX wording pin ──

test('CleanA4Binding binds through buildRenderModel and carries the layout data', () => {
  const binding = new CleanA4Binding();
  assert.equal(binding.layout, CLEAN_A4_LAYOUT);
  assert.equal(binding.layout.page.size, 'A4');
  const m = binding.bind(mg6, ACTIVE_VALUES, { sensitivePermitted: false });
  assert.ok(!flatText(m).includes('SECRET-MARKER'));
});

test('DOCX header wording is the scope\'s exact text', () => {
  assert.equal(DOCX_DRAFT_HEADER_TEXT, 'Draft — not the authoritative version');
});
