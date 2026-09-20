import { expect, test } from './support/fixtures';
import {
  QUEUE_SPREAD_NON_MG1,
  caseFor,
  createDraft,
  queueCodes,
  queueRows,
  seedQueueSpread, getCases } from './support/api';

const EXPECTED_CODES = [
  'MG1',
  'MG2',
  'MG3',
  'MG4',
  'MG5',
  'MG6',
  'MG11',
  'MG12',
  'MG14',
  'MG15',
  'MG16',
];

test.describe('Dashboard layout', () => {
  test.beforeAll(async ({ request }) => {
    // Paging, filtering and sorting need a queue with a SPREAD of form codes, not
    // merely a populated one — see seedQueueSpread for the three properties and
    // why topping up to a minimum was not enough.
    await seedQueueSpread(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-form-code]').first()).toBeVisible();
  });

  test('form picker is the first section, ahead of the work queue and cases', async ({ page }) => {
    // evaluateAll does not auto-wait, so make sure every section has rendered.
    await expect(page.locator('[data-testid="case-list"]')).toBeVisible();
    const order = await page
      .locator('[data-testid="form-picker"], [data-testid="in-progress"], [data-testid="case-list"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(order).toEqual(['form-picker', 'in-progress', 'case-list']);
  });

  test('picker is fully visible without scrolling at 1366x768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const box = await page.locator('[data-testid="form-picker"]').boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  });

  test('picker is fully visible without scrolling at 1920x1080', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const box = await page.locator('[data-testid="form-picker"]').boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y + box!.height).toBeLessThanOrEqual(1080);
  });

  test('all 11 cards lay out 4-up on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const boxes = await page
      .locator('[data-form-code]')
      .evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { top: Math.round(r.top), left: Math.round(r.left) };
        }),
      );
    expect(boxes).toHaveLength(11);
    // Four columns, so eleven cards occupy three rows.
    expect(new Set(boxes.map((b) => b.left)).size).toBe(4);
    expect(new Set(boxes.map((b) => b.top)).size).toBe(3);
  });

  test('queue shows 6 drafts by default', async ({ page }) => {
    await expect(queueRows(page)).toHaveCount(6);
  });

  test('view-all toggle expands the full queue and collapses again', async ({ page }) => {
    const toggle = page.getByTestId('drafts-view-all');
    const total = Number((await toggle.textContent())!.match(/\((\d+)\)/)![1]);
    expect(total).toBeGreaterThan(6);

    await toggle.click();
    await expect(queueRows(page)).toHaveCount(total);
    await expect(toggle).toHaveText(/Show fewer/);

    await toggle.click();
    await expect(queueRows(page)).toHaveCount(6);
    await expect(toggle).toHaveText(/View all/);
  });

  test('filter narrows the queue by form code', async ({ page }) => {
    await page.getByTestId('drafts-view-all').click();
    // Deterministic wait: eventCoalescing renders on the next animation
    // frame, so the expansion must have LANDED (the toggle re-labels in the
    // same render pass) before any instant read.
    await expect(page.getByTestId('drafts-view-all')).toHaveText(/Show fewer/);
    const unfiltered = await queueCodes(page);
    const before = unfiltered.length;

    // Precondition, asserted rather than assumed: the queue must contain a code
    // the filter will NOT match, or "narrows" is unprovable. `MG1` is a prefix of
    // MG11/MG12/MG16, so a queue of only those would match everything and this
    // test would fail for a reason that says nothing about filtering.
    const nonMatching = unfiltered.filter((c) => !c.trim().startsWith('MG1'));
    expect(
      nonMatching.length,
      `the queue needs a non-MG1 code to narrow away; seedQueueSpread supplies ${QUEUE_SPREAD_NON_MG1.join(', ')}`,
    ).toBeGreaterThan(0);

    await page.getByTestId('drafts-filter').fill('MG1');
    // The filter strictly narrows (asserted above), so the row count must
    // change — an auto-retrying sentinel for the coalesced re-render.
    await expect(queueRows(page)).not.toHaveCount(before);
    const codes = await queueCodes(page);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.length).toBeLessThan(before);
    expect(codes.every((c) => c.trim().startsWith('MG1'))).toBe(true);
  });

  test('filter matches defendant name and URN', async ({ page }) => {
    const bellamy = await caseFor(page.request, 'Marcus Bellamy');
    await page.getByTestId('drafts-view-all').click();
    // Same coalesced-render race as the sort tests: land the expansion, then
    // land the narrowing, before any instant count() read.
    await expect(page.getByTestId('drafts-view-all')).toHaveText(/Show fewer/);
    const beforeCount = await queueRows(page).count();

    await page.getByTestId('drafts-filter').fill('Bellamy');
    await expect(queueRows(page)).not.toHaveCount(beforeCount);
    const byName = await queueRows(page).count();
    expect(byName).toBeGreaterThan(0);
    await expect(queueRows(page).first()).toContainText('Marcus Bellamy');

    await page.getByTestId('drafts-filter').fill(bellamy.urn);
    await expect(queueRows(page)).toHaveCount(byName);
  });

  test('filter with no matches shows the empty-filter state', async ({ page }) => {
    await page.getByTestId('drafts-filter').fill('zzzz-no-such-draft');
    await expect(page.getByTestId('drafts-no-matches')).toBeVisible();
    await expect(page.getByTestId('drafts-no-matches')).toContainText('No drafts match your filter');
    await expect(queueRows(page)).toHaveCount(0);
  });

  test('sort by form code changes the order', async ({ page }) => {
    await page.getByTestId('drafts-view-all').click();
    // Deterministic waits, no sleeps (CI run 32953783522 caught this test
    // reading between the click and the COALESCED render — eventCoalescing
    // schedules change detection on an animation frame, and neither
    // queueCodes read auto-waits): the toggle re-labels in the same render
    // pass as the expansion, so its text is the expansion's sentinel...
    await expect(page.getByTestId('drafts-view-all')).toHaveText(/Show fewer/);
    const byRecent = await queueCodes(page);

    // Precondition, asserted rather than assumed: a queue of one repeated code
    // cannot be reordered, so sorting it would be indistinguishable from not
    // sorting. seedQueueSpread creates the highest code first and a low one last
    // precisely so recency order and code order cannot coincide.
    expect(
      new Set(byRecent.map((c) => c.trim())).size,
      'the queue needs at least two distinct form codes for sorting to be observable',
    ).toBeGreaterThan(1);

    await page.getByTestId('drafts-sort').click();
    await page.getByTestId('drafts-sort-code').click();
    // ...and the re-sort's sentinel is the reorder itself landing (the
    // precondition above guarantees code order differs from recency order).
    await expect.poll(() => queueCodes(page)).not.toEqual(byRecent);
    const byCode = await queueCodes(page);

    expect(byCode).not.toEqual(byRecent);
    // MG codes sort numerically: MG5 before MG11.
    const ranks = byCode.map((c) => Number(c.trim().replace(/\D+/g, '')));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  test('sort by case puts standalone drafts last', async ({ page, request }) => {
    const standalone = await createDraft(request, 'MG14', null);
    expect(standalone.draft.caseId).toBeNull();

    await page.reload();
    await page.getByTestId('drafts-view-all').click();
    await expect(page.getByTestId('drafts-view-all')).toHaveText(/Show fewer/);
    const byRecent = await queueRows(page).allTextContents();
    await page.getByTestId('drafts-sort').click();
    await page.getByTestId('drafts-sort-case').click();
    // The just-created standalone draft is the most RECENT row but case
    // order puts it last, so the orders must differ — the reorder landing
    // is the coalesced render's sentinel (same race as sort-by-code).
    await expect.poll(() => queueRows(page).allTextContents()).not.toEqual(byRecent);

    const labels = await queueRows(page).allTextContents();
    const lastStandalone = labels.findLastIndex((t) => t.includes('Standalone'));
    const lastLinked = labels.findLastIndex((t) => !t.includes('Standalone'));
    expect(lastStandalone).toBeGreaterThan(lastLinked);
  });

  test('each row shows required-field progress computed from the template', async ({ page }) => {
    const row = queueRows(page).first();
    // "N of M required" plus the percentage the redesign adds.
    await expect(row.locator('.meter-text')).toHaveText(/\d+ of \d+ required · \d+%/);
    await expect(row.locator('.meter')).toBeVisible();

    // The bar's width must agree with the percentage it reports. (A 0% bar is
    // zero-width, so assert the style rather than visibility.)
    const label = (await row.locator('.meter-text').textContent())!;
    const [, done, total, percent] = label.match(/(\d+) of (\d+) required · (\d+)%/)!;
    expect(Number(percent)).toBe(Math.round((Number(done) / Number(total)) * 100));
    const width = await row.locator('.meter-fill').evaluate((el) => (el as HTMLElement).style.width);
    expect(width).toBe(`${percent}%`);
  });

  test('last-saved shows relative time with the exact timestamp on hover', async ({ page }) => {
    const saved = queueRows(page).first().locator('.draft-saved');
    await expect(saved).toHaveText(/ago|just now|yesterday/);
    // Material renders the exact timestamp as a tooltip on hover.
    await saved.hover();
    await expect(page.locator('.mat-mdc-tooltip')).toContainText(/\d{1,2} \w{3} \d{4}, \d{2}:\d{2}/);
  });

  test('rows remain full-row links that resume the draft', async ({ page }) => {
    const row = queueRows(page).first();
    const href = await row.getAttribute('href');
    expect(href).toMatch(/^\/drafts\/.+/);

    await row.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByTestId('form-header')).toBeVisible();
  });

  test('empty queue shows the friendly empty state', async ({ page }) => {
    await page.route('**/api/drafts', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: [] });
      } else {
        await route.fallback();
      }
    });
    await page.goto('/');

    await expect(page.getByTestId('drafts-empty')).toBeVisible();
    await expect(page.getByTestId('drafts-empty')).toContainText(
      'Nothing in progress — pick a form above to get started',
    );
    // Controls are pointless with nothing to filter.
    await expect(page.getByTestId('drafts-filter')).toHaveCount(0);
  });

test('the nav offers only destinations that exist', async ({ page }) => {
    // No notification bell, settings or favourites — nothing pointing
    // nowhere. UC-10 added the third real destination: the archive.
    const items = page.locator('[data-testid="app-nav"] a');
    await expect(items).toHaveCount(3);
    await expect(items).toHaveText([/Dashboard/, /Cases/, /Archive/]);

    await expect(page.getByTestId('nav-dashboard')).toHaveAttribute('href', '/');
    await expect(page.getByTestId('nav-cases')).toHaveAttribute('href', /#cases/);
    await expect(page.getByTestId('nav-archive')).toHaveAttribute('href', '/archive');
  });

  test('the app bar shows the signed-in user and their initials', async ({ page, request }) => {
    const me = await (await request.get('/api/me')).json();
    const bar = page.getByTestId('app-user');
    await expect(bar).toContainText(me.name);

    const initials = me.name
      .split(/\s+/)
      .slice(0, 2)
      .map((p: string) => p[0].toUpperCase())
      .join('');
    await expect(bar.locator('.user-avatar')).toHaveText(initials);
  });

  test('hero stat tiles match the real API counts', async ({ page, request }) => {
    const [drafts, cases, templates] = await Promise.all([
      (await request.get('/api/drafts')).json(),
      (await request.get('/api/cases')).json(),
      (await request.get('/api/form-templates')).json(),
    ]);

    await expect(page.getByTestId('stat-in-progress')).toContainText(String(drafts.length));
    await expect(page.getByTestId('stat-cases')).toContainText(String(cases.length));
    await expect(page.getByTestId('stat-forms')).toContainText(String(templates.length));
    // Real counts only — no invented percentages or scores.
    await expect(page.getByTestId('hero-stats')).not.toContainText('%');
  });

  test('picker cards carry the real code, name and description from the template', async ({
    page,
    request,
  }) => {
    const templates = await (await request.get('/api/form-templates')).json();
    expect(templates).toHaveLength(11);

    for (const template of templates) {
      const card = page.locator(`[data-form-code="${template.code}"]`);
      await expect(card.locator('.card-code')).toHaveText(template.code);
      await expect(card.locator('.card-name')).toHaveText(template.name);
      await expect(card.locator('.card-desc')).toHaveText(template.description);
    }
    // Templates are not drafts: no completion bars on these cards.
    await expect(page.locator('[data-form-code] .meter')).toHaveCount(0);
  });

  test('Continue resumes the draft belonging to its own row', async ({ page }) => {
    const row = queueRows(page).first();
    const href = await row.getAttribute('href');
    expect(href).toMatch(/^\/drafts\/.+/);

    await page.locator('[data-testid="draft-continue"]').first().click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByTestId('form-header')).toBeVisible();
  });

  test('section headers carry counts', async ({ page, request }) => {
    await expect(page.locator('[data-testid="form-picker"] h2')).toContainText('· 11');
    await expect(page.locator('[data-testid="in-progress"] h2')).toContainText('·');
    // Derived, not pinned: the accessible-case count moves when dedicated
    // suite fixtures are seeded (LER-1269, e2e/FIXTURES.md).
    const caseCount = (await getCases(request)).length;
    await expect(page.locator('[data-testid="case-list"] h2')).toContainText(`· ${caseCount}`);
  });

  test('cards keep [data-form-code] and render code, name and description', async ({ page }) => {
    for (const code of EXPECTED_CODES) {
      const card = page.locator(`[data-form-code="${code}"]`);
      await expect(card).toHaveCount(1);
      await expect(card.locator('.card-code')).toHaveText(code);
      await expect(card.locator('.card-name')).not.toBeEmpty();
      await expect(card.locator('.card-desc')).not.toBeEmpty();
    }
  });

  test('card descriptions expose full text via tooltip when truncated', async ({ page }) => {
    const desc = page.locator('[data-form-code="MG3"] .card-desc');
    await desc.hover();
    await expect(page.locator('.mat-mdc-tooltip')).toContainText('charging decision');
  });

  test('case rows still link to the case detail page', async ({ page }) => {
    const row = page.locator('[data-testid="case-list"] a').first();
    const href = await row.getAttribute('href');
    expect(href).toMatch(/^\/cases\/.+/);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test('degrades at narrow width: cards wrap, rows stack', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 900 });
    await page.goto('/');
    // Re-navigating drops the beforeEach wait; evaluateAll would otherwise read
    // an empty card list before the templates arrive.
    await expect(page.locator('[data-form-code]')).toHaveCount(11);

    const tops = await page
      .locator('[data-form-code]')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBeGreaterThan(2);

    // No horizontal overflow at narrow width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
