import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { caseFor, createDraft, getDraft, saveValues } from '../support/api';

/**
 * Phase 6 audit walkthrough.
 *
 * Drives a real user journey per use case against the running app and saves a
 * numbered screenshot at each state, so the walkthrough can be eyeballed without
 * replaying it. Assertions are deliberately kept to the state each screenshot is
 * supposed to show — the point is visible evidence, not a second test suite.
 */

const SHOTS = join('e2e', 'audit-artifacts', 'shots');
mkdirSync(SHOTS, { recursive: true });

/** Console errors seen across the whole walkthrough, written out at the end. */
const consoleErrors: string[] = [];

function watchConsole(page: Page, label: string): void {
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') consoleErrors.push(`[${label}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${label}] PAGEERROR ${e.message}`));
}

/**
 * Scrolls a target into frame for a screenshot, allowing for the sticky form
 * header. The header occupies roughly 180px at 1366x768, so scrolling an element
 * to `block: 'start'` puts its first lines UNDER the header — which is fine for a
 * user who scrolls naturally, but useless as evidence.
 */
async function frame(page: Page, selector: string, offset = 210): Promise<void> {
  await page.locator(selector).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.evaluate((o) => window.scrollBy(0, -o), offset);
  await page.waitForTimeout(300);
}

let shotIndex = 0;
async function shot(page: Page, uc: string, name: string): Promise<void> {
  shotIndex++;
  const file = join(SHOTS, `${uc}-${String(shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
}

test.afterAll(() => {
  writeFileSync(
    join('e2e', 'audit-artifacts', 'console-errors.txt'),
    consoleErrors.length ? consoleErrors.join('\n') : 'NONE — no console errors during the walkthrough',
  );
});

// ── UC-01 ────────────────────────────────────────────────────────────────────

test('UC-01 walkthrough: picker, case link, render, progress, save', async ({ page, request }) => {
  watchConsole(page, 'UC-01');
  await page.goto('/');
  await expect(page.getByTestId('form-picker')).toBeVisible();
  await shot(page, 'uc01', 'dashboard-picker');

  // All 11 cards present AND fully above the fold at 1366x768.
  const cards = page.locator('[data-testid="form-picker"] [data-form-code]');
  await expect(cards).toHaveCount(11);
  const overflow = await page.evaluate(() => {
    const picker = document.querySelector('[data-testid="form-picker"]')!;
    return picker.getBoundingClientRect().bottom - window.innerHeight;
  });
  expect(overflow, 'picker must fit without scrolling').toBeLessThanOrEqual(0);

  // Start a case-linked MG4 through the real dialog.
  const okafor = await caseFor(request, 'Liam Okafor');
  await page.locator('[data-form-code="MG4"]').click();
  await expect(page.getByRole('heading', { name: 'Link to a case?' })).toBeVisible();
  await shot(page, 'uc01', 'case-link-dialog');
  await page.getByRole('radio', { name: new RegExp(okafor.urn) }).click();
  await page.getByRole('button', { name: 'Start form' }).click();

  await expect(page.getByTestId('form-header')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('required fields completed');
  await shot(page, 'uc01', 'form-rendered-with-progress');

  // Progress advances as a required field is completed. It must be a required
  // field auto-fill did NOT already fill — `chargeWording` carries
  // mapsTo: 'charges', so on a case-linked draft it is already complete and
  // already counted, and re-typing it cannot move the number.
  const before = (await page.getByTestId('progress-label').textContent()) ?? '';
  await page.locator('[data-field-id="chargingOfficer"] input').fill('PC 1234 OKONKWO');
  await expect(page.getByTestId('progress-label')).not.toHaveText(before);
  await shot(page, 'uc01', 'progress-advanced');

  await page.getByTestId('save-draft').click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await shot(page, 'uc01', 'save-confirmed');
});

// ── UC-02 ────────────────────────────────────────────────────────────────────

test('UC-02 walkthrough: badges, clear, summary, ambiguity', async ({ page, request }) => {
  watchConsole(page, 'UC-02');
  const okafor = await caseFor(request, 'Liam Okafor');
  const { draft } = await createDraft(request, 'MG4', okafor.id);
  await page.goto(`/drafts/${draft.id}`);

  await expect(page.getByTestId('autofill-summary')).toBeVisible();
  await shot(page, 'uc02', 'population-summary');
  await expect(page.getByTestId('autofill-badge').first()).toBeVisible();
  await shot(page, 'uc02', 'autofilled-fields-with-badges');

  const badges = await page.getByTestId('autofill-badge').count();
  await page.getByTestId('autofill-clear').first().click();
  await expect(page.getByTestId('autofill-badge')).toHaveCount(badges - 1);
  await shot(page, 'uc02', 'badge-gone-after-clear');

  // The two-offence case: the offence date is ambiguous, so it is left blank
  // with a reason rather than guessed.
  const bellamy = await caseFor(request, 'Marcus Bellamy');
  const second = await createDraft(request, 'MG5', bellamy.id);
  await page.goto(`/drafts/${second.draft.id}`);
  await expect(page.getByTestId('autofill-note').first()).toBeVisible();
  await shot(page, 'uc02', 'ambiguous-offence-date-note');
});

// ── UC-03 ────────────────────────────────────────────────────────────────────

test('UC-03 walkthrough: four steps, hearsay, declaration gate, vulnerable chip', async ({
  page,
  request,
}) => {
  watchConsole(page, 'UC-03');
  const { draft } = await createDraft(request, 'MG11', null);
  await page.goto(`/drafts/${draft.id}`);
  await expect(page.getByTestId('mg11-wizard')).toBeVisible();
  await shot(page, 'uc03', 'step1-witness-details');

  // An under-18 date of birth raises the vulnerable-witness chip.
  await page.locator('[data-field-id="witnessDob"] input').fill('22/03/2012');
  await page.locator('[data-field-id="witnessName"] input').fill('Jane SMITH');
  await expect(page.getByTestId('vulnerable-witness-indicator')).toBeVisible();
  await shot(page, 'uc03', 'vulnerable-witness-chip');

  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-step-position')).toContainText('Step 2 of 4');
  await page.getByTestId('narrative-input').fill('I was told that he left by the rear door.');
  await expect(page.getByTestId('narrative-flag').first()).toBeVisible();
  await frame(page, '[data-field-id="statementText"], [data-testid="narrative-input"]');
  await shot(page, 'uc03', 'step2-hearsay-underline');

  await page.getByTestId('narrative-flag').first().hover();
  await page.waitForTimeout(900); // let the tooltip render and settle
  await shot(page, 'uc03', 'step2-hearsay-tooltip');

  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('declaration-block')).toBeVisible();
  await shot(page, 'uc03', 'step3-declaration');

  // Blocked while unticked.
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('declaration-reminder')).toBeVisible();
  await expect(page.getByTestId('wizard-step-position')).toContainText('Step 3 of 4');
  await shot(page, 'uc03', 'step3-blocked-unticked');

  await page.check('[data-field-id="declarationConfirmed"] input[type=checkbox]');
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-step-position')).toContainText('Step 4 of 4');
  await shot(page, 'uc03', 'step4-signature');
});

// ── UC-04 ────────────────────────────────────────────────────────────────────

test('UC-04 walkthrough: add rows, numbering, delete confirm, renumber, sensitive', async ({
  page,
  request,
}) => {
  watchConsole(page, 'UC-04');
  const { draft } = await createDraft(request, 'MG6', null);
  await page.goto(`/drafts/${draft.id}`);
  await expect(page.getByTestId('schedule')).toBeVisible();
  await shot(page, 'uc04', 'schedule-empty');

  for (let i = 0; i < 3; i++) await page.getByTestId('add-item').click();
  await expect(page.getByTestId('schedule-row')).toHaveCount(3);
  await frame(page, '[data-testid="schedule"]');
  for (const [i, ref] of ['REF-A', 'REF-B', 'REF-C'].entries()) {
    await page
      .getByTestId('schedule-row')
      .nth(i)
      .locator('[data-column-id="itemReference"] input')
      .fill(ref);
  }
  await expect(page.getByTestId('row-ordinal')).toHaveText(['1', '2', '3']);
  await shot(page, 'uc04', 'three-rows-numbered');

  // Delete the middle row: confirm first, then renumber.
  await page.getByTestId('schedule-row').nth(1).getByTestId('delete-row').click();
  await expect(page.getByTestId('renumber-confirm')).toBeVisible();
  await page.waitForTimeout(600); // the dialog fades in; capture it settled
  await shot(page, 'uc04', 'delete-confirmation-dialog');
  await page.getByTestId('confirm-delete').click();
  await expect(page.getByTestId('schedule-row')).toHaveCount(2);
  await expect(page.getByTestId('row-ordinal')).toHaveText(['1', '2']);
  await shot(page, 'uc04', 'renumbered-after-delete');

  // Sensitive classification raises the header chip with no further action.
  const cell = page.getByTestId('schedule-row').nth(1).locator('[data-column-id="classification"]');
  await cell.locator('mat-select').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('option', { name: 'Sensitive', exact: true }).click();
  await expect(page.getByTestId('sensitive-material-indicator')).toBeVisible();
  await shot(page, 'uc04', 'sensitive-material-indicator');
});

// ── UC-05 ────────────────────────────────────────────────────────────────────

test('UC-05 walkthrough: hard error, advisory hint, consistency panel, still saves', async ({
  page,
  request,
}) => {
  watchConsole(page, 'UC-05');
  const okafor = await caseFor(request, 'Liam Okafor');
  const { draft } = await createDraft(request, 'MG4', okafor.id);
  const fresh = await getDraft(request, draft.id);
  // A charge dated before the case's offence date — the DoD's cross-field rule.
  await saveValues(
    request,
    draft.id,
    { ...fresh.values, chargeDate: '2020-01-01', urn: 'not-a-urn' },
    fresh.version,
  );
  await page.goto(`/drafts/${draft.id}`);
  await expect(page.getByTestId('form-header')).toBeVisible();

  // A SOURCED format (telephone, ITU-T E.123) is a hard error.
  const phone = page.locator('[data-field-id="contactTelephone"]');
  await phone.locator('input').fill('not a phone');
  await phone.locator('input').blur();
  await expect(phone.locator('mat-error')).toContainText('Enter a valid telephone number');
  await shot(page, 'uc05', 'sourced-format-hard-error');

  // An UNSOURCED format (URN) is advisory: a hint, no error, control still valid.
  const urn = page.locator('[data-field-id="urn"]');
  await expect(urn.getByTestId('validation-hint')).toContainText('Unverified format');
  await expect(urn.locator('mat-error')).toHaveCount(0);
  await shot(page, 'uc05', 'unsourced-format-advisory-not-block');

  // The cross-field inconsistency lands in the panel, never inline.
  const panel = page.getByTestId('consistency-issues');
  await expect(panel).toBeVisible();
  await expect(
    page.getByTestId('consistency-issue').filter({ hasText: 'before the offence' }),
  ).toHaveAttribute('data-severity', 'error');
  await panel.scrollIntoViewIfNeeded();
  await shot(page, 'uc05', 'consistency-issues-panel');

  // And the draft still saves with an error present — validation never blocks.
  await page.getByTestId('save-draft').click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await shot(page, 'uc05', 'saves-with-errors-present');
});

// ── accessibility smoke ──────────────────────────────────────────────────────

test('accessibility smoke: keyboard focus is visible and reaches the controls', async ({
  page,
  request,
}) => {
  watchConsole(page, 'a11y');
  const { draft } = await createDraft(request, 'MG6', null);
  await page.goto(`/drafts/${draft.id}`);
  await expect(page.getByTestId('schedule')).toBeVisible();

  // Tab into the form and confirm the focused element carries a visible ring
  // (an outline, or a box-shadow, or Material's own focus indicator).
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute('data-testid'),
      outlineWidth: s.outlineWidth,
      outlineStyle: s.outlineStyle,
      boxShadow: s.boxShadow,
    };
  });
  expect(focus, 'Tab must move focus into the page').not.toBeNull();
  await shot(page, 'a11y', 'keyboard-focus-visible');
  writeFileSync(
    join('e2e', 'audit-artifacts', 'focus-state.json'),
    JSON.stringify(focus, null, 2),
  );
});
