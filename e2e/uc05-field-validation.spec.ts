import { expect, test } from './support/fixtures';
import { type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import {
  FIELD_FORMATS,
  FORM_TEMPLATES,
  getFormTemplate,
  severityFor,
  validateForm,
} from '@mgs/shared';
import { auditEventsFor, caseFor, createDraft, getDraft, saveValues } from './support/api';

/** The seeded single-offence case, and its one offence date. */
async function singleOffenceCase(request: import('@playwright/test').APIRequestContext) {
  // Isla Fenwick is UC-05's DEDICATED write fixture (LER-1269): these tests
  // persist deliberately malformed URNs on case-linked drafts, which UC-08's
  // case-wide Check 3 correctly flags as blocking — so they land on a case no
  // other suite reads (e2e/FIXTURES.md). Single offence AND a listed hearing,
  // so both the ordering rule and the after-hearing advisory run here.
  const c = await caseFor(request, 'Isla Fenwick');
  expect(c.offences).toHaveLength(1);
  return { id: c.id, offenceDate: c.offences[0].offenceDate.slice(0, 10) };
}

/** Seeds values through the API, then opens the form so the page renders them. */
async function openWith(
  page: Page,
  request: import('@playwright/test').APIRequestContext,
  formCode: string,
  caseId: string | null,
  values: Record<string, unknown>,
): Promise<string> {
  const { draft } = await createDraft(request, formCode, caseId);
  const fresh = await getDraft(request, draft.id);
  await saveValues(request, draft.id, values, fresh.version);
  await page.goto(`/drafts/${draft.id}`);
  await expect(page.getByTestId('form-header')).toBeVisible();
  return draft.id;
}

const issues = (page: Page) => page.getByTestId('consistency-issue');

/**
 * Opens a select from the keyboard.
 *
 * A long label fills the whole control, so a centre-point click lands on the
 * label and Playwright refuses it as an intercepted hit target. A real user's
 * click still opens the select (Material forwards a container click), so this is
 * a harness concern — and the keyboard route is what an assistive-technology user
 * does anyway.
 */
async function openSelect(page: Page, fieldId: string): Promise<void> {
  const select = page.locator(`[data-field-id="${fieldId}"] mat-select`);
  await select.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('mat-option').first()).toBeVisible();
}

test.describe('UC-05 field validation', () => {
  // ── DoD: per-field format validation with inline hints

  test('an unsourced format shows an advisory hint and blocks nothing', async ({ page, request }) => {
    const id = await openWith(page, request, 'MG4', null, { urn: 'not-a-urn' });

    const hint = page.locator('[data-field-id="urn"]').getByTestId('validation-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Unverified format');

    // Advisory: the control stays valid, so no inline error and no block.
    await expect(page.locator('[data-field-id="urn"] mat-error')).toHaveCount(0);
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('save-status')).toContainText('Saved');

    // And it really is stored — an unsourced format never refuses a value.
    const saved = await getDraft(request, id);
    expect(saved.values['urn']).toBe('not-a-urn');
  });

  test('a sourced format is a hard error on the field', async ({ page, request }) => {
    await openWith(page, request, 'MG11', null, {});
    const field = page.locator('[data-field-id="witnessPhone"]');
    await field.locator('input').fill('not a phone');
    await field.locator('input').blur();

    await expect(field.locator('mat-error')).toContainText('Enter a valid telephone number');
    // A blocking format shows an error, not an advisory hint.
    await expect(field.getByTestId('validation-hint')).toHaveCount(0);
  });

  test('required fields are caught across three MG form types', async ({ page, request }) => {
    // The scope's DoD says three form types. MG11, MG4 and MG6 between them cover
    // text, textarea, date, select, checkbox, a required group and a conditional.
    for (const [formCode, fieldId, selector] of [
      ['MG11', 'witnessName', 'input'],
      ['MG4', 'defendantName', 'input'],
      ['MG6', 'disclosureOfficer', 'input'],
    ] as const) {
      await openWith(page, request, formCode, null, {});
      const field = page.locator(`[data-field-id="${fieldId}"]`);
      await field.locator(selector).click();
      await field.locator(selector).blur();
      await expect(field.locator('mat-error'), `${formCode}.${fieldId}`).toContainText(
        'This field is required',
      );
    }
  });

  test('a date field offers a format hint while it is focused', async ({ page, request }) => {
    await openWith(page, request, 'MG11', null, {});
    const field = page.locator('[data-field-id="witnessDob"]');
    await expect(field.getByTestId('format-hint')).toHaveCount(0);

    await field.locator('input').click();
    await expect(field.getByTestId('format-hint')).toContainText('DD/MM/YYYY');

    // Once a real date is in, the hint has nothing to say.
    await field.locator('input').fill('22/03/1990');
    await expect(field.getByTestId('format-hint')).toHaveCount(0);
  });

  // ── DoD: cross-field consistency, offence-vs-charge as case-datum-vs-form-field

  test('a charge dated before the offence is flagged as an error', async ({ page, request }) => {
    const c = await singleOffenceCase(request);
    await openWith(page, request, 'MG4', c.id, { chargeDate: '2020-01-01' });

    const panel = page.getByTestId('consistency-issues');
    await expect(panel).toBeVisible();
    const issue = issues(page).filter({ hasText: 'cannot be dated before the offence' });
    await expect(issue).toBeVisible();
    await expect(issue).toHaveAttribute('data-severity', 'error');
    await expect(issue).toHaveAttribute('data-issue-field', 'chargeDate');
  });

  test('a charge on or after the offence date is not flagged', async ({ page, request }) => {
    const c = await singleOffenceCase(request);

    // Same day is normal practice.
    await openWith(page, request, 'MG4', c.id, { chargeDate: c.offenceDate });
    await expect(issues(page).filter({ hasText: 'before the offence' })).toHaveCount(0);

    // And later still — derived from the fixture's offence date (LER-1269),
    // so the test states its dependency instead of pinning a calendar.
    const later = new Date(Date.parse(c.offenceDate) + 30 * 86_400_000).toISOString().slice(0, 10);
    await openWith(page, request, 'MG4', c.id, { chargeDate: later });
    await expect(issues(page).filter({ hasText: 'before the offence' })).toHaveCount(0);
  });

  test('an ambiguous case suppresses the check and explains why', async ({ page, request }) => {
    // Marcus Bellamy carries two offences with different dates, so UC-02 resolves
    // `offenceDate` as ambiguous. The rule must not guess which one to compare.
    const bellamy = await caseFor(request, 'Marcus Bellamy');
    expect(bellamy.offences.length).toBeGreaterThan(1);
    await openWith(page, request, 'MG4', bellamy.id, { chargeDate: '2020-01-01' });

    const issue = issues(page).filter({ hasText: 'could not be checked against the case file' });
    await expect(issue).toBeVisible();
    await expect(issue).toHaveAttribute('data-severity', 'suppressed');
    await expect(issue).toContainText('offence dates');
    // Suppressed is not an error: nothing is asserted to be wrong.
    await expect(issues(page).filter({ hasText: 'cannot be dated before' })).toHaveCount(0);
  });

  test('a standalone draft suppresses the check silently', async ({ page, request }) => {
    await openWith(page, request, 'MG4', null, { chargeDate: '2020-01-01' });
    // No case, so nothing to compare against and nothing to explain.
    await expect(page.getByTestId('consistency-issues')).toHaveCount(0);
  });

  test('cross-field findings never appear in a field inline slot', async ({ page, request }) => {
    const c = await singleOffenceCase(request);
    await openWith(page, request, 'MG4', c.id, { chargeDate: '2020-01-01' });

    // The scope: "Cross-field errors shown in a 'Consistency Issues' panel below
    // the form section, not inline."
    await expect(issues(page).filter({ hasText: 'before the offence' })).toBeVisible();
    // Scoped to the form, so the panel's own item cannot satisfy it — the panel
    // deliberately uses `data-issue-field`, not the renderer's `data-field-id`.
    const inline = page.locator('app-dynamic-form [data-field-id="chargeDate"]');
    await expect(inline).toHaveCount(1);
    await expect(inline.getByText('before the offence')).toHaveCount(0);
    await expect(inline.locator('mat-error')).toHaveCount(0);
  });

  test('a hearing before the charge date, and an interview ending before it starts', async ({
    page,
    request,
  }) => {
    await openWith(page, request, 'MG4', null, {
      chargeDate: '2026-01-10',
      hearingDate: '2026-01-05',
    });
    await expect(issues(page).filter({ hasText: 'hearing cannot be listed before' })).toHaveAttribute(
      'data-severity',
      'error',
    );

    // The only cross-field pair that exists within one template today.
    await openWith(page, request, 'MG15', null, { interviewStart: '14:00', interviewEnd: '13:00' });
    await expect(issues(page).filter({ hasText: 'must end after it starts' })).toHaveAttribute(
      'data-severity',
      'error',
    );
  });

  test('an unusual-but-legal ordering is advisory, not an error', async ({ page, request }) => {
    // A statement dated after the listed hearing is ordinary for a further
    // statement, so it must advise rather than block. Its sibling rule — a
    // statement before the witness was born — is an error, on the same field.
    // Isla Fenwick (the UC-05 fixture) has one offence AND a listed hearing —
    // required, because on a case with no hearing this advisory could never
    // fire (LER-1269: dedicated fixtures, e2e/FIXTURES.md).
    const c = await caseFor(request, 'Isla Fenwick');
    expect(c.nextHearingAt).toBeTruthy();
    const after = new Date(new Date(c.nextHearingAt!).getTime() + 86_400_000)
      .toISOString()
      .slice(0, 10);

    await openWith(page, request, 'MG11', c.id, { witnessDob: '1990-01-01', statementDate: after });
    await expect(issues(page).filter({ hasText: 'dated after the listed hearing' })).toHaveAttribute(
      'data-severity',
      'advisory',
    );

    await openWith(page, request, 'MG11', c.id, {
      witnessDob: '1990-01-01',
      statementDate: '1985-01-01',
    });
    await expect(issues(page).filter({ hasText: 'before the witness was born' })).toHaveAttribute(
      'data-severity',
      'error',
    );
  });

  test('a conditional requirement activates, counts and lifts', async ({ page, request }) => {
    await openWith(page, request, 'MG6', null, {});
    const before = await page.getByTestId('progress-label').textContent();

    await openSelect(page, 'underminesCase');
    await page.getByRole('option', { name: 'Yes', exact: true }).click();

    const issue = issues(page).filter({ hasText: 'is required because' });
    await expect(issue).toBeVisible();
    await expect(issue).toHaveAttribute('data-severity', 'error');
    // The denominator grows: progress must not read complete while a required
    // answer is missing.
    await expect(page.getByTestId('progress-label')).not.toHaveText(before ?? '');

    await openSelect(page, 'underminesCase');
    await page.getByRole('option', { name: 'No', exact: true }).click();
    await expect(issue).toHaveCount(0);
  });

  test('findings clear automatically when the value is corrected', async ({ page, request }) => {
    const c = await singleOffenceCase(request);
    await openWith(page, request, 'MG4', c.id, { chargeDate: '2020-01-01', urn: 'not-a-urn' });

    // Cross-field finding, and an advisory hint, both present.
    await expect(issues(page).filter({ hasText: 'before the offence' })).toBeVisible();
    await expect(page.locator('[data-field-id="urn"]').getByTestId('validation-hint')).toBeVisible();

    // Correcting the advisory clears the hint with no blur, save or reload.
    await page.locator('[data-field-id="urn"] input').fill('01AB0123456/24');
    await expect(page.locator('[data-field-id="urn"]').getByTestId('validation-hint')).toHaveCount(0);

    // Correcting the date clears the cross-field finding. Derived from the
    // fixture's own offence date rather than a literal, so the test states its
    // real dependency (a charge on/after the offence) instead of silently
    // coupling to one seeded calendar (LER-1269).
    const [oy, om, od] = c.offenceDate.split('-');
    await page.locator('[data-field-id="chargeDate"] input').fill(`${od}/${om}/${oy}`);
    await expect(issues(page).filter({ hasText: 'before the offence' })).toHaveCount(0);

    // And a plain required error clears the same way.
    const name = page.locator('[data-field-id="defendantName"]');
    await name.locator('input').click();
    await name.locator('input').blur();
    await expect(name.locator('mat-error')).toBeVisible();
    await name.locator('input').fill('Liam OKAFOR');
    await expect(name.locator('mat-error')).toHaveCount(0);
  });

  test('the not-sign-off caveat follows the verification flag (absent on D-F MG4, present when unverified)', async ({
    page,
    request,
  }) => {
    // D-F flagged MG4 'verified' (provisional), so the caveat is gone there…
    await openWith(page, request, 'MG4', null, { chargeDate: '2026-01-10', hearingDate: '2026-01-05' });
    await expect(page.getByTestId('consistency-caveat')).toHaveCount(0);

    // …and still present for an unverified template with the same findings —
    // exercised at the browser boundary (the real unverified forms carry no
    // date-order rule to trip the panel with).
    await page.route('**/api/form-templates/MG4*', async (route) => {
      const response = await route.fetch();
      const template = await response.json();
      await route.fulfill({ response, json: { ...template, verification: 'unverified' } });
    });
    await openWith(page, request, 'MG4', null, { chargeDate: '2026-01-10', hearingDate: '2026-01-05' });
    await expect(page.getByTestId('consistency-caveat')).toContainText('not sign-off');
  });

  // ── DoD: server-side enforcement parity with the client

  test('the API records the findings the browser shows, and never 4xxs a draft for them', async ({
    request,
  }) => {
    const c = await singleOffenceCase(request);
    const { draft } = await createDraft(request, 'MG4', c.id);
    const fresh = await getDraft(request, draft.id);
    const values = { chargeDate: '2020-01-01', urn: 'not-a-urn' };

    // A semantic violation SAVES. A form is invalid for most of the time a human
    // is filling it in; rejecting would break autosave.
    const saved = await saveValues(request, draft.id, values, fresh.version);
    expect(saved.values['chargeDate']).toBe('2020-01-01');

    // The server's counts come from the same shared function the browser renders.
    const expected = validateForm(getFormTemplate('MG4')!, values, {
      ...c,
      offences: [{ id: 'x', offenceDate: `${c.offenceDate}T00:00:00.000Z`, chargeWording: 'w' }],
    } as never);
    const errors = expected.filter((f) => !f.suppressed && f.severity === 'error').length;
    const advisories = expected.filter((f) => !f.suppressed && f.severity === 'advisory').length;

    const event = (await auditEventsFor(draft.id)).filter((e) => e.action === 'DRAFT_SAVED').pop();
    expect(event!.metadata).toMatchObject({
      validationErrorCount: errors,
      validationAdvisoryCount: advisories,
    });
    expect(errors).toBe(1);
    expect(advisories).toBe(1);
    // Counts only — no field value and no failing string reaches the audit trail.
    expect(JSON.stringify(event!.metadata)).not.toContain('not-a-urn');
  });

  test('the type-shape guard rejects only what cannot be stored', async ({ request }) => {
    const { draft } = await createDraft(request, 'MG4', null);
    const fresh = await getDraft(request, draft.id);

    for (const [why, values] of [
      ['an object where a scalar belongs', { defendantName: { a: 1 } }],
      ['a list where a scalar belongs', { defendantName: ['x'] }],
      ['a non-boolean tick', { unconditionalBailGranted: 'yes' }],
    ] as const) {
      const res = await request.patch(`/api/drafts/${draft.id}`, {
        data: { values, baseVersion: fresh.version },
      });
      expect(res.status(), `422 for ${why}`).toBe(422);
    }

    // The date adapter stores 'invalid' for unparseable input and autosave saves
    // it, so the guard must NOT reject that — it already saves today.
    const ok = await request.patch(`/api/drafts/${draft.id}`, {
      data: { values: { dateOfBirth: 'invalid' }, baseVersion: fresh.version },
    });
    expect(ok.status(), "the 'invalid' date sentinel must still save").toBe(200);
  });

  // ── DoD: no statutory format shipped as error without a cited source

  test('only a sourced format can block, and the case-file references cannot', async () => {
    for (const [name, format] of Object.entries(FIELD_FORMATS)) {
      const canBlock = severityFor(format) === 'error';
      if (canBlock) {
        expect(format.provenance, `${name} blocks, so it must be documented`).toBe('documented');
        expect(format.source?.trim(), `${name} blocks, so it must cite a source`).toBeTruthy();
      }
      // Every pattern must at least match its own example.
      expect(new RegExp(format.pattern).test(format.example), `${name} example`).toBe(true);
    }

    // The five case-file references are unsourced, so none of them can block.
    for (const name of ['urn', 'asn', 'custodyNumber', 'collarNumber', 'cpsReference'] as const) {
      expect(severityFor(FIELD_FORMATS[name]), name).toBe('advisory');
    }
  });

  test('conformance fails a template that asks a blocking rule of an unsourced format', async () => {
    const script = `
      const { checkTemplate } = require('@mgs/shared');
      const t = {
        code: 'MG1', name: 'x', description: 'x', templateVersion: 1,
        fields: [{ id: 'urn', label: 'URN', type: 'text', required: true,
                   helpText: 'Long enough help text to clear the structural floor.',
                   validation: { format: 'urn', severity: 'error' } }],
      };
      const rules = checkTemplate(t).filter(f => f.severity === 'error').map(f => f.rule);
      if (!rules.includes('format-severity')) throw new Error('gate missed it: ' + rules.join(','));
      console.log('gate caught it');
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(`${result.stdout}${result.stderr}`).toContain('gate caught it');
    expect(result.status).toBe(0);
  });

  test('no composite officer field carries a format rule, and two formats are unreferenced', async () => {
    // Collar numbers live inside composite "name, rank and collar number" boxes.
    // A pattern over one would reject correct input, so none carries one.
    for (const [code, fieldId] of [
      ['MG1', 'officerInCase'],
      ['MG3', 'officerInCase'],
      ['MG4', 'officerInCase'],
      ['MG5', 'officerCompleting'],
      ['MG16', 'officerCompleting'],
    ] as const) {
      const field = getFormTemplate(code)!.fields.find((f) => f.id === fieldId);
      expect(field, `${code}.${fieldId} exists`).toBeTruthy();
      expect(field!.validation?.format, `${code}.${fieldId} must carry no format`).toBeUndefined();
    }

    // No template has a CPS reference or a bare collar-number box, so both
    // formats exist in the registry referenced by nothing. If a field is added
    // later, this check fails and forces the rule to be wired up deliberately.
    const referenced = new Set(
      FORM_TEMPLATES.flatMap((t) => t.fields.map((f) => f.validation?.format).filter(Boolean)),
    );
    expect(referenced.has('cpsReference')).toBe(false);
    expect(referenced.has('collarNumber')).toBe(false);
  });

  // ── audit remediation: the two UC-05 NO-COVERAGE rows from the 19 Aug audit

  test('no error is shown while the field still has focus', async ({ page, request }) => {
    // LER-1209's first criterion. Errors are gated on `touched`, which Material
    // sets on blur — so an invalid value must say nothing until focus leaves.
    await openWith(page, request, 'MG11', null, {});
    const field = page.locator('[data-field-id="witnessPhone"]');

    await field.locator('input').click();
    await field.locator('input').type('not a phone', { delay: 10 });
    // Still focused: the value is already invalid, and the field stays quiet.
    await expect(field.locator('input')).toBeFocused();
    await expect(field.locator('mat-error')).toHaveCount(0);

    // Leaving the field is what speaks.
    await field.locator('input').blur();
    await expect(field.locator('mat-error')).toContainText('Enter a valid telephone number');

    // And a required field behaves the same way — untouched and empty says nothing.
    const name = page.locator('[data-field-id="witnessName"]');
    await expect(name.locator('mat-error')).toHaveCount(0);
    await name.locator('input').click();
    await name.locator('input').blur();
    await expect(name.locator('mat-error')).toContainText('This field is required');
  });

  test('a cross-field finding names both fields involved', async ({ page, request }) => {
    // LER-1216's second criterion. Both operands are identified on the finding,
    // not just the field it hangs off — a sibling-field rule and a case-datum rule
    // are checked, because they resolve their second operand differently.
    await openWith(page, request, 'MG4', null, {
      chargeDate: '2026-01-10',
      hearingDate: '2026-01-05',
    });
    const siblingRule = issues(page).filter({ hasText: 'hearing cannot be listed before' });
    await expect(siblingRule).toHaveAttribute('data-issue-field', 'hearingDate');
    // The other operand is identified by its STABLE id (LER-1271): the human
    // label lives in the message; the attribute keys tooling and — downstream —
    // the review engine's acknowledgement-bearing issue ids, which must not
    // change shape when someone edits a label.
    await expect(siblingRule).toHaveAttribute('data-issue-related', 'chargeDate');
    // And the row states the relationship that failed, not merely that one failed.
    await expect(siblingRule).toContainText('cannot be listed before');

    // A case-datum rule names the case file as the second operand.
    const c = await singleOffenceCase(request);
    await openWith(page, request, 'MG4', c.id, { chargeDate: '2020-01-01' });
    const caseRule = issues(page).filter({ hasText: 'before the offence' });
    await expect(caseRule).toHaveAttribute('data-issue-field', 'chargeDate');
    await expect(caseRule).toHaveAttribute('data-issue-related', /offenceDate/);
  });

  test('conformance and orphan-scan stay green with the validation rules', async () => {
    for (const script of ['conformance', 'orphan-scan']) {
      const result = spawnSync('npm', ['run', script], { cwd: process.cwd(), encoding: 'utf8' });
      expect(result.status, `npm run ${script}:\n${result.stdout}${result.stderr}`).toBe(0);
    }
  });
});
