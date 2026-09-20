import { expect, test } from './support/fixtures';
import { type APIRequestContext, type Page } from '@playwright/test';
import type { FinaliseResponse, QualityReport, QualityReviewResponse } from '@mgs/shared';
import {
  checkDateLogic,
  crossFieldFindings,
  getFormTemplate,
  isRealIsoDate,
} from '@mgs/shared';
import { auditEventsFor, caseFor, createDraft, getDraft, recordDraft, saveValues } from './support/api';
import { COLLEAGUE, COLLEAGUE_EMAIL, pageAs } from './support/auth';

/**
 * UC-08 Form Review & Quality Check.
 *
 * The four scope DoD lines each have named checks below. Everything that
 * gates finalisation is asserted at the API — a real HTTP call, because the
 * endpoint is the boundary and the button is only its shadow.
 */



/**
 * Check 3 is deliberately CASE-WIDE, so drafts created by earlier tests (or
 * earlier runs) on the same seeded case contribute their citations too. Each
 * test therefore uses run-unique exhibit tokens, and the finalise flow
 * acknowledges every advisory the panel shows — not only its own.
 */
const RUN = String(Date.now() % 10_000);

async function review(request: APIRequestContext, id: string): Promise<QualityReviewResponse> {
  const res = await request.post(`/api/drafts/${id}/review`);
  expect(res.status(), `POST /api/drafts/${id}/review`).toBe(201);
  return res.json();
}

function issuesOf(report: QualityReport) {
  return report.checks.flatMap((c) => c.issues);
}

/** Acknowledgements covering every advisory in a report (shared-case strays included). */
function advisoryAcksFor(report: QualityReport, reason: string) {
  return issuesOf(report)
    .filter((i) => i.severity === 'advisory')
    .map((i) => ({ issueId: i.id, reason }));
}

/** A complete, consistent MG12 value set for the given case. */
function completeMg12Values(
  urn: string,
  exhibits: string,
  defendantName = 'Daniel Foster',
): Record<string, unknown> {
  return {
    urn,
    defendantName,
    compiledBy: 'PC 4571 Amara Hughes',
    exhibitEntries: exhibits,
    storageLocation: 'Central exhibit store',
    continuityConfirmed: true,
    dateCompiled: '2026-08-02',
  };
}

test.describe('UC-08 form review and quality check', () => {
  // ── DoD 1: "Quality check catches all required field types across 3
  //           different MG form types" ───────────────────────────────────────

  test('Check 1 catches every required field type, across MG6, MG11 and MG3', async ({
    request,
  }) => {
    // One nearly-empty draft per form (one field completed so the review may
    // run). The blocking set must name every still-missing required field, so
    // across the three forms every field TYPE the templates use is caught.
    const typesCaught = new Set<string>();
    const expectations: [string, string, Record<string, unknown>][] = [
      ['MG6', 'urn', { urn: '01AB0456321/26' }],
      ['MG11', 'witnessName', { witnessName: 'Jordan Smith' }],
      ['MG3', 'urn', { urn: '01AB0456321/26' }],
    ];
    for (const [code, completedId, values] of expectations) {
      const { draft } = await createDraft(request, code, null);
      const saved = await saveValues(request, draft.id, values, draft.version);
      const { report } = await review(request, saved.id);

      const completeness = report.checks.find((c) => c.checkId === 'completeness')!;
      expect(completeness.status, `${code} completeness`).toBe('issues');
      const flaggedIds = new Set(completeness.issues.map((i) => i.fieldId));
      expect(flaggedIds.has(completedId), `${code}: completed field not flagged`).toBe(false);

      // Every reported issue is blocking — the scope's "red if not".
      for (const issue of completeness.issues) {
        expect(issue.severity).toBe('blocking');
      }

      const template = await (await request.get(`/api/form-templates/${code}`)).json();
      for (const field of template.fields) {
        if (field.required && field.id !== completedId) {
          expect(flaggedIds.has(field.id), `${code}.${field.id} missing from Check 1`).toBe(true);
          typesCaught.add(field.type);
        }
      }
    }
    // The claim in the DoD line, verified rather than assumed:
    for (const type of ['text', 'textarea', 'date', 'select', 'checkbox', 'group']) {
      expect(typesCaught.has(type), `required type "${type}" was never exercised`).toBe(true);
    }
  });

  test('fixing a missing required field clears exactly its issue on the next run', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    const saved = await saveValues(request, draft.id, { urn: '01AB0456321/26' }, draft.version);
    const first = await review(request, saved.id);
    expect(issuesOf(first.report).some((i) => i.fieldId === 'compiledBy')).toBe(true);

    const fixed = await saveValues(
      request,
      saved.id,
      { urn: '01AB0456321/26', compiledBy: 'PC 4571 Hughes' },
      saved.version,
    );
    const second = await review(request, fixed.id);
    expect(issuesOf(second.report).some((i) => i.fieldId === 'compiledBy')).toBe(false);
  });

  // ── DoD 2: "'Jump to field' links correctly navigate to and highlight the
  //           relevant field" ────────────────────────────────────────────────

  test('Jump to field scrolls to, focuses and highlights the target on a flat form', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    await saveValues(request, draft.id, { urn: '01AB0456321/26' }, draft.version);

    await page.goto(`/drafts/${draft.id}`);
    await page.getByTestId('review-trigger').click();
    await expect(page.getByTestId('review-panel')).toBeVisible();

    const row = page
      .locator('[data-testid="review-issue"]')
      .filter({ hasText: 'List compiled by' })
      .first();
    await row.getByTestId('issue-jump').click();

    const target = page.locator('[data-field-id="compiledBy"]');
    await expect(target).toHaveClass(/jump-highlight/);
    await expect(target).toBeInViewport();
    await expect(target.locator('input')).toBeFocused();
    // The highlight is temporary — it announces, it does not decorate.
    await expect(target).not.toHaveClass(/jump-highlight/, { timeout: 5_000 });
  });

  test('Jump reveals the MG11 wizard step that holds the field before highlighting it', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await saveValues(request, draft.id, { witnessName: 'Jordan Smith' }, draft.version);

    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('wizard-step-position')).toContainText('Step 1 of 4');
    await page.getByTestId('review-trigger').click();

    // declarationConfirmed lives on a later step the user has never visited.
    const row = page
      .locator('[data-testid="review-issue"][data-issue-id="completeness:required:declarationConfirmed"]');
    await row.getByTestId('issue-jump').click();

    await expect(page.getByTestId('wizard-step-position')).not.toContainText('Step 1 of 4');
    const target = page.locator('[data-field-id="declarationConfirmed"]');
    await expect(target).toBeVisible();
    await expect(target).toHaveClass(/jump-highlight/);
  });

  test('a jump whose target the viewer cannot see lands on the sensitive section block', async ({
    page,
    request,
  }) => {
    // The colleague owns an MG6 with sensitive material: the MG6D field is
    // never rendered for them (UC-07 lock), so the jump's honest destination
    // is the section block itself.
    const res = await request.post('/api/drafts', {
      data: { formCode: 'MG6', caseId: null },
      headers: COLLEAGUE,
    });
    const { draft } = await res.json();
    recordDraft(draft.id);
    await request.patch(`/api/drafts/${draft.id}`, {
      data: {
        values: {
          unusedMaterialItems: [
            {
              __id: 'r1',
              itemReference: 'UM-1',
              description: 'Surveillance log',
              materialType: 'document',
              classification: 'sensitive',
            },
          ],
        },
        baseVersion: draft.version,
      },
      headers: COLLEAGUE,
    });

    await pageAs(page, COLLEAGUE_EMAIL);
    await page.goto(`/drafts/${draft.id}`);
    await page.getByTestId('review-trigger').click();

    const row = page.locator(
      '[data-testid="review-issue"][data-issue-id="completeness:sensitive-schedule:sensitiveScheduleItems"]',
    );
    await row.getByTestId('issue-jump').click();
    await expect(page.getByTestId('sensitive-section')).toHaveClass(/jump-highlight/);
  });

  // ── DoD 3: "Advisory issues can be acknowledged and bypassed; blocking
  //           issues cannot" — the blocking half at the API ──────────────────

  test('a real HTTP finalise attempt with blocking issues outstanding is refused and audited', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    const saved = await saveValues(request, draft.id, { urn: '01AB0456321/26' }, draft.version);
    await review(request, saved.id);

    const res = await request.post(`/api/drafts/${saved.id}/finalise`, {
      data: { advisoryAcknowledgements: [] },
    });
    expect(res.status(), 'blocking issues cannot be bypassed').toBe(409);

    const after = await getDraft(request, saved.id);
    expect(after.status).toBe('DRAFT');
    const rejected = (await auditEventsFor(saved.id)).find(
      (e) => e.action === 'FINALISE_REJECTED',
    );
    expect(rejected, 'the refusal is on the record').toBeTruthy();
    expect(rejected!.metadata?.['blocking']).toBeGreaterThan(0);
  });

  test('blocking rows carry no acknowledgement control at all', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    await saveValues(request, draft.id, { urn: '01AB0456321/26' }, draft.version);
    await page.goto(`/drafts/${draft.id}`);
    await page.getByTestId('review-trigger').click();

    const blockingGroup = page.getByTestId('review-blocking');
    await expect(blockingGroup).toBeVisible();
    // The distinction is structural: not a disabled input — no input.
    expect(await blockingGroup.getByTestId('advisory-reason').count()).toBe(0);
    await expect(page.getByTestId('finalise-button')).toBeDisabled();
  });

  test('an advisory is bypassed only with a reason, which reaches the audit trail verbatim', async ({
    page,
    request,
  }) => {
    // Two forms on one case: MG12 complete but MG11 cites an exhibit the list
    // does not carry — a pure advisory on an otherwise clean MG12.
    // Rowan Ashcroft is UC-08's DEDICATED cross-form fixture (LER-1269) — the
    // documented pattern that replaced the old "find an unpolluted case"
    // workaround: every write-bearing suite owns its case (e2e/FIXTURES.md).
    const caseDto = await caseFor(request, 'Rowan Ashcroft');
    const CITED = `QA/${RUN}`;
    const { draft: mg11 } = await createDraft(request, 'MG11', caseDto.id);
    await saveValues(
      request,
      mg11.id,
      { exhibitsReferenced: `${CITED} — till receipt` },
      mg11.version,
    );
    const { draft: mg12 } = await createDraft(request, 'MG12', caseDto.id);
    const saved = await saveValues(
      request,
      mg12.id,
      completeMg12Values(caseDto.urn, 'PC/1 — CCTV disc — PC Hughes — store — attached', 'Rowan Ashcroft'),
      mg12.version,
    );

    // Without an acknowledgement the API refuses — advisory blocks the ACT
    // until acknowledged, not the readiness.
    const bare = await request.post(`/api/drafts/${saved.id}/finalise`, {
      data: { advisoryAcknowledgements: [] },
    });
    expect(bare.status()).toBe(409);

    // A whitespace reason is not a reason (LER-1106).
    const blank = await request.post(`/api/drafts/${saved.id}/finalise`, {
      data: { advisoryAcknowledgements: [{ issueId: `crossForm:exhibit:${CITED}`, reason: '   ' }] },
    });
    expect(blank.status()).toBe(409);

    // Through the UI: type the reason, finalise, and the trail carries it.
    const REASON = `Till receipt ${CITED} is with the CPS courier; list update follows on Monday.`;
    await page.goto(`/drafts/${saved.id}`);
    await page.getByTestId('review-trigger').click();
    const advisoryRow = page.locator(
      `[data-testid="review-issue"][data-issue-id="crossForm:exhibit:${CITED}"]`,
    );
    await expect(advisoryRow).toBeVisible();
    await expect(page.getByTestId('finalise-button')).toBeDisabled();
    // Every advisory needs a reason — including strays from other drafts on
    // this shared case; ours gets the reason the trail assertion looks for.
    const reasonInputs = page.getByTestId('advisory-reason');
    for (let i = (await reasonInputs.count()) - 1; i >= 0; i--) {
      await reasonInputs.nth(i).fill('Acknowledged for test isolation on a shared case.');
    }
    await advisoryRow.getByTestId('advisory-reason').fill(REASON);
    await expect(page.getByTestId('finalise-button')).toBeEnabled();
    await page.getByTestId('finalise-button').click();

    await expect(page.getByTestId('finalised-banner')).toBeVisible();
    const bypass = (await auditEventsFor(saved.id)).find(
      (e) => e.action === 'ADVISORY_BYPASSED' && e.metadata?.['issueId'] === `crossForm:exhibit:${CITED}`,
    );
    expect(bypass, 'the bypass is on the record').toBeTruthy();
    expect(bypass!.metadata?.['reason'], 'the reason is recorded verbatim').toBe(REASON);
  });

  // ── DoD 4: "Cross-reference consistency check correctly flags mismatched
  //           exhibit numbers across linked forms" ───────────────────────────

  test('an exhibit cited on one form but defined on no list is flagged, and clears when the list catches up', async ({
    request,
  }) => {
    const caseDto = await caseFor(request, 'Rowan Ashcroft');
    const DEFINED = `QB/${RUN}`;
    const MISSING = `QC/${RUN}`;
    const { draft: mg11 } = await createDraft(request, 'MG11', caseDto.id);
    const savedMg11 = await saveValues(
      request,
      mg11.id,
      { witnessName: 'Jordan Smith', exhibitsReferenced: `${DEFINED} — CCTV disc\n${MISSING} — till receipt` },
      mg11.version,
    );
    const { draft: mg12 } = await createDraft(request, 'MG12', caseDto.id);
    const savedMg12 = await saveValues(
      request,
      mg12.id,
      completeMg12Values(caseDto.urn, `${DEFINED} — CCTV disc — PC Hughes — store — attached`, 'Rowan Ashcroft'),
      mg12.version,
    );

    const first = await review(request, savedMg11.id);
    const crossForm = first.report.checks.find((c) => c.checkId === 'crossForm')!;
    const flagged = crossForm.issues.find((i) => i.id === `crossForm:exhibit:${MISSING}`);
    expect(flagged, `${MISSING} has no definition anywhere on the case`).toBeTruthy();
    expect(flagged!.severity).toBe('advisory');
    expect(flagged!.message).toContain(MISSING);
    expect(
      crossForm.issues.some((i) => i.id === `crossForm:exhibit:${DEFINED}`),
      'a defined exhibit is not flagged',
    ).toBe(false);

    // The list catches up — the mismatch clears without touching MG11.
    await saveValues(
      request,
      savedMg12.id,
      completeMg12Values(
        caseDto.urn,
        `${DEFINED} — CCTV disc — PC Hughes — store — attached\n${MISSING} — till receipt — PC Hughes — store — attached`,
        'Rowan Ashcroft',
      ),
      savedMg12.version,
    );
    const second = await review(request, savedMg11.id);
    expect(
      issuesOf(second.report).some((i) => i.id === `crossForm:exhibit:${MISSING}`),
    ).toBe(false);
  });

  test('URN divergence across one case\'s forms is blocking; agreement clears it', async ({
    request,
  }) => {
    const caseDto = await caseFor(request, 'Rowan Ashcroft');
    const { draft: mg12 } = await createDraft(request, 'MG12', caseDto.id);
    const savedMg12 = await saveValues(
      request,
      mg12.id,
      completeMg12Values(caseDto.urn, 'PC/1 — CCTV — PC Hughes — store — attached', 'Rowan Ashcroft'),
      mg12.version,
    );
    const { draft: mg5 } = await createDraft(request, 'MG5', caseDto.id);
    const savedMg5 = await saveValues(request, mg5.id, { urn: '99ZZ0000000/26' }, mg5.version);

    const diverged = await review(request, savedMg12.id);
    const urnIssue = issuesOf(diverged.report).find((i) => i.id === 'crossForm:mapsTo:urn');
    expect(urnIssue, 'one case, two URNs — flagged').toBeTruthy();
    expect(urnIssue!.severity).toBe('blocking');

    await saveValues(request, savedMg5.id, { urn: caseDto.urn }, savedMg5.version);
    const agreed = await review(request, savedMg12.id);
    expect(issuesOf(agreed.report).some((i) => i.id === 'crossForm:mapsTo:urn')).toBe(false);
  });

  // ── The rest of the scope's contract ───────────────────────────────────────

  test('an empty draft cannot be reviewed — API refuses, trigger stays disabled', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    const res = await request.post(`/api/drafts/${draft.id}/review`);
    expect(res.status()).toBe(422);

    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('review-trigger')).toBeDisabled();
  });

  test('every run is audited — failing and passing alike, with per-check outcomes', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    const saved = await saveValues(request, draft.id, { urn: '01AB0456321/26' }, draft.version);
    await review(request, saved.id); // failing run
    const fixed = await saveValues(
      request,
      saved.id,
      completeMg12Values('01AB0456321/26', 'PC/1 — CCTV — PC Hughes — store — attached'),
      saved.version,
    );
    await review(request, fixed.id); // passing run

    const runs = (await auditEventsFor(saved.id)).filter(
      (e) => e.action === 'QUALITY_CHECK_COMPLETED',
    );
    expect(runs).toHaveLength(2);
    expect(runs[0].metadata?.['blocking']).toBeGreaterThan(0);
    expect(runs[1].metadata?.['blocking']).toBe(0);
    for (const run of runs) {
      const perCheck = run.metadata?.['perCheck'] as Record<string, string>;
      expect(Object.keys(perCheck).sort()).toEqual([
        'completeness',
        'crossForm',
        'dateLogic',
        'sensitiveHandling',
      ]);
    }
  });

  test('a clean review marks the draft REVIEWED; an edit reverts it, on the record', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    const saved = await saveValues(
      request,
      draft.id,
      completeMg12Values('01AB0456321/26', 'PC/1 — CCTV — PC Hughes — store — attached'),
      draft.version,
    );
    const clean = await review(request, saved.id);
    expect(clean.report.readyToFinalise).toBe(true);
    expect(clean.status).toBe('REVIEWED');
    expect((await getDraft(request, saved.id)).status).toBe('REVIEWED');

    // A review attests the values it saw — the edit invalidates it.
    const current = await getDraft(request, saved.id);
    const edited = await saveValues(
      request,
      saved.id,
      completeMg12Values('01AB0456321/26', 'PC/1 — CCTV disc (copy) — PC Hughes — store — attached'),
      current.version,
    );
    expect(edited.status).toBe('DRAFT');
    const revert = (await auditEventsFor(saved.id)).find(
      (e) => e.action === 'DRAFT_SAVED' && e.metadata?.['reviewInvalidated'] === true,
    );
    expect(revert, 'the reversion explains itself in the trail').toBeTruthy();
  });

  test('Check 4 blocks while MG6D handling is unconfirmed and clears once confirmed', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG6', null);
    const saved = await saveValues(
      request,
      draft.id,
      {
        unusedMaterialItems: [
          {
            __id: 'r1',
            itemReference: 'UM-1',
            description: 'Surveillance log',
            materialType: 'document',
            classification: 'sensitive',
          },
        ],
      },
      draft.version,
    );

    const before = await review(request, saved.id);
    const unconfirmed = issuesOf(before.report).find(
      (i) => i.id === 'sensitiveHandling:unconfirmed:form',
    );
    expect(unconfirmed, 'unconfirmed handling is a blocking finding').toBeTruthy();
    expect(unconfirmed!.severity).toBe('blocking');

    const confirm = await request.post(`/api/drafts/${saved.id}/sensitive/confirmations`, {
      data: { kind: 'HANDLING_INSTRUCTIONS' },
    });
    expect(confirm.status()).toBe(201);
    const after = await review(request, saved.id);
    expect(
      after.report.checks.find((c) => c.checkId === 'sensitiveHandling')!.status,
    ).toBe('clean');
  });

  test('a finalised form is read-only, says so, and hands off to the UC-09 stub', async ({
    page,
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    const saved = await saveValues(
      request,
      draft.id,
      completeMg12Values('01AB0456321/26', 'PC/1 — CCTV — PC Hughes — store — attached'),
      draft.version,
    );
    await review(request, saved.id);
    const fin = await request.post(`/api/drafts/${saved.id}/finalise`, {
      data: { advisoryAcknowledgements: [] },
    });
    expect(fin.status()).toBe(201);
    expect(((await fin.json()) as FinaliseResponse).status).toBe('FINALISED');

    await page.goto(`/drafts/${saved.id}`);
    await expect(page.getByTestId('finalised-banner')).toBeVisible();
    // UC-09 replaced the stub with the real generation controls (rule-5 note
    // in the UC-09 PR: the stub testid existed to mark absence, and the
    // absence is over).
    await expect(page.getByTestId('generate-pdf')).toBeVisible();
    await expect(page.getByTestId('review-trigger')).toHaveCount(0);
    await expect(page.locator('[data-field-id="compiledBy"] input')).toBeDisabled();

    // The server, not the CSS, is what makes it read-only.
    const current = await getDraft(request, saved.id);
    const edit = await request.patch(`/api/drafts/${saved.id}`, {
      data: { values: { urn: '01AB0456321/26' }, baseVersion: current.version },
    });
    expect(edit.status()).toBe(409);
    expect((await auditEventsFor(saved.id)).some((e) => e.action === 'FORM_FINALISED')).toBe(true);
  });

  test('a timed-out check shows partial results and keeps finalisation blocked', async ({
    page,
    request,
  }) => {
    // A real per-check timeout cannot be forced honestly in E2E, so the UI's
    // partial-results contract is proven against a crafted review response;
    // the SERVER side of the same rule (incomplete blocks finalise) is
    // enforced by the engine re-run, which the other checks exercise live.
    const { draft } = await createDraft(request, 'MG12', null);
    await saveValues(
      request,
      draft.id,
      completeMg12Values('01AB0456321/26', 'PC/1 — CCTV — PC Hughes — store — attached'),
      draft.version,
    );

    await page.route(`**/api/drafts/${draft.id}/review`, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'DRAFT',
          report: {
            checks: [
              { checkId: 'completeness', status: 'clean', issues: [] },
              { checkId: 'dateLogic', status: 'clean', issues: [] },
              {
                checkId: 'crossForm',
                status: 'incomplete',
                issues: [],
                guidance:
                  'Check 3 — Cross-form references could not complete — verify this aspect manually. Finalisation stays blocked until a full run succeeds.',
              },
              { checkId: 'sensitiveHandling', status: 'clean', issues: [] },
            ],
            blocking: 0,
            advisory: 0,
            incomplete: 1,
            readyToFinalise: false,
          },
        }),
      });
    });

    await page.goto(`/drafts/${draft.id}`);
    await page.getByTestId('review-trigger').click();
    await expect(page.getByTestId('review-incomplete-guidance')).toContainText('verify this aspect manually');
    await expect(
      page.locator('[data-testid="review-check"][data-check-id="crossForm"]'),
    ).toHaveAttribute('data-check-status', 'incomplete');
    // Completed checks still shown — partial results, not a blank error.
    await expect(
      page.locator('[data-testid="review-check"][data-check-id="completeness"]'),
    ).toHaveAttribute('data-check-status', 'clean');
    await expect(page.getByTestId('finalise-button')).toBeDisabled();
  });

  test('a standalone draft says honestly that there was nothing to compare', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    const saved = await saveValues(request, draft.id, { urn: '01AB0456321/26' }, draft.version);
    const { report } = await review(request, saved.id);
    const crossForm = report.checks.find((c) => c.checkId === 'crossForm')!;
    expect(crossForm.status).toBe('clean');
    expect(crossForm.note).toContain('Standalone');
  });

  // ── Finalise audit ordering: nothing reaches the trail until the transition
  //    has won (the LER-1189-flagged reorder) ─────────────────────────────────

  test('a finalise that loses the guard writes ZERO bypass rows — and the winner exactly one set', async ({
    request,
  }) => {
    // Two finalise requests race deliberately. Exactly one can win the guarded
    // status flip; the loser hits the same `count === 0` branch as any
    // mid-window write (a concurrent PATCH between finalise's read and its
    // update exercises the identical code path, but that interleaving lives
    // inside the server's own await gaps and cannot be forced deterministically
    // from outside — this race CAN be, because one of two same-draft finalises
    // must lose whichever way the awaits interleave).
    const caseDto = await caseFor(request, 'Rowan Ashcroft');
    const CITED = `QD/${RUN}`;
    const { draft: mg11 } = await createDraft(request, 'MG11', caseDto.id);
    await saveValues(request, mg11.id, { exhibitsReferenced: `${CITED} — race probe` }, mg11.version);
    const { draft: mg12 } = await createDraft(request, 'MG12', caseDto.id);
    const saved = await saveValues(
      request,
      mg12.id,
      completeMg12Values(caseDto.urn, 'PC/1 — CCTV — PC Hughes — store — attached', 'Rowan Ashcroft'),
      mg12.version,
    );
    const { report } = await review(request, saved.id);
    const acks = advisoryAcksFor(report, 'raced bypass — reason recorded once, by the winner');

    const [a, b] = await Promise.all([
      request.post(`/api/drafts/${saved.id}/finalise`, { data: { advisoryAcknowledgements: acks } }),
      request.post(`/api/drafts/${saved.id}/finalise`, { data: { advisoryAcknowledgements: acks } }),
    ]);
    const statuses = [a.status(), b.status()].sort();
    expect(statuses, 'exactly one winner, one audited refusal').toEqual([201, 409]);

    const events = await auditEventsFor(saved.id);
    const bypassesForOurIssue = events.filter(
      (e) => e.action === 'ADVISORY_BYPASSED' && e.metadata?.['issueId'] === `crossForm:exhibit:${CITED}`,
    );
    // The loser wrote NOTHING (no stranded rows), the winner wrote exactly one
    // row per advisory (no duplicates) — the two anomalies of the old ordering.
    expect(bypassesForOurIssue, 'one bypass row, from the winner alone').toHaveLength(1);
    expect(events.filter((e) => e.action === 'FORM_FINALISED')).toHaveLength(1);
    expect((await getDraft(request, saved.id)).status).toBe('FINALISED');
  });

  test('a save racing a finalise never strands bypass rows on an unfinalised form', async ({
    request,
  }) => {
    // The mid-window interleaving (a PATCH landing between finalise's read and
    // its guarded update) cannot be forced deterministically from outside the
    // process, so this asserts the ordering INVARIANT under whichever
    // interleaving actually occurs: a 409 finalise left zero bypass rows and no
    // FORM_FINALISED; a 201 finalise left exactly one set. The staggered PATCH
    // makes the losing interleaving likely; the deterministic double-finalise
    // check above pins the count===0 branch itself.
    const caseDto = await caseFor(request, 'Rowan Ashcroft');
    const CITED = `QE/${RUN}`;
    const { draft: mg11 } = await createDraft(request, 'MG11', caseDto.id);
    await saveValues(request, mg11.id, { exhibitsReferenced: `${CITED} — race probe` }, mg11.version);
    const { draft: mg12 } = await createDraft(request, 'MG12', caseDto.id);
    const saved = await saveValues(
      request,
      mg12.id,
      completeMg12Values(caseDto.urn, 'PC/1 — CCTV — PC Hughes — store — attached', 'Rowan Ashcroft'),
      mg12.version,
    );
    const { report } = await review(request, saved.id);
    const acks = advisoryAcksFor(report, 'race probe reason');
    const current = await getDraft(request, saved.id);

    const [finaliseRes] = await Promise.all([
      request.post(`/api/drafts/${saved.id}/finalise`, { data: { advisoryAcknowledgements: acks } }),
      (async () => {
        await new Promise((r) => setTimeout(r, 40)); // aim inside the engine window
        return request.patch(`/api/drafts/${saved.id}`, {
          data: { values: current.values, baseVersion: current.version },
        });
      })(),
    ]);

    const events = await auditEventsFor(saved.id);
    const bypasses = events.filter(
      (e) => e.action === 'ADVISORY_BYPASSED' && e.metadata?.['issueId'] === `crossForm:exhibit:${CITED}`,
    );
    const finalised = events.filter((e) => e.action === 'FORM_FINALISED');
    if (finaliseRes.status() === 409) {
      expect(bypasses, 'a refused finalise leaves no trace in the trail').toHaveLength(0);
      expect(finalised).toHaveLength(0);
      expect((await getDraft(request, saved.id)).status).not.toBe('FINALISED');
    } else {
      expect(finaliseRes.status()).toBe(201);
      expect(bypasses, 'a successful finalise records each bypass exactly once').toHaveLength(1);
      expect(finalised).toHaveLength(1);
    }
  });

  // ── Engine remediation: LER-1270 / 1271 / 1272 (unit cases folded in from
  //    the 24 Aug tranche-1 draft, plus deployed-shape API coverage) ─────────

  test('an impossible calendar date is blocking — the engine now agrees with the input layer', async ({
    request,
  }) => {
    // LER-1270. The input layer already rejects impossible dates (see
    // uk-dates.spec.ts "an impossible date is rejected at input"); the engine
    // used to accept them because its validity pass was shape-only, and the
    // API accepts values from any client. Engine-level cases first — from the
    // tranche-1 draft:
    const mg12 = getFormTemplate('MG12')!;
    for (const bad of ['2026-13-45', '2026-02-31', '2026-02-29']) {
      const issues = checkDateLogic(mg12, { dateCompiled: bad });
      expect(issues, `${bad} must block`).toHaveLength(1);
      expect(issues[0].severity).toBe('blocking');
    }
    expect(checkDateLogic(mg12, { dateCompiled: '2024-02-29' })).toHaveLength(0); // real leap day
    expect(isRealIsoDate('2026-02-31')).toBe(false);
    expect(isRealIsoDate('2026-02-28')).toBe(true);

    // And against the running API — the writer the input layer cannot police.
    const { draft } = await createDraft(request, 'MG12', null);
    const saved = await saveValues(
      request,
      draft.id,
      { urn: '01AB0456321/26', dateCompiled: '2026-02-31' },
      draft.version,
    );
    const { report } = await review(request, saved.id);
    const flagged = issuesOf(report).find((i) => i.id === 'dateLogic:invalid:dateCompiled');
    expect(flagged, 'the stored impossible date is a finding').toBeTruthy();
    expect(flagged!.severity).toBe('blocking');

    const fixed = await saveValues(
      request,
      saved.id,
      { urn: '01AB0456321/26', dateCompiled: '2026-02-28' },
      saved.version,
    );
    const clean = await review(request, fixed.id);
    expect(issuesOf(clean.report).some((i) => i.id === 'dateLogic:invalid:dateCompiled')).toBe(false);
  });

  test('a half-filled sensitive schedule row is a blocking completeness issue naming the section', async ({
    request,
  }) => {
    // LER-1272. Existing is not complete: with the section active, a row with
    // blank required columns must block — previously only emptiness did.
    const { draft } = await createDraft(request, 'MG6', null);
    const saved = await saveValues(
      request,
      draft.id,
      {
        unusedMaterialItems: [
          { __id: 'r1', itemReference: 'UM-1', description: 'Surveillance log',
            materialType: 'document', classification: 'sensitive' },
        ],
      },
      draft.version,
    );
    const confirm = await request.post(`/api/drafts/${saved.id}/sensitive/confirmations`, {
      data: { kind: 'HANDLING_INSTRUCTIONS' },
    });
    expect(confirm.status()).toBe(201);
    const { id: confirmationId } = await confirm.json();

    // A row whose required columns are blank — description only.
    const half = await saveValues(
      request,
      saved.id,
      {
        unusedMaterialItems: saved.values['unusedMaterialItems'] as unknown[],
        sensitiveScheduleItems: [{ __id: 's1', description: 'Half-filled entry', location: '', sensitivityReason: '' }],
      },
      saved.version,
      { sensitiveConfirmationId: confirmationId },
    );
    const withIssue = await review(request, half.id);
    const flagged = issuesOf(withIssue.report).find(
      (i) => i.id === 'completeness:sensitive-incomplete:sensitiveScheduleItems',
    );
    expect(flagged, 'the half-filled row blocks').toBeTruthy();
    expect(flagged!.severity).toBe('blocking');
    // Wording discipline: the SECTION is named, never the row's content.
    expect(flagged!.message).toContain('Sensitive material schedule');
    expect(flagged!.message).not.toContain('Half-filled entry');

    const completed = await saveValues(
      request,
      half.id,
      {
        unusedMaterialItems: saved.values['unusedMaterialItems'] as unknown[],
        sensitiveScheduleItems: [{ __id: 's1', description: 'Half-filled entry',
          location: 'DS safe', sensitivityReason: 'Reveals a technique' }],
      },
      half.version,
      { sensitiveConfirmationId: confirmationId },
    );
    const clean = await review(request, completed.id);
    expect(
      issuesOf(clean.report).some((i) => i.id === 'completeness:sensitive-incomplete:sensitiveScheduleItems'),
    ).toBe(false);
  });

  test('a failed ordering identifies the operand by id, matching the suppressed branch', async () => {
    // LER-1271, from the tranche-1 draft: the interface documents
    // relatedFieldId as a field id or case:<path>; the failed branch used the
    // display label, which downstream keyed acknowledgement-bearing issue ids
    // (and so ADVISORY_BYPASSED audit rows) on mutable copy.
    const mg4 = getFormTemplate('MG4')!;
    const failed = crossFieldFindings(mg4, { chargeDate: '2026-01-10', hearingDate: '2026-01-05' });
    const ordering = failed.find((f) => f.kind === 'order' && !f.suppressed);
    expect(ordering, 'the sibling ordering fires').toBeTruthy();
    expect(ordering!.relatedFieldId, 'id, not label').toBe('chargeDate');
    // The human label still belongs to the MESSAGE.
    expect(ordering!.message).toContain('hearing');
  });

  test('a clean run shows the green Ready to Finalise state', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG12', null);
    await saveValues(
      request,
      draft.id,
      completeMg12Values('01AB0456321/26', 'PC/1 — CCTV — PC Hughes — store — attached'),
      draft.version,
    );
    await page.goto(`/drafts/${draft.id}`);
    await page.getByTestId('review-trigger').click();
    await expect(page.getByTestId('review-ready')).toContainText('Ready to Finalise');
    await expect(page.getByTestId('finalise-button')).toBeEnabled();
    // The reviewed draft stays on the work queue (Q1).
    const listed = await (await request.get('/api/drafts')).json();
    expect(listed.some((d: { id: string }) => d.id === draft.id)).toBe(true);
  });
});
