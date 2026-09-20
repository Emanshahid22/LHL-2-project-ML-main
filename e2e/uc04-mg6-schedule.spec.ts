import { expect, test } from './support/fixtures';
import { type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  COMPLETENESS_TRIGGER_ITEM_COUNT,
  COMPLEXITY_THRESHOLDS,
  GROUP_ROW_ID_KEY,
  SENSITIVE_MATERIAL_FLAG_KEY,
  checkCompleteness,
  getFormTemplate,
  shouldRunCompletenessCheck,
} from '@mgs/shared';
import { auditEventsFor, createDraft, getDraft, saveValues } from './support/api';

const SCHEDULE_FIELD = 'unusedMaterialItems';
const COMPLEXITY_FIELD = 'caseComplexity';

/** One row's worth of values, as the API stores them. */
function row(reference: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [GROUP_ROW_ID_KEY]: `row-${reference}`,
    itemReference: reference,
    description: `Item ${reference}`,
    materialType: 'document',
    classification: 'non_sensitive',
    ...over,
  };
}

/** Adds `count` rows through the UI and waits for the table to settle. */
async function addRows(page: Page, count: number): Promise<void> {
  const rows = page.getByTestId('schedule-row');
  const before = await rows.count();
  for (let i = 0; i < count; i++) {
    await page.getByTestId('add-item').click();
  }
  await expect(rows).toHaveCount(before + count);
}

/** Fills one cell of a row, addressed by position and column id. */
async function fillCell(
  page: Page,
  index: number,
  columnId: string,
  value: string,
): Promise<void> {
  const cell = page.getByTestId('schedule-row').nth(index).locator(`[data-column-id="${columnId}"]`);
  await cell.locator('input, textarea').fill(value);
}

/**
 * Picks a select option in one cell. Matched exactly: "Sensitive" is a substring
 * of "Non-Sensitive", so a loose match would silently choose the wrong one.
 */
async function selectCell(
  page: Page,
  index: number,
  columnId: string,
  label: string,
): Promise<void> {
  const cell = page.getByTestId('schedule-row').nth(index).locator(`[data-column-id="${columnId}"]`);
  await cell.locator('mat-select').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/** The `__id` of every row currently rendered, in display order. */
async function rowIds(page: Page): Promise<string[]> {
  return page.getByTestId('schedule-row').evaluateAll((rows) =>
    rows.map((r) => r.getAttribute('data-row-id') ?? ''),
  );
}

test.describe('UC-04 MG6 unused material schedule', () => {
  // ── DoD 1: "numbering is correct and sequential across add, edit, and delete"

  test('numbering is sequential as rows are added, and unaffected by editing', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);

    await expect(page.getByTestId('schedule')).toBeVisible();
    await expect(page.getByTestId('schedule-empty')).toBeVisible();

    await addRows(page, 3);
    await expect(page.getByTestId('row-ordinal')).toHaveText(['1', '2', '3']);

    // Editing a row's content must not disturb the sequence.
    await fillCell(page, 1, 'itemReference', 'REF-B');
    await fillCell(page, 1, 'description', 'Custody record');
    await expect(page.getByTestId('row-ordinal')).toHaveText(['1', '2', '3']);
  });

  test('deleting a middle row renumbers the survivors and leaves no gap', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);

    await addRows(page, 3);
    for (const [index, reference] of ['A', 'B', 'C'].entries()) {
      await fillCell(page, index, 'itemReference', `REF-${reference}`);
    }
    const before = await rowIds(page);

    await page.getByTestId('schedule-row').nth(1).getByTestId('delete-row').click();
    await page.getByTestId('confirm-delete').click();

    await expect(page.getByTestId('schedule-row')).toHaveCount(2);
    // Contiguous, and the survivors are the rows we expected — the deleted row's
    // identity is gone, the others keep theirs.
    await expect(page.getByTestId('row-ordinal')).toHaveText(['1', '2']);
    expect(await rowIds(page)).toEqual([before[0], before[2]]);
  });

  test('reordering moves a row without changing its identity', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);

    await addRows(page, 3);
    await fillCell(page, 0, 'itemReference', 'REF-FIRST');
    const before = await rowIds(page);

    await page.getByTestId('schedule-row').nth(0).getByTestId('move-row-down').click();

    // Position 2 now, still the same row: `__id` travelled with it, and the
    // number is purely positional.
    expect(await rowIds(page)).toEqual([before[1], before[0], before[2]]);
    await expect(page.getByTestId('row-ordinal')).toHaveText(['1', '2', '3']);
    await expect(
      page.getByTestId('schedule-row').nth(1).locator('[data-column-id="itemReference"] input'),
    ).toHaveValue('REF-FIRST');
  });

  test('no ordinal is ever persisted', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);

    await addRows(page, 2);
    await fillCell(page, 0, 'itemReference', 'REF-1');
    await fillCell(page, 1, 'itemReference', 'REF-2');
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('save-status')).toContainText('Saved');

    const saved = await getDraft(request, draft.id);
    const rows = saved.values[SCHEDULE_FIELD] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const stored of rows) {
      // Every key is a declared column or the row id — nothing that looks like a
      // stored position, which could then drift from what is displayed.
      expect(Object.keys(stored).sort()).toEqual(
        [GROUP_ROW_ID_KEY, 'classification', 'description', 'itemReference', 'materialType'].sort(),
      );
    }
  });

  // ── DoD 2: "Renumbering on deletion prompts user confirmation before executing"

  test('deletion prompts first, and cancelling changes nothing', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);

    await addRows(page, 3);
    await fillCell(page, 1, 'itemReference', 'REF-KEEP');
    const before = await rowIds(page);

    await page.getByTestId('schedule-row').nth(1).getByTestId('delete-row').click();

    // The prompt names the item and says what renumbering will happen.
    const prompt = page.getByTestId('renumber-confirm');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('REF-KEEP');
    await expect(prompt).toContainText('renumbered');

    await page.getByTestId('cancel-delete').click();
    await expect(prompt).toHaveCount(0);

    // A true no-op: same rows, same identities, same numbers.
    await expect(page.getByTestId('schedule-row')).toHaveCount(3);
    expect(await rowIds(page)).toEqual(before);
    await expect(page.getByTestId('row-ordinal')).toHaveText(['1', '2', '3']);
  });

  test('nothing is deleted without the prompt being answered', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);

    await addRows(page, 2);
    await page.getByTestId('schedule-row').nth(0).getByTestId('delete-row').click();
    await expect(page.getByTestId('renumber-confirm')).toBeVisible();
    // While the prompt is open the row is still there.
    await expect(page.getByTestId('schedule-row')).toHaveCount(2);
  });

  // ── DoD 3: "Completeness check fires correctly for 'Complex' cases with fewer
  //           than 5 items"

  test('a Complex case with fewer than five items is flagged as sparse', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);

    // caseComplexity is a normal top-level field, not a schedule column.
    await page.locator(`[data-field-id="${COMPLEXITY_FIELD}"] mat-select`).click();
    await page.getByRole('option', { name: 'Complex', exact: true }).click();

    await addRows(page, 4);
    const banner = page.getByTestId('completeness-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByTestId('completeness-count')).toHaveText('4');
    await expect(banner).toContainText(`${COMPLEXITY_THRESHOLDS.complex.minItems}`);
    // Advisory, not a block: saving still works while it is showing.
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('save-status')).toContainText('Saved');

    // A fifth item clears it.
    await addRows(page, 1);
    await expect(banner).toHaveCount(0);
  });

  test('the check runs on size alone, and advises nothing without a band', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    // Seeded through the API: clicking Add ten times is the same assertion for
    // ten times the wall clock.
    const rows = Array.from({ length: COMPLETENESS_TRIGGER_ITEM_COUNT }, (_, i) =>
      row(`REF-${i + 1}`),
    );
    const fresh = await getDraft(request, draft.id);
    await saveValues(request, draft.id, { [SCHEDULE_FIELD]: rows }, fresh.version);

    // The check ran on size alone: the trigger is what made it run, and the
    // audit row proves it did.
    const check = (await auditEventsFor(draft.id)).find(
      (e) => e.action === 'COMPLETENESS_CHECKED',
    );
    expect(check!.metadata).toMatchObject({
      itemCount: COMPLETENESS_TRIGGER_ITEM_COUNT,
      complexity: 'unknown',
      threshold: null,
      sparse: false,
    });

    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('schedule-row')).toHaveCount(COMPLETENESS_TRIGGER_ITEM_COUNT);
    // With no band chosen there is no threshold to fall short of, so nothing is
    // advised rather than a band being guessed.
    await expect(page.getByTestId('completeness-banner')).toHaveCount(0);
  });

  test('summary-only matters use a lower threshold', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    const fresh = await getDraft(request, draft.id);
    await saveValues(
      request,
      draft.id,
      { [COMPLEXITY_FIELD]: 'summary_only', [SCHEDULE_FIELD]: [row('REF-1')] },
      fresh.version,
    );

    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('schedule-row')).toHaveCount(1);
    // One item clears the summary-only bar but would not clear Complex.
    expect(COMPLEXITY_THRESHOLDS.summary_only.minItems).toBe(1);
    await expect(page.getByTestId('completeness-banner')).toHaveCount(0);
  });

  test('the thresholds are configurable in one place, not at call sites', async () => {
    // The DoD requires configurability, which is only true if changing the
    // constant changes the outcome. Run the real module with a patched band.
    const script = `
      const path = require.resolve('@mgs/shared');
      const shared = require(path);
      shared.COMPLEXITY_THRESHOLDS.complex.minItems = 99;
      const result = shared.checkCompleteness({ itemCount: 20, complexity: 'complex' });
      if (!result.sparse || result.threshold !== 99) {
        throw new Error('threshold is not read from COMPLEXITY_THRESHOLDS: ' + JSON.stringify(result));
      }
      console.log('threshold honoured');
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(`${result.stdout}${result.stderr}`).toContain('threshold honoured');
    expect(result.status).toBe(0);

    // And no call site hardcodes a band's number.
    for (const file of [
      'apps/api/src/drafts/drafts.service.ts',
      'apps/web/src/app/features/form-fill/form-fill-page.ts',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not hardcode a threshold`).not.toMatch(/minItems\s*[:=]\s*\d/);
    }
  });

  test('the completeness outcome is written to the audit log', async ({ request }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    const fresh = await getDraft(request, draft.id);
    await saveValues(
      request,
      draft.id,
      { [COMPLEXITY_FIELD]: 'complex', [SCHEDULE_FIELD]: [row('REF-1'), row('REF-2')] },
      fresh.version,
    );

    const events = await auditEventsFor(draft.id);
    const check = events.find((e) => e.action === 'COMPLETENESS_CHECKED');
    expect(check, 'a COMPLETENESS_CHECKED row must exist').toBeTruthy();
    expect(check!.metadata).toMatchObject({
      fieldId: SCHEDULE_FIELD,
      sparse: true,
      threshold: COMPLEXITY_THRESHOLDS.complex.minItems,
      complexity: 'complex',
      itemCount: 2,
    });

    // The save itself records the schedule's size and sensitivity.
    const saved = events.filter((e) => e.action === 'DRAFT_SAVED').pop();
    expect(saved!.metadata).toMatchObject({
      scheduleItemCounts: { [SCHEDULE_FIELD]: 2 },
      [SENSITIVE_MATERIAL_FLAG_KEY]: false,
    });
  });

  // ── DoD 4: "Sensitive classification automatically triggers UC-07 handling
  //           without additional user action"

  test('marking a row sensitive raises the flag with no further action', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);

    await addRows(page, 2);
    await fillCell(page, 0, 'itemReference', 'REF-1');
    await fillCell(page, 1, 'itemReference', 'REF-2');
    await expect(page.getByTestId('sensitive-material-indicator')).toHaveCount(0);

    // The only action is choosing the classification.
    await selectCell(page, 1, 'classification', 'Sensitive');
    await expect(page.getByTestId('sensitive-material-indicator')).toBeVisible();

    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('save-status')).toContainText('Saved');

    const saved = await getDraft(request, draft.id);
    expect(saved.values[SENSITIVE_MATERIAL_FLAG_KEY]).toBe(true);
  });

  test('the flag is derived, and clears when the last sensitive row goes', async ({ request }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    let current = await getDraft(request, draft.id);

    current = await saveValues(
      request,
      draft.id,
      { [SCHEDULE_FIELD]: [row('REF-1'), row('REF-2', { classification: 'sensitive' })] },
      current.version,
    );
    expect(current.values[SENSITIVE_MATERIAL_FLAG_KEY]).toBe(true);

    // Removing the sensitive row removes the flag rather than leaving it latched.
    current = await saveValues(
      request,
      draft.id,
      { [SCHEDULE_FIELD]: [row('REF-1')] },
      current.version,
    );
    expect(SENSITIVE_MATERIAL_FLAG_KEY in current.values).toBe(false);

    // A client cannot set it: it is recomputed from the rows on every save.
    current = await saveValues(
      request,
      draft.id,
      { [SENSITIVE_MATERIAL_FLAG_KEY]: true, [SCHEDULE_FIELD]: [row('REF-1')] },
      current.version,
    );
    expect(SENSITIVE_MATERIAL_FLAG_KEY in current.values).toBe(false);
  });

  // ── duplicate references

  test('a duplicate item reference is blocked at the row level', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);

    await addRows(page, 2);
    await fillCell(page, 0, 'itemReference', 'REF-SAME');
    await fillCell(page, 1, 'itemReference', 'REF-SAME');
    await page.getByTestId('schedule-row').nth(1).locator('[data-column-id="description"] input').click();

    // The second row is the one flagged, so the user is pointed at what they
    // just typed rather than at both rows.
    const secondRowError = page
      .getByTestId('schedule-row')
      .nth(1)
      .getByTestId('cell-error-itemReference');
    await expect(secondRowError).toBeVisible();
    await expect(secondRowError).toContainText('unique');
    await expect(
      page.getByTestId('schedule-row').nth(0).getByTestId('cell-error-itemReference'),
    ).toHaveCount(0);

    // Fixing it clears the error on the row that was flagged.
    await fillCell(page, 1, 'itemReference', 'REF-OTHER');
    await expect(secondRowError).toHaveCount(0);
  });

  // ── API contract

  test('the API rejects a malformed schedule with 422', async ({ request }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    const fresh = await getDraft(request, draft.id);

    const bad: [string, unknown][] = [
      ['not an array', 'a string'],
      ['a row that is not an object', ['a string']],
      ['a row with no id', [{ itemReference: 'REF-1' }]],
      ['two rows sharing an id', [row('REF-1'), { ...row('REF-2'), [GROUP_ROW_ID_KEY]: 'row-REF-1' }]],
      ['an undeclared column', [{ ...row('REF-1'), notAColumn: 'x' }]],
    ];
    for (const [why, value] of bad) {
      const res = await request.patch(`/api/drafts/${draft.id}`, {
        data: { values: { [SCHEDULE_FIELD]: value }, baseVersion: fresh.version },
      });
      expect(res.status(), `422 for ${why}`).toBe(422);
      expect((await res.json()).message).toContain(SCHEDULE_FIELD);
    }
  });

  test('an existing MG6 draft keeps every value it held before the schedule existed', async ({
    request,
  }) => {
    // The seven original field ids are unchanged, so a draft written against
    // templateVersion 1 still round-trips. Renaming one would strand its value.
    const { draft } = await createDraft(request, 'MG6', null);
    const legacy = {
      disclosureOfficer: 'DC 1234 PATEL',
      scheduleReference: 'SCH/1',
      unusedSummary: 'Nothing of note beyond the schedule.',
      underminesCase: 'no',
      underminesDetail: '',
      sensitiveMaterial: false,
      dateCompleted: '2026-05-01',
    };
    const fresh = await getDraft(request, draft.id);
    const saved = await saveValues(request, draft.id, legacy, fresh.version);
    for (const [id, value] of Object.entries(legacy)) {
      expect(saved.values[id], `${id} survived`).toEqual(value);
    }
  });

  // ── designation independence

  test('the schedule renders from the field type, never from the form code', async () => {
    const template = getFormTemplate('MG6')!;
    // At least 2: UC-04 took MG6 from 1, and UC-05's rules took it further.
    expect(template.templateVersion).toBeGreaterThanOrEqual(2);
    const group = template.fields.find((f) => f.type === 'group');
    expect(group?.id).toBe(SCHEDULE_FIELD);
    expect(group?.columns?.map((c) => c.id)).toEqual([
      'itemReference',
      'description',
      'materialType',
      'classification',
    ]);

    // Nothing in the schedule machinery compares a form code to MG6, so the
    // schedule survives the designation question (LER-1205) either way. The
    // search is for the string literal a branch would need — prose about the
    // designation in a comment is exactly what we want to keep.
    const grep = spawnSync(
      'git',
      [
        'grep',
        '-n',
        "'MG6'",
        '--',
        'apps/web/src/app/shared/dynamic-form',
        'apps/api/src/drafts',
        'apps/web/src/app/features/form-fill/form-fill-page.ts',
        'libs/shared/src/lib/schedule.ts',
        'libs/shared/src/lib/completeness.ts',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(grep.stdout.trim(), 'no schedule code may branch on the MG6 form code').toBe('');
  });

  // ── U1: the numbering must stay on screen at a standard laptop width

  test('the row number and item reference stay in the viewport at 1366x768', async ({
    page,
    request,
  }) => {
    // The audit (finding U1) found the ordinal and reference columns scrolled off
    // screen at this width — the two things that tell a user WHICH row they are
    // editing, on the use case whose whole point is numbering. Both columns are
    // now pinned, which only means anything while the table is scrolled right.
    await page.setViewportSize({ width: 1366, height: 768 });
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);
    await addRows(page, 3);
    await fillCell(page, 0, 'itemReference', 'REF-A');
    await fillCell(page, 0, 'description', 'A long description that pushes the later columns wide');

    const table = page.locator('.schedule-table');
    // Scroll the table as far right as it goes — the state the audit caught.
    await table.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.waitForTimeout(200);
    const scrolled = await table.evaluate((el) => el.scrollLeft);

    const inViewport = async (locator: import('@playwright/test').Locator, what: string) => {
      const box = await locator.boundingBox();
      expect(box, `${what} must be rendered`).not.toBeNull();
      expect(box!.x, `${what} left edge must be on screen`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${what} right edge must be on screen`).toBeLessThanOrEqual(1366);
      return box!;
    };

    // Both survive the scroll: the row number, and the item-reference header.
    const ordinal = await inViewport(page.getByTestId('row-ordinal').first(), 'the row ordinal');
    const header = await inViewport(
      page.locator('.schedule-table thead th[data-column-id="itemReference"]'),
      'the item-reference header',
    );
    // And they are still in reading order, number first.
    expect(ordinal.x).toBeLessThan(header.x);
    // Sanity: the assertion above is only meaningful if the table really scrolled.
    expect(scrolled, 'the table must actually be scrolled for this to prove pinning').toBeGreaterThan(0);
  });

  // ── audit remediation: the six NO-COVERAGE rows from the 19 Aug audit

  test('the column option lists match the template, with no invented third state', async ({
    page,
    request,
  }) => {
    const group = getFormTemplate('MG6')!.fields.find((f) => f.type === 'group')!;
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);
    await addRows(page, 1);

    for (const columnId of ['classification', 'materialType'] as const) {
      const declared = group.columns!.find((c) => c.id === columnId)!.options!.map((o) => o.label);
      const cell = page.getByTestId('schedule-row').first().locator(`[data-column-id="${columnId}"]`);
      await cell.locator('mat-select').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('mat-option').first()).toBeVisible();
      const rendered = await page.locator('mat-option').allTextContents();
      // Rendered options ARE the template's options — same set, same count, so a
      // hardcoded extra state in the component would fail here.
      expect(rendered.map((t) => t.trim()), `${columnId} options`).toEqual(declared);
      await page.keyboard.press('Escape');
      // The overlay must be gone before the next select opens, or the next
      // assertion sees both panels' options at once.
      await expect(page.locator('mat-option')).toHaveCount(0);
    }

    // The scope names exactly two classifications and three material-type examples.
    const classification = group.columns!.find((c) => c.id === 'classification')!;
    expect(classification.options!.map((o) => o.value)).toEqual(['non_sensitive', 'sensitive']);
    const types = group.columns!.find((c) => c.id === 'materialType')!.options!.map((o) => o.value);
    for (const scopeExample of ['document', 'cctv', 'forensic']) {
      expect(types, `the scope names ${scopeExample}`).toContain(scopeExample);
    }
  });

  test('the completeness hook fires on a finalisation attempt, whatever the count', async () => {
    // LER-1090's second criterion: "Given a finalisation attempt occurs ... the
    // check evaluates regardless of item count. (No finalise endpoint exists yet —
    // expose the hook and test it directly.)" The audit found the hook was never
    // exercised at all, so this calls it directly.
    expect(shouldRunCompletenessCheck({ itemCount: 0, finalising: true })).toBe(true);
    expect(shouldRunCompletenessCheck({ itemCount: 1, finalising: true })).toBe(true);
    expect(
      shouldRunCompletenessCheck({ itemCount: 2, complexity: 'complex', finalising: true }),
    ).toBe(true);
    // Without finalising, a sub-trigger count and no band stays silent.
    expect(shouldRunCompletenessCheck({ itemCount: 2 })).toBe(false);
    // And a finalisation on an empty schedule still records a band-less outcome
    // rather than guessing one.
    expect(checkCompleteness({ itemCount: 0, complexity: undefined })).toMatchObject({
      sparse: false,
      threshold: null,
      complexity: 'unknown',
    });
  });

  test('a save still succeeds when the audit write throws', async () => {
    // LER-1090's last criterion: an audit failure must never break a user action.
    // Proven against the REAL compiled AuditService with a Prisma stub that throws.
    const script = `
      const { AuditService } = require('./apps/api/dist/audit/audit.service.js');
      const prisma = { auditEvent: { create: () => { throw new Error('disk on fire'); } } };
      const service = new AuditService(prisma);
      service.record('user-1', 'DRAFT_SAVED', 'draft-1', { formCode: 'MG6' })
        .then(() => console.log('RESOLVED without throwing'))
        .catch((e) => { console.log('REJECTED: ' + e.message); process.exit(1); });
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(`${result.stdout}${result.stderr}`).toContain('RESOLVED without throwing');
    expect(result.status, 'a failed audit write must not reject').toBe(0);
  });

  // ── guardrails

  test('conformance and orphan-scan stay green with a group template', async () => {
    for (const script of ['conformance', 'orphan-scan']) {
      const result = spawnSync('npm', ['run', script], { cwd: process.cwd(), encoding: 'utf8' });
      expect(result.status, `npm run ${script} must exit 0:\n${result.stdout}${result.stderr}`).toBe(
        0,
      );
    }
  });
});
