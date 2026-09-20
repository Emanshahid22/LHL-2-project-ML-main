import { expect, test } from './support/fixtures';
import { type APIRequestContext } from '@playwright/test';
import { join } from 'node:path';
import { caseFor, createDraft, getDraft, recordDraft, saveValues } from './support/api';
import { COLLEAGUE, COLLEAGUE_EMAIL } from './support/auth';

/**
 * UC-10 — Form Archive & Case Attachment.
 *
 * Fixture: Callum Whitmore (08AR0110022/26) — RESERVED for this suite by
 * e2e/FIXTURES.md. Amendment cycles finalise and regenerate drafts on his
 * case; standalone tests use case-less drafts. The frozen Nadia Kowalczyk
 * UC-09 fixture is never touched here.
 *
 * Direct-API discipline (stage-2 review, condition 3): every lock in this
 * suite is proven by hitting the API, never by the absence of a button.
 */

const RUN = `R${Date.now().toString(36)}`;
const STORE_DIR = join(process.cwd(), 'apps', 'api', 'document-store');


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

/** Draft ids whose documents/jobs/versions this spec must clean in afterAll
 *  (the drafts themselves ride E2E_DRAFT_LOG). */
const generatedFor: string[] = [];

/** Gate-passing MG12 values on this suite's own fixture data — never Nadia's. */
function mg12Values(marker: string): Record<string, unknown> {
  return {
    urn: '08AR0110022/26',
    defendantName: 'Callum Whitmore',
    compiledBy: 'DS 3319 Fallon',
    exhibitEntries: `CW/1 — seized ledger — DS 3319 Fallon — ${marker}`,
    storageLocation: 'Northgate property store',
    dateCompiled: '2026-08-02',
  };
}

/** MG6 values on this suite's fixture data; `mg6dDescription` non-null adds
 *  the MG6D row (sensitive section active AND non-empty — gate-passing). */
function mg6Values(mg6dDescription: string | null): Record<string, unknown> {
  return {
    urn: '08AR0110022/26',
    defendantName: 'Callum Whitmore',
    disclosureOfficer: 'DS 3319 Fallon',
    scheduleReference: `MG6-UC10-${RUN}`,
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
    dateCompleted: '2026-08-02',
    ...(mg6dDescription
      ? {
          sensitiveScheduleItems: [
            {
              __id: `mg6d-${RUN}`,
              description: mg6dDescription,
              location: 'Intelligence safe 2',
              sensitivityReason: 'Reveals the identity of an informant',
            },
          ],
        }
      : {}),
  };
}

async function generatePdf(
  request: APIRequestContext,
  draftId: string,
  headers?: Record<string, string>,
): Promise<{ jobId: string; documentId: string }> {
  const start = await request.post(`/api/drafts/${draftId}/pdf`, { headers, data: {} });
  expect(start.status(), 'POST /pdf accepted').toBe(201);
  const { jobId } = await start.json();
  generatedFor.push(draftId);
  for (let i = 0; i < 100; i++) {
    const res = await request.get(`/api/pdf-jobs/${jobId}`, { headers });
    expect(res.ok()).toBeTruthy();
    const job = await res.json();
    if (job.status === 'done') return { jobId, documentId: job.documentId };
    if (job.status === 'failed') throw new Error(`job failed: ${job.failureReason}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('job never settled');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function versionsOf(draftIds: string[]): Promise<any[]> {
  return prismaDo((p) =>
    p.archivedVersion.findMany({
      where: { draftId: { in: draftIds } },
      orderBy: { versionNumber: 'asc' },
    }),
  );
}

async function finaliseDraft(request: APIRequestContext, draftId: string): Promise<void> {
  const res = await request.post(`/api/drafts/${draftId}/finalise`, {
    data: { advisoryAcknowledgements: [] },
  });
  expect(res.status(), 'finalise accepted').toBe(201);
}

async function reopenDraft(
  request: APIRequestContext,
  draftId: string,
): Promise<{ draftId: string; lineageId: string }> {
  const res = await request.post(`/api/drafts/${draftId}/reopen`, { data: {} });
  expect(res.status(), 'reopen accepted').toBe(201);
  const body = await res.json();
  // Server-created copy: log it for cleanup like any suite-created draft.
  recordDraft(body.draftId);
  generatedFor.push(body.draftId);
  return body;
}

test.describe('UC-10 — form archive & case attachment', () => {
  test.afterAll(async () => {
    await prismaDo(async (p) => {
      const ids = [...new Set(generatedFor)];
      if (ids.length === 0) return;
      // Versions first (they reference documents), then documents/jobs, then
      // shared-file-aware unlink — the uc09 discipline extended to UC-10.
      await p.archivedVersion.deleteMany({ where: { draftId: { in: ids } } });
      const docs = await p.generatedDocument.findMany({ where: { draftId: { in: ids } } });
      await p.generatedDocument.deleteMany({ where: { draftId: { in: ids } } });
      await p.pdfJob.deleteMany({ where: { draftId: { in: ids } } });
      const { unlinkSync } = require('node:fs');
      for (const d of docs) {
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

  // ── the generation guard (stage-2 first commit: predates ARCHIVED itself) ──

  test('generation from a superseded (ARCHIVED) draft is refused at the API', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12');
    await saveValues(request, draft.id, mg12Values(`${RUN}-guard`), draft.version);

    // No endpoint can flip a draft to ARCHIVED yet (this guard ships first,
    // by design) — the superseded state is manufactured directly in the
    // database, which also makes this a pure API-level proof.
    await prismaDo((p) =>
      p.formDraft.update({ where: { id: draft.id }, data: { status: 'ARCHIVED' } }),
    );

    const res = await request.post(`/api/drafts/${draft.id}/pdf`, { data: {} });
    expect(res.status(), 'superseded draft → 409').toBe(409);
    const body = await res.json();
    // Content-free reason: names no field, quotes no value.
    expect(String(body.message)).toContain('superseded');

    const jobs = await prismaDo((p) => p.pdfJob.count({ where: { draftId: draft.id } }));
    expect(jobs, 'no job row for a refused generation').toBe(0);
    const after = await getDraft(request, draft.id);
    expect(after.status).toBe('ARCHIVED');
  });

  // ── mint-on-generate (LER-1172, 1177, 1184) ──

  test('generation mints V1 "Original" attached to the case, in step with the document row', async ({
    request,
  }) => {
    const callum = await caseFor(request, 'Callum Whitmore');
    const { draft } = await createDraft(request, 'MG12', callum.id);
    await saveValues(request, draft.id, mg12Values(`${RUN}-v1`), draft.version);
    const { documentId } = await generatePdf(request, draft.id);

    const versions = await versionsOf([draft.id]);
    expect(versions).toHaveLength(1);
    const v1 = versions[0];
    expect(v1.versionNumber).toBe(1);
    expect(v1.label).toBe('Original');
    expect(v1.cycle).toBe(0);
    expect(v1.caseId, 'auto-attached to the case').toBe(callum.id);
    expect(v1.documentId).toBe(documentId);
    expect(v1.containsSensitive).toBe(false);
    expect(v1.lineageId, 'root draft is its own lineage').toBe(draft.id);

    // The version's denormalised hash equals the document row's — the
    // byte-integrity anchor condition 5's cycle checks rely on.
    const doc = await prismaDo((p) =>
      p.generatedDocument.findUnique({ where: { id: documentId } }),
    );
    expect(v1.contentHash).toBe(doc.contentHash);

    // Metadata DTO shows the real archive state, not the retired stub.
    const meta = await request.get(`/api/documents/${documentId}`);
    expect(((await meta.json()) as { archiveStatus: string }).archiveStatus).toBe('attached');

    const audited = await prismaDo((p) =>
      p.auditEvent.findFirst({ where: { formDraftId: draft.id, action: 'DOCUMENT_ARCHIVED' } }),
    );
    expect(audited, 'DOCUMENT_ARCHIVED recorded').toBeTruthy();
    const auditMeta = JSON.parse(audited.metadataJson);
    expect(auditMeta.versionNumber).toBe(1);
    expect(auditMeta.attached).toBe(true);
  });

  test('a standalone form lands in the personal archive, not orphaned and not attached', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12');
    await saveValues(request, draft.id, mg12Values(`${RUN}-solo`), draft.version);
    const { documentId } = await generatePdf(request, draft.id);

    const versions = await versionsOf([draft.id]);
    expect(versions).toHaveLength(1);
    expect(versions[0].caseId, 'no case attachment').toBeNull();
    expect(versions[0].label).toBe('Original');

    const meta = await request.get(`/api/documents/${documentId}`);
    expect(((await meta.json()) as { archiveStatus: string }).archiveStatus).toBe('personal');

    const audited = await prismaDo((p) =>
      p.auditEvent.findFirst({ where: { formDraftId: draft.id, action: 'DOCUMENT_ARCHIVED' } }),
    );
    expect(JSON.parse(audited.metadataJson).attached).toBe(false);
  });

  test('plain regeneration of the unchanged current version re-serves without minting', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12');
    await saveValues(request, draft.id, mg12Values(`${RUN}-reserve`), draft.version);
    const first = await generatePdf(request, draft.id);
    const second = await generatePdf(request, draft.id);

    // Same draft, unchanged content: same document row, and STILL one
    // version — a re-download must not inflate history. (A different draft
    // minting identical bytes is the opposite case — proven in the
    // identical-content amendment test.)
    expect(second.documentId).toBe(first.documentId);
    const versions = await versionsOf([draft.id]);
    expect(versions).toHaveLength(1);
  });

  // ── reopen & the locks (LER-1174, 1175, 1181) ──

  test('reopen creates an editable copy and supersedes the original — every lock at the API', async ({
    request,
  }) => {
    const callum = await caseFor(request, 'Callum Whitmore');
    const { draft } = await createDraft(request, 'MG12', callum.id);
    await saveValues(request, draft.id, mg12Values(`${RUN}-reopen`), draft.version);
    await finaliseDraft(request, draft.id);

    const reopened = await reopenDraft(request, draft.id);
    expect(reopened.lineageId).toBe(draft.id);

    const copy = await getDraft(request, reopened.draftId);
    expect(copy.status).toBe('DRAFT');
    expect(copy.values).toEqual((await getDraft(request, draft.id)).values);
    const source = await getDraft(request, draft.id);
    expect(source.status, 'source superseded at reopen').toBe('ARCHIVED');

    // Direct-API lock proofs — no UI in the loop (condition 3).
    const edit = await request.patch(`/api/drafts/${draft.id}`, {
      data: { values: { compiledBy: 'Should never land' }, baseVersion: source.version },
    });
    expect(edit.status(), 'editing the superseded original → 409').toBe(409);
    expect(String((await edit.json()).message)).toContain('superseded');

    const reopenAgain = await request.post(`/api/drafts/${draft.id}/reopen`, { data: {} });
    expect(reopenAgain.status(), 'reopening the superseded original → 409').toBe(409);
    expect(String((await reopenAgain.json()).message)).toContain('superseded');

    const reopenOpenCopy = await request.post(`/api/drafts/${copy.id}/reopen`, { data: {} });
    expect(reopenOpenCopy.status(), 'reopening a still-open draft → 409').toBe(409);

    const audited = await prismaDo((p) =>
      p.auditEvent.findFirst({ where: { formDraftId: draft.id, action: 'FORM_REOPENED' } }),
    );
    expect(audited, 'FORM_REOPENED recorded on the source').toBeTruthy();
    expect(JSON.parse(audited.metadataJson).newDraftId).toBe(copy.id);
  });

  test('the fork guard refuses a second open amendment on one lineage', async ({ request }) => {
    const { draft } = await createDraft(request, 'MG12');
    await saveValues(request, draft.id, mg12Values(`${RUN}-fork`), draft.version);
    await finaliseDraft(request, draft.id);
    await reopenDraft(request, draft.id);

    // The reopen flow can never leave two finalised drafts on one lineage,
    // so the open-amendment branch is proven by manufacture: resurrect the
    // source to FINALISED directly in the database and hit the API.
    await prismaDo((p) =>
      p.formDraft.update({ where: { id: draft.id }, data: { status: 'FINALISED' } }),
    );
    const res = await request.post(`/api/drafts/${draft.id}/reopen`, { data: {} });
    expect(res.status(), 'open amendment on the lineage → 409').toBe(409);
    expect(String((await res.json()).message)).toContain('already open');
    await prismaDo((p) =>
      p.formDraft.update({ where: { id: draft.id }, data: { status: 'ARCHIVED' } }),
    );
  });

  // ── the amendment path re-runs UC-08 (LER-1176 — a proof, not a feature) ──

  test('an amendment passes back through the quality gate — no shortcut path to a new version', async ({
    request,
  }) => {
    const callum = await caseFor(request, 'Callum Whitmore');
    const { draft } = await createDraft(request, 'MG12', callum.id);
    await saveValues(request, draft.id, mg12Values(`${RUN}-qc`), draft.version);
    await finaliseDraft(request, draft.id);
    await generatePdf(request, draft.id);

    const { draftId: copyId } = await reopenDraft(request, draft.id);
    const copy = await getDraft(request, copyId);
    // Break a required field on the amendment: the gate must block exactly
    // as it blocks an original.
    await saveValues(request, copyId, { ...mg12Values(`${RUN}-qc`), compiledBy: '' }, copy.version);
    const blocked = await request.post(`/api/drafts/${copyId}/pdf`, { data: {} });
    expect(blocked.status(), 'blocking finding on the amendment → 409').toBe(409);
    expect(await versionsOf([draft.id, copyId]), 'no version minted past the gate').toHaveLength(1);

    // Fix it: the amendment now mints V2 "Amendment 1".
    const fixed = await getDraft(request, copyId);
    await saveValues(
      request,
      copyId,
      { ...mg12Values(`${RUN}-qc`), compiledBy: 'DS 3319 Fallon (amended)' },
      fixed.version,
    );
    await generatePdf(request, copyId);
    const versions = await versionsOf([draft.id, copyId]);
    expect(versions.map((v: { versionNumber: number; label: string; cycle: number }) => [v.versionNumber, v.label, v.cycle])).toEqual([
      [1, 'Original', 0],
      [2, 'Amendment 1', 1],
    ]);
    expect(versions[0].contentHash).not.toBe(versions[1].contentHash);
    expect(versions[1].lineageId, 'one lineage across the amendment').toBe(draft.id);
  });

  // ── DoD 1, tested to the letter (stage-2 review, condition 5) ──

  test('three amendment cycles: every prior version present, downloadable, byte-intact, labelled, PII-free', async ({
    request,
  }) => {
    const { createHash } = require('node:crypto');
    const callum = await caseFor(request, 'Callum Whitmore');
    const { draft } = await createDraft(request, 'MG12', callum.id);
    await saveValues(request, draft.id, mg12Values(`${RUN}-cycle-0`), draft.version);
    await finaliseDraft(request, draft.id);
    await generatePdf(request, draft.id);

    const expectedLabels = ['Original'];
    let currentId = draft.id;
    for (let cycle = 1; cycle <= 3; cycle++) {
      const { draftId: nextId } = await reopenDraft(request, currentId);
      const next = await getDraft(request, nextId);
      await saveValues(request, nextId, mg12Values(`${RUN}-cycle-${cycle}`), next.version);
      await finaliseDraft(request, nextId);
      await generatePdf(request, nextId);
      currentId = nextId;
      expectedLabels.push(`Amendment ${cycle}`);

      // After EVERY cycle, not just the last: the whole history, via the API.
      const res = await request.get(`/api/archive/lineages/${draft.id}/versions`);
      expect(res.ok(), 'versions endpoint').toBeTruthy();
      const versions = await res.json();
      expect(versions, `cycle ${cycle}: all versions present`).toHaveLength(cycle + 1);
      expect(versions.map((v: { versionNumber: number }) => v.versionNumber)).toEqual(
        Array.from({ length: cycle + 1 }, (_, i) => i + 1),
      );
      expect(versions.map((v: { label: string }) => v.label)).toEqual(expectedLabels);

      for (const v of versions) {
        const dl = await request.get(`/api/documents/${v.documentId}/download`);
        expect(dl.ok(), `cycle ${cycle}: V${v.versionNumber} downloadable`).toBeTruthy();
        const bytes = await dl.body();
        // Byte-intact: the served plaintext hashes to the version's own
        // denormalised contentHash.
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(v.contentHash);
        // PII-free filename PER VERSION (Global DoD #11): form code, date,
        // version — never a name, URN fragment or case id.
        const disposition = dl.headers()['content-disposition'] ?? '';
        expect(disposition).toMatch(/filename="MG12-draft-\d{8}-v\d+\.pdf"/);
        for (const leak of ['Callum', 'Whitmore', '08AR', callum.id]) {
          expect(disposition).not.toContain(leak);
        }
      }
    }
    // V4 exists (Original + three amendments), on one lineage.
    const final = await (await request.get(`/api/archive/lineages/${draft.id}/versions`)).json();
    expect(final).toHaveLength(4);
    expect(final[3].versionNumber).toBe(4);
    expect(final[3].label).toBe('Amendment 3');

    // Storage paths PII-free for every version's document (per version, not
    // just V1): opaque ids and hashes only.
    const lineageDrafts = await prismaDo((p) =>
      p.formDraft.findMany({ where: { lineageId: draft.id }, select: { id: true } }),
    );
    const docs = await prismaDo((p) =>
      p.generatedDocument.findMany({
        where: { draftId: { in: lineageDrafts.map((d: { id: string }) => d.id) } },
        select: { storageKey: true },
      }),
    );
    expect(docs.length).toBeGreaterThanOrEqual(4);
    for (const d of docs) {
      expect(d.storageKey).toMatch(/^documents\/[a-z0-9]+\/[a-f0-9]{64}\.(pdf|docx)\.enc$/);
      for (const leak of ['Callum', 'Whitmore', '08AR']) {
        expect(d.storageKey).not.toContain(leak);
      }
    }
  });

  test('an identical-content amendment still mints a new version — rows are history, files are storage', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12');
    await saveValues(request, draft.id, mg12Values(`${RUN}-samebytes`), draft.version);
    await finaliseDraft(request, draft.id);
    await generatePdf(request, draft.id);

    // Reopen and change NOTHING: the amendment finalises with byte-identical
    // content. Condition 1: a new version row still mints, pointing at the
    // same immutable stored file.
    const { draftId: copyId } = await reopenDraft(request, draft.id);
    await finaliseDraft(request, copyId);
    await generatePdf(request, copyId);

    const versions = await versionsOf([draft.id, copyId]);
    expect(versions).toHaveLength(2);
    expect(versions[1].versionNumber).toBe(2);
    expect(versions[1].label).toBe('Amendment 1');
    expect(versions[1].contentHash, 'same bytes').toBe(versions[0].contentHash);

    // The UC-09 twin-row discipline: each version's document row exists,
    // shares the one ciphertext file AND its cipher identity — never a
    // re-encryption.
    const [docA, docB] = await prismaDo((p) =>
      Promise.all([
        p.generatedDocument.findUnique({ where: { id: versions[0].documentId } }),
        p.generatedDocument.findUnique({ where: { id: versions[1].documentId } }),
      ]),
    );
    expect(docA.id).not.toBe(docB.id);
    expect(docA.storageKey).toBe(docB.storageKey);
    expect(docA.iv).toBe(docB.iv);
    expect(docA.authTag).toBe(docB.authTag);
  });

  // ── the UC-07 boundary at retrieval and in the diff (condition 4) ──

  test('a field-level diff between any two versions shows exactly what changed', async ({
    request,
  }) => {
    const { draft } = await createDraft(request, 'MG12');
    await saveValues(request, draft.id, mg12Values(`${RUN}-diff-a`), draft.version);
    await generatePdf(request, draft.id);
    const v1 = await getDraft(request, draft.id);
    await saveValues(
      request,
      draft.id,
      { ...mg12Values(`${RUN}-diff-a`), storageLocation: 'Southgate property store' },
      v1.version,
    );
    await generatePdf(request, draft.id);

    const res = await request.get(`/api/archive/lineages/${draft.id}/diff?from=1&to=2`);
    expect(res.ok()).toBeTruthy();
    const diff = await res.json();
    expect(diff.entries).toHaveLength(1);
    expect(diff.entries[0].fieldId).toBe('storageLocation');
    expect(diff.entries[0].kind).toBe('changed');
    expect(diff.entries[0].from).toBe('Northgate property store');
    expect(diff.entries[0].to).toBe('Southgate property store');
    expect(diff.entries[0].sensitive).toBe(false);
  });

  test('a permitted diff over sensitive changes is visible and recorded; revocation closes download AND diff', async ({
    request,
  }) => {
    const markerA = `Handler-log-A-${RUN}`;
    const markerB = `Handler-log-B-${RUN}`;
    const setAccess = (value: boolean) =>
      prismaDo((p) =>
        p.user.update({
          where: { email: COLLEAGUE_EMAIL },
          data: { sensitiveMaterialAccess: value },
        }),
      );
    try {
      await setAccess(true);
      const created = await request.post('/api/drafts', {
        headers: COLLEAGUE,
        data: { formCode: 'MG6' },
      });
      expect(created.ok()).toBeTruthy();
      const own = (await created.json()).draft;
      recordDraft(own.id);
      generatedFor.push(own.id);

      const base = await request.patch(`/api/drafts/${own.id}`, {
        headers: COLLEAGUE,
        data: { values: mg6Values(null), baseVersion: own.version },
      });
      expect(base.ok()).toBeTruthy();
      let version = (await base.json()).version;

      // V1 with MG6D row A, V2 with row B — each sensitive write carries its
      // own fresh confirmation (UC-07 step-up).
      for (const marker of [markerA, markerB]) {
        const confirm = await request.post(`/api/drafts/${own.id}/sensitive/confirmations`, {
          headers: COLLEAGUE,
          data: { kind: 'HANDLING_INSTRUCTIONS' },
        });
        expect(confirm.status()).toBe(201);
        const { id: confirmationId } = await confirm.json();
        const saved = await request.patch(`/api/drafts/${own.id}`, {
          headers: COLLEAGUE,
          data: { values: mg6Values(marker), baseVersion: version, sensitiveConfirmationId: confirmationId },
        });
        expect(saved.ok()).toBeTruthy();
        version = (await saved.json()).version;
        await generatePdf(request, own.id, COLLEAGUE);
      }

      const versions = await versionsOf([own.id]);
      expect(versions).toHaveLength(2);
      expect(versions.every((v: { containsSensitive: boolean }) => v.containsSensitive)).toBe(true);

      // Permitted: the sensitive change is visible — and the access recorded.
      const permittedDiff = await request.get(
        `/api/archive/lineages/${own.id}/diff?from=1&to=2`,
        { headers: COLLEAGUE },
      );
      expect(permittedDiff.ok()).toBeTruthy();
      const visible = await permittedDiff.json();
      const sensEntry = visible.entries.find(
        (e: { sensitive: boolean }) => e.sensitive === true,
      );
      expect(sensEntry, 'sensitive change visible to the permitted caller').toBeTruthy();
      expect(JSON.stringify(sensEntry)).toContain(markerA);
      const audited = await prismaDo((p) =>
        p.auditEvent.findMany({
          where: { formDraftId: own.id, action: 'SENSITIVE_SECTION_VIEWED' },
        }),
      );
      expect(
        audited.some(
          (e: { metadataJson: string }) => JSON.parse(e.metadataJson).via === 'version-diff',
        ),
        'permitted sensitive diff recorded',
      ).toBe(true);

      // Permitted download works while the permission holds.
      const okDownload = await request.get(
        `/api/documents/${versions[1].documentId}/download`,
        { headers: COLLEAGUE },
      );
      expect(okDownload.ok()).toBeTruthy();

      // Revoked after contribution: the same caller, the same version.
      await setAccess(false);
      for (const mode of ['download', 'preview', 'docx']) {
        const denied = await request.get(
          `/api/documents/${versions[1].documentId}/${mode}`,
          { headers: COLLEAGUE },
        );
        expect(denied.status(), `revoked ${mode} → 403`).toBe(403);
      }
      const revokedDiff = await request.get(
        `/api/archive/lineages/${own.id}/diff?from=1&to=2`,
        { headers: COLLEAGUE },
      );
      expect(revokedDiff.ok()).toBeTruthy();
      const hidden = await revokedDiff.json();
      expect(hidden.entries.some((e: { sensitive: boolean }) => e.sensitive)).toBe(false);
      const raw = JSON.stringify(hidden);
      expect(raw).not.toContain(markerA);
      expect(raw).not.toContain(markerB);
    } finally {
      await setAccess(false); // the seeded default
    }
  });

  // ── manual case-linking (LER-1185, DoD 3) ──

  test('a standalone lineage links to a case afterwards — whole history, audited, once', async ({
    request,
  }) => {
    const callum = await caseFor(request, 'Callum Whitmore');
    const { draft } = await createDraft(request, 'MG12');
    await saveValues(request, draft.id, mg12Values(`${RUN}-link`), draft.version);
    await generatePdf(request, draft.id);

    // Linking to a case the caller cannot access: 404, existence undisclosed.
    const whitfield = await prismaDo((p) =>
      p.case.findUnique({ where: { urn: '03JK0890456/26' }, select: { id: true } }),
    );
    const denied = await request.post(`/api/archive/lineages/${draft.id}/link`, {
      data: { caseId: whitfield.id },
    });
    expect(denied.status(), 'inaccessible case → 404').toBe(404);

    const linked = await request.post(`/api/archive/lineages/${draft.id}/link`, {
      data: { caseId: callum.id },
    });
    expect(linked.status()).toBe(201);

    const versions = await versionsOf([draft.id]);
    expect(versions.every((v: { caseId: string }) => v.caseId === callum.id)).toBe(true);
    expect((await getDraft(request, draft.id)).case?.id).toBe(callum.id);
    const doc = await prismaDo((p) =>
      p.generatedDocument.findFirst({ where: { draftId: draft.id, kind: 'pdf' } }),
    );
    expect(doc.archiveStatus).toBe('attached');

    const audited = await prismaDo((p) =>
      p.auditEvent.findFirst({ where: { formDraftId: draft.id, action: 'CASE_LINKED' } }),
    );
    expect(audited, 'CASE_LINKED recorded').toBeTruthy();
    expect(JSON.parse(audited.metadataJson).caseId).toBe(callum.id);

    const again = await request.post(`/api/archive/lineages/${draft.id}/link`, {
      data: { caseId: callum.id },
    });
    expect(again.status(), 'already linked → 409').toBe(409);
  });

  // ── case-holder read scope (stage-3 item 6, API level) ──

  test('case access grants the version list and non-sensitive downloads; sensitive stays 403', async ({
    request,
  }) => {
    // Marcus Bellamy is shared demo+colleague (seed). Values MATCH the case
    // record, so nothing diverges on the shared fixture; everything created
    // here is logged and cleaned.
    const bellamy = await caseFor(request, 'Marcus Bellamy');
    const plain = await createDraft(request, 'MG12', bellamy.id);
    await saveValues(
      request,
      plain.draft.id,
      {
        urn: '01CD0789654/26',
        defendantName: 'Marcus Bellamy',
        compiledBy: 'DC 2984 Llewellyn',
        exhibitEntries: `MB/1 — recovered goods — DC 2984 Llewellyn — ${RUN}`,
        storageLocation: 'Bow property store',
        dateCompiled: '2026-08-02',
      },
      plain.draft.version,
    );
    await generatePdf(request, plain.draft.id);

    // The colleague holds CASE access, not ownership: list + download work.
    const versions = await request.get(
      `/api/archive/lineages/${plain.draft.id}/versions`,
      { headers: COLLEAGUE },
    );
    expect(versions.status(), 'case-holder version list').toBe(200);
    const [v1] = await versions.json();
    const dl = await request.get(`/api/documents/${v1.documentId}/download`, {
      headers: COLLEAGUE,
    });
    expect(dl.status(), 'case-holder non-sensitive download').toBe(200);

    // A sensitive-bearing version on the same case: visible in the list,
    // 403 on the bytes — case access never widens the UC-07 boundary.
    const sens = await createDraft(request, 'MG6', bellamy.id);
    const base = await request.patch(`/api/drafts/${sens.draft.id}`, {
      data: {
        values: {
          ...mg6Values(null),
          urn: '01CD0789654/26',
          defendantName: 'Marcus Bellamy',
        },
        baseVersion: sens.draft.version,
      },
    });
    expect(base.ok()).toBeTruthy();
    const confirm = await request.post(`/api/drafts/${sens.draft.id}/sensitive/confirmations`, {
      data: { kind: 'HANDLING_INSTRUCTIONS' },
    });
    const { id: confirmationId } = await confirm.json();
    const saved = await request.patch(`/api/drafts/${sens.draft.id}`, {
      data: {
        values: {
          ...mg6Values(`Case-holder-boundary-${RUN}`),
          urn: '01CD0789654/26',
          defendantName: 'Marcus Bellamy',
        },
        baseVersion: (await base.json()).version,
        sensitiveConfirmationId: confirmationId,
      },
    });
    expect(saved.ok()).toBeTruthy();
    await generatePdf(request, sens.draft.id);

    const sensVersions = await request.get(
      `/api/archive/lineages/${sens.draft.id}/versions`,
      { headers: COLLEAGUE },
    );
    expect(sensVersions.status(), 'sensitive-bearing version LISTED for the case holder').toBe(200);
    const [sv] = await sensVersions.json();
    expect(sv.containsSensitive).toBe(true);
    const denied = await request.get(`/api/documents/${sv.documentId}/download`, {
      headers: COLLEAGUE,
    });
    expect(denied.status(), 'sensitive bytes stay 403 for the case holder').toBe(403);
  });

  // ── the UI (stage-3 items 1–5) ──

  test('UI: Documents section shows the CURRENT version as the one primary entry; the drawer holds the history', async ({
    request,
    page,
  }) => {
    const callum = await caseFor(request, 'Callum Whitmore');
    const { draft } = await createDraft(request, 'MG12', callum.id);
    await saveValues(request, draft.id, mg12Values(`${RUN}-ui-docs`), draft.version);
    await finaliseDraft(request, draft.id);
    await generatePdf(request, draft.id);
    const { draftId: copyId } = await reopenDraft(request, draft.id);
    const copy = await getDraft(request, copyId);
    await saveValues(
      request,
      copyId,
      { ...mg12Values(`${RUN}-ui-docs`), storageLocation: 'Amended store' },
      copy.version,
    );
    await finaliseDraft(request, copyId);
    await generatePdf(request, copyId);

    await page.goto(`/cases/${callum.id}`);
    const section = page.getByTestId('case-documents');
    await expect(section).toBeVisible();
    const row = section.getByTestId(`case-doc-${draft.id}`);
    // DoD 4: ONE primary entry for this lineage, and it is the CURRENT
    // version — V2, never the superseded V1.
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('doc-version')).toHaveText('V2 — Amendment 1');
    await expect(row.getByTestId('doc-status')).toHaveText('Final');
    await expect(row.getByTestId('doc-by')).not.toBeEmpty();

    await row.getByTestId('doc-history-toggle').click();
    const drawer = section.getByTestId('version-drawer');
    await expect(drawer).toBeVisible();
    // Oldest first, the scope's exact fields per row.
    await expect(drawer.getByTestId('version-label')).toHaveText(['Original', 'Amendment 1']);
    const v1Row = drawer.getByTestId('version-row-1');
    await expect(v1Row.getByTestId('version-date')).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/);
    await expect(v1Row.getByTestId('version-generator')).not.toBeEmpty();
    // The prior version downloads from the drawer (LER-1180) — via its link.
    const href = await v1Row.getByTestId('version-download').getAttribute('href');
    const dl = await request.get(href!);
    expect(dl.ok()).toBeTruthy();
    expect((await dl.body()).subarray(0, 4).toString()).toBe('%PDF');
  });

  test('UI: diff view renders exactly what the endpoint returns', async ({ request, page }) => {
    const callum = await caseFor(request, 'Callum Whitmore');
    const { draft } = await createDraft(request, 'MG12', callum.id);
    await saveValues(request, draft.id, mg12Values(`${RUN}-ui-diff`), draft.version);
    await generatePdf(request, draft.id);
    const v1 = await getDraft(request, draft.id);
    await saveValues(
      request,
      draft.id,
      { ...mg12Values(`${RUN}-ui-diff`), storageLocation: 'Eastgate property store' },
      v1.version,
    );
    await generatePdf(request, draft.id);

    await page.goto(`/cases/${callum.id}`);
    const section = page.getByTestId('case-documents');
    const row = section.getByTestId(`case-doc-${draft.id}`);
    await row.getByTestId('doc-history-toggle').click();
    await expect(row.getByTestId('version-drawer')).toBeVisible();
    // The drawer defaults to first → latest (V1 → V2 here).
    await row.getByTestId('diff-compare').click();
    const result = row.getByTestId('diff-result');
    await expect(result).toBeVisible();
    const entry = result.getByTestId('diff-entry-storageLocation');
    await expect(entry.getByTestId('diff-value-from')).toContainText('Northgate property store');
    await expect(entry.getByTestId('diff-value-to')).toContainText('Eastgate property store');
  });

  test('UI: archive lists, filters server-side, and links a standalone form to a case', async ({
    request,
    page,
  }) => {
    const { draft } = await createDraft(request, 'MG12');
    await saveValues(request, draft.id, mg12Values(`${RUN}-ui-arch`), draft.version);
    await generatePdf(request, draft.id);

    await page.goto('/archive');
    const row = page.getByTestId(`archive-row-${draft.id}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('archive-case')).toHaveText('—');
    await expect(row.getByTestId('archive-status')).toHaveText('Final');

    // Server-side filters: standalone keeps the row; a different form type
    // removes it (the empty state is honest).
    await page.getByTestId('filter-case').click();
    await page.getByRole('option', { name: 'Standalone (no case)' }).click();
    await page.getByTestId('archive-search').click();
    await expect(row).toBeVisible();
    await page.getByTestId('filter-form').click();
    await page.getByRole('option', { name: 'MG15', exact: true }).click();
    await page.getByTestId('archive-search').click();
    await expect(row).not.toBeVisible();
    await page.getByTestId('filter-form').click();
    await page.getByRole('option', { name: 'All forms' }).click();
    // Back to 'All cases' too: once linked, the row would rightly vanish
    // from a standalone-only view.
    await page.getByTestId('filter-case').click();
    await page.getByRole('option', { name: 'All cases' }).click();
    await page.getByTestId('archive-search').click();

    // Manual case-linking from the archive view (DoD 3).
    await row.getByTestId('archive-link-case').click();
    await page.getByTestId('link-case-08AR0110022/26').click();
    await page.getByTestId('link-case-confirm').click();
    await expect(page.getByText('Form linked to the case.')).toBeVisible();
    await expect(row.getByTestId('archive-case')).toHaveText('R v Callum Whitmore');
    await expect(row.getByTestId('archive-link-case')).toHaveCount(0);
  });

  test('UI: a superseded draft shows the honest lock; a finalised one offers reopen', async ({
    request,
    page,
  }) => {
    const { draft } = await createDraft(request, 'MG12');
    await saveValues(request, draft.id, mg12Values(`${RUN}-ui-lock`), draft.version);
    await finaliseDraft(request, draft.id);

    // Finalised: the banner offers reopen; clicking navigates to the copy.
    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('finalised-banner')).toBeVisible();
    await page.getByTestId('reopen-button').click();
    await page.waitForURL((url) => !url.pathname.endsWith(draft.id));
    const copyId = page.url().split('/').pop()!;
    expect(copyId).not.toBe(draft.id);
    recordDraft(copyId);
    generatedFor.push(copyId);

    // The original is now superseded: banner, disabled fields, no pdf
    // section, no reopen. The API enforces all of it; this is the courtesy.
    await page.goto(`/drafts/${draft.id}`);
    await expect(page.getByTestId('superseded-banner')).toBeVisible();
    await expect(page.getByTestId('finalised-banner')).toHaveCount(0);
    await expect(page.getByTestId('pdf-section')).toHaveCount(0);
    await expect(page.getByTestId('reopen-button')).toHaveCount(0);
    const anyInput = page.locator('input[data-testid], textarea[data-testid]').first();
    if ((await anyInput.count()) > 0) {
      await expect(anyInput).toBeDisabled();
    }
  });

  test('UI: a sensitive-bearing version shows the withheld state — level named, never content', async ({
    request,
    page,
  }) => {
    const marker = `Withheld-ui-${RUN}`;
    const setDemoAccess = (value: boolean) =>
      prismaDo((p) =>
        p.user.update({
          where: { email: 'demo.solicitor@example.co.uk' },
          data: { sensitiveMaterialAccess: value },
        }),
      );
    // Built while permitted (the demo user's default), viewed after
    // revocation — the UI equivalent of revoked-after-contribution.
    const { draft } = await createDraft(request, 'MG6');
    const base = await saveValues(request, draft.id, mg6Values(null), draft.version);
    const confirm = await request.post(`/api/drafts/${draft.id}/sensitive/confirmations`, {
      data: { kind: 'HANDLING_INSTRUCTIONS' },
    });
    const { id: confirmationId } = await confirm.json();
    await saveValues(request, draft.id, mg6Values(marker), base.version, {
      sensitiveConfirmationId: confirmationId,
    });
    await generatePdf(request, draft.id);

    try {
      await setDemoAccess(false);
      await page.goto('/archive');
      const row = page.getByTestId(`archive-row-${draft.id}`);
      await expect(row).toBeVisible();
      await row.getByTestId('archive-history-toggle').click();
      const withheld = row.getByTestId('version-withheld');
      await expect(withheld).toBeVisible();
      // The LEVEL is named (the UC-07 presentation); the content never is.
      await expect(withheld).toContainText('Sensitive Material Access');
      await expect(row.getByTestId('version-download')).toHaveCount(0);
      expect(await page.content()).not.toContain(marker);
    } finally {
      await setDemoAccess(true); // the seeded default for the demo user
    }
  });
});
