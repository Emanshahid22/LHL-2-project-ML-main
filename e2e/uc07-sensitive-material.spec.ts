import { expect, test } from './support/fixtures';
import { type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  GROUP_ROW_ID_KEY,
  PII_PRACTICE_DIRECTION,
  PII_STEPS,
  SENSITIVE_HANDLING_INSTRUCTIONS,
  SENSITIVE_HANDLING_SHA256,
  SENSITIVE_MATERIAL_FLAG_KEY,
  SENSITIVE_PERMISSION_LEVEL,
} from '@mgs/shared';
import {
  acknowledgementsFor,
  auditEventsFor,
  createDraft,
  getDraft,
  recordDraft,
  saveValues,
} from './support/api';
import { COLLEAGUE, COLLEAGUE_EMAIL, pageAs } from './support/auth';

/**
 * UC-07 Sensitive Material Handling.
 *
 * The four scope DoD lines each have named checks below; the section headers
 * quote them verbatim. The guard checks are REAL HTTP calls against the API —
 * the scope's own wording for DoD 2 — because Angular form state is
 * presentation and the endpoint is the boundary.
 */

const SCHEDULE = 'unusedMaterialItems';
const MG6D = 'sensitiveScheduleItems';
const DEMO_EMAIL = 'demo.solicitor@example.co.uk';


/** The text of the planted sensitive item — asserted ABSENT from exports. */
const SENSITIVE_MARKER = 'Identity of informant HORNET';

function scheduleRow(reference: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [GROUP_ROW_ID_KEY]: `row-${reference}`,
    itemReference: reference,
    description: `Item ${reference}`,
    materialType: 'document',
    classification: 'non_sensitive',
    ...over,
  };
}

function sensitiveRow(reference: string): Record<string, unknown> {
  return scheduleRow(reference, {
    description: SENSITIVE_MARKER,
    materialType: 'document',
    classification: 'sensitive',
  });
}

function mg6dRow(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [GROUP_ROW_ID_KEY]: id,
    description: SENSITIVE_MARKER,
    location: 'DS safe, Lewisham station',
    sensitivityReason: 'Would reveal the identity of an informant',
    ...over,
  };
}

/** A draft whose schedule already holds one sensitive + one plain item. */
async function activatedDraft(request: APIRequestContext) {
  const { draft } = await createDraft(request, 'MG6', null);
  const saved = await saveValues(
    request,
    draft.id,
    { [SCHEDULE]: [scheduleRow('UM-1', { materialType: 'cctv', description: 'CCTV from the shop' }), sensitiveRow('UM-2')] },
    draft.version,
  );
  return saved;
}

/** Confirms the handling instructions over HTTP and returns the confirmation id. */
async function confirmHandling(request: APIRequestContext, draftId: string): Promise<string> {
  const res = await request.post(`/api/drafts/${draftId}/sensitive/confirmations`, {
    data: { kind: 'HANDLING_INSTRUCTIONS' },
  });
  expect(res.status(), 'confirmation recorded').toBe(201);
  const body = await res.json();
  return body.id as string;
}

/** Drives the UI gate: tick the checkbox, press Confirm, wait for the unlock. */
async function confirmInUi(page: Page): Promise<void> {
  await page.getByTestId('sensitive-read-checkbox').locator('input').check();
  await page.getByTestId('sensitive-confirm').click();
  await expect(page.getByTestId('pii-panel')).toBeVisible();
}

test.describe('UC-07 sensitive material handling', () => {
  // ── DoD 1: "Sensitive material flag (MG6D) triggers the mandatory handling
  //           instruction every time without exception" ──────────────────────

  test('classifying a row Sensitive activates the MG6D section immediately, no save needed', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('sensitive-section')).toHaveCount(0);

    // Build one row through the UI and classify it Sensitive.
    await page.getByTestId('add-item').click();
    const row = page.getByTestId('schedule-row').first();
    await row.locator('[data-column-id="itemReference"] input').fill('UM-1');
    await row.locator('[data-column-id="description"] input').fill('Surveillance log');
    await row.locator('[data-column-id="materialType"] mat-select').click();
    await page.getByRole('option', { name: 'Document', exact: true }).click();
    await row.locator('[data-column-id="classification"] mat-select').click();
    await page.getByRole('option', { name: 'Sensitive', exact: true }).click();

    // The section and its banner appear the moment the select changes — before
    // any save. The server block (and with it the instructions) arrives with
    // the autosave a moment later.
    await expect(page.getByTestId('sensitive-section')).toBeVisible();
    await expect(page.getByTestId('sensitive-banner')).toContainText('Sensitive — Restricted Access');
    await expect(page.getByTestId('handling-instructions')).toBeVisible();

    // UC-04's header chip is unchanged by UC-07.
    await expect(page.getByTestId('sensitive-material-indicator')).toBeVisible();
  });

  test('a second, fresh draft triggers the same handling — no exception', async ({
    page,
    request,
  }) => {
    const saved = await activatedDraft(request);
    await page.goto(`/drafts/${saved.id}`);
    await expect(page.getByTestId('sensitive-section')).toBeVisible();
    await expect(page.getByTestId('handling-instructions')).toBeVisible();
    // Every shipped instruction sentence renders, each with its citation.
    for (const line of SENSITIVE_HANDLING_INSTRUCTIONS) {
      await expect(page.getByTestId('handling-instructions')).toContainText(line.text);
    }
    await expect(page.getByTestId('instruction-source')).toHaveCount(
      SENSITIVE_HANDLING_INSTRUCTIONS.length,
    );
    await expect(page.getByTestId('handling-notice')).toContainText('not been verified');
  });

  test('deactivation un-flags the draft while MG6D content survives, dormant, and returns', async ({
    request,
  }) => {
    const saved = await activatedDraft(request);
    const confirmationId = await confirmHandling(request, saved.id);

    // Complete MG6D, then reclassify the sensitive row.
    const withMg6d = await saveValues(
      request,
      saved.id,
      { [SCHEDULE]: saved.values[SCHEDULE], [MG6D]: [mg6dRow('mg6d-1')] },
      saved.version,
      { sensitiveConfirmationId: confirmationId },
    );
    expect(withMg6d.values[SENSITIVE_MATERIAL_FLAG_KEY]).toBe(true);

    const deactivated = await saveValues(
      request,
      saved.id,
      { [SCHEDULE]: [scheduleRow('UM-1'), scheduleRow('UM-2')] },
      withMg6d.version,
    );
    // The flag is removed, not latched…
    expect(deactivated.values[SENSITIVE_MATERIAL_FLAG_KEY]).toBeUndefined();
    expect(deactivated.sensitiveSection?.active).toBe(false);
    // …and the MG6D rows were preserved server-side (merge-preserve), dormant.
    expect(deactivated.values[MG6D]).toHaveLength(1);

    const reactivated = await saveValues(
      request,
      saved.id,
      { [SCHEDULE]: [scheduleRow('UM-1'), sensitiveRow('UM-2')] },
      deactivated.version,
    );
    expect(reactivated.sensitiveSection?.active).toBe(true);
    expect(reactivated.values[MG6D]).toHaveLength(1);
  });

  // ── DoD 2: "Confirmation cannot be bypassed at API level — tested with a
  //           direct API call without the confirmation flag" ─────────────────

  test('a direct API call touching MG6D without the confirmation flag is rejected', async ({
    request,
  }) => {
    const saved = await activatedDraft(request);
    const res = await request.patch(`/api/drafts/${saved.id}`, {
      data: {
        values: { ...saved.values, [MG6D]: [mg6dRow('bypass-1')] },
        baseVersion: saved.version,
      },
    });
    expect(res.status(), 'rejected without a confirmation').toBe(403);
    // Nothing was stored.
    const after = await getDraft(request, saved.id);
    expect(after.values[MG6D] ?? []).toHaveLength(0);
    expect(after.version).toBe(saved.version);
  });

  test('an invented confirmation id, and one belonging to another draft, are equally rejected', async ({
    request,
  }) => {
    const saved = await activatedDraft(request);
    const invented = await request.patch(`/api/drafts/${saved.id}`, {
      data: {
        values: { ...saved.values, [MG6D]: [mg6dRow('bypass-2')] },
        baseVersion: saved.version,
        sensitiveConfirmationId: 'c-invented-000000000000',
      },
    });
    expect(invented.status()).toBe(403);

    // A REAL confirmation — for a different draft — must not transfer.
    const other = await activatedDraft(request);
    const foreign = await confirmHandling(request, other.id);
    const transplanted = await request.patch(`/api/drafts/${saved.id}`, {
      data: {
        values: { ...saved.values, [MG6D]: [mg6dRow('bypass-3')] },
        baseVersion: saved.version,
        sensitiveConfirmationId: foreign,
      },
    });
    expect(transplanted.status(), 'a foreign confirmation does not transfer').toBe(403);
    const after = await getDraft(request, saved.id);
    expect(after.values[MG6D] ?? []).toHaveLength(0);
  });

  test('a user without the permission is rejected outright — confirm and edit both', async ({
    request,
  }) => {
    // The colleague owns this draft, so ownership is not what stops them.
    const res = await request.post('/api/drafts', {
      data: { formCode: 'MG6', caseId: null },
      headers: COLLEAGUE,
    });
    const { draft } = await res.json();
    recordDraft(draft.id);
    const savedRes = await request.patch(`/api/drafts/${draft.id}`, {
      data: { values: { [SCHEDULE]: [sensitiveRow('UM-1')] }, baseVersion: draft.version },
      headers: COLLEAGUE,
    });
    const saved = await savedRes.json();

    const confirm = await request.post(`/api/drafts/${draft.id}/sensitive/confirmations`, {
      data: { kind: 'HANDLING_INSTRUCTIONS' },
      headers: COLLEAGUE,
    });
    expect(confirm.status(), 'confirmation requires the permission').toBe(403);

    const edit = await request.patch(`/api/drafts/${draft.id}`, {
      data: {
        values: { ...saved.values, [MG6D]: [mg6dRow('bypass-4')] },
        baseVersion: saved.version,
      },
      headers: COLLEAGUE,
    });
    expect(edit.status(), 'editing requires the permission').toBe(403);

    // Both rejections are on the record with the caller's identity (DoD 3).
    const denied = (await auditEventsFor(draft.id)).filter(
      (e) => e.action === 'SENSITIVE_ACCESS_DENIED',
    );
    expect(denied.length).toBeGreaterThanOrEqual(2);
    for (const event of denied) {
      expect(event.userEmail).toBe(COLLEAGUE_EMAIL);
    }
  });

  test('the legitimate flow — confirm, then save — succeeds', async ({ request }) => {
    const saved = await activatedDraft(request);
    const confirmationId = await confirmHandling(request, saved.id);
    const res = await request.patch(`/api/drafts/${saved.id}`, {
      data: {
        values: { ...saved.values, [MG6D]: [mg6dRow('legit-1')] },
        baseVersion: saved.version,
        sensitiveConfirmationId: confirmationId,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.values[MG6D]).toHaveLength(1);
    expect(body.sensitiveSection.sensitiveItemCount).toBe(1);
  });

  test('merge-preserve: a save that omits the sensitive key cannot erase MG6D', async ({
    request,
  }) => {
    const saved = await activatedDraft(request);
    const confirmationId = await confirmHandling(request, saved.id);
    const withMg6d = await saveValues(
      request,
      saved.id,
      { [SCHEDULE]: saved.values[SCHEDULE], [MG6D]: [mg6dRow('keep-1')] },
      saved.version,
      { sensitiveConfirmationId: confirmationId },
    );

    // The wholesale save a locked or unconfirmed client would send: every key
    // it knows about, and no sensitive key at all.
    const wholesale = await saveValues(
      request,
      saved.id,
      { [SCHEDULE]: saved.values[SCHEDULE], disclosureOfficer: 'DC 2984 Owen Llewellyn' },
      withMg6d.version,
    );
    expect(wholesale.values[MG6D], 'MG6D survived a save without its key').toHaveLength(1);
    expect(wholesale.values['disclosureOfficer']).toBe('DC 2984 Owen Llewellyn');
  });

  // ── DoD 3: "All MG6D access events appear in the audit trail with correct
  //           user identity and timestamp" ───────────────────────────────────

  test('view, confirmation and edit each reach the trail with the acting user and timestamp', async ({
    page,
    request,
  }) => {
    const saved = await activatedDraft(request);
    const openedAt = Date.now();

    // View: open the draft (the GET that delivers the section content).
    await page.goto(`/drafts/${saved.id}`);
    await expect(page.getByTestId('handling-instructions')).toBeVisible();

    // Confirm and edit through the UI, then let the autosave land.
    await confirmInUi(page);
    const mg6dSchedule = page.locator(`[data-group-id="${MG6D}"]`);
    await expect(mg6dSchedule).toBeVisible();
    await mg6dSchedule.getByTestId('add-item').click();
    const row = mg6dSchedule.getByTestId('schedule-row').first();
    await row.locator('[data-column-id="description"] textarea').fill(SENSITIVE_MARKER);
    await row.locator('[data-column-id="location"] input').fill('DS safe, Lewisham');
    await row.locator('[data-column-id="sensitivityReason"] textarea').fill('Reveals an informant');
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 });

    const events = await auditEventsFor(saved.id);
    const view = events.find((e) => e.action === 'SENSITIVE_SECTION_VIEWED');
    const confirmed = events.find((e) => e.action === 'SENSITIVE_INSTRUCTIONS_CONFIRMED');
    const edited = events.find((e) => e.action === 'SENSITIVE_SECTION_EDITED');

    expect(view, 'the view is on the record').toBeTruthy();
    expect(view!.userEmail).toBe(DEMO_EMAIL);
    expect(Math.abs(new Date(view!.createdAt).getTime() - openedAt)).toBeLessThan(60_000);

    expect(confirmed, 'the confirmation is on the record').toBeTruthy();
    expect(confirmed!.userEmail).toBe(DEMO_EMAIL);
    // The trail records WHICH wording was acknowledged, by its reviewed pin.
    expect(confirmed!.metadata?.['wordingHash']).toBe(SENSITIVE_HANDLING_SHA256);

    expect(edited, 'the edit is on the record').toBeTruthy();
    expect(edited!.userEmail).toBe(DEMO_EMAIL);
    expect(edited!.metadata?.['fieldIds']).toEqual([MG6D]);
    expect(typeof edited!.metadata?.['confirmationId']).toBe('string');
    // Metadata carries ids and counts, never the material itself.
    expect(JSON.stringify(edited!.metadata)).not.toContain(SENSITIVE_MARKER);
  });

  // ── DoD 4: "Sensitive items are absent from non-sensitive schedule exports —
  //           verified with a test export" ───────────────────────────────────

  test('a test export contains the plain item and not one byte of the sensitive one', async ({
    request,
  }) => {
    const saved = await activatedDraft(request);
    const confirmationId = await confirmHandling(request, saved.id);
    await saveValues(
      request,
      saved.id,
      { [SCHEDULE]: saved.values[SCHEDULE], [MG6D]: [mg6dRow('exp-1')] },
      saved.version,
      { sensitiveConfirmationId: confirmationId },
    );

    const res = await request.get(`/api/drafts/${saved.id}/export/non-sensitive-schedule`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    expect(res.headers()['content-disposition']).toContain('attachment');

    const csv = await res.text();
    expect(csv, 'the non-sensitive item is exported').toContain('CCTV from the shop');
    expect(csv, 'the sensitive description never appears').not.toContain(SENSITIVE_MARKER);
    expect(csv, 'the sensitive reference never appears').not.toContain('UM-2');
    expect(csv, 'no MG6D column leaks into the export').not.toContain('sensitivityReason');

    const exported = (await auditEventsFor(saved.id)).find((e) => e.action === 'SCHEDULE_EXPORTED');
    expect(exported).toBeTruthy();
    expect(exported!.metadata?.['includedRows']).toBe(1);
    expect(exported!.metadata?.['excludedSensitiveRows']).toBe(1);
    expect(JSON.stringify(exported!.metadata)).not.toContain(SENSITIVE_MARKER);
  });

  test('the export is offered beside the schedule as a plain download link', async ({
    page,
    request,
  }) => {
    const saved = await activatedDraft(request);
    await page.goto(`/drafts/${saved.id}`);
    const link = page.getByTestId('export-non-sensitive');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute(
      'href',
      `/api/drafts/${saved.id}/export/non-sensitive-schedule`,
    );
  });

  // ── Alt flow: insufficient permission ──────────────────────────────────────

  test('the colleague sees a locked section naming the level and its holders — and never receives the content', async ({
    page,
    request,
  }) => {
    // The colleague's own draft: ownership is not the lock, the permission is.
    const res = await request.post('/api/drafts', {
      data: { formCode: 'MG6', caseId: null },
      headers: COLLEAGUE,
    });
    const { draft } = await res.json();
    recordDraft(draft.id);
    await request.patch(`/api/drafts/${draft.id}`, {
      data: { values: { [SCHEDULE]: [sensitiveRow('UM-1')] }, baseVersion: draft.version },
      headers: COLLEAGUE,
    });

    // The payload proof first: no sensitive key, no instructions, no PII steps.
    const dtoRes = await request.get(`/api/drafts/${draft.id}`, { headers: COLLEAGUE });
    const dto = await dtoRes.json();
    expect(dto.values[MG6D]).toBeUndefined();
    expect(dto.sensitiveSection.permitted).toBe(false);
    expect(dto.sensitiveSection.handlingInstructions).toBeUndefined();
    expect(dto.sensitiveSection.piiSteps).toBeUndefined();
    expect(JSON.stringify(dto)).not.toContain(SENSITIVE_HANDLING_INSTRUCTIONS[0].text);

    // Then the screen: banner, lock, the named level, and who to ask.
    await pageAs(page, COLLEAGUE_EMAIL);
    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('sensitive-banner')).toContainText('Sensitive — Restricted Access');
    await expect(page.getByTestId('sensitive-locked')).toBeVisible();
    await expect(page.getByTestId('sensitive-permission-level')).toContainText(
      SENSITIVE_PERMISSION_LEVEL,
    );
    await expect(page.getByTestId('sensitive-permission-holders')).toContainText('Alex Marlowe');
    // No gate is offered to a user the gate cannot help.
    await expect(page.getByTestId('sensitive-confirm')).toHaveCount(0);
    await expect(page.getByTestId('handling-instructions')).toHaveCount(0);
  });

  // ── Error handling: the gate in the UI ─────────────────────────────────────

  test('before confirmation there is nothing to edit: no control, no form key, read-only preview', async ({
    page,
    request,
  }) => {
    const saved = await activatedDraft(request);
    const confirmationId = await confirmHandling(request, saved.id);
    await saveValues(
      request,
      saved.id,
      { [SCHEDULE]: saved.values[SCHEDULE], [MG6D]: [mg6dRow('ro-1')] },
      saved.version,
      { sensitiveConfirmationId: confirmationId },
    );

    // A fresh access: the earlier confirmation belongs to a previous context.
    await page.goto(`/drafts/${saved.id}`);
    await expect(page.getByTestId('handling-instructions')).toBeVisible();

    // The instructions block is text, not a form.
    expect(
      await page.getByTestId('handling-instructions').locator('input, textarea, select').count(),
    ).toBe(0);
    // The MG6D schedule has no editable rendering at all pre-confirmation…
    await expect(page.locator(`[data-group-id="${MG6D}"]`)).toHaveCount(0);
    // …the stored rows show as a read-only preview…
    await expect(page.getByTestId('sensitive-preview-row')).toHaveCount(1);
    expect(await page.getByTestId('sensitive-preview').locator('input, textarea').count()).toBe(0);
    // …and the autosave a pre-confirmation edit triggers sends NO sensitive
    // key at all — captured off the wire, because that request is what the
    // API guard would judge.
    const patchPromise = page.waitForRequest(
      (req) => req.method() === 'PATCH' && req.url().includes(`/api/drafts/${saved.id}`),
      { timeout: 10_000 },
    );
    await page.locator('[data-field-id="disclosureOfficer"] input').fill('DC 2984 Owen Llewellyn');
    const patch = await patchPromise;
    const body = patch.postDataJSON() as { values: Record<string, unknown> };
    expect(Object.keys(body.values)).not.toContain(MG6D);
    expect(body).not.toHaveProperty('sensitiveConfirmationId');
  });

  test('the confirmation gate: checkbox arms the button, confirming unlocks editing', async ({
    page,
    request,
  }) => {
    const saved = await activatedDraft(request);
    await page.goto(`/drafts/${saved.id}`);

    const confirm = page.getByTestId('sensitive-confirm');
    await expect(confirm).toBeDisabled();
    await page.getByTestId('sensitive-read-checkbox').locator('input').check();
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // Unlocked: the editable MG6D schedule joins the form and saves flow.
    const mg6dSchedule = page.locator(`[data-group-id="${MG6D}"]`);
    await expect(mg6dSchedule).toBeVisible();
    await mg6dSchedule.getByTestId('add-item').click();
    const row = mg6dSchedule.getByTestId('schedule-row').first();
    await row.locator('[data-column-id="description"] textarea').fill('Surveillance technique detail');
    await row.locator('[data-column-id="location"] input').fill('Property store');
    await row.locator('[data-column-id="sensitivityReason"] textarea').fill('Reveals the technique');
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 });

    const after = await getDraft(request, saved.id);
    expect(after.values[MG6D]).toHaveLength(1);
  });

  test('step-up: a reload locks the section again, and a fresh confirmation is a second recorded row', async ({
    page,
    request,
  }) => {
    const saved = await activatedDraft(request);
    await page.goto(`/drafts/${saved.id}`);
    await confirmInUi(page);
    expect(await acknowledgementsFor(saved.id)).toHaveLength(1);

    // The reload is a new access: locked again, nothing editable.
    await page.reload();
    await expect(page.getByTestId('sensitive-confirm-gate')).toBeVisible();
    await expect(page.locator(`[data-group-id="${MG6D}"]`)).toHaveCount(0);

    await confirmInUi(page);
    const acks = await acknowledgementsFor(saved.id);
    expect(acks.filter((a) => a.kind === 'HANDLING_INSTRUCTIONS')).toHaveLength(2);
  });

  // ── The PII reminder panel ─────────────────────────────────────────────────

  test('the PII panel lists the cited steps, links the practice-direction rules, and records the acknowledgement', async ({
    page,
    request,
  }) => {
    const saved = await activatedDraft(request);
    await page.goto(`/drafts/${saved.id}`);
    await confirmInUi(page);

    const panel = page.getByTestId('pii-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('pii-step')).toHaveCount(PII_STEPS.length);
    for (const step of PII_STEPS) {
      await expect(panel).toContainText(step.text);
    }
    const link = page.getByTestId('practice-direction-link');
    await expect(link).toHaveAttribute('href', PII_PRACTICE_DIRECTION.url);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');

    await page.getByTestId('pii-acknowledge').click();
    await expect(page.getByTestId('pii-acknowledged')).toBeVisible();

    const acked = (await auditEventsFor(saved.id)).find(
      (e) => e.action === 'SENSITIVE_PII_ACKNOWLEDGED',
    );
    expect(acked).toBeTruthy();
    expect(acked!.userEmail).toBe(DEMO_EMAIL);

    // Persisted per user per draft: a fresh access re-demands the handling
    // confirmation (step-up) but shows the PII reminder as already acknowledged.
    await page.reload();
    await confirmInUi(page);
    await expect(page.getByTestId('pii-acknowledged')).toBeVisible();
    await expect(page.getByTestId('pii-acknowledge')).toHaveCount(0);
  });

  // ── Post-condition: MG6D is mandatory while material is sensitive ─────────

  test('an active section with an empty MG6D schedule is an error-severity consistency finding', async ({
    page,
    request,
  }) => {
    const saved = await activatedDraft(request);
    await page.goto(`/drafts/${saved.id}`);
    await confirmInUi(page);

    // Unlocked and empty: the finding names the obligation.
    await expect(page.getByTestId('consistency-issues')).toBeVisible();
    await expect(page.getByTestId('consistency-issues')).toContainText('mandatory');

    // Completing the schedule clears it.
    const mg6dSchedule = page.locator(`[data-group-id="${MG6D}"]`);
    await mg6dSchedule.getByTestId('add-item').click();
    const row = mg6dSchedule.getByTestId('schedule-row').first();
    await row.locator('[data-column-id="description"] textarea').fill('Detail');
    await row.locator('[data-column-id="location"] input').fill('Safe');
    await row.locator('[data-column-id="sensitivityReason"] textarea').fill('Informant');
    // The finding was the panel's only content, so clearing it removes the
    // panel itself — asserted as absence, which is what the user sees.
    await expect(page.getByTestId('consistency-issues')).toHaveCount(0);
  });

  // ── The red is UC-07's ─────────────────────────────────────────────────────

  test('the banner paints with the sensitive tokens — the red reserved since UC-03', async ({
    page,
    request,
  }) => {
    const saved = await activatedDraft(request);
    await page.goto(`/drafts/${saved.id}`);
    const banner = page.getByTestId('sensitive-banner');
    await expect(banner).toBeVisible();
    const background = await banner.evaluate((el) => getComputedStyle(el).backgroundColor);
    // --mg-sensitive-800 = #7a1220
    expect(background).toBe('rgb(122, 18, 32)');
  });

  // ── Audit-count parity: the trail counts stored truth ─────────────────────

  test('a never-opened MG6D counts as the empty mandatory schedule in the save audit', async ({
    request,
  }) => {
    // The blind spot the UC-08 build surfaced: an MG6D that was never unlocked
    // stores no key at all, and the DRAFT_SAVED validation counts used to miss
    // the mandatory-schedule error until the section was first opened —
    // under-reporting a true outstanding error and disagreeing with the review
    // engine. The two saves differ ONLY in one row's classification, so the
    // count delta of exactly one IS the mandatory-MG6D error.
    const { draft } = await createDraft(request, 'MG6', null);
    const plain = await saveValues(
      request,
      draft.id,
      { [SCHEDULE]: [scheduleRow('UM-1')] },
      draft.version,
    );
    const sensitive = await saveValues(
      request,
      draft.id,
      { [SCHEDULE]: [scheduleRow('UM-1', { classification: 'sensitive' })] },
      plain.version,
    );
    expect(sensitive.values[MG6D], 'MG6D was never opened — no key stored').toBeUndefined();

    const saves = (await auditEventsFor(draft.id)).filter((e) => e.action === 'DRAFT_SAVED');
    expect(saves).toHaveLength(2);
    const before = saves[0].metadata?.['validationErrorCount'] as number;
    const after = saves[1].metadata?.['validationErrorCount'] as number;
    expect(after, 'the mandatory-schedule error reaches the stored counts').toBe(before + 1);
  });

  // ── LER-1250: access log immutability, structurally ───────────────────────

  test('no API code path updates or deletes an audit event or an acknowledgement', () => {
    // The append-only guarantee is a property of the API's source: creation is
    // the only verb. Grepping comment-stripped source keeps the NEXT change
    // honest too — a route added later fails this check before it ships.
    const apiSrc = join(process.cwd(), 'apps', 'api', 'src');
    const offenders: string[] = [];
    const forbidden = /(auditEvent|sensitiveAcknowledgement)\.(update|updateMany|delete|deleteMany|upsert)\(/;

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (entry.endsWith('.ts')) {
          const source = readFileSync(path, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
          if (forbidden.test(source)) offenders.push(path);
        }
      }
    };
    walk(apiSrc);
    expect(offenders, 'append-only stores must stay append-only').toEqual([]);
  });
});
