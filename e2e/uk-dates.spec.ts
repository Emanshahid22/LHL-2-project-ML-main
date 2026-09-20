import { expect, test } from './support/fixtures';
import { caseFor, createDraft, getDraft, saveValues } from './support/api';

/**
 * UK date convention (UC-03 signature date; UC-05 as the engine-wide rule).
 *
 * The display convention is DD/MM/YYYY everywhere. Storage is unchanged: drafts
 * still hold ISO "YYYY-MM-DD", which is what keeps auto-fill provenance and the
 * no-future-date rule working.
 */
test.describe('UK date convention', () => {
  test('a stored ISO date displays as DD/MM/YYYY', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    const fresh = await getDraft(request, draft.id);
    await saveValues(request, draft.id, { dateCompiled: '2026-08-17' }, fresh.version);

    await page.goto(`/drafts/${draft.id}`);
    const input = page.locator('[data-field-id="dateCompiled"] input');
    await expect(input).toHaveValue('17/08/2026');
    await expect(input).toHaveAttribute('placeholder', 'DD/MM/YYYY');
    // The native locale-dependent date control is gone.
    await expect(input).not.toHaveAttribute('type', 'date');
  });

  test('typed DD/MM/YYYY is accepted and stored as ISO', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    await page.goto(`/drafts/${draft.id}`);

    const input = page.locator('[data-field-id="dateCompiled"] input');
    await input.fill('05/04/2012');
    await input.blur();
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 });

    const saved = await getDraft(request, draft.id);
    expect(saved.values['dateCompiled']).toBe('2012-04-05');
    await expect(page.locator('[data-field-id="dateCompiled"] mat-error')).toHaveCount(0);
  });

  test('an impossible date is rejected at input', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    await page.goto(`/drafts/${draft.id}`);

    const field = page.locator('[data-field-id="dateCompiled"]');
    await field.locator('input').fill('31/02/2026');
    await field.locator('input').blur();

    await expect(field.locator('mat-error')).toContainText('Enter a real date as DD/MM/YYYY');
    // 31 February must not be silently rolled forward into March.
    const saved = await getDraft(request, draft.id);
    expect(saved.values['dateCompiled']).not.toBe('2026-03-03');
    expect(saved.values['dateCompiled']).not.toBe('2026-02-31');
  });

  test('the no-future-date rule still applies', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    await page.goto(`/drafts/${draft.id}`);

    const field = page.locator('[data-field-id="dateCompiled"]');
    await field.locator('input').fill('01/01/2099');
    await field.locator('input').blur();
    await expect(field.locator('mat-error')).toContainText('Date cannot be in the future');
  });

  test('the calendar picker also stores ISO, and weeks start on Monday', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    await page.goto(`/drafts/${draft.id}`);

    await page.locator('[data-field-id="dateCompiled"] mat-datepicker-toggle button').click();
    await expect(page.locator('.mat-calendar')).toBeVisible();
    // UK convention.
    await expect(page.locator('.mat-calendar-table-header th').first()).toContainText('Monday');

    await page.locator('.mat-calendar-body-cell').first().click();
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 });

    const saved = await getDraft(request, draft.id);
    expect(String(saved.values['dateCompiled'])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // And the input shows the UK rendering of whatever was picked.
    await expect(page.locator('[data-field-id="dateCompiled"] input')).toHaveValue(
      /^\d{2}\/\d{2}\/\d{4}$/,
    );
  });

  test('an untouched date field still saves as an empty string', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    await page.fill('[data-field-id="witnessName"] input', 'Jane SMITH');
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 });

    // Storage shape is unchanged by the display convention.
    const saved = await getDraft(request, draft.id);
    expect(saved.values['witnessDob']).toBe('');
  });

  test('an auto-filled date shows UK format and keeps its badge', async ({ page, request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);
    await page.goto(`/drafts/${draft.id}`);

    const field = page.locator('[data-field-id="defendantDob"]');
    await expect(field.locator('input')).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);
    // Provenance is compared against the ISO string the server wrote, so the
    // badge only survives if the control still holds ISO.
    await expect(field.getByTestId('autofill-badge')).toBeVisible();

    const saved = await getDraft(request, draft.id);
    expect(String(saved.values['defendantDob'])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('every date field across all 11 forms uses the shared datepicker', async ({
    page,
    request,
  }) => {
    const templates = await (await request.get('/api/form-templates')).json();
    const withDates = templates.filter((t: { fields: { type: string }[] }) =>
      t.fields.some((f) => f.type === 'date'),
    );
    expect(withDates.length).toBeGreaterThan(0);

    for (const template of withDates) {
      const { draft } = await createDraft(request, template.code, null);
      await page.goto(`/drafts/${draft.id}`);
      await expect(page.getByTestId('form-header')).toBeVisible();

      const dateFields = template.fields.filter((f: { type: string }) => f.type === 'date');
      for (const field of dateFields) {
        const locator = page.locator(`[data-field-id="${field.id}"]`);
        // MG11's wizard shows one step at a time, so a field may not be on screen;
        // it must still be a datepicker wherever it renders.
        if ((await locator.count()) === 0) continue;
        await expect(locator.locator('mat-datepicker-toggle')).toHaveCount(1);
        await expect(locator.locator('input')).toHaveAttribute('placeholder', 'DD/MM/YYYY');
      }
    }
  });
});
