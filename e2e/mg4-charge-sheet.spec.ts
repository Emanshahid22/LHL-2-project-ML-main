import { expect, test } from './support/fixtures';
import { caseFor, createDraft, getDraft, saveValues } from './support/api';

/**
 * LER-1034 — MG4 Charge Sheet rebuilt from the sourced field set.
 * The acceptance criteria in docs/stories/LER-1034-mg4-charge-sheet.md are the
 * contract; these are the checks that hold it.
 */

/** The ids that existed before the rebuild. Renaming any of them destroys a
 *  live draft's stored value on its next autosave. */
const ORIGINAL_IDS = [
  'defendantName',
  'defendantAddress',
  'chargeWording',
  'chargeDate',
  'chargingOfficer',
  'courtName',
  'hearingDate',
  'bailConditions',
];

test.describe('MG4 charge sheet', () => {
  test('the template is rebuilt, provisionally verified (D-F), and every field carries provenance', async ({
    request,
  }) => {
    const mg4 = await (await request.get('/api/form-templates/MG4')).json();

    // At least 2: the rebuild took it from 1, and it rises again whenever rules
    // change (UC-05 added format and cross-field rules). Pinning an exact number
    // would make every future rule change a false failure.
    expect(mg4.templateVersion).toBeGreaterThanOrEqual(2);
    // D-F (provisional, docs/decisions/layout-verification-record.md): MG4 is
    // one of the six specimen-matched templates flagged 'verified'.
    expect(mg4.verification).toBe('verified');
    expect(mg4.fields.length).toBeGreaterThanOrEqual(30);

    // Nothing invented: every field states the evidence behind it.
    for (const field of mg4.fields) {
      expect(['documented', 'likely', 'inference'], `${field.id} provenance`).toContain(
        field.provenance,
      );
    }
    // No field ids collide.
    const ids = mg4.fields.map((f: { id: string }) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('all eight original field ids survive the rebuild', async ({ request }) => {
    const mg4 = await (await request.get('/api/form-templates/MG4')).json();
    const ids = mg4.fields.map((f: { id: string }) => f.id);
    for (const id of ORIGINAL_IDS) {
      expect(ids, `original id ${id} must not be renamed or removed`).toContain(id);
    }
  });

  test('a draft saved before the rebuild still loads its values', async ({ page, request }) => {
    // Stand in for a pre-existing draft: values stored under the original ids.
    const { draft } = await createDraft(request, 'MG4', null);
    const fresh = await getDraft(request, draft.id);
    await saveValues(
      request,
      draft.id,
      {
        defendantName: 'Legacy Defendant',
        chargingOfficer: 'PC 1234 Legacy',
        bailConditions: 'Reside at the address given',
      },
      fresh.version,
    );

    await page.goto(`/drafts/${draft.id}`);
    await expect(page.locator('[data-field-id="defendantName"] input')).toHaveValue(
      'Legacy Defendant',
    );
    await expect(page.locator('[data-field-id="chargingOfficer"] input')).toHaveValue(
      'PC 1234 Legacy',
    );
    await expect(page.locator('[data-field-id="bailConditions"] textarea')).toHaveValue(
      'Reside at the address given',
    );
  });

  test('the D-F-verified MG4 loses the unverified indicator — through the real flag', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG4', null);
    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('form-header')).toBeVisible();
    await expect(page.getByTestId('unverified-template')).toHaveCount(0);
  });

  test('a template with no verification marker is labelled too', async ({ page, request }) => {
    // MG5 carries no `verification` property at all — "not yet assessed",
    // which is even further from sign-off than the literal 'unverified'. The
    // absence of the marker must never read as filing-ready. (This regressed
    // once: strict equality against 'unverified' silently dropped the label on
    // all the markerless templates, and an earlier version of this very test
    // asserted that behaviour as correct — using MG11, which has since gained
    // the literal marker via its sourcing pass, hence MG5 as today's absent
    // fixture.)
    const { draft } = await createDraft(request, 'MG5', null);
    await page.goto(`/drafts/${draft.id}`);

    const chip = page.getByTestId('unverified-template');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('pending practitioner sign-off');

    // And the literal 'unverified' state: MG3 keeps the explicit marker
    // (no specimen exists for it — D-F left it unverified), so both
    // unverified states show the label. (MG11 moved to the verified six.)
    const mg3 = await createDraft(request, 'MG3', null);
    await page.goto(`/drafts/${mg3.draft.id}`);
    await expect(page.getByTestId('unverified-template')).toBeVisible();
  });

  test('a verified template loses the label; the unverified five keep it (MG5 positive)', async ({
    page,
    request,
  }) => {
    // Since D-F the verified branch is real (MG11 is in the six) — no route
    // mock needed. The positive control stays MG5: no verification property,
    // partial specimen match, deliberately unverified.
    const { draft } = await createDraft(request, 'MG11', null);
    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('form-header')).toBeVisible();
    await expect(page.getByTestId('unverified-template')).toHaveCount(0);

    const mg5 = await createDraft(request, 'MG5', null);
    await page.goto(`/drafts/${mg5.draft.id}`);
    await expect(page.getByTestId('unverified-template')).toBeVisible();
  });

  test('every field renders, grouped into its sections', async ({ page, request }) => {
    const mg4 = await (await request.get('/api/form-templates/MG4')).json();
    const { draft } = await createDraft(request, 'MG4', null);
    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('form-header')).toBeVisible();

    for (const field of mg4.fields) {
      await expect(
        page.locator(`[data-field-id="${field.id}"]`),
        `field ${field.id} must render`,
      ).toHaveCount(1);
    }
    // Section headings come from the template's `section` values.
    const sections = [...new Set(mg4.fields.map((f: { section?: string }) => f.section))].filter(
      Boolean,
    );
    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections) {
      await expect(page.locator('.section-title', { hasText: String(section) })).toHaveCount(1);
    }
  });

  test('auto-fill populates exactly the mapped fields and nothing else', async ({
    page,
    request,
  }) => {
    const foster = await caseFor(request, 'Daniel Foster');
    const mg4 = await (await request.get('/api/form-templates/MG4')).json();
    const mapped: string[] = mg4.fields
      .filter((f: { mapsTo?: string }) => f.mapsTo)
      .map((f: { id: string }) => f.id);
    expect(mapped.length).toBeGreaterThan(0);

    const { draft } = await createDraft(request, 'MG4', foster.id);
    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('autofill-summary')).toBeVisible();

    const after = await getDraft(request, draft.id);
    // Only mapped fields were written.
    for (const [id, value] of Object.entries(after.values)) {
      if (value === '' || value === false || value === null) continue;
      expect(mapped, `${id} was filled but is not a mapped field`).toContain(id);
    }
    // And the provenance recorded is the case, for mapped fields that filled.
    for (const id of Object.keys(after.autoFill)) {
      expect(mapped).toContain(id);
      expect(after.autoFill[id].source).toBe('case');
    }
  });

  test('no field maps case data to something that is not that datum', async ({ request }) => {
    const mg4 = await (await request.get('/api/form-templates/MG4')).json();
    const byId = new Map(mg4.fields.map((f: { id: string; mapsTo?: string }) => [f.id, f.mapsTo]));

    // The five mappings that existed before the rebuild are preserved.
    expect(byId.get('defendantName')).toBe('defendantName');
    expect(byId.get('defendantAddress')).toBe('defendantAddress');
    expect(byId.get('chargeWording')).toBe('charges');
    expect(byId.get('courtName')).toBe('courtName');
    expect(byId.get('hearingDate')).toBe('nextHearingAt');

    // Officers who are NOT the officer in the case stay unmapped, per the MG11
    // witness-name and MG16 subjectName precedents.
    expect(byId.get('chargingOfficer')).toBeUndefined();
    expect(byId.get('chargeAcceptedBy')).toBeUndefined();
    expect(byId.get('officerGrantingBail')).toBeUndefined();
    // Signatures are never case data.
    expect(byId.get('signaturePersonCharged')).toBeUndefined();
    expect(byId.get('signatureAppropriateAdult')).toBeUndefined();
    expect(byId.get('signaturePersonBailed')).toBeUndefined();
  });

  test('dates that cannot be in the future carry the rule and render as DD/MM/YYYY', async ({
    page,
    request,
  }) => {
    const mg4 = await (await request.get('/api/form-templates/MG4')).json();
    for (const id of ['dateOfBirth', 'firstArrestDate', 'chargeDate']) {
      const field = mg4.fields.find((f: { id: string }) => f.id === id);
      expect(field?.validation?.noFutureDate, `${id} must forbid future dates`).toBe(true);
    }

    const { draft } = await createDraft(request, 'MG4', null);
    await page.goto(`/drafts/${draft.id}`);
    const input = page.locator('[data-field-id="chargeDate"] input');
    await expect(input).toHaveAttribute('placeholder', 'DD/MM/YYYY');

    await input.fill('01/01/2099');
    await input.blur();
    await expect(page.locator('[data-field-id="chargeDate"] mat-error')).toContainText(
      'cannot be in the future',
    );
  });
});
