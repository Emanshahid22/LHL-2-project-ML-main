import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseSummaryDto, CreateDraftResponse, FormDraftDto } from '@mgs/shared';

/**
 * Every draft the suite creates is appended to E2E_DRAFT_LOG (when set) so the
 * run can be cleaned up afterwards without touching drafts it did not create.
 */
const DRAFT_LOG = process.env.E2E_DRAFT_LOG;

export function recordDraft(id: string): void {
  if (DRAFT_LOG) appendFileSync(DRAFT_LOG, `${id}\n`);
}

export async function getCases(request: APIRequestContext): Promise<CaseSummaryDto[]> {
  const res = await request.get('/api/cases');
  expect(res.ok(), 'GET /api/cases').toBeTruthy();
  return res.json();
}

/** The seeded case for a given defendant — the suite's fixed reference points. */
export async function caseFor(
  request: APIRequestContext,
  defendantName: string,
): Promise<CaseSummaryDto> {
  const found = (await getCases(request)).find((c) => c.defendantName === defendantName);
  expect(found, `seeded case for ${defendantName}`).toBeTruthy();
  return found!;
}

export async function createDraft(
  request: APIRequestContext,
  formCode: string,
  caseId: string | null = null,
  headers?: Record<string, string>,
): Promise<CreateDraftResponse> {
  const res = await request.post('/api/drafts', { headers, data: { formCode, caseId } });
  expect(res.ok(), `POST /api/drafts ${formCode}`).toBeTruthy();
  const body: CreateDraftResponse = await res.json();
  recordDraft(body.draft.id);
  return body;
}

export async function getDraft(
  request: APIRequestContext,
  id: string,
): Promise<FormDraftDto> {
  const res = await request.get(`/api/drafts/${id}`);
  expect(res.ok(), `GET /api/drafts/${id}`).toBeTruthy();
  return res.json();
}

export async function saveValues(
  request: APIRequestContext,
  id: string,
  values: Record<string, unknown>,
  baseVersion: number,
  /** UC-07: saves that touch the sensitive section carry the confirmation id. */
  extra: { sensitiveConfirmationId?: string } = {},
  headers?: Record<string, string>,
): Promise<FormDraftDto> {
  const res = await request.patch(`/api/drafts/${id}`, { headers, data: { values, baseVersion, ...extra } });
  expect(res.ok(), `PATCH /api/drafts/${id}`).toBeTruthy();
  return res.json();
}

export async function autoFill(request: APIRequestContext, id: string) {
  return request.post(`/api/drafts/${id}/autofill`, { data: {} });
}

/**
 * The spread the queue tests need, in creation order.
 *
 * Deliberately ordered highest-code-first and lowest-code-last: see property 3
 * below. `standalone` rows exist because the sort-by-case test needs both kinds,
 * and one row is pinned to Marcus Bellamy because the filter-by-name test looks
 * for him by name and URN.
 */
const QUEUE_SPREAD: readonly { code: string; link: 'standalone' | 'any' | 'bellamy' }[] = [
  { code: 'MG16', link: 'standalone' },
  { code: 'MG12', link: 'any' },
  { code: 'MG11', link: 'bellamy' },
  { code: 'MG5', link: 'standalone' },
  { code: 'MG4', link: 'any' },
  { code: 'MG3', link: 'bellamy' },
  { code: 'MG2', link: 'standalone' },
  { code: 'MG6', link: 'any' },
];

/**
 * Seeds the work queue with a spread of form codes, unconditionally.
 *
 * Filtering and sorting need three properties a uniform queue cannot provide,
 * and that ambient database state must not be relied on to provide:
 *
 *  1. **More than 6 drafts**, so the view-all toggle has something to expand.
 *  2. **Codes both matching and not matching the prefix `MG1`**, so filtering by
 *     it genuinely narrows the queue. Note `MG11`, `MG12` and `MG16` all start
 *     with `MG1`, so a spread of only those would not narrow anything.
 *  3. **The highest-numbered code created first and a low one last**, so the
 *     recency order and the code order cannot coincide — otherwise sorting by
 *     code is indistinguishable from not sorting.
 *
 * It creates its own drafts on every run rather than topping up to a minimum.
 * A top-up does nothing on a populated database, which is exactly how this
 * drifted into passing against a developer's `dev.db` while failing on every
 * freshly seeded CI database (red on the base branch since `79d6965`).
 */
export async function seedQueueSpread(request: APIRequestContext): Promise<void> {
  const cases = await getCases(request);
  const bellamy = cases.find((c) => c.defendantName === 'Marcus Bellamy');
  expect(bellamy, 'the seeded Marcus Bellamy case').toBeTruthy();

  for (const [i, row] of QUEUE_SPREAD.entries()) {
    const caseId =
      row.link === 'standalone'
        ? null
        : row.link === 'bellamy'
          ? bellamy!.id
          : cases[i % cases.length].id;
    await createDraft(request, row.code, caseId);
  }
}

/** Codes in the spread that the queue filter `MG1` does NOT match. */
export const QUEUE_SPREAD_NON_MG1 = QUEUE_SPREAD.map((r) => r.code).filter(
  (c) => !c.startsWith('MG1'),
);

/** The form codes shown in the "In progress" queue, top to bottom. */
export async function queueCodes(page: Page): Promise<string[]> {
  return page.locator('[data-testid="in-progress"] a[href^="/drafts/"] .draft-code').allTextContents();
}

export function queueRows(page: Page) {
  return page.locator('[data-testid="in-progress"] a[href^="/drafts/"]');
}

/**
 * Audit rows for one draft, read straight from the dev database.
 *
 * There is no audit read endpoint, and UC-04's contract is additive-only, so
 * adding one just to assert a log entry would widen the API's surface for the
 * benefit of a test. Reading the same SQLite file the API writes proves the row
 * exists without inventing surface area.
 */
export async function auditEventsFor(draftId: string): Promise<
  {
    action: string;
    metadata: Record<string, unknown> | null;
    userId: string;
    userEmail: string;
    createdAt: Date;
  }[]
> {
  // Honour an externally supplied DATABASE_URL so a run against a throwaway
  // database — which is what CI does, and what a fresh-database simulation does —
  // reads the same file the API wrote to. Hardcoding dev.db made those runs report
  // phantom "no audit rows" failures that looked like product defects. Falling
  // back to dev.db leaves the ordinary local run behaving exactly as before.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = `file:${join(process.cwd(), 'apps', 'api', 'prisma', 'dev.db')}`;
  }
  // Required lazily: importing Prisma at module load would cost every spec file
  // a client instantiation for the one suite that needs it.
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.auditEvent.findMany({
      where: { formDraftId: draftId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { email: true } } },
    });
    // userId/userEmail and createdAt are returned because UC-07's DoD requires
    // asserting "correct user identity and timestamp" on access events.
    return rows.map(
      (r: {
        action: string;
        metadataJson: string | null;
        userId: string;
        createdAt: Date;
        user: { email: string };
      }) => ({
        action: r.action,
        metadata: r.metadataJson ? JSON.parse(r.metadataJson) : null,
        userId: r.userId,
        userEmail: r.user.email,
        createdAt: r.createdAt,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * UC-07: acknowledgement rows for one draft, read straight from the database —
 * the same reasoning as auditEventsFor: step-up and persistence are proven by
 * counting rows, and adding a read endpoint for a test would widen the API.
 */
export async function acknowledgementsFor(
  draftId: string,
): Promise<{ kind: string; wordingHash: string; userId: string; createdAt: Date }[]> {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = `file:${join(process.cwd(), 'apps', 'api', 'prisma', 'dev.db')}`;
  }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    return await prisma.sensitiveAcknowledgement.findMany({
      where: { draftId },
      orderBy: { createdAt: 'asc' },
      select: { kind: true, wordingHash: true, userId: true, createdAt: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}
