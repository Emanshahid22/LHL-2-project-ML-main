import { expect, test } from './support/fixtures';
import { FORM_TEMPLATES, requiredFieldIds } from '@mgs/shared';
import { caseFor, createDraft, getCases, getDraft, recordDraft, saveValues } from './support/api';
import { COLLEAGUE } from './support/auth';

/**
 * UC-01 — Form Selection & Initiation, as described in README.md.
 * These are regression checks: the dashboard was restructured, the behaviour
 * was not meant to change.
 */
test.describe('UC-01 form selection and initiation', () => {
  test('picker offers all 11 MG forms', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="form-picker"] [data-form-code]')).toHaveCount(11);
  });

  test('every one of the 11 forms opens and renders its own field set', async ({
    page,
    request,
  }) => {
    // LER-1040, closing UC-01 DoD #1. Counting cards in the picker proves the
    // eleven forms are OFFERED; the DoD says they "load correctly". So this opens
    // a draft of each and asserts the renderer produced that template's own
    // fields — the check that would have caught a template that lists in the
    // picker and then renders nothing.
    expect(FORM_TEMPLATES).toHaveLength(11);

    for (const template of FORM_TEMPLATES) {
      const { draft } = await createDraft(request, template.code, null);
      await page.goto(`/drafts/${draft.id}`);

      // The header proves the TEMPLATE loaded, not merely that a page rendered:
      // the denominator is this template's required-field count.
      await expect(page.getByTestId('progress-label'), `${template.code} progress`).toContainText(
        `of ${requiredFieldIds(template).length} required fields completed`,
      );

      // MG11 is the wizard, so its fields arrive a step at a time; every other
      // form renders flat. Collect what is on screen either way.
      const rendered = new Set<string>();
      const collect = async () => {
        for (const id of await page
          .locator('[data-field-id]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-field-id') ?? ''))) {
          if (id) rendered.add(id);
        }
      };
      await collect();
      if (template.code === 'MG11') {
        for (let step = 1; step < 4; step++) {
          if (step === 3) {
            await page.check('[data-field-id="declarationConfirmed"] input[type=checkbox]');
          }
          await page.getByTestId('wizard-next').click();
          await expect(page.getByTestId('wizard-step-position')).toContainText(
            `Step ${step + 1} of 4`,
          );
          await collect();
        }
      }

      // Every declared field is on screen, with three documented exceptions:
      // `specialMeasuresApplied` appears only for a vulnerable witness (UC-03),
      // the derived vulnerability flag is a stored value, never a control, and
      // `sensitiveScheduleItems` (UC-07) renders only while the draft holds
      // sensitive material AND the handling instructions have been confirmed —
      // a fresh draft has neither, by design.
      const conditional = new Set([
        'specialMeasuresApplied',
        'isVulnerableWitness',
        'sensitiveScheduleItems',
      ]);
      const missing = template.fields
        .map((f) => f.id)
        .filter((id) => !rendered.has(id) && !conditional.has(id));
      expect(missing, `${template.code} rendered every declared field`).toEqual([]);
    }
  });

  test('picking a form opens the "Link to a case?" dialog', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-form-code="MG11"]').click();
    await expect(page.getByRole('heading', { name: 'Link to a case?' })).toBeVisible();
    await expect(page.locator('mat-dialog-content, .mat-mdc-dialog-content')).toContainText(
      'MG11 — Witness Statement',
    );
  });

  test('dialog lists only accessible cases and never the colleague-only case', async ({
    page,
    request,
  }) => {
    const cases = await getCases(request);
    await page.goto('/');
    await page.locator('[data-form-code="MG11"]').click();

    const dialog = page.locator('.mat-mdc-dialog-container');
    for (const c of cases) {
      await expect(dialog).toContainText(c.urn);
    }
    // R v Whitfield belongs to the second solicitor only.
    await expect(dialog).not.toContainText('Whitfield');
    await expect(dialog).toContainText('Standalone');
  });

  test('cancelling the dialog starts no draft', async ({ page, request }) => {
    const before = (await request.get('/api/drafts')).json();
    await page.goto('/');
    await page.locator('[data-form-code="MG12"]').click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.mat-mdc-dialog-container')).toHaveCount(0);

    const after = await (await request.get('/api/drafts')).json();
    expect(after.length).toBe((await before).length);
  });

  test('starting a standalone form navigates to the draft and shows the Standalone chip', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('[data-form-code="MG12"]').click();
    await page.getByRole('radio', { name: /Standalone/ }).click();
    await page.getByRole('button', { name: 'Start form' }).click();

    await expect(page).toHaveURL(/\/drafts\/.+/);
    recordDraft(page.url().split('/drafts/')[1]);
    await expect(page.getByTestId('form-header')).toContainText('Exhibit List');
    await expect(page.getByTestId('form-header')).toContainText('Standalone');
  });

  test('starting a case-linked form carries the case onto the form', async ({ page, request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    await page.goto('/');
    await page.locator('[data-form-code="MG12"]').click();
    await page.getByRole('radio', { name: new RegExp(foster.urn) }).click();
    await page.getByRole('button', { name: 'Start form' }).click();

    await expect(page).toHaveURL(/\/drafts\/.+/);
    recordDraft(page.url().split('/drafts/')[1]);
    await expect(page.getByTestId('form-header')).toContainText(foster.urn);
    await expect(page.getByTestId('form-header')).toContainText('Daniel Foster');
  });

  test('required fields are marked and contextual help expands', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    const witnessName = page.locator('[data-field-id="witnessName"]');
    await expect(witnessName).toContainText('Full name of witness');
    // Required text fields are marked by Material's own asterisk; required
    // checkboxes (which sit outside mat-form-field) use .required-marker.
    await expect(witnessName.locator('.mat-mdc-form-field-required-marker')).toBeVisible();

    await witnessName.getByRole('button', { name: /Help for/ }).click();
    await expect(witnessName.locator('.help-panel')).toContainText('block capitals');
  });

  test('inline validation message appears for an empty required field', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    const input = page.locator('[data-field-id="witnessName"] input');
    await input.click();
    await input.fill('x');
    await input.fill('');
    await input.blur();
    await expect(page.locator('[data-field-id="witnessName"] mat-error')).toBeVisible();
  });

  test('header progress reports N of M required fields and advances as they are filled', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    const label = page.getByTestId('progress-label');
    await expect(label).toContainText(/0 of \d+ required fields completed/);
    const total = Number((await label.textContent())!.match(/of (\d+)/)![1]);
    expect(total).toBeGreaterThan(0);

    await page.locator('[data-field-id="witnessName"] input').fill('Jane SMITH');
    await expect(label).toContainText(`1 of ${total} required fields completed`);
  });

  test('explicit Save draft persists and confirms with a snackbar', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    await page.locator('[data-field-id="witnessName"] input').fill('Jane SMITH');
    await page.getByTestId('save-draft').click();

    await expect(page.locator('.mat-mdc-snack-bar-label').first()).toContainText('Draft saved');
    await expect(page.getByTestId('save-status')).toContainText('Saved');

    const saved = await getDraft(request, draft.id);
    expect(saved.values['witnessName']).toBe('Jane SMITH');
  });

  test('debounced autosave persists without an explicit save', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);

    await page.locator('[data-field-id="witnessOccupation"] input').fill('Shop manager');
    await expect(page.getByTestId('save-status')).toContainText('Unsaved changes');
    // Autosave debounce is 1.5s.
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 });

    const saved = await getDraft(request, draft.id);
    expect(saved.values['witnessOccupation']).toBe('Shop manager');
  });

  test('draft appears in the work queue and resumes with its saved values', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    const fresh = await getDraft(request, draft.id);
    await request.patch(`/api/drafts/${draft.id}`, {
      data: { values: { witnessName: 'Resume Test' }, baseVersion: fresh.version },
    });

    await page.goto('/');
    await page.getByTestId('drafts-filter').fill('Witness Statement');
    const row = page.locator(`[data-testid="in-progress"] a[href="/drafts/${draft.id}"]`);
    await expect(row).toBeVisible();

    await row.click();
    await expect(page.locator('[data-field-id="witnessName"] input')).toHaveValue('Resume Test');
  });

  test('case detail "Complete MG Form" starts a draft pre-linked to that case', async ({
    page,
    request,
  }) => {
    const renard = await caseFor(request, 'Sofia Renard');
    await page.goto(`/cases/${renard.id}`);

    await page.getByTestId('complete-mg-form').click();
    await expect(page.getByRole('heading', { name: 'Complete MG form' })).toBeVisible();
    await page.locator('.mat-mdc-dialog-container [data-form-code="MG12"]').click();

    await expect(page).toHaveURL(/\/drafts\/.+/);
    recordDraft(page.url().split('/drafts/')[1]);
    await expect(page.getByTestId('form-header')).toContainText(renard.urn);
  });

  test('template load failure on the dashboard offers Retry', async ({ page }) => {
    await page.route('**/api/form-templates', (route) => route.abort('failed'));
    await page.goto('/');

    const picker = page.locator('[data-testid="form-picker"]');
    await expect(picker).toContainText('The form templates could not be loaded');

    // Recover, then Retry must repopulate the picker.
    await page.unroute('**/api/form-templates');
    await picker.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('[data-form-code]')).toHaveCount(11);
  });

  test('draft load failure offers Retry', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await page.route(`**/api/drafts/${draft.id}`, (route) => route.abort('failed'));
    await page.goto(`/drafts/${draft.id}`);

    await expect(page.getByTestId('load-error')).toContainText('could not be loaded');
    await page.unroute(`**/api/drafts/${draft.id}`);
    await page.getByTestId('load-error').getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('form-header')).toBeVisible();
  });

  test('a denied case link shows the explanatory banner on the form', async ({ page, request }) => {
    // Making a real case inaccessible mid-flow is not possible from the browser,
    // so return the warning the API sends for one and check the UI surfaces it.
    const { draft } = await createDraft(request, 'MG12', null);
    await page.route('**/api/drafts', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        json: {
          draft,
          caseLinkWarning:
            'The selected case is no longer accessible to you, so this form was started standalone. You can link it to a case later.',
        },
      });
    });

    await page.goto('/');
    await page.locator('[data-form-code="MG12"]').click();
    await page.getByRole('radio', { name: /Standalone/ }).click();
    await page.getByRole('button', { name: 'Start form' }).click();

    await expect(page.getByTestId('case-link-warning')).toBeVisible();
    await expect(page.getByTestId('case-link-warning')).toContainText('no longer accessible');
  });

  test('a stale save is rejected with 409 and does not overwrite newer work', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    const fresh = await getDraft(request, draft.id);
    await saveValues(request, draft.id, { witnessName: 'First write' }, fresh.version);

    // Re-using the now-stale baseVersion must conflict, not clobber.
    const stale = await request.patch(`/api/drafts/${draft.id}`, {
      data: { values: { witnessName: 'Stale write' }, baseVersion: fresh.version },
    });
    expect(stale.status()).toBe(409);

    const after = await getDraft(request, draft.id);
    expect(after.values['witnessName']).toBe('First write');
  });

  test('a case belonging only to a colleague is not readable', async ({ request }) => {


    // Whitfield is granted to the second solicitor only.
    const theirCases = await (await request.get('/api/cases', { headers: COLLEAGUE })).json();
    const whitfield = theirCases.find((c: { defendantName: string }) =>
      c.defendantName.includes('Whitfield'),
    );
    expect(whitfield, 'colleague can see R v Whitfield').toBeTruthy();

    // The demo user must not be able to read it even with the id in hand.
    expect((await request.get(`/api/cases/${whitfield.id}`)).status()).toBe(404);
    const mine = await getCases(request);
    expect(mine.some((c) => c.id === whitfield.id)).toBe(false);
  });

  test("another user's draft is not readable", async ({ request }) => {

    const res = await request.post('/api/drafts', {
      data: { formCode: 'MG11', caseId: null },
      headers: COLLEAGUE,
    });
    expect(res.ok()).toBeTruthy();
    const theirDraft = (await res.json()).draft;
    recordDraft(theirDraft.id);

    expect((await request.get(`/api/drafts/${theirDraft.id}`)).status()).toBe(404);
  });

  test('a draft requested against an inaccessible case is started standalone with a warning', async ({
    request,
  }) => {
    const res = await request.post('/api/drafts', {
      data: { formCode: 'MG11', caseId: 'clzzzzzzzzzzzzzzzzzzzzzzzz' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    recordDraft(body.draft.id);

    expect(body.draft.caseId).toBeNull();
    expect(body.caseLinkWarning).toContain('no longer accessible');
  });
});
