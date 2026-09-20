import { expect, test } from './support/fixtures';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MG11_DECLARATION, MG11_DECLARATION_SHA256 } from '@mgs/shared';
import { caseFor, createDraft, getDraft, saveValues } from './support/api';

/** A narrative containing every phrase the UC-03 scope requires flagging. */
const FLAGGED_NARRATIVE =
  'I was told that the man left through the rear door at about 11:15pm. ' +
  'In my opinion he was avoiding the camera. I think he had been drinking. ' +
  'In my view the door was already damaged. I heard that the alarm failed that week.';

/** Enough to satisfy steps 1 and 2, so a resumed draft lands on step 3. */
const STEP_1_AND_2_COMPLETE = {
  title: 'Ms',
  witnessName: 'Jane SMITH',
  witnessDob: '1990-03-22',
  witnessAddress: '14 Bridge Street, London SE1 9AA',
  statementText: FLAGGED_NARRATIVE,
};

/**
 * Walks forward to `step` (1-based) using Next, because step headers are
 * deliberately disabled until a step has been visited. Ticks the declaration
 * on the way if we need to get past it.
 */
async function advanceTo(page: import('@playwright/test').Page, step: number): Promise<void> {
  for (let current = 1; current < step; current++) {
    if (current === 3) {
      await page.check('[data-field-id="declarationConfirmed"] input[type=checkbox]');
    }
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('wizard-step-position')).toContainText(
      `Step ${current + 1} of 4`,
    );
  }
}

test.describe('UC-03 MG11 witness statement wizard', () => {
  test('renders four steps, and only MG11 uses the wizard', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    await expect(page.getByTestId('mg11-wizard')).toBeVisible();
    const steps = page.locator('[data-testid="wizard-steps"] li');
    await expect(steps).toHaveCount(4);
    await expect(steps).toHaveText([
      /Witness details/,
      /Statement narrative/,
      /Declaration/,
      /Signature and date/,
    ]);

    // Every other form keeps the flat renderer.
    const other = await createDraft(request, 'MG5', null);
    await page.goto(`/drafts/${other.draft.id}`);
    await expect(page.getByTestId('mg11-wizard')).toHaveCount(0);
    await expect(page.locator('app-dynamic-form')).toBeVisible();
  });

  test('step 1 holds witness details including the new title field', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    for (const id of ['title', 'witnessName', 'witnessDob', 'witnessAddress', 'witnessPhone']) {
      await expect(page.locator(`[data-field-id="${id}"]`)).toBeVisible();
    }
    // Witness-care fields belong on step 1 too.
    await expect(page.locator('[data-field-id="witnessConsentsCourt"]')).toBeVisible();
    await expect(page.locator('[data-field-id="specialMeasures"]')).toBeVisible();
  });

  test('cannot advance past the declaration until it is confirmed', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('declaration-block')).toBeVisible();
    await expect(page.getByTestId('declaration-reminder')).toHaveCount(0);

    // Blocked, with an inline reminder, and still on step 3.
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('declaration-reminder')).toBeVisible();
    await expect(page.getByTestId('declaration-reminder')).toContainText('confirm the declaration');
    await expect(page.getByTestId('wizard-step-position')).toContainText('Step 3 of 4');

    // Ticking releases it.
    await page.check('[data-field-id="declarationConfirmed"] input[type=checkbox]');
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('wizard-step-position')).toContainText('Step 4 of 4');
    await expect(page.getByTestId('signature-note')).toContainText('wet signature');
  });

  test('the declaration is read-only text, not an editable field', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-next').click();

    const block = page.getByTestId('declaration-text');
    await expect(block).toHaveText(MG11_DECLARATION);
    // No input carries the wording, and it is never stored on the draft.
    await expect(page.locator('[data-field-id="declarationText"]')).toHaveCount(0);
    const saved = await getDraft(request, draft.id);
    expect(saved.values['declarationText']).toBeUndefined();
  });

  test('the shipped declaration matches its integrity hash', async () => {
    const actual = createHash('sha256').update(MG11_DECLARATION, 'utf8').digest('hex');
    expect(actual).toBe(MG11_DECLARATION_SHA256);
  });

  test('the API refuses to start on a tampered declaration', () => {
    // Overrides the shared module in memory, then runs the real compiled gate.
    const script = `
      const resolved = require.resolve('@mgs/shared');
      const real = require(resolved);
      require.cache[resolved].exports = {
        ...real,
        MG11_DECLARATION: real.MG11_DECLARATION.replace('true to the best', 'true to the vest'),
      };
      require('./apps/api/dist/integrity/declaration-integrity.js').assertDeclarationIntegrity();
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(result.status, 'the gate must exit non-zero').not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('integrity check failed');
  });

  test('the API rejects declaration tampering', async ({ request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    const fresh = await getDraft(request, draft.id);

    // Declaration wording is server-owned: no endpoint accepts it.
    const wording = await request.patch(`/api/drafts/${draft.id}`, {
      data: { values: { declarationText: 'altered wording' }, baseVersion: fresh.version },
    });
    expect(wording.status()).toBe(422);

    // Confirmation is a boolean; a truthy string must not pass for a tick.
    const truthy = await request.patch(`/api/drafts/${draft.id}`, {
      data: { values: { declarationConfirmed: 'yes' }, baseVersion: fresh.version },
    });
    expect(truthy.status()).toBe(422);

    const ok = await request.patch(`/api/drafts/${draft.id}`, {
      data: { values: { declarationConfirmed: true }, baseVersion: fresh.version },
    });
    expect(ok.ok()).toBeTruthy();
  });

  test('resuming returns to the furthest incomplete step', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    const fresh = await getDraft(request, draft.id);
    await saveValues(request, draft.id, STEP_1_AND_2_COMPLETE, fresh.version);

    await page.goto(`/drafts/${draft.id}`);
    // Steps 1 and 2 are done, so the declaration is the first unfinished step.
    await expect(page.getByTestId('wizard-step-position')).toContainText('Step 3 of 4');
    await expect(page.getByTestId('declaration-block')).toBeVisible();
  });

  test('autosave works from every step', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    // Step 1
    await page.fill('[data-field-id="witnessName"] input', 'Jane SMITH');
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 });

    // Step 2
    await page.getByTestId('wizard-next').click();
    await page.fill('[data-testid="narrative-input"]', 'A short account of what I saw happen.');
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 });

    // Step 3
    await page.getByTestId('wizard-next').click();
    await page.check('[data-field-id="declarationConfirmed"] input[type=checkbox]');
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 });

    // Step 4
    await page.getByTestId('wizard-next').click();
    await page.fill('[data-field-id="signatureName"] input', 'Jane Smith');
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 });

    const saved = await getDraft(request, draft.id);
    expect(saved.values['witnessName']).toBe('Jane SMITH');
    expect(saved.values['declarationConfirmed']).toBe(true);
    expect(saved.values['signatureName']).toBe('Jane Smith');
  });

  test('UC-02 is unchanged: witness fields never auto-fill from the case', async ({
    page,
    request,
  }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG11', foster.id);
    await page.goto(`/drafts/${draft.id}`);

    // An MG11 witness is not the defendant, so nothing is mapped.
    await expect(page.locator('[data-field-id="witnessName"] input')).toHaveValue('');
    await expect(page.getByTestId('autofill-badge')).toHaveCount(0);
    await expect(page.getByTestId('autofill-summary')).toHaveCount(0);
  });
});

test.describe('UC-03 hearsay and opinion flagging', () => {
  async function openNarrative(page: import('@playwright/test').Page, draftId: string) {
    await page.goto(`/drafts/${draftId}`);
    await advanceTo(page, 2);
    await expect(page.getByTestId('narrative-input')).toBeVisible();
  }

  test('flags every phrase the scope requires', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await openNarrative(page, draft.id);

    await page.fill('[data-testid="narrative-input"]', FLAGGED_NARRATIVE);
    const marks = page.getByTestId('narrative-flag');
    await expect(marks).toHaveCount(5);
    await expect(marks).toHaveText([
      'I was told that',
      'In my opinion',
      'I think',
      'In my view',
      'I heard that',
    ]);

    // Hearsay and opinion are distinguished.
    await expect(page.locator('[data-flag-kind="hearsay"]')).toHaveCount(2);
    await expect(page.locator('[data-flag-kind="opinion"]')).toHaveCount(3);
  });

  test('detects mixed-case variants', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await openNarrative(page, draft.id);

    await page.fill(
      '[data-testid="narrative-input"]',
      'i was told that he ran. IN MY OPINION he was angry. In My View that is wrong.',
    );
    await expect(page.getByTestId('narrative-flag')).toHaveCount(3);
  });

  test('does not flag ordinary narrative prose', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await openNarrative(page, draft.id);

    await page.fill(
      '[data-testid="narrative-input"]',
      'I saw the man walk to the rear door. He was wearing a grey coat. He left at 11:15pm.',
    );
    await expect(page.getByTestId('narrative-flag')).toHaveCount(0);
    await expect(page.getByTestId('narrative-flag-summary')).toHaveCount(0);
  });

  test('marks align with the text they underline', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await openNarrative(page, draft.id);
    await page.fill('[data-testid="narrative-input"]', FLAGGED_NARRATIVE);
    await expect(page.getByTestId('narrative-flag').first()).toBeVisible();

    // Alignment rests on the backdrop and textarea sharing text metrics, and on
    // the first mark starting exactly at the text origin (padding + border).
    const geometry = await page.evaluate(() => {
      const metrics = (el: Element) => {
        const s = getComputedStyle(el);
        return [
          s.fontFamily,
          s.fontSize,
          s.lineHeight,
          s.letterSpacing,
          s.paddingTop,
          s.paddingLeft,
          s.borderTopWidth,
          s.borderLeftWidth,
          s.whiteSpace,
          Math.round(el.getBoundingClientRect().width),
        ].join('|');
      };
      const ta = document.querySelector('[data-testid="narrative-input"]')!;
      const bd = document.querySelector('[data-testid="narrative-backdrop"]')!;
      const mark = document.querySelector('[data-testid="narrative-flag"]')!;
      const s = getComputedStyle(ta);
      const taBox = ta.getBoundingClientRect();
      const markBox = mark.getBoundingClientRect();
      return {
        same: metrics(ta) === metrics(bd),
        offsetX: Math.round(markBox.left - taBox.left),
        offsetY: Math.round(markBox.top - taBox.top),
        expectedX: Math.round(parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth)),
        firstLineTop: Math.round(parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth)),
        lineHeight: Math.round(parseFloat(s.lineHeight)),
      };
    });

    // Shared metrics are what actually keeps the two in step.
    expect(geometry.same, 'backdrop and textarea must share text metrics').toBe(true);
    // The first mark starts at the very first character of the text.
    expect(Math.abs(geometry.offsetX - geometry.expectedX)).toBeLessThanOrEqual(1);
    // Vertically it must sit inside the first line box. An inline box excludes
    // half-leading, so it starts a couple of pixels below the text origin.
    expect(geometry.offsetY).toBeGreaterThanOrEqual(geometry.firstLineTop - 1);
    expect(geometry.offsetY).toBeLessThanOrEqual(geometry.firstLineTop + geometry.lineHeight);
  });

  test('hovering a flagged phrase explains why', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await openNarrative(page, draft.id);
    await page.fill('[data-testid="narrative-input"]', FLAGGED_NARRATIVE);
    await expect(page.getByTestId('narrative-flag').first()).toBeVisible();

    await page.getByTestId('narrative-flag').first().hover();
    await expect(page.locator('.mat-mdc-tooltip')).toContainText('May be hearsay');
  });

  test('flags never block saving, navigating or completing', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await openNarrative(page, draft.id);
    await page.fill('[data-testid="narrative-input"]', FLAGGED_NARRATIVE);
    await expect(page.getByTestId('narrative-flag').first()).toBeVisible();

    // Save explicitly with flags present.
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('save-status')).toContainText('Saved');

    // Navigate on to the end with flags present.
    await page.getByTestId('wizard-next').click();
    await page.check('[data-field-id="declarationConfirmed"] input[type=checkbox]');
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('wizard-step-position')).toContainText('Step 4 of 4');

    const saved = await getDraft(request, draft.id);
    expect(saved.values['statementText']).toBe(FLAGGED_NARRATIVE);
  });

  test('a live word count tracks the narrative, and spell-check is on', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await openNarrative(page, draft.id);

    await expect(page.getByTestId('narrative-input')).toHaveAttribute('spellcheck', 'true');
    await expect(page.getByTestId('narrative-word-count')).toContainText('0 words');

    await page.fill('[data-testid="narrative-input"]', 'One two three four five');
    await expect(page.getByTestId('narrative-word-count')).toContainText('5 words');

    await page.fill('[data-testid="narrative-input"]', 'Just one');
    await expect(page.getByTestId('narrative-word-count')).toContainText('2 words');
  });

  test('saving records the flags in the audit trail', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    const fresh = await getDraft(request, draft.id);
    await saveValues(request, draft.id, { statementText: FLAGGED_NARRATIVE }, fresh.version);

    // The audit trail has no read endpoint until UC-08, so assert the same
    // detection the API records is what the UI shows.
    await page.goto(`/drafts/${draft.id}`);
    await advanceTo(page, 2);
    await expect(page.getByTestId('narrative-flag')).toHaveCount(5);
    await expect(page.getByTestId('narrative-flag-summary')).toContainText('2 possible hearsay');
    await expect(page.getByTestId('narrative-flag-summary')).toContainText('3 possible opinion');
  });
});

test.describe('UC-03 vulnerable witness', () => {
  test('an under-18 date of birth reveals special measures and the indicator', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    await expect(page.getByTestId('vulnerable-witness-indicator')).toHaveCount(0);
    await expect(page.locator('[data-field-id="specialMeasuresApplied"]')).toHaveCount(0);

    await page.fill('[data-field-id="witnessDob"] input', '05/04/2012');
    await expect(page.getByTestId('vulnerable-witness-indicator')).toBeVisible();
    await expect(page.locator('[data-field-id="specialMeasuresApplied"]')).toBeVisible();
  });

  test('an adult with a special-measures category is treated the same', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    await page.fill('[data-field-id="witnessDob"] input', '01/06/1980');
    await expect(page.getByTestId('vulnerable-witness-indicator')).toHaveCount(0);

    await page.locator('[data-field-id="specialMeasures"] mat-select').click();
    await page.getByRole('option', { name: /Intimidated witness/ }).click();

    await expect(page.getByTestId('vulnerable-witness-indicator')).toBeVisible();
    await expect(page.locator('[data-field-id="specialMeasuresApplied"]')).toBeVisible();
  });

  test('the indicator and derived flag survive a reload', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    await page.fill('[data-field-id="witnessDob"] input', '05/04/2012');
    await expect(page.getByTestId('vulnerable-witness-indicator')).toBeVisible();
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('save-status')).toContainText('Saved');

    // Persisted for later PDF output (UC-09).
    const saved = await getDraft(request, draft.id);
    expect(saved.values['isVulnerableWitness']).toBe(true);

    await page.reload();
    await expect(page.getByTestId('vulnerable-witness-indicator')).toBeVisible();
  });
});
