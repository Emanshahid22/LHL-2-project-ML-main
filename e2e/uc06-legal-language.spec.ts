import { expect, test } from './support/fixtures';
import { type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPLETENESS_HINTS,
  INFORMAL_PATTERNS,
  STANDARD_PHRASES,
  canProposeVerbatim,
} from '@mgs/shared';
import { auditEventsFor, createDraft, getDraft, saveValues } from './support/api';

/**
 * UC-06 Legal Language Assistance.
 *
 * One check per line of the scope's Definition of Done, plus the story criteria.
 * The four DoD lines, verbatim:
 *
 *  1. "Legal language assistance suggestions appear correctly in the side panel
 *     for MG5 and MG11"
 *  2. "Suggestions are never auto-applied — verified by automated test that
 *     confirms text field is unchanged without a user Insert action"
 *  3. "Insert action correctly places text at cursor position and logs the action
 *     in the audit trail"
 *  4. "Panel degrades gracefully when language AI service is unavailable — no
 *     errors surfaced to user"
 *
 * A note on DoD 3, because it shapes several tests. Nothing in the default build
 * proposes wording: `STANDARD_PHRASES` ships empty and no informal alternative
 * could be attributed, so `canProposeVerbatim` leaves every in-process prompt
 * observation-only. That is the epic's central rule, not a gap. The insert
 * mechanic is therefore exercised through a *configured* assistance service —
 * stubbed at the browser boundary, which is a supported configuration — whose
 * prompt carries a source and so is entitled to propose. The same stub proves the
 * gate: a prompt without a source arrives with its wording stripped.
 */

/** Informal wording, no time, no date, no mention of who else was there. */
const NARRATIVE =
  'The group kicked off outside the shop and I saw one of them throw a bottle at the window.';

/** The same account with a time, so the scope's hint must fall silent. */
const NARRATIVE_WITH_TIME =
  'At about 11:15pm the group gathered outside the shop and I saw one of them throw a bottle.';

/** The scope's one worked example of a completeness hint, verbatim. */
const TIME_HINT = 'You have not recorded the time of the incident';

/** MG5's longest prose box — the field the DoD's "MG5" half hangs on. */
const MG5_NARRATIVE_FIELD = 'summaryOfCircumstances';

const SOURCED_PROMPT = {
  id: 'sourced-1',
  kind: 'phrase',
  message: 'Standard wording for describing CCTV continuity.',
  insertText: 'I have viewed the footage in full. ',
  provenance: 'documented',
  source: 'Stubbed assistance service, for the purposes of this test only.',
};

const UNSOURCED_PROMPT = {
  id: 'unsourced-1',
  kind: 'informal',
  message: 'This phrasing reads informally.',
  // Proposes wording with no citation. It must arrive with the wording gone.
  insertText: 'Some plausible-sounding courtroom phrasing.',
  provenance: 'likely',
};

/** A locator for one narrative on a form that has several (MG5 has four). */
function narrative(page: Page, fieldId: string) {
  // The renderer's field row and the narrative component both carry
  // data-field-id, so this pins the component itself — a selector matching both
  // would count every mark inside it twice.
  return page.locator(`[data-testid="narrative-field"][data-field-id="${fieldId}"]`);
}

function narrativeInput(page: Page, fieldId: string) {
  return page.locator(`[data-field-id="${fieldId}"] [data-testid="narrative-input"]`);
}

function panelFor(page: Page, fieldId: string) {
  return page.locator(`[data-testid="language-assistant"][data-field-id="${fieldId}"]`);
}

function promptsFor(page: Page, fieldId: string) {
  return panelFor(page, fieldId).getByTestId('assistance-prompt');
}

/** Stubs the assistance proxy at the browser boundary. */
async function stubService(
  page: Page,
  body: { prompts: unknown[]; enabled?: boolean; degraded?: boolean },
): Promise<void> {
  await page.route('**/api/language/prompts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: true, degraded: false, ...body }),
    }),
  );
}

/** Collects console errors so "no errors surfaced" can be asserted literally. */
function watchConsole(page: Page): { errors: string[]; crashes: string[] } {
  const errors: string[] = [];
  const crashes: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => crashes.push(err.message));
  return { errors, crashes };
}

/** An MG5 draft whose narrative already holds `text`. */
async function mg5With(
  request: Parameters<typeof createDraft>[0],
  text: string,
  fieldId: string = MG5_NARRATIVE_FIELD,
): Promise<string> {
  const { draft } = await createDraft(request, 'MG5', null);
  await saveValues(request, draft.id, { [fieldId]: text }, draft.version);
  return draft.id;
}

/** Walks the MG11 wizard to the statement-narrative step. */
async function mg11Narrative(page: Page, draftId: string): Promise<void> {
  await page.goto(`/drafts/${draftId}`);
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-step-position')).toContainText('Step 2 of 4');
}

test.describe('UC-06 Legal Language Assistance', () => {
  // ── DoD 1: suggestions appear in the side panel for MG5 and MG11 ──────────

  test('DoD 1 — the panel appears for an MG5 narrative and lists prompts', async ({
    page,
    request,
  }) => {
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);

    // Before UC-06, MG5's prose was a plain textarea with no highlighting at all.
    await expect(narrativeInput(page, MG5_NARRATIVE_FIELD)).toBeVisible();

    // The scope's trigger: the panel opens when the narrative field is focused.
    // Its collapsed header is there beforehand — a panel nobody can find is not
    // collapsible, it is absent — but it holds no suggestions until focus.
    const panel = panelFor(page, MG5_NARRATIVE_FIELD);
    await expect(panel).toContainText('Legal Language Assistant');
    await expect(panel.getByTestId('assistant-body')).toHaveCount(0);

    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();
    await expect(panel.getByTestId('assistant-body')).toBeVisible();

    await expect(promptsFor(page, MG5_NARRATIVE_FIELD).first()).toBeVisible();
    // Two of the three prompt sources the scope names, from one narrative: an
    // informal flag and completeness hints. The third (standard phrasing) has an
    // empty registry by design.
    await expect(panel.locator('[data-prompt-kind="informal"]')).toHaveCount(1);
    await expect(panel.locator('[data-prompt-kind="completeness"]')).not.toHaveCount(0);
    await expect(panel).toContainText(TIME_HINT);
  });

  test('DoD 1 — the panel appears for the MG11 statement narrative', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await saveValues(request, draft.id, { statementText: NARRATIVE }, draft.version);

    await mg11Narrative(page, draft.id);
    await expect(panelFor(page, 'statementText').getByTestId('assistant-body')).toHaveCount(0);
    await page.getByTestId('narrative-input').focus();
    await expect(panelFor(page, 'statementText').getByTestId('assistant-body')).toBeVisible();
    await expect(panelFor(page, 'statementText')).toContainText(TIME_HINT);
    await expect(promptsFor(page, 'statementText').first()).toBeVisible();
  });

  test('DoD 1 — a textarea that is not a declared narrative gets no panel and no marks', async ({
    page,
    request,
  }) => {
    // MG5's charge list is a textarea holding charges, not prose. Flagging "I
    // think" inside it, or offering it formal phrasing, would be a category error.
    const draftId = await mg5With(
      request,
      'I think the group kicked off at the shop',
      'chargesList',
    );
    await page.goto(`/drafts/${draftId}`);

    const cell = page.locator('[data-field-id="chargesList"]');
    await expect(cell).toBeVisible();
    await expect(cell.locator('app-narrative-field')).toHaveCount(0);
    await expect(cell.getByTestId('narrative-backdrop')).toHaveCount(0);
    await cell.locator('textarea').focus();
    await expect(panelFor(page, 'chargesList')).toHaveCount(0);
  });

  test('the panel says what it does not know when it has nothing to suggest', async ({
    page,
    request,
  }) => {
    // An account with a time, a date, a place and who was present, and no
    // informal wording: nothing for the assistant to say. Silence must not read
    // as approval.
    const draftId = await mg5With(
      request,
      'At about 11:15pm on Tuesday 3 June I was outside the shop on Bridge Street with my colleague when the window broke.',
    );
    await page.goto(`/drafts/${draftId}`);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();

    await expect(promptsFor(page, MG5_NARRATIVE_FIELD)).toHaveCount(0);
    const empty = panelFor(page, MG5_NARRATIVE_FIELD).getByTestId('assistance-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('only checks the patterns it has been given');
    await expect(empty).toContainText('not a review of the statement');
  });

  test('an empty narrative produces no prompts at all', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG5', null);
    await page.goto(`/drafts/${draft.id}`);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();

    // An unstarted statement is not an incomplete one.
    await expect(promptsFor(page, MG5_NARRATIVE_FIELD)).toHaveCount(0);
    await expect(panelFor(page, MG5_NARRATIVE_FIELD)).toContainText('Nothing to suggest');
  });

  test('the scope’s completeness hint fires only when no time is recorded', async ({
    page,
    request,
  }) => {
    const draftId = await mg5With(request, NARRATIVE_WITH_TIME);
    await page.goto(`/drafts/${draftId}`);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();

    await expect(panelFor(page, MG5_NARRATIVE_FIELD)).not.toContainText(TIME_HINT);
    // …and the hint's own provenance is the scope document itself.
    const hint = COMPLETENESS_HINTS.find((h) => h.message === TIME_HINT)!;
    expect(hint.provenance).toBe('documented');
    expect(hint.source).toContain('mg-forms-scope');
  });

  test('an informal phrase is marked in the text and listed in the panel', async ({
    page,
    request,
  }) => {
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();

    const mark = narrative(page, MG5_NARRATIVE_FIELD)
      .locator('[data-testid="narrative-flag"][data-flag-kind="informal"]')
      .first();
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText('kicked off');

    const informal = panelFor(page, MG5_NARRATIVE_FIELD).locator('[data-prompt-kind="informal"]');
    await expect(informal).toHaveCount(1);
    await expect(informal).toContainText('kicked off');
    // The amber mark and its panel entry describe the same phrase, and the count
    // is stated as text — colour is never the only carrier.
    await expect(
      narrative(page, MG5_NARRATIVE_FIELD).getByTestId('narrative-informal-count'),
    ).toHaveText('1 informal');
  });

  // ── DoD 2: suggestions are never auto-applied ────────────────────────────

  test('DoD 2 — the narrative is byte-identical with prompts shown and no Insert pressed', async ({
    page,
    request,
  }) => {
    // A configured service that DOES propose wording, so this is the strongest
    // form of the check: an insertable suggestion is on screen and unpressed.
    await stubService(page, { prompts: [SOURCED_PROMPT] });
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);

    const input = narrativeInput(page, MG5_NARRATIVE_FIELD);
    await input.focus();
    await expect(
      panelFor(page, MG5_NARRATIVE_FIELD).getByTestId('assistance-insert').first(),
    ).toBeVisible();

    // Long enough for every debounce in the component (300ms) and the autosave
    // (1.5s) to have fired.
    await page.waitForTimeout(2200);
    expect(await input.inputValue()).toBe(NARRATIVE);

    // Dismissing, re-analysing and refocusing must not change it either.
    await panelFor(page, MG5_NARRATIVE_FIELD).getByTestId('assistance-dismiss').first().click();
    await input.blur();
    await input.focus();
    await page.waitForTimeout(600);
    expect(await input.inputValue()).toBe(NARRATIVE);

    // And the stored draft still holds exactly what was saved.
    const draft = await getDraft(request, draftId);
    expect(draft.values[MG5_NARRATIVE_FIELD]).toBe(NARRATIVE);
  });

  test('DoD 2 — the narrative control is written in exactly one place', async () => {
    // A behavioural test proves today's build; this protects the guarantee from
    // the next refactor, in the shape UC-02 uses for its case-write-path guard.
    const source = readFileSync(
      join(
        process.cwd(),
        'apps/web/src/app/features/form-fill/narrative-field/narrative-field.ts',
      ),
      'utf8',
    );
    const writes = source.match(/\.setValue\(|\.patchValue\(|\.setRawValue\(/g) ?? [];
    expect(writes, 'the narrative may be written in exactly one place').toHaveLength(1);

    const insertHandler = source.slice(source.indexOf('insertSuggestion(prompt'));
    expect(insertHandler).toContain('.setValue(');

    // The panel emits; it must never hold a control to write to.
    const panel = readFileSync(
      join(
        process.cwd(),
        'apps/web/src/app/features/form-fill/language-assistant/language-assistant.ts',
      ),
      'utf8',
    );
    expect(panel).not.toContain('setValue');
    expect(panel).not.toContain('FormControl');
  });

  // ── DoD 3: Insert places text at the cursor and logs the action ───────────

  test('DoD 3 — Insert splices at the cursor, leaves the caret after it, and is audited', async ({
    page,
    request,
  }) => {
    await stubService(page, { prompts: [SOURCED_PROMPT] });
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);

    const input = narrativeInput(page, MG5_NARRATIVE_FIELD);
    await input.click();
    // Mid-text, deliberately not at the end: the scope says "at the cursor
    // position", and appending would be the easy, wrong implementation.
    const caretAt = NARRATIVE.indexOf('outside');
    await input.evaluate((el, at) => {
      (el as HTMLTextAreaElement).setSelectionRange(at, at);
    }, caretAt);

    const insert = panelFor(page, MG5_NARRATIVE_FIELD).getByTestId('assistance-insert').first();
    await expect(insert).toBeEnabled();
    await insert.click();

    const expected =
      NARRATIVE.slice(0, caretAt) + SOURCED_PROMPT.insertText + NARRATIVE.slice(caretAt);
    await expect(input).toHaveValue(expected);
    const caret = await input.evaluate((el) => (el as HTMLTextAreaElement).selectionStart);
    expect(caret).toBe(caretAt + SOURCED_PROMPT.insertText.length);

    // …and the audit trail records the action, with the suggestion text the
    // scope's post-condition asks for and none of the witness's own words.
    await expect.poll(async () => {
      const events = await auditEventsFor(draftId);
      return events.filter((e) => e.action === 'LANGUAGE_SUGGESTION_INSERTED').length;
    }, { timeout: 10_000 }).toBe(1);

    const row = (await auditEventsFor(draftId)).find(
      (e) => e.action === 'LANGUAGE_SUGGESTION_INSERTED',
    )!;
    expect(row.metadata).toMatchObject({
      fieldId: MG5_NARRATIVE_FIELD,
      promptId: `service:${SOURCED_PROMPT.id}`,
      kind: 'phrase',
      suggestionText: SOURCED_PROMPT.insertText,
    });
    // The narrative itself never reaches the audit trail.
    expect(JSON.stringify(row.metadata)).not.toContain('kicked off');
    expect(JSON.stringify(row.metadata)).not.toContain(NARRATIVE);
  });

  test('DoD 3 — Insert replaces a selection, as a text editor would', async ({ page, request }) => {
    await stubService(page, { prompts: [SOURCED_PROMPT] });
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);

    const input = narrativeInput(page, MG5_NARRATIVE_FIELD);
    await input.click();
    const start = NARRATIVE.indexOf('kicked off');
    const end = start + 'kicked off'.length;
    await input.evaluate(
      (el, range) => {
        (el as HTMLTextAreaElement).setSelectionRange(range[0], range[1]);
      },
      [start, end],
    );

    await panelFor(page, MG5_NARRATIVE_FIELD).getByTestId('assistance-insert').first().click();
    await expect(input).toHaveValue(
      NARRATIVE.slice(0, start) + SOURCED_PROMPT.insertText + NARRATIVE.slice(end),
    );
  });

  test('Insert is disabled until the narrative has a cursor', async ({ page, request }) => {
    await stubService(page, { prompts: [SOURCED_PROMPT] });
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);

    // Open the panel from its own toggle, without ever touching the textarea, so
    // there is no cursor position. Inserting at a guessed position would be an
    // edit the user did not ask for.
    await panelFor(page, MG5_NARRATIVE_FIELD).getByTestId('assistant-toggle').click();
    const insert = panelFor(page, MG5_NARRATIVE_FIELD).getByTestId('assistance-insert').first();
    await expect(insert).toBeDisabled();
    await expect(
      panelFor(page, MG5_NARRATIVE_FIELD).getByTestId('assistance-no-cursor').first(),
    ).toBeVisible();

    // Placing the caret enables it, and the narrative is still untouched.
    await narrativeInput(page, MG5_NARRATIVE_FIELD).click();
    await expect(insert).toBeEnabled();
    expect(await narrativeInput(page, MG5_NARRATIVE_FIELD).inputValue()).toBe(NARRATIVE);
  });

  // ── DoD 4: graceful degradation ───────────────────────────────────────────

  test('DoD 4 — an unavailable assistance service surfaces nothing to the user', async ({
    page,
    request,
  }) => {
    const seen = watchConsole(page);
    // A configured service that cannot answer — what the API reports when the
    // upstream times out or 5xxs. It answers 200 with `degraded`, deliberately:
    // a 5xx would put a red line in the console for a feature the scope requires
    // to fail silently.
    await stubService(page, { prompts: [], degraded: true });
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();

    const panel = panelFor(page, MG5_NARRATIVE_FIELD);
    // The scope's own wording for this state.
    await expect(panel.getByTestId('assistance-unavailable')).toContainText(
      'Language assistance temporarily unavailable',
    );
    // Degrades to LESS, not to nothing: the in-process rules still work.
    await expect(panel).toContainText(TIME_HINT);
    // Nothing shouted at the user, and nothing in the console.
    await expect(page.locator('mat-snack-bar-container')).toHaveCount(0);

    // Editing and saving are unaffected.
    await narrativeInput(page, MG5_NARRATIVE_FIELD).fill(`${NARRATIVE} It then went quiet.`);
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('save-status')).toContainText(/Saved/i);

    expect(seen.errors, 'no console errors while the service is unavailable').toEqual([]);
    expect(seen.crashes, 'no uncaught errors while the service is unavailable').toEqual([]);
  });

  test('DoD 4 — a request that fails outright is swallowed too', async ({ page, request }) => {
    const seen = watchConsole(page);
    // The harsher case: the request never completes. Chromium logs the failed
    // resource itself, so what is asserted here is that the APP adds nothing —
    // no uncaught error, no error of its own, no lost functionality.
    await page.route('**/api/language/prompts', (route) => route.abort('failed'));
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();

    await expect(panelFor(page, MG5_NARRATIVE_FIELD)).toContainText(TIME_HINT);
    await expect(page.locator('mat-snack-bar-container')).toHaveCount(0);
    expect(seen.crashes).toEqual([]);
    const appErrors = seen.errors.filter((e) => !/language\/prompts|Failed to load resource/i.test(e));
    expect(appErrors, 'the app itself must log nothing').toEqual([]);
  });

  // ── the provenance gate ───────────────────────────────────────────────────

  test('a prompt that cannot attribute its wording may observe but not propose', async ({
    page,
    request,
  }) => {
    await stubService(page, {
      prompts: [
        SOURCED_PROMPT,
        UNSOURCED_PROMPT,
        // Malformed: dropped entirely, without taking the others with it.
        { id: 'broken', kind: 'not-a-kind', message: '' },
      ],
    });
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();

    const panel = panelFor(page, MG5_NARRATIVE_FIELD);
    const sourced = panel.locator('[data-prompt-id="service:sourced-1"]');
    const unsourced = panel.locator('[data-prompt-id="service:unsourced-1"]');

    await expect(sourced).toHaveAttribute('data-can-insert', 'true');
    await expect(sourced.getByTestId('assistance-insert')).toBeVisible();

    // The observation survives; the proposal does not.
    await expect(unsourced).toBeVisible();
    await expect(unsourced).toContainText('reads informally');
    await expect(unsourced).toHaveAttribute('data-can-insert', 'false');
    await expect(unsourced.getByTestId('assistance-insert')).toHaveCount(0);
    await expect(unsourced.getByTestId('assistance-no-proposal')).toBeVisible();
    await expect(unsourced).not.toContainText('plausible-sounding');

    await expect(panel.locator('[data-prompt-id="service:broken"]')).toHaveCount(0);
  });

  test('nothing in the shipped registries proposes wording it cannot cite', async () => {
    // The scope asks for standard phrasing for common evidential descriptions and
    // supplies none, so this ships empty rather than invented. See
    // docs/usecases/uc-06/open-questions.md Q1.
    expect(STANDARD_PHRASES).toEqual([]);
    // Informal patterns observe. An alternative may only ship with a citation.
    for (const pattern of INFORMAL_PATTERNS) {
      if (pattern.suggestion !== undefined) {
        expect(
          canProposeVerbatim({
            provenance: pattern.suggestionProvenance,
            source: pattern.suggestionSource,
          }),
          `${pattern.phrase} proposes wording without provenance 'documented' and a source`,
        ).toBe(true);
      }
    }
    // Every completeness hint is an observation; none carries wording.
    for (const hint of COMPLETENESS_HINTS) {
      expect(Object.keys(hint)).not.toContain('insertText');
      if (hint.provenance === 'documented') expect(hint.source?.trim()).toBeTruthy();
    }
  });

  test('in the default configuration no in-process prompt offers wording', async ({
    page,
    request,
  }) => {
    // No stub: the real API answers `enabled: false`, which is the shipped
    // deployment. Every prompt is advisory and none has anything to insert.
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();

    const prompts = promptsFor(page, MG5_NARRATIVE_FIELD);
    await expect(prompts.first()).toBeVisible();
    const flags = await prompts.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-can-insert')),
    );
    expect(flags.every((f) => f === 'false')).toBe(true);
    await expect(panelFor(page, MG5_NARRATIVE_FIELD).getByTestId('assistance-insert')).toHaveCount(
      0,
    );
  });

  // ── dismissal, the toggle, and non-blocking ───────────────────────────────

  test('a dismissed suggestion stays dismissed for the session and returns after reload', async ({
    page,
    request,
  }) => {
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();

    const panel = panelFor(page, MG5_NARRATIVE_FIELD);
    const before = await panel.getByTestId('assistance-prompt').count();
    expect(before).toBeGreaterThan(1);

    const informal = panel.locator('[data-prompt-kind="informal"]').first();
    await informal.getByTestId('assistance-dismiss').click();
    await expect(panel.locator('[data-prompt-kind="informal"]')).toHaveCount(0);
    // The others are untouched.
    await expect(panel.getByTestId('assistance-prompt')).toHaveCount(before - 1);

    // Typing re-analyses the narrative; the dismissal holds.
    await narrativeInput(page, MG5_NARRATIVE_FIELD).fill(`${NARRATIVE} They kicked off again.`);
    await expect(panel.getByTestId('assistance-prompt').first()).toBeVisible();
    await expect(panel.locator('[data-prompt-kind="informal"]')).toHaveCount(0);

    // A reload is a new session, and the scope says dismissal lasts only one.
    await page.reload();
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();
    await expect(
      panelFor(page, MG5_NARRATIVE_FIELD).locator('[data-prompt-kind="informal"]'),
    ).toHaveCount(1);
  });

  test('turning assistance off hides suggestions and clears informal marks only', async ({
    page,
    request,
  }) => {
    // The scope's alt flow. UC-03's hearsay and opinion flags are NOT language
    // assistance, so this toggle must not quietly remove them.
    const draftId = await mg5With(request, `I think ${NARRATIVE}`);
    await page.goto(`/drafts/${draftId}`);
    const field = narrative(page, MG5_NARRATIVE_FIELD);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();

    await expect(field.locator('[data-flag-kind="informal"]')).toHaveCount(1);
    await expect(field.locator('[data-flag-kind="opinion"]')).toHaveCount(1);

    await panelFor(page, MG5_NARRATIVE_FIELD).getByTestId('assistance-disable').click();
    // The toggle is a preference about the assistant, not about one box, so every
    // narrative on the form follows it — hence the field-scoped locator.
    const off = narrative(page, MG5_NARRATIVE_FIELD).getByTestId('language-assistant-off');
    await expect(off).toBeVisible();
    await expect(panelFor(page, MG5_NARRATIVE_FIELD)).toHaveCount(0);
    await expect(field.locator('[data-flag-kind="informal"]')).toHaveCount(0);
    await expect(field.locator('[data-flag-kind="opinion"]')).toHaveCount(1);

    // And it comes back on request.
    await off.getByTestId('assistance-enable').click();
    await expect(panelFor(page, MG5_NARRATIVE_FIELD)).toBeVisible();
    await expect(field.locator('[data-flag-kind="informal"]')).toHaveCount(1);
  });

  test('collapsing the panel keeps it closed when the narrative is focused again', async ({
    page,
    request,
  }) => {
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);
    const input = narrativeInput(page, MG5_NARRATIVE_FIELD);
    await input.focus();

    const panel = panelFor(page, MG5_NARRATIVE_FIELD);
    await expect(panel.getByTestId('assistant-body')).toBeVisible();
    await panel.getByTestId('assistant-toggle').click();
    await expect(panel.getByTestId('assistant-body')).toHaveCount(0);

    // A user who closed it meant it: refocusing does not reopen it.
    await input.blur();
    await input.focus();
    await expect(panel.getByTestId('assistant-body')).toHaveCount(0);
    // The toggle still opens it.
    await panel.getByTestId('assistant-toggle').click();
    await expect(panel.getByTestId('assistant-body')).toBeVisible();
  });

  test('assistance never blocks saving, progress or navigation', async ({ page, request }) => {
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);
    await narrativeInput(page, MG5_NARRATIVE_FIELD).focus();
    await expect(promptsFor(page, MG5_NARRATIVE_FIELD).first()).toBeVisible();

    // A prompt is not an incomplete field.
    const progress = await page.getByTestId('progress-label').textContent();
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('save-status')).toContainText(/Saved/i);
    expect(await page.getByTestId('progress-label').textContent()).toBe(progress);

    // The control is valid despite the flagged wording, and the value survives.
    const draft = await getDraft(request, draftId);
    expect(draft.values[MG5_NARRATIVE_FIELD]).toBe(NARRATIVE);

    // And on MG11, informal wording does not gate a wizard step.
    const mg11 = await createDraft(request, 'MG11', null);
    await saveValues(request, mg11.draft.id, { statementText: NARRATIVE }, mg11.draft.version);
    await mg11Narrative(page, mg11.draft.id);
    await page.getByTestId('narrative-input').focus();
    await expect(promptsFor(page, 'statementText').first()).toBeVisible();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('wizard-step-position')).toContainText('Step 3 of 4');
  });

  // ── accessibility and the service boundary ───────────────────────────────

  test('the panel is a labelled landmark, keyboard operable, and never steals focus', async ({
    page,
    request,
  }) => {
    const draftId = await mg5With(request, NARRATIVE);
    await page.goto(`/drafts/${draftId}`);
    const input = narrativeInput(page, MG5_NARRATIVE_FIELD);
    await input.focus();

    const panel = panelFor(page, MG5_NARRATIVE_FIELD);
    await expect(panel).toHaveAttribute('role', 'complementary');
    const labelledBy = await panel.getAttribute('aria-labelledby');
    await expect(page.locator(`#${labelledBy}`)).toHaveText('Legal Language Assistant');

    // Prompts have appeared, and the caret is still where the user was typing.
    await expect(panel.getByTestId('assistance-prompt').first()).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(
      'narrative-input',
    );

    // Operable from the keyboard: the toggle collapses on Enter.
    const toggle = panel.getByTestId('assistant-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Dismiss is reachable and operable by keyboard too.
    await page.keyboard.press('Enter');
    await expect(panel.getByTestId('assistant-body')).toBeVisible();
    const dismiss = panel.getByTestId('assistance-dismiss').first();
    await dismiss.focus();
    const dismissed = await panel
      .getByTestId('assistance-prompt')
      .first()
      .getAttribute('data-prompt-id');
    await page.keyboard.press('Space');
    await expect(panel.locator(`[data-prompt-id="${dismissed}"]`)).toHaveCount(0);
  });

  test('the assistance module has no write path to a draft', async () => {
    // Structural, in the shape UC-02's case-write-path guard uses: an accidental
    // future write path fails the build rather than shipping. The difference
    // between "an assistant suggested this and the solicitor accepted it" and
    // "something edited a witness statement" is exactly this boundary.
    const dir = join(process.cwd(), 'apps/api/src/language');
    const files = ['language.module.ts', 'language.controller.ts', 'language-assist.client.ts'];
    for (const file of files) {
      // Comments are stripped first: this is a guard on what the code DOES, and
      // the client's own doc comment names DraftsService to explain its absence.
      const source = readFileSync(join(dir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(source, `${file} must not reach the database`).not.toMatch(/PrismaService|prisma\./);
      expect(source, `${file} must not reach the drafts service`).not.toContain('DraftsService');
      expect(source, `${file} must not mutate anything`).not.toMatch(/@(Patch|Put|Delete)\(/);
      expect(source, `${file} must not touch a draft`).not.toMatch(/formDraft|FormDraft/);
    }
  });

  test('recording an insertion does not modify the draft', async ({ request }) => {
    // The endpoint records; it does not write. The narrative reaches the server by
    // the ordinary autosave PATCH, and a second write path for narrative text is
    // what the never-auto-applied guarantee exists to prevent.
    const draftId = await mg5With(request, NARRATIVE);
    const before = await getDraft(request, draftId);

    const res = await request.post(`/api/drafts/${draftId}/language-insert`, {
      data: {
        fieldId: MG5_NARRATIVE_FIELD,
        promptId: 'phrase:test',
        kind: 'phrase',
        suggestionText: 'Some sourced wording. ',
      },
    });
    expect(res.status()).toBe(204);

    const after = await getDraft(request, draftId);
    expect(after.values).toEqual(before.values);
    expect(after.version).toBe(before.version);

    // A kind outside the union is refused rather than recorded.
    const bad = await request.post(`/api/drafts/${draftId}/language-insert`, {
      data: { fieldId: 'x', promptId: 'y', kind: 'nonsense', suggestionText: 'z' },
    });
    expect(bad.status()).toBe(422);

    // Another user's draft is not found, not merely forbidden.
    const missing = await request.post('/api/drafts/does-not-exist/language-insert', {
      data: {
        fieldId: 'x',
        promptId: 'y',
        kind: 'phrase',
        suggestionText: 'z',
      },
    });
    expect(missing.status()).toBe(404);
  });

  test('UC-03 hearsay and opinion flagging is unchanged by UC-06', async ({ page, request }) => {
    const { draft } = await createDraft(request, 'MG11', null);
    await saveValues(
      request,
      draft.id,
      {
        statementText:
          'I was told that the door was open. In my opinion he was drunk. I think he left at 11:15pm.',
      },
      draft.version,
    );
    await mg11Narrative(page, draft.id);

    // Three marks, two kinds, exactly as UC-03 delivered them.
    await expect(page.locator('[data-testid="narrative-flag"][data-flag-kind="hearsay"]')).toHaveCount(
      1,
    );
    await expect(page.locator('[data-testid="narrative-flag"][data-flag-kind="opinion"]')).toHaveCount(
      2,
    );
    await expect(page.getByTestId('narrative-flag-summary')).toContainText('1 possible hearsay');
    await expect(page.getByTestId('narrative-flag-summary')).toContainText('2 possible opinion');
    await expect(page.getByTestId('narrative-word-count')).toBeVisible();

    // …and the audit metadata still counts them the way it always did.
    await expect
      .poll(async () => {
        const events = await auditEventsFor(draft.id);
        return events.find((e) => e.action === 'DRAFT_SAVED')?.metadata?.['hearsayFlagCount'];
      })
      .toBe(3);
  });
});
