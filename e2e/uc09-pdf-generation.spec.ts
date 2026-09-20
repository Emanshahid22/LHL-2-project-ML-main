import { expect, test } from './support/fixtures';
import { type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DRAFT_BAND_TEXT,
  DOCX_DRAFT_HEADER_TEXT,
  MG11_DECLARATION,
  SENSITIVE_PERMISSION_LEVEL,
  withDeclaredPageCount,
} from '@mgs/shared';
import { caseFor, createDraft, getDraft, recordDraft, saveValues } from './support/api';
import { COLLEAGUE, COLLEAGUE_EMAIL } from './support/auth';

/**
 * UC-09 — PDF Generation & Formatting.
 *
 * Fixture: Nadia Kowalczyk (07ST0990011/26) — RESERVED for this suite by
 * e2e/FIXTURES.md. Writes stay on her case and on standalone drafts; the
 * reference-render baselines (tools/capture-reference-renders) use the same
 * fixture's values statically and never touch the database.
 *
 * Two boundary facts this suite asserts as facts rather than working around:
 * an ACTIVE sensitive schedule whose MG6D was never opened cannot pass the
 * quality gate (the engine's sensitive-incomplete finding blocks generation
 * before any render), so the absent-key RENDER path is unit-layer coverage
 * (render-model.test.mjs), and the e2e assertion is the 409 itself.
 *
 * Text-level PDF assertions use pdftotext (poppler-utils — installed in CI;
 * `apt-get install poppler-utils` locally). The suite fails loudly if it is
 * missing rather than skipping: a skipped DoD check is a hole, not a pass.
 */


const RUN = `R${Date.now().toString(36)}`;

/** MG6D content marker for leak scans — unique to this run. */
const MG6D_MARKER = `Informant-contact-log-${RUN}`;

const STORE_DIR = join(process.cwd(), 'apps', 'api', 'document-store');

// ── helpers ──

/**
 * Wrap-proof comparison form: pdftotext swallows the hyphen when a token
 * wraps at one (soft-hyphenation heuristics), and wrap positions shift with
 * each run's unique token widths — so marker assertions, positive AND
 * negative, compare with hyphens and whitespace removed on both sides.
 */
const flat = (s: string): string => s.replace(/[\s-]+/g, '');

function pdfToText(pdf: Buffer): string[] {
  // Pages split on form-feed; the trailing element after the last \f is empty.
  const text = execFileSync('pdftotext', ['-', '-'], { input: pdf }).toString();
  const pages = text.split('\f');
  if (pages[pages.length - 1] === '') pages.pop();
  return pages;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function prismaDo(fn: (prisma: any) => Promise<any>): Promise<any> {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = `file:${join(process.cwd(), 'apps', 'api', 'prisma', 'dev.db')}`;
  }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** Draft ids this spec generated documents for — cleaned up in afterAll
 *  (jobs/documents/files; the drafts themselves ride E2E_DRAFT_LOG). */
const generatedFor: string[] = [];

async function generatePdf(
  request: APIRequestContext,
  draftId: string,
  headers?: Record<string, string>,
): Promise<{ jobId: string; documentId: string; docx: string }> {
  const start = await request.post(`/api/drafts/${draftId}/pdf`, { headers, data: {} });
  expect(start.status(), 'POST /pdf accepted').toBe(201);
  const { jobId } = await start.json();
  generatedFor.push(draftId);
  for (let i = 0; i < 100; i++) {
    const res = await request.get(`/api/pdf-jobs/${jobId}`, { headers });
    expect(res.ok()).toBeTruthy();
    const job = await res.json();
    if (job.status === 'done') {
      const docJob = await prismaDo((p) =>
        p.pdfJob.findUnique({ where: { id: jobId }, select: { docxDocumentId: true } }),
      );
      return { jobId, documentId: job.documentId, docx: docJob.docxDocumentId };
    }
    if (job.status === 'failed') throw new Error(`job failed: ${job.failureReason}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('job never settled');
}

async function fetchPdf(
  request: APIRequestContext,
  documentId: string,
  mode: 'download' | 'preview' = 'download',
  headers?: Record<string, string>,
): Promise<Buffer> {
  const res = await request.get(`/api/documents/${documentId}/${mode}`, { headers });
  expect(res.ok(), `GET ${mode}`).toBeTruthy();
  return res.body();
}

/** Fill every required MG12 field with deterministic, gate-passing values. */
function mg12Values(): Record<string, unknown> {
  return {
    urn: '07ST0990011/26',
    defendantName: 'Nadia Kowalczyk',
    compiledBy: 'DC 5521 Marsh',
    exhibitEntries: `NK/1 — recovered mobile phone — DC 5521 Marsh — ${RUN}\nNK/2 — call-data schedule — DC 5521 Marsh`,
    storageLocation: 'Weyford property store',
    dateCompiled: '2026-08-01',
  };
}

function mg11Values(): Record<string, unknown> {
  return {
    witnessName: 'Priya Shah',
    witnessDob: '1990-01-15',
    witnessAddress: '12 Example Way\nWeyford',
    statementDate: '2026-08-01',
    statementText:
      `I confirm I produce the recovered mobile phone as exhibit NK/1 (${RUN}). ` +
      'I also refer to XX/99, a reference that no exhibit list defines. ' +
      'The remainder of this statement exists to force pagination across several pages of print output. ' +
      'On the morning in question I was present at the location described and observed events over a sustained period. '.repeat(
        220,
      ),
    exhibitsReferenced: 'NK/1 recovered mobile phone\nNK/3 unrelated listed exhibit',
    declarationConfirmed: true,
    signatureName: 'Priya Shah',
    statementTakenBy: 'DC 5521 Marsh',
  };
}

function mg6Values(withMg6dRow: boolean): Record<string, unknown> {
  return {
    urn: '07ST0990011/26',
    defendantName: 'Nadia Kowalczyk',
    disclosureOfficer: 'DC 5521 Marsh',
    scheduleReference: `MG6-${RUN}`,
    unusedMaterialItems: [
      {
        __id: `row-plain-${RUN}`,
        itemReference: 'UM/1',
        description: 'CCTV hard drive, not relied on',
        materialType: 'digital',
        classification: 'non-sensitive',
      },
      {
        __id: `row-flagged-${RUN}`,
        itemReference: 'UM/2',
        description: `Contact records ${RUN}`,
        materialType: 'document',
        classification: 'sensitive',
      },
    ],
    unusedSummary: 'Two items examined; one classified sensitive.',
    underminesCase: 'no',
    dateCompleted: '2026-08-01',
    ...(withMg6dRow
      ? {
          sensitiveScheduleItems: [
            {
              __id: `mg6d-${RUN}`,
              description: MG6D_MARKER,
              location: 'Force intelligence safe 4',
              sensitivityReason: 'Reveals the identity of an informant',
            },
          ],
        }
      : {}),
  };
}

test.describe('UC-09 — PDF generation & formatting', () => {
  test.afterAll(async () => {
    // Jobs, documents and stored files for this run's drafts. The drafts
    // themselves are logged via E2E_DRAFT_LOG and cleaned by the run harness.
    await prismaDo(async (p) => {
      const ids = [...new Set(generatedFor)];
      const docs = await p.generatedDocument.findMany({ where: { draftId: { in: ids } } });
      await p.generatedDocument.deleteMany({ where: { draftId: { in: ids } } });
      await p.pdfJob.deleteMany({ where: { draftId: { in: ids } } });
      const { unlinkSync } = require('node:fs');
      for (const d of docs) {
        // Content-addressed files can be shared between rows — unlink only
        // once nothing references the key any more.
        const still = await p.generatedDocument.count({ where: { storageKey: d.storageKey } });
        if (still === 0) {
          try {
            unlinkSync(join(STORE_DIR, d.storageKey));
          } catch {
            /* already gone */
          }
        }
      }
    });
  });

  // ── the gate ──

  test('generation is refused while the quality gate fails — and the draft is untouched', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG11');
    await saveValues(request, draft.id, { witnessName: 'Only one field' }, draft.version);
    const before = await getDraft(request, draft.id);

    const res = await request.post(`/api/drafts/${draft.id}/pdf`, { data: {} });
    expect(res.status(), 'blocking issues → 409').toBe(409);

    const after = await getDraft(request, draft.id);
    expect(after.values).toEqual(before.values);
    expect(after.version).toBe(before.version);
    const jobs = await prismaDo((p) => p.pdfJob.count({ where: { draftId: draft.id } }));
    expect(jobs, 'no job row for a refused generation').toBe(0);
  });

  test('no endpoint accepts layout, wording or filename input from a client', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);

    // A hostile body full of render inputs: everything is ignored — the only
    // thing the endpoint reads is the draft id in the URL.
    const start = await request.post(`/api/drafts/${draft.id}/pdf`, {
      data: {
        layout: { page: 'A1' },
        declarationText: 'FORGED',
        filename: '../../etc/passwd',
        headerTemplate: '<b>injected</b>',
      },
    });
    expect(start.status()).toBe(201);
    expect(Object.keys(await start.json())).toEqual(['jobId']);
    generatedFor.push(draft.id);
  });

  // ── happy path (case-linked, Nadia) ──

  test('happy path: job settles, preview streams inline, download names a PII-free file', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);
    const { documentId } = await generatePdf(request, draft.id);

    const preview = await request.get(`/api/documents/${documentId}/preview`);
    expect(preview.ok()).toBeTruthy();
    expect(preview.headers()['content-type']).toContain('application/pdf');
    expect(preview.headers()['content-disposition']).toBe('inline');
    expect((await preview.body()).subarray(0, 4).toString()).toBe('%PDF');

    const download = await request.get(`/api/documents/${documentId}/download`);
    const disposition = download.headers()['content-disposition'];
    // UC-10: every generation mints an archived version, so the download
    // carries its version number — still nothing case-derived.
    expect(disposition).toMatch(/^attachment; filename="MG12-draft-\d{8}-v\d+\.pdf"$/);
    // LER-1167: derived at download time, from metadata only — and carrying
    // no defendant data by construction.
    expect(disposition.toLowerCase()).not.toContain('kowalczyk');
    expect(disposition.toLowerCase()).not.toContain('nadia');
  });

  test('stored bytes are ciphertext; the DB row records cipher, IV, auth tag and content hash', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);
    const { documentId } = await generatePdf(request, draft.id);

    const row = await prismaDo((p) => p.generatedDocument.findUnique({ where: { id: documentId } }));
    expect(row.cipher).toBe('aes-256-gcm');
    expect(row.iv).toMatch(/^[a-f0-9]{24}$/); // 96-bit IV
    expect(row.authTag).toMatch(/^[a-f0-9]{32}$/);
    expect(row.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.storageKey).toBe(`documents/${nadia.id}/${row.contentHash}.pdf.enc`);

    const stored = readFileSync(join(STORE_DIR, row.storageKey));
    expect(stored.subarray(0, 4).toString()).not.toBe('%PDF');
    expect(stored.subarray(0, 2).toString()).not.toBe('PK');
    // And the decrypted stream really is the plaintext the hash names.
    const plain = await fetchPdf(request, documentId);
    const { createHash } = require('node:crypto');
    expect(createHash('sha256').update(plain).digest('hex')).toBe(row.contentHash);
  });

  test('a tampered stored file answers 410 with an audit row — never altered bytes as success', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    // UNIQUE content on purpose: storage is content-addressed, so a shared
    // file corrupted here would poison every later test that renders the
    // same values (found the hard way — gate run 1, 25 Aug).
    await saveValues(
      request,
      draft.id,
      { ...mg12Values(), storageLocation: `Tamper isolation wing ${RUN}` },
      draft.version,
    );
    const { documentId } = await generatePdf(request, draft.id);
    const row = await prismaDo((p) => p.generatedDocument.findUnique({ where: { id: documentId } }));

    // Flip one ciphertext byte on disk: GCM authentication must fail and the
    // endpoint must answer honestly (LER-1165) — 410, audited, and never a
    // truncated or altered body dressed as a document.
    const path = join(STORE_DIR, row.storageKey);
    const bytes = readFileSync(path);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    require('node:fs').writeFileSync(path, bytes);

    for (const mode of ['preview', 'download'] as const) {
      const res = await request.get(`/api/documents/${documentId}/${mode}`);
      expect(res.status(), `${mode} of a tampered file`).toBe(410);
    }
    const events = await prismaDo((p) =>
      p.auditEvent.findMany({
        where: { formDraftId: draft.id, action: 'DOCUMENT_INTEGRITY_FAILED' },
      }),
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(events[0].metadataJson).documentId).toBe(documentId);
  });

  test('pii-scan (the DoD 3 tool) passes over the real rows and files this suite created', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);
    await generatePdf(request, draft.id);

    // Exit 0 or this throws — self-tests plus a live walk of rows and bytes.
    const out = execFileSync('node', ['tools/pii-scan'], {
      cwd: process.cwd(),
      env: { ...process.env },
    }).toString();
    expect(out).toContain('self-tests passed');
    expect(out).toContain('clean');
  });

  test('regenerating identical content reuses the storage key — no duplicate rows', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);
    await generatePdf(request, draft.id);
    await generatePdf(request, draft.id);

    const rows = await prismaDo((p) =>
      p.generatedDocument.findMany({ where: { draftId: draft.id } }),
    );
    // One PDF + one DOCX, not two of each: same plaintext → same content
    // hash → same key → the existing rows already tell the truth.
    expect(rows.map((r: { kind: string }) => r.kind).sort()).toEqual(['docx', 'pdf']);
  });

  test('audit trail: generation, preview, download and Word export are all recorded', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);
    const { jobId, documentId } = await generatePdf(request, draft.id);
    await fetchPdf(request, documentId, 'preview');
    await fetchPdf(request, documentId, 'download');
    await (await request.get(`/api/documents/${documentId}/docx`)).body();

    const events = await prismaDo((p) =>
      p.auditEvent.findMany({ where: { formDraftId: draft.id }, orderBy: { createdAt: 'asc' } }),
    );
    const actions = events.map((e: { action: string }) => e.action);
    expect(actions).toContain('PDF_GENERATED');
    expect(actions).toContain('DOCUMENT_DOWNLOADED');
    expect(actions).toContain('DOCX_EXPORTED');

    const generated = events.find((e: { action: string }) => e.action === 'PDF_GENERATED');
    const meta = JSON.parse(generated.metadataJson);
    expect(meta.jobId).toBe(jobId);
    expect(meta.documentId).toBe(documentId);
    expect(meta.pageCount).toBeGreaterThanOrEqual(1);
    // Ids and counts only — never draft content.
    expect(generated.metadataJson).not.toContain('Kowalczyk');
    const downloads = events.filter((e: { action: string }) => e.action === 'DOCUMENT_DOWNLOADED');
    expect(downloads.map((e: { metadataJson: string }) => JSON.parse(e.metadataJson).mode).sort()).toEqual([
      'download',
      'preview',
    ]);
  });

  test('the UC-10 stub retired: archiveStatus reports the real archive state', async ({ request }) => {
    // This check pinned archiveStatus 'pending-uc10' while UC-10 did not
    // exist (deviation D4's honest stub). UC-10 replaced the stub: a
    // case-linked generation now reports 'attached'.
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);
    const { documentId } = await generatePdf(request, draft.id);
    const meta = await (await request.get(`/api/documents/${documentId}`)).json();
    expect(meta.archiveStatus).toBe('attached');
    expect(meta.kind).toBe('pdf');
  });

  test('a standalone (case-less) draft renders under documents/standalone/', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12');
    await saveValues(request, draft.id, mg12Values(), draft.version);
    const { documentId } = await generatePdf(request, draft.id);
    const row = await prismaDo((p) => p.generatedDocument.findUnique({ where: { id: documentId } }));
    expect(row.storageKey).toMatch(/^documents\/standalone\/[a-f0-9]{64}\.pdf\.enc$/);
  });

  test('another user cannot reach the job, the metadata or the bytes', async ({ request }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);
    const { jobId, documentId } = await generatePdf(request, draft.id);

    for (const url of [
      `/api/pdf-jobs/${jobId}`,
      `/api/documents/${documentId}`,
      `/api/documents/${documentId}/preview`,
      `/api/documents/${documentId}/download`,
      `/api/documents/${documentId}/docx`,
    ]) {
      const res = await request.get(url, { headers: COLLEAGUE });
      expect(res.status(), `${url} for a non-owner`).toBe(404);
    }
  });

  // ── draft marking, pagination, declaration, links (MG11) ──

  test('the draft band appears on EVERY page of a multi-page UNVERIFIED render (MG1)', async ({
    request,
  }) => {
    // D-F flagged MG11 verified, so the positive band check moves to MG1 —
    // deliberately unverified (no specimen exists) and long enough to
    // paginate via its charges narrative.
    const { draft } = await createDraft(request, 'MG1');
    await saveValues(
      request,
      draft.id,
      {
        urn: '07ST0990011/26',
        defendantName: 'Nadia Kowalczyk',
        defendantDob: '1991-08-27',
        chargeSummary:
          'Count narrative paragraph to force pagination across several pages of print output. '.repeat(
            260,
          ),
        officerInCase: 'PC 4408 Marcus Doyle',
      },
      draft.version,
    );
    const { documentId } = await generatePdf(request, draft.id);
    const pages = pdfToText(await fetchPdf(request, documentId));
    expect(pages.length, 'the long narrative paginates').toBeGreaterThan(2);
    for (const [i, page] of pages.entries()) {
      expect(page, `page ${i + 1} carries the band`).toContain(DRAFT_BAND_TEXT);
    }
  });

  test('a D-F-verified render (MG11) carries NO band on any page — same predicate', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG11', nadia.id);
    await saveValues(request, draft.id, mg11Values(), draft.version);
    const { documentId } = await generatePdf(request, draft.id);
    const pages = pdfToText(await fetchPdf(request, documentId));
    expect(pages.length, 'still multi-page').toBeGreaterThan(2);
    for (const [i, page] of pages.entries()) {
      expect(page, `page ${i + 1} must not carry the band`).not.toContain(DRAFT_BAND_TEXT);
    }
    // The body header line states the verified state through the predicate.
    expect(pages.join(' ').replace(/\s+/g, ' ')).toContain('verified template');
  });

  test('page count: the DB row, the PDF page tree and the printed footer all agree', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG11', nadia.id);
    await saveValues(request, draft.id, mg11Values(), draft.version);
    const { documentId } = await generatePdf(request, draft.id);
    const row = await prismaDo((p) => p.generatedDocument.findUnique({ where: { id: documentId } }));
    const pages = pdfToText(await fetchPdf(request, documentId));
    expect(row.pageCount).toBe(pages.length);
    for (const [i, page] of pages.entries()) {
      expect(page).toContain(`Page ${i + 1} of ${pages.length}`);
    }
  });

  test('the pinned declaration renders verbatim with the ACTUAL page count interpolated (D-B; LER-1071-73 active)', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG11', nadia.id);
    await saveValues(request, draft.id, mg11Values(), draft.version);
    const { documentId } = await generatePdf(request, draft.id);
    const pages = pdfToText(await fetchPdf(request, documentId));
    const text = pages.join('\n').replace(/\s+/g, ' ');
    // The adopted two-specimen wording, with the document's OWN page count
    // in the parenthetical — the trio's promise: declared count == actual
    // count, or the render refuses to emit.
    const expected = withDeclaredPageCount(MG11_DECLARATION, pages.length).replace(/\s+/g, ' ');
    expect(expected).toContain(`consisting of ${pages.length} page(s)`);
    expect(text).toContain(expected);
    // No un-interpolated blank may ever reach a document.
    expect(text).not.toContain('___');
  });

  test('exhibit citations hyperlink to defined entries; dangling references stay plain', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG11', nadia.id);
    await saveValues(request, draft.id, mg11Values(), draft.version);
    const { documentId } = await generatePdf(request, draft.id);
    const raw = (await fetchPdf(request, documentId)).toString('latin1');
    const links = (raw.match(/\/Subtype\s*\/Link/g) ?? []).length;
    // The narrative cites NK/1 once; XX/99 is dangling and must not link.
    expect(links).toBe(1);
  });

  test('the vulnerable-witness marker renders from the persisted flag (UC-03 #4)', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG11', nadia.id);
    // The flag is persisted by the MG11 wizard's hidden control whenever a
    // special-measures category (or age) makes the witness vulnerable — the
    // save below carries exactly what the wizard persists, and the render
    // reads the PERSISTED flag rather than re-deriving vulnerability.
    await saveValues(
      request,
      draft.id,
      {
        ...mg11Values(),
        specialMeasures: 'intimidated',
        specialMeasuresApplied: 'Screens in court',
        isVulnerableWitness: true,
      },
      draft.version,
    );
    const { documentId } = await generatePdf(request, draft.id);
    const firstPage = pdfToText(await fetchPdf(request, documentId))[0];
    expect(firstPage).toContain('Vulnerable / intimidated witness');
  });

  // ── DOCX ──

  test('DOCX: a real header part carries the scope\'s exact wording for every page', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);
    const { documentId } = await generatePdf(request, draft.id);

    const res = await request.get(`/api/documents/${documentId}/docx`);
    expect(res.headers()['content-type']).toContain('officedocument.wordprocessingml.document');
    expect(res.headers()['content-disposition']).toMatch(
      // UC-10: versioned like the PDF it pairs with.
      /^attachment; filename="MG12-draft-\d{8}-v\d+\.docx"$/,
    );
    const docx = await res.body();
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    // Entries are STORED (uncompressed), so the parts are directly readable.
    const content = docx.toString('utf8');
    expect(content).toContain(DOCX_DRAFT_HEADER_TEXT);
    expect(content).toContain('word/header1.xml');
    // The header is referenced as the section DEFAULT — Word's mechanism for
    // "on every page", not a paragraph that scrolls away.
    expect(content).toContain('<w:headerReference w:type="default"');
    expect(content).toContain('wordprocessingml.header+xml');
  });

  test('a tampered stored file answers 410 with an audit row — never altered bytes', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    // Unique content on purpose: identical plaintext shares its ciphertext
    // file across documents, and corrupting a shared file would fail OTHER
    // tests' downloads — this document must own its bytes.
    await saveValues(
      request,
      draft.id,
      { ...mg12Values(), exhibitEntries: `NK/1 — tamper-case exhibit — ${RUN}` },
      draft.version,
    );
    const { documentId } = await generatePdf(request, draft.id);
    const row = await prismaDo((p) => p.generatedDocument.findUnique({ where: { id: documentId } }));
    const path = join(STORE_DIR, row.storageKey);
    const bytes = readFileSync(path);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    require('node:fs').writeFileSync(path, bytes);

    for (const mode of ['download', 'preview']) {
      const res = await request.get(`/api/documents/${documentId}/${mode}`);
      expect(res.status(), `${mode} of a tampered file`).toBe(410);
    }
    const events = await prismaDo((p) =>
      p.auditEvent.findMany({
        where: { formDraftId: draft.id, action: 'DOCUMENT_INTEGRITY_FAILED' },
      }),
    );
    expect(events.length).toBe(2);
    expect(JSON.parse(events[0].metadataJson).documentId).toBe(documentId);
    // The draft itself is untouched — tampered STORAGE never mutates source.
    const after = await getDraft(request, draft.id);
    expect(after.status).toBe('DRAFT');
  });

  // ── failure & retry (LER-1169) ──

  test('a failed job is retryable with a content-free reason; retry succeeds and is audited', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    const saved = await saveValues(request, draft.id, mg12Values(), draft.version);

    // The renderer cannot be made to fail deterministically from outside the
    // process (that is a feature), so the FAILED STATE is planted as the row
    // the failure path writes — wording and flags exactly as the service's
    // catch block records them — and the retry semantics are then exercised
    // for real: the next POST both audits PDF_RETRIED and succeeds.
    void saved;
    const demo = await prismaDo((p) =>
      p.user.findUnique({ where: { email: 'demo.solicitor@example.co.uk' } }),
    );
    const planted = await prismaDo((p) =>
      p.pdfJob.create({
        data: {
          draftId: draft.id,
          requestedBy: demo.id,
          status: 'failed',
          failureReason:
            'The document renderer failed or timed out. The form is unchanged — retry the generation.',
          retryable: true,
        },
      }),
    );

    const status = await (await request.get(`/api/pdf-jobs/${planted.id}`)).json();
    expect(status.status).toBe('failed');
    expect(status.retryable).toBe(true);
    expect(status.failureReason).not.toContain('Kowalczyk');

    const before = await getDraft(request, draft.id);
    await generatePdf(request, draft.id);
    const after = await getDraft(request, draft.id);
    expect(after.values, 'failure and retry never touch the draft').toEqual(before.values);

    const events = await prismaDo((p) =>
      p.auditEvent.findMany({ where: { formDraftId: draft.id, action: 'PDF_RETRIED' } }),
    );
    expect(events.length).toBe(1);
    expect(JSON.parse(events[0].metadataJson).previousJobId).toBe(planted.id);
  });

  // ── the sensitive boundary on paper (stories/sensitive-rendering.md) ──

  test('an active schedule with a never-opened MG6D cannot generate: the engine blocks first', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG6', nadia.id);
    await saveValues(request, draft.id, mg6Values(false), draft.version);
    const res = await request.post(`/api/drafts/${draft.id}/pdf`, { data: {} });
    // The stored truth for a never-opened MG6D is an ABSENT key; the gate's
    // engine normalises it (withDormantSensitiveSections) and finds the
    // active section incomplete — blocking. The locked/absent RENDER paths
    // are covered at the unit layer (render-model.test.mjs); through the
    // API, the gate speaks first, and this asserts exactly that.
    expect(res.status()).toBe(409);
  });

  test('permitted caller: MG6D renders under RESTRICTED and the render is a recorded UC-07 access', async ({
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG6', nadia.id);
    const noMg6d = await saveValues(request, draft.id, mg6Values(false), draft.version);
    const confirm = await request.post(`/api/drafts/${draft.id}/sensitive/confirmations`, {
      data: { kind: 'HANDLING_INSTRUCTIONS' },
    });
    expect(confirm.status()).toBe(201);
    const { id: confirmationId } = await confirm.json();
    // A PATCH carries the FULL value set (sensitive keys merge-preserve when
    // omitted; nothing else does) — so the MG6D-completing save is the whole
    // form plus the confirmation id.
    await saveValues(request, draft.id, mg6Values(true), noMg6d.version, {
      sensitiveConfirmationId: confirmationId,
    });

    const { documentId } = await generatePdf(request, draft.id);
    const text = pdfToText(await fetchPdf(request, documentId)).join('\n');
    expect(text).toContain('RESTRICTED');
    expect(flat(text)).toContain(flat(MG6D_MARKER));

    const events = await prismaDo((p) =>
      p.auditEvent.findMany({ where: { formDraftId: draft.id, action: 'SENSITIVE_SECTION_VIEWED' } }),
    );
    const renderAccess = events.filter(
      (e: { metadataJson: string }) => JSON.parse(e.metadataJson).via === 'document-render',
    );
    expect(renderAccess.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(renderAccess[0].metadataJson).documentId).toBe(documentId);
  });

  test('permission revoked after contribution: the SAME draft renders the locked placeholder — level named, never content', async ({
    request,
  }) => {
    // The one real-world route to a locked render: the section was completed
    // by someone who held the permission, and the caller no longer does
    // (staff change). Simulated by granting and then revoking the seeded
    // colleague's permission — restored in finally, whatever happens.
    const email = COLLEAGUE_EMAIL;
    const setAccess = (value: boolean) =>
      prismaDo((p) =>
        p.user.update({ where: { email }, data: { sensitiveMaterialAccess: value } }),
      );
    try {
      await setAccess(true);
      // The colleague's own standalone draft (createDraft would use demo
      // headers, so the request is made directly):
      const res = await request.post('/api/drafts', {
        headers: COLLEAGUE,
        data: { formCode: 'MG6' },
      });
      expect(res.ok()).toBeTruthy();
      const own = (await res.json()).draft;
      recordDraft(own.id);
      const savedBase = await request.patch(`/api/drafts/${own.id}`, {
        headers: COLLEAGUE,
        data: { values: mg6Values(false), baseVersion: own.version },
      });
      const baseVersion = (await savedBase.json()).version;
      const confirm = await request.post(`/api/drafts/${own.id}/sensitive/confirmations`, {
        headers: COLLEAGUE,
        data: { kind: 'HANDLING_INSTRUCTIONS' },
      });
      const { id: confirmationId } = await confirm.json();
      await request.patch(`/api/drafts/${own.id}`, {
        headers: COLLEAGUE,
        data: {
          values: mg6Values(true),
          baseVersion,
          sensitiveConfirmationId: confirmationId,
        },
      });

      // While permitted: the render carries the content.
      const permitted = await generatePdf(request, own.id, COLLEAGUE);
      const permittedText = pdfToText(await fetchPdf(request, permitted.documentId, 'download', COLLEAGUE));

      // Revoke, render again: the gate still passes (the stored schedule is
      // complete), and the render is now the caller's LOCKED view.
      await setAccess(false);
      const locked = await generatePdf(request, own.id, COLLEAGUE);
      const lockedPages = pdfToText(await fetchPdf(request, locked.documentId, 'download', COLLEAGUE));
      const lockedText = lockedPages.join('\n');

      expect(flat(lockedText)).toContain(flat(SENSITIVE_PERMISSION_LEVEL));
      expect(flat(lockedText)).toContain(flat('Content withheld'));
      expect(flat(lockedText)).not.toContain(flat(MG6D_MARKER));
      expect(flat(lockedText)).not.toContain(flat('Force intelligence safe 4'));
      // And the permitted render really differed only by that section.
      expect(flat(permittedText.join('\n'))).toContain(flat(MG6D_MARKER));

      // The DOCX obeys the same redaction — one render model feeds both.
      const docxRes = await request.get(`/api/documents/${locked.documentId}/docx`, {
        headers: COLLEAGUE,
      });
      const docx = (await docxRes.body()).toString('utf8');
      expect(flat(docx)).not.toContain(flat(MG6D_MARKER));
      expect(docx).toContain('Content withheld');

      // No MG6D content anywhere outside the encrypted documents: job rows,
      // audit metadata, storage keys, filenames.
      const jobRows = await prismaDo((p) => p.pdfJob.findMany({ where: { draftId: own.id } }));
      const auditRows = await prismaDo((p) =>
        p.auditEvent.findMany({ where: { formDraftId: own.id } }),
      );
      const docRows = await prismaDo((p) =>
        p.generatedDocument.findMany({ where: { draftId: own.id } }),
      );
      const everything = JSON.stringify({ jobRows, auditRows, docRows });
      expect(everything).not.toContain(MG6D_MARKER);
      expect(everything).not.toContain('informant');
      generatedFor.push(own.id);
    } finally {
      await setAccess(false);
    }
  });

  test('one shared definition of sensitive: the CSV export and the locked render exclude the same MG6D', async ({
    request,
  }) => {
    // The CSV (UC-07's disclosure product) excludes flagged schedule ROWS and
    // the whole MG6D section; the locked PDF (a render of the caller's own
    // SCREEN view) locks the MG6D section while showing the schedule with its
    // classification column, exactly as the screen does. One definition —
    // sensitiveFieldIds + the sensitivityFlag — two products; MG6D content
    // reaches neither. (Deviation from the story's letter recorded in the PR.)
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG6', nadia.id);
    const saved = await saveValues(request, draft.id, mg6Values(false), draft.version);
    const confirm = await request.post(`/api/drafts/${draft.id}/sensitive/confirmations`, {
      data: { kind: 'HANDLING_INSTRUCTIONS' },
    });
    const { id: confirmationId } = await confirm.json();
    await saveValues(request, draft.id, mg6Values(true), saved.version, {
      sensitiveConfirmationId: confirmationId,
    });

    const csv = await (
      await request.get(`/api/drafts/${draft.id}/export/non-sensitive-schedule`)
    ).text();
    expect(flat(csv)).not.toContain(flat(MG6D_MARKER));

    const { documentId } = await generatePdf(request, draft.id);
    const pdfText = pdfToText(await fetchPdf(request, documentId)).join('\n');
    // The demo user is permitted, so their own render shows MG6D — but the
    // CSV STILL excludes it: the export is for onward disclosure, whoever
    // generates it.
    expect(flat(pdfText)).toContain(flat(MG6D_MARKER));
    expect(flat(csv)).not.toContain(flat('Force intelligence safe 4'));
  });

  // ── the client ──

  test('UI: review → generate → preview iframe with zoom, downloads and the Word note', async ({
    page,
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);

    await page.goto(`/drafts/${draft.id}`);
    await page.getByTestId('review-trigger').click();
    await expect(page.getByTestId('pdf-section')).toBeVisible();
    await page.getByTestId('generate-pdf').click();
    generatedFor.push(draft.id);

    await expect(page.getByTestId('pdf-preview')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('pdf-zoom-level')).toHaveText('100%');
    await page.getByTestId('pdf-zoom-in').click();
    await expect(page.getByTestId('pdf-zoom-level')).toHaveText('125%');
    await page.getByTestId('pdf-zoom-out').click();
    await page.getByTestId('pdf-zoom-out').click();
    await expect(page.getByTestId('pdf-zoom-level')).toHaveText('75%');

    await expect(page.getByTestId('pdf-download')).toHaveAttribute(
      'href',
      /\/api\/documents\/.+\/download$/,
    );
    await expect(page.getByTestId('docx-download')).toHaveAttribute(
      'href',
      /\/api\/documents\/.+\/docx$/,
    );
    await expect(page.getByTestId('docx-note')).toContainText('not the authoritative');
    await expect(page.getByTestId('pdf-page-count')).toContainText('page');
  });

  test('UI: a failed job shows the reason and Retry; retrying succeeds without touching the form', async ({
    page,
    request,
  }) => {
    const nadia = await caseFor(request, 'Nadia Kowalczyk');
    const { draft } = await createDraft(request, 'MG12', nadia.id);
    await saveValues(request, draft.id, mg12Values(), draft.version);

    // First poll answers "failed" (intercepted); the retry then flows to the
    // real backend and succeeds — the client's whole failure path, for real.
    let intercepted = false;
    await page.route('**/api/pdf-jobs/**', async (route) => {
      if (!intercepted) {
        intercepted = true;
        const url = route.request().url();
        const id = url.split('/').pop();
        await route.fulfill({
          json: {
            id,
            draftId: draft.id,
            status: 'failed',
            failureReason: 'The document renderer failed or timed out. The form is unchanged — retry the generation.',
            retryable: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/drafts/${draft.id}`);
    await page.getByTestId('review-trigger').click();
    await page.getByTestId('generate-pdf').click();
    generatedFor.push(draft.id);

    await expect(page.getByTestId('pdf-failure')).toBeVisible();
    await expect(page.getByTestId('pdf-failure-reason')).toContainText('retry the generation');
    await page.getByTestId('pdf-retry').click();
    await expect(page.getByTestId('pdf-preview')).toBeVisible({ timeout: 20_000 });
  });
});
