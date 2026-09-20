import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from './support/fixtures';
import { autoFill, caseFor, createDraft, getDraft, saveValues } from './support/api';

/**
 * UC-02 — Auto-Population from Case File Data, as described in README.md.
 * The dashboard restructure must not have disturbed any of it, so this covers
 * the documented behaviour end to end (UI) and at the API contract level.
 */
test.describe('UC-02 auto-population', () => {
  test('first open of a case-linked draft populates and summarises', async ({ page, request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);
    await page.goto(`/drafts/${draft.id}`);

    const summary = page.getByTestId('autofill-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/\d+ of \d+ mappable fields were filled from the case file/);
    await expect(page.locator('[data-field-id="defendantName"] input')).toHaveValue('Daniel Foster');
    await expect(page.locator('[data-field-id="urn"] input')).toHaveValue(foster.urn);
  });

  test('the summary can be dismissed', async ({ page, request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);
    await page.goto(`/drafts/${draft.id}`);

    await page.getByTestId('dismiss-autofill-summary').click();
    await expect(page.getByTestId('autofill-summary')).toHaveCount(0);
  });

  test('filled fields carry an Auto-filled badge with a Clear affordance', async ({
    page,
    request,
  }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);
    await page.goto(`/drafts/${draft.id}`);

    const field = page.locator('[data-field-id="defendantName"]');
    await expect(field.getByTestId('autofill-badge')).toBeVisible();
    await expect(field.getByTestId('autofill-clear')).toBeVisible();
  });

  test('EVERY field the run filled carries the badge, on two different forms', async ({
    page,
    request,
  }) => {
    // LER-1055, closing UC-02 DoD #2 — "Auto-filled badge displayed on every
    // pre-filled field". The check above asserts one field (`defendantName`),
    // which is a sample, not the claim. This loops over what the run actually
    // wrote and demands a badge on each, on two templates so it cannot be an
    // MG1 peculiarity.
    const foster = await caseFor(request, 'Daniel Foster');

    for (const code of ['MG1', 'MG4']) {
      const { draft } = await createDraft(request, code, foster.id);
      await page.goto(`/drafts/${draft.id}`);
      await expect(page.getByTestId('autofill-summary'), `${code} summary`).toBeVisible();

      // The provenance map IS the set of fields this run filled — the same source
      // the badge itself is derived from, read back from the API rather than
      // guessed from the DOM.
      const populated = await getDraft(request, draft.id);
      const filled = Object.keys(populated.autoFill);
      expect(filled.length, `${code} filled more than one field`).toBeGreaterThan(1);

      for (const id of filled) {
        // Scoped to the row: a narrative field carries data-field-id twice, so an
        // unscoped selector would be ambiguous on forms that have one.
        const row = page.locator(`.field-row[data-field-id="${id}"]`);
        await expect(row.getByTestId('autofill-badge'), `${code}.${id} badge`).toBeVisible();
        await expect(row.getByTestId('autofill-clear'), `${code}.${id} clear`).toBeVisible();
      }

      // And the badge count on screen equals the number of fields filled, so no
      // filled field is quietly missing one.
      await expect(page.getByTestId('autofill-badge'), `${code} badge count`).toHaveCount(
        filled.length,
      );
      await expect(page.getByTestId('autofill-summary')).toContainText(
        `${filled.length} of`,
      );
    }
  });

  test('clearing a filled field makes it manual and drops the badge', async ({ page, request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);
    await page.goto(`/drafts/${draft.id}`);

    const field = page.locator('[data-field-id="defendantName"]');
    await field.getByTestId('autofill-clear').click();
    await expect(field.locator('input')).toHaveValue('');
    await expect(field.getByTestId('autofill-badge')).toHaveCount(0);
  });

  test('editing a filled field makes it manual, and it stays manual across a reload', async ({
    page,
    request,
  }) => {
    // Theo Marchetti is UC-02's DEDICATED write fixture (LER-1269): this test
    // persists an edited defendant name, which UC-08's case-wide Check 3
    // correctly flags as blocking on every later review of the same case — so
    // the edit lands on a case no other suite reads (e2e/FIXTURES.md).
    const marchetti = await caseFor(request, 'Theo Marchetti');
    const { draft } = await createDraft(request, 'MG1', marchetti.id);
    await page.goto(`/drafts/${draft.id}`);

    const field = page.locator('[data-field-id="defendantName"]');
    await field.locator('input').fill('Theo MARCHETTI (edited)');
    await expect(field.getByTestId('autofill-badge')).toHaveCount(0);

    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('save-status')).toContainText('Saved');

    await page.reload();
    const reloaded = page.locator('[data-field-id="defendantName"]');
    await expect(reloaded.locator('input')).toHaveValue('Theo MARCHETTI (edited)');
    await expect(reloaded.getByTestId('autofill-badge')).toHaveCount(0);
  });

  test('ambiguous case data leaves the field blank with an explanatory note', async ({
    page,
    request,
  }) => {
    // Marcus Bellamy's case carries two offences with different dates.
    const bellamy = await caseFor(request, 'Marcus Bellamy');
    const { draft } = await createDraft(request, 'MG5', bellamy.id);
    await page.goto(`/drafts/${draft.id}`);

    const field = page.locator('[data-field-id="offenceDate"]');
    await expect(field.locator('input')).toHaveValue('');
    await expect(field.getByTestId('autofill-note')).toContainText('Not auto-filled');
    await expect(field.getByTestId('autofill-note')).toContainText('offence dates');
  });

  test('missing case data is flagged with a no-data note', async ({ page, request }) => {
    // Liam Okafor's case has no hearing listed, so MG4's hearingDate cannot fill.
    const okafor = await caseFor(request, 'Liam Okafor');
    const { draft } = await createDraft(request, 'MG4', okafor.id);
    await page.goto(`/drafts/${draft.id}`);

    const field = page.locator('[data-field-id="hearingDate"]');
    await expect(field.locator('input')).toHaveValue('');
    await expect(field.getByTestId('autofill-note')).toContainText('Not auto-filled');
    await expect(field.getByTestId('autofill-note')).toContainText('No hearing is listed');
  });

  test('a failed auto-fill explains itself and leaves the form usable', async ({ page, request }) => {
    // Also on the UC-02 write fixture: the typed value persists (LER-1269).
    const marchetti = await caseFor(request, 'Theo Marchetti');
    const { draft } = await createDraft(request, 'MG1', marchetti.id);
    await page.route(`**/api/drafts/${draft.id}/autofill`, (route) =>
      route.fulfill({ status: 500, json: { message: 'Internal server error' } }),
    );

    await page.goto(`/drafts/${draft.id}`);
    await expect(page.locator('.mat-mdc-snack-bar-label').first()).toContainText(
      'Auto-population was unavailable',
    );

    // The form must still be fully usable for manual entry.
    const input = page.locator('[data-field-id="defendantName"] input');
    await input.fill('Typed by hand');
    await expect(input).toHaveValue('Typed by hand');
    await expect(page.getByTestId('progress-label')).toContainText('of');
  });

  test('unmapped fields carry no auto-fill note', async ({ page, request }) => {
    const renard = await caseFor(request, 'Sofia Renard');
    const { draft } = await createDraft(request, 'MG11', renard.id);
    await page.goto(`/drafts/${draft.id}`);

    // An MG11 witness is not the defendant, so witnessName has no mapping.
    await expect(
      page.locator('[data-field-id="witnessName"]').getByTestId('autofill-note'),
    ).toHaveCount(0);
  });

  test('MG16 subjectName is not auto-filled from the defendant', async ({ page, request }) => {
    // s.100 notices concern a non-defendant, so the field stays unmapped.
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG16', foster.id);
    await page.goto(`/drafts/${draft.id}`);

    const field = page.locator('[data-field-id="subjectName"]');
    await expect(field.locator('input')).toHaveValue('');
    await expect(field.getByTestId('autofill-badge')).toHaveCount(0);
  });

  test('population never overwrites a manual value on re-run', async ({ request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);

    const first = await autoFill(request, draft.id);
    expect(first.ok()).toBeTruthy();

    const current = await getDraft(request, draft.id);
    await saveValues(
      request,
      draft.id,
      { ...current.values, defendantName: 'Manually Typed' },
      current.version,
    );

    const second = await autoFill(request, draft.id);
    expect(second.ok()).toBeTruthy();
    const after = await getDraft(request, draft.id);
    expect(after.values['defendantName']).toBe('Manually Typed');
  });

  test('re-run refills a field that was cleared back to empty', async ({ request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);
    await autoFill(request, draft.id);

    const current = await getDraft(request, draft.id);
    await saveValues(request, draft.id, { ...current.values, urn: '' }, current.version);

    await autoFill(request, draft.id);
    const after = await getDraft(request, draft.id);
    expect(after.values['urn']).toBe(foster.urn);
  });

  test('provenance records the source, the value and the case timestamp', async ({ request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);
    await autoFill(request, draft.id);

    const after = await getDraft(request, draft.id);
    const provenance = after.autoFill['defendantName'];
    expect(provenance).toBeTruthy();
    expect(provenance.source).toBe('case');
    expect(provenance.value).toBe('Daniel Foster');
    expect(provenance.accepted).toBe(true);
    expect(provenance.caseUpdatedAt).toBeTruthy();
  });

  test('saving a value that differs from what auto-fill wrote prunes its provenance', async ({
    request,
  }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);
    await autoFill(request, draft.id);

    const current = await getDraft(request, draft.id);
    expect(current.autoFill['defendantName']).toBeTruthy();

    const saved = await saveValues(
      request,
      draft.id,
      { ...current.values, defendantName: 'Someone Else' },
      current.version,
    );
    expect(saved.autoFill['defendantName']).toBeUndefined();
  });

  test('charges are joined from every offence on the case', async ({ request }) => {
    const bellamy = await caseFor(request, 'Marcus Bellamy');
    const { draft } = await createDraft(request, 'MG1', bellamy.id);
    await autoFill(request, draft.id);

    const after = await getDraft(request, draft.id);
    // MG1's field is chargeSummary; `charges` is the case path it maps from.
    const charges = String(after.values['chargeSummary'] ?? '');
    expect(charges.split('\n')).toHaveLength(2);
    expect(charges).toContain('actual bodily harm');
  });

  test('ambiguous and no_data outcomes are reported with reasons', async ({ request }) => {
    const bellamy = await caseFor(request, 'Marcus Bellamy');
    const { draft } = await createDraft(request, 'MG5', bellamy.id);

    const res = await autoFill(request, draft.id);
    expect(res.ok()).toBeTruthy();
    const result = await res.json();

    const offenceDate = result.outcomes.find((o: any) => o.fieldId === 'offenceDate');
    expect(offenceDate.outcome).toBe('ambiguous');
    expect(offenceDate.reason).toContain('offence dates');
    for (const outcome of result.outcomes) {
      if (outcome.outcome !== 'filled') expect(outcome.reason).toBeTruthy();
    }
  });

  test('the summary counts only mappable fields', async ({ request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);

    const res = await autoFill(request, draft.id);
    const result = await res.json();
    expect(result.summary.total).toBeGreaterThan(0);
    expect(result.summary.filled).toBeLessThanOrEqual(result.summary.total);
    expect(result.outcomes.length).toBe(result.summary.total);
  });

  test('a standalone draft is rejected for auto-fill and never populates on open', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG1', null);

    const res = await autoFill(request, draft.id);
    expect(res.status()).toBe(400);

    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('autofill-summary')).toHaveCount(0);
    await expect(page.locator('[data-field-id="defendantName"] input')).toHaveValue('');
  });

  test('a case that changed after population surfaces the banner, and Re-run clears it', async ({
    page,
    request,
  }) => {
    const okafor = await caseFor(request, 'Liam Okafor');
    const { draft } = await createDraft(request, 'MG1', okafor.id);
    await autoFill(request, draft.id);

    // caseChanged() is true when any provenance predates the case's updatedAt.
    // Age the provenance on the way to the browser to simulate an edited case.
    await page.route(`**/api/drafts/${draft.id}`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      const body = await response.json();
      for (const key of Object.keys(body.autoFill)) {
        body.autoFill[key].caseUpdatedAt = '2000-01-01T00:00:00.000Z';
      }
      await route.fulfill({ response, json: body });
    });

    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('case-changed-banner')).toBeVisible();
    await expect(page.getByTestId('case-changed-banner')).toContainText(
      'The case file has changed since this form was populated',
    );

    // Re-running against the real case refreshes provenance, so it clears.
    await page.unroute(`**/api/drafts/${draft.id}`);
    await page.getByTestId('rerun-autofill').click();
    await expect(page.getByTestId('case-changed-banner')).toHaveCount(0);
  });

  test('auto-fill writes an AUTO_POPULATED audit event', async ({ request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);
    const res = await autoFill(request, draft.id);
    expect(res.ok()).toBeTruthy();
    // The audit trail has no read endpoint yet (UC-08), so assert the write
    // path succeeded and the draft advanced a version.
    const after = await getDraft(request, draft.id);
    expect(after.version).toBeGreaterThan(draft.version);
  });

  test('auto-fill leaves fields the case cannot supply blank', async ({ request }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const { draft } = await createDraft(request, 'MG1', foster.id);
    const res = await autoFill(request, draft.id);
    const result = await res.json();

    for (const outcome of result.outcomes) {
      if (outcome.outcome === 'no_data') {
        const after = await getDraft(request, draft.id);
        expect(after.values[outcome.fieldId] ?? '').toBe('');
      }
    }
  });

  // ── audit remediation: LER-1053's coverage gap from the 19 Aug audit

  test('no API path writes to the case file', async () => {
    // The read-only guarantee was structural but unasserted, so an accidental
    // future write path — a well-meaning "touch the case's updatedAt", say —
    // would not have failed the suite. This asserts the absence directly.
    const writes = spawnSync(
      'git',
      [
        'grep',
        '-nE',
        String.raw`prisma\.(case|caseOffence)\.(create|update|upsert|delete|createMany|updateMany|deleteMany)`,
        '--',
        'apps/api/src',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(
      writes.stdout.trim(),
      `no served API code may write to Case or CaseOffence, found:\n${writes.stdout}`,
    ).toBe('');

    // The service exposes no write method at all, so there is nothing to call.
    const service = readFileSync('apps/api/src/cases/cases.service.ts', 'utf8');
    for (const forbidden of ['create', 'update', 'upsert', 'delete']) {
      expect(service, `CasesService must expose no ${forbidden} method`).not.toMatch(
        new RegExp(`async\\s+${forbidden}`, 'i'),
      );
    }

    // And the controller exposes reads only — no verb that could carry a body.
    const controller = readFileSync('apps/api/src/cases/cases.controller.ts', 'utf8');
    const verbs = [...controller.matchAll(/@(Get|Post|Patch|Put|Delete)\(/g)].map((m) => m[1]);
    expect(verbs.length, 'the cases controller must declare routes').toBeGreaterThan(0);
    expect([...new Set(verbs)], 'cases must be read-only over HTTP').toEqual(['Get']);
  });

});
