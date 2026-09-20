/**
 * UC-09: generation pipeline, storage and streaming.
 *
 * Rendering runs OFF the request path: startPdf enqueues and returns a job
 * id; a depth-1 in-process queue renders one job at a time (at most one
 * Chromium alive, per Phase 0's memory budget). One render model — built
 * from the CALLER's view, redaction before binding — feeds both the PDF and
 * the DOCX, so the pair cannot disagree about content.
 *
 * Log/row discipline (stories/sensitive-rendering.md): nothing in this file
 * writes draft content to a log line, job row, filename or storage key —
 * ids, counts and hashes only. tools/pii-scan audits the stored keys.
 */
import {
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ArchivedVersion, FormDraft, GeneratedDocument, PdfJob, Prisma, User } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import {
  CleanA4Binding,
  declarationPageCountActive,
  GeneratedDocumentDto,
  getFormTemplate,
  planVersionMint,
  shouldMintVersion,
  PdfJobDto,
  RenderModel,
  StartPdfResponse,
  withDeclaredPageCount,
  footerTemplate,
  headerTemplate,
  modelToHtml,
} from '@mgs/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DraftsService } from '../drafts/drafts.service';
import { documentDecipher, DOCUMENT_CIPHER, encryptDocument } from './document-crypto';
import {
  countPdfPages,
  renderPdf,
} from './chromium-pdf';
import { buildDocx } from './docx-builder';
import { renderFontCss } from './render-font';

/**
 * Where ciphertext lives. Deployed: the volume (`DOCUMENT_STORE_DIR=
 * /data/documents`). Dev default: a gitignored directory beside the API.
 */
export function documentStoreDir(): string {
  return process.env['DOCUMENT_STORE_DIR'] || resolve(__dirname, '..', '..', 'document-store');
}

/**
 * storageKey = documents/<caseId|standalone>/<contentHash>.<kind>.enc —
 * opaque ids and a hash, nothing human-meaningful, by construction (DoD 3).
 * The charset guard is a write-time invariant; tools/pii-scan is the audit.
 */
function storageKeyFor(caseId: string | null, contentHash: string, kind: 'pdf' | 'docx'): string {
  const key = `documents/${caseId ?? 'standalone'}/${contentHash}.${kind}.enc`;
  if (!/^documents\/[a-z0-9]+\/[a-f0-9]{64}\.(pdf|docx)\.enc$/.test(key)) {
    throw new Error('Storage key failed the PII-free shape invariant');
  }
  return key;
}

const RETRYABLE_FAILURE = 'The document renderer failed or timed out. The form is unchanged — retry the generation.';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly binding = new CleanA4Binding();
  /** Depth-1 queue: each job chains on the last. Never rejects — every
   *  failure is absorbed into its own job row. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly drafts: DraftsService,
  ) {}

  /**
   * POST /drafts/:id/pdf — gate (server-side re-run of UC-08's engine, via
   * DraftsService), enqueue, return the job id. PDF_RETRIED is recorded when
   * this generation follows a failed job for the same draft (LER-1169).
   */
  async startPdf(user: User, draftId: string): Promise<StartPdfResponse> {
    const { draft, template, values } = await this.drafts.gateForGeneration(user, draftId);

    const previousFailure = await this.prisma.pdfJob.findFirst({
      where: { draftId: draft.id, status: 'failed' },
      orderBy: { createdAt: 'desc' },
    });
    const job = await this.prisma.pdfJob.create({
      data: { draftId: draft.id, requestedBy: user.id },
    });
    if (previousFailure) {
      await this.audit.record(user.id, 'PDF_RETRIED', draft.id, {
        jobId: job.id,
        previousJobId: previousFailure.id,
      });
    }

    this.queue = this.queue.then(() =>
      this.processJob(user, job.id, draft, template.code, values).catch((err) => {
        // processJob handles its own failures; this catch is the queue's
        // never-break guarantee for anything thrown outside them.
        this.logger.error(`PDF job ${job.id} escaped its handler`, err as Error);
      }),
    );
    return { jobId: job.id };
  }

  private async processJob(
    user: User,
    jobId: string,
    draft: FormDraft & { case: { id: string } | null },
    formCode: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.pdfJob.update({ where: { id: jobId }, data: { status: 'rendering' } });
    try {
      const template = getFormTemplate(formCode);
      if (!template) throw new Error('Template disappeared between gate and render');

      const sensitivePermitted = user.sensitiveMaterialAccess === true;
      const model = this.binding.bind(template, values, { sensitivePermitted });
      const pdf = await this.renderWithPageCountAssertion(model);
      const pageCount = countPdfPages(pdf);
      const docx = buildDocx(model);

      // UC-10: the render's sensitive predicate, recorded at mint — the same
      // expression that gates the SENSITIVE_SECTION_VIEWED audit below. An
      // unpermitted caller's render carries no MG6D content (redaction
      // happened before binding), so its versions are not sensitive-bearing.
      const containsSensitive =
        sensitivePermitted && model.sections.some((s) => s.sensitive);

      // Document rows and the version mint commit or fail TOGETHER (stage-2
      // review, requirement 1): no version row without stored bytes, no
      // archived bytes invisible to history.
      const { pdfDoc, docxDoc, version } = await this.prisma.$transaction(async (tx) => {
        const pdfDoc = await this.storeDocument(tx, user, draft, 'pdf', pdf, pageCount);
        const docxDoc = await this.storeDocument(tx, user, draft, 'docx', docx, pageCount);
        const version = await this.mintVersion(tx, user, draft, values, containsSensitive, pdfDoc, docxDoc);
        return { pdfDoc, docxDoc, version };
      });

      await this.prisma.pdfJob.update({
        where: { id: jobId },
        data: { status: 'done', documentId: pdfDoc.id, docxDocumentId: docxDoc.id },
      });
      await this.audit.record(user.id, 'PDF_GENERATED', draft.id, {
        jobId,
        documentId: pdfDoc.id,
        docxDocumentId: docxDoc.id,
        formCode,
        pageCount,
        sizeBytes: pdf.length,
      });
      if (version) {
        await this.audit.record(user.id, 'DOCUMENT_ARCHIVED', draft.id, {
          lineageId: version.lineageId,
          versionNumber: version.versionNumber,
          label: version.label,
          documentId: pdfDoc.id,
          attached: draft.caseId !== null,
        });
      }
      // A permitted caller's render that includes the active MG6D section IS
      // a UC-07 access — recorded through the existing action (LER-1158).
      if (sensitivePermitted && model.sections.some((s) => s.sensitive)) {
        await this.audit.record(user.id, 'SENSITIVE_SECTION_VIEWED', draft.id, {
          via: 'document-render',
          documentId: pdfDoc.id,
        });
      }
    } catch (err) {
      // Content-free failure: the reason is fixed wording, never an error
      // string that could carry draft content. The draft is untouched.
      this.logger.error(`PDF job ${jobId} failed`, err as Error);
      await this.prisma.pdfJob.update({
        where: { id: jobId },
        data: { status: 'failed', failureReason: RETRYABLE_FAILURE, retryable: true },
      });
      await this.audit.record(user.id, 'PDF_FAILED', draft.id, { jobId });
    }
  }

  /**
   * The MG11 page-count trio (LER-1071–1073), as a MECHANISM: while the
   * pinned declaration carries no page-count parenthetical
   * (declarationPageCountActive() === false, pending LER-1200) this is a
   * single render. When approved wording activates it: render, interpolate
   * the actual count into the declaration, re-render, and REFUSE to emit a
   * document whose declared count differs from its actual count.
   */
  private async renderWithPageCountAssertion(model: RenderModel): Promise<Buffer> {
    const render = (m: RenderModel) =>
      renderPdf({
        html: modelToHtml(m, this.binding.layout, renderFontCss()),
        headerTemplate: headerTemplate(m),
        footerTemplate: footerTemplate(m),
        marginMm: this.binding.layout.page.marginMm,
      });

    const first = await render(model);
    if (!(model.formCode === 'MG11' && declarationPageCountActive())) return first;

    const actual = countPdfPages(first);
    const interpolated: RenderModel = {
      ...model,
      sections: model.sections.map((s) => ({
        ...s,
        blocks: s.blocks.map((b) =>
          b.kind === 'declaration'
            ? { ...b, text: withDeclaredPageCount(b.text ?? '', actual) }
            : b,
        ),
      })),
    };
    const second = await render(interpolated);
    const declared = actual;
    const finalCount = countPdfPages(second);
    if (finalCount !== declared) {
      throw new Error(
        `MG11 declared page count ${declared} != actual ${finalCount} — refusing to emit a defective statement`,
      );
    }
    return second;
  }

  private async storeDocument(
    tx: Prisma.TransactionClient,
    user: User,
    draft: FormDraft & { case: { id: string } | null },
    kind: 'pdf' | 'docx',
    plaintext: Buffer,
    pageCount: number,
  ): Promise<GeneratedDocument> {
    const enc = encryptDocument(plaintext);
    const storageKey = storageKeyFor(draft.caseId, enc.contentHashHex, kind);
    // Same plaintext → same hash → same key. Three cases, in order:
    //  1. THIS draft already has the row — reuse it (regenerating identical
    //     content changes nothing, and must not).
    //  2. Another draft stored the same bytes — the FILE stays untouched
    //     (its ciphertext pairs with the iv/authTag already recorded), and
    //     this draft gets its OWN row sharing that cipher identity.
    //  3. New content — write the file, record the fresh identity.
    // Never overwrite an existing file with a re-encryption: the old rows'
    // auth tags would stop matching and every prior reference would die.
    // (A file written inside a transaction that later rolls back is an
    // orphan no row references — harmless ciphertext the next identical
    // write may replace, since only row-referenced files are immutable.)
    const mine = await tx.generatedDocument.findUnique({
      where: { draftId_storageKey: { draftId: draft.id, storageKey } },
    });
    if (mine) return mine;
    const twin = await tx.generatedDocument.findFirst({ where: { storageKey } });
    const identity = twin
      ? { iv: twin.iv, authTag: twin.authTag }
      : { iv: enc.ivHex, authTag: enc.authTagHex };
    if (!twin) {
      const path = join(documentStoreDir(), storageKey);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, enc.ciphertext);
    }
    return tx.generatedDocument.create({
      data: {
        draftId: draft.id,
        caseId: draft.caseId,
        formCode: draft.formCode,
        templateVersion: draft.templateVersion,
        kind,
        contentHash: enc.contentHashHex,
        storageKey,
        cipher: DOCUMENT_CIPHER,
        ...identity,
        sizeBytes: plaintext.length,
        pageCount,
        renderedBy: user.id,
        // UC-10: the stub becomes real at mint time.
        archiveStatus: draft.caseId ? 'attached' : 'personal',
      },
    });
  }

  /**
   * UC-10: mint the lineage's next version — same transaction as the
   * document rows. VERSION IDENTITY IS ROW-LEVEL (stage-1 review,
   * condition 1): a different draft minting byte-identical content still
   * gets a new row; the ONLY no-mint case is the same CURRENT draft
   * regenerating its own unchanged latest version (a plain re-serve —
   * re-downloads and idle regenerations must not inflate history).
   * Number and label come only from the shared planVersionMint.
   */
  private async mintVersion(
    tx: Prisma.TransactionClient,
    user: User,
    draft: FormDraft & { case: { id: string } | null },
    values: Record<string, unknown>,
    containsSensitive: boolean,
    pdfDoc: GeneratedDocument,
    docxDoc: GeneratedDocument,
  ): Promise<ArchivedVersion | null> {
    const lineageId = draft.lineageId ?? draft.id;
    if (!draft.lineageId) {
      await tx.formDraft.update({ where: { id: draft.id }, data: { lineageId } });
    }
    const versions = await tx.archivedVersion.findMany({
      where: { lineageId },
      orderBy: { versionNumber: 'asc' },
      select: { versionNumber: true, draftId: true, contentHash: true },
    });
    const latest = versions[versions.length - 1];
    if (!shouldMintVersion({ latest, draftId: draft.id, contentHash: pdfDoc.contentHash })) {
      return null;
    }
    const cycle = await this.amendmentCycle(tx, draft);
    const { versionNumber, label } = planVersionMint({
      existingNumbers: versions.map((v) => v.versionNumber),
      cycle,
    });
    return tx.archivedVersion.create({
      data: {
        lineageId,
        versionNumber,
        label,
        cycle,
        draftId: draft.id,
        formCode: draft.formCode,
        templateVersion: draft.templateVersion,
        documentId: pdfDoc.id,
        docxDocumentId: docxDoc.id,
        contentHash: pdfDoc.contentHash,
        caseId: draft.caseId,
        userId: user.id,
        generatedByName: user.name,
        valuesSnapshotJson: JSON.stringify(values),
        containsSensitive,
      },
    });
  }

  /** Amendment depth of a draft: root = 0, each reopen hop adds one. Walked
   *  rather than stored — lineages are shallow and the chain is the truth. */
  private async amendmentCycle(
    tx: Prisma.TransactionClient,
    draft: FormDraft,
  ): Promise<number> {
    let cycle = 0;
    const seen = new Set<string>([draft.id]);
    let cursor = draft.amendedFromId;
    while (cursor) {
      if (seen.has(cursor) || cycle >= 100) {
        throw new Error('Amendment lineage is cyclic or implausibly deep — refusing to mint');
      }
      seen.add(cursor);
      cycle++;
      const parent = await tx.formDraft.findUnique({
        where: { id: cursor },
        select: { amendedFromId: true },
      });
      cursor = parent?.amendedFromId ?? null;
    }
    return cycle;
  }

  /** GET /pdf-jobs/:id — owner-scoped through the draft. */
  async jobStatus(user: User, jobId: string): Promise<PdfJobDto> {
    const job = await this.prisma.pdfJob.findUnique({ where: { id: jobId } });
    if (!job || !(await this.ownsDraft(user, job.draftId))) {
      throw new NotFoundException('Job not found');
    }
    return this.jobDto(job);
  }

  private jobDto(job: PdfJob): PdfJobDto {
    return {
      id: job.id,
      draftId: job.draftId,
      status: job.status as PdfJobDto['status'],
      documentId: job.documentId ?? undefined,
      failureReason: job.failureReason ?? undefined,
      retryable: job.status === 'failed' ? job.retryable : undefined,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private async ownsDraft(user: User, draftId: string): Promise<boolean> {
    return (
      (await this.prisma.formDraft.findFirst({
        where: { id: draftId, userId: user.id },
        select: { id: true },
      })) !== null
    );
  }

  private async ownedDocument(user: User, id: string): Promise<GeneratedDocument> {
    const doc = await this.prisma.generatedDocument.findUnique({ where: { id } });
    if (!doc || !(await this.ownsDraft(user, doc.draftId))) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  /**
   * UC-10 (stage-3 item 6): download/preview scope is owner OR case-access
   * holder of the version's case. Case access never implies the UC-07
   * permission — the sensitive serve-time re-check in openDocument runs
   * AFTER this, for every caller. 404 either way when neither holds.
   */
  private async accessibleDocument(user: User, id: string): Promise<GeneratedDocument> {
    const doc = await this.prisma.generatedDocument.findUnique({ where: { id } });
    if (doc) {
      if (await this.ownsDraft(user, doc.draftId)) return doc;
      const version = await this.prisma.archivedVersion.findFirst({
        where: { OR: [{ documentId: doc.id }, { docxDocumentId: doc.id }] },
        select: { caseId: true },
      });
      if (version?.caseId) {
        const access = await this.prisma.caseAccess.findUnique({
          where: { userId_caseId: { userId: user.id, caseId: version.caseId } },
          select: { id: true },
        });
        if (access) return doc;
      }
    }
    throw new NotFoundException('Document not found');
  }

  toDocumentDto(doc: GeneratedDocument): GeneratedDocumentDto {
    return {
      id: doc.id,
      draftId: doc.draftId,
      formCode: doc.formCode,
      templateVersion: doc.templateVersion,
      kind: doc.kind as 'pdf' | 'docx',
      pageCount: doc.pageCount,
      sizeBytes: doc.sizeBytes,
      archiveStatus: doc.archiveStatus as GeneratedDocumentDto['archiveStatus'],
      createdAt: doc.createdAt.toISOString(),
    };
  }

  /**
   * Decrypted stream for preview (inline) and download (attachment). The
   * filename exists only here, derived from row metadata — never stored,
   * never containing case data (LER-1167): <formCode>-draft-<yyyymmdd>.<ext>.
   */
  async openDocument(
    user: User,
    id: string,
    mode: 'preview' | 'download' | 'docx',
  ): Promise<{ stream: Readable; contentType: string; filename: string; disposition: string }> {
    let doc = await this.accessibleDocument(user, id);
    if (mode === 'docx' && doc.kind === 'pdf') {
      // The DOCX paired with this PDF — produced by the same job, from the
      // same render model.
      const job = await this.prisma.pdfJob.findFirst({
        where: { documentId: doc.id },
        orderBy: { createdAt: 'desc' },
      });
      const docxId = job?.docxDocumentId;
      if (!docxId) throw new NotFoundException('No Word export exists for this document');
      doc = await this.accessibleDocument(user, docxId);
    }

    // UC-10 serve-time re-check (stage-2 review, requirement 4): a version
    // whose render includes MG6D content serves ONLY to a caller holding the
    // permission NOW — revocation after contribution closes the download,
    // whatever access minted it. Content-free refusal; regardless of any
    // case access.
    const version = await this.prisma.archivedVersion.findFirst({
      where: { OR: [{ documentId: doc.id }, { docxDocumentId: doc.id }] },
      select: { versionNumber: true, containsSensitive: true },
    });
    if (version?.containsSensitive && user.sensitiveMaterialAccess !== true) {
      throw new ForbiddenException(
        'This document contains sensitive material — the sensitive material permission is required to open it.',
      );
    }

    const date = doc.createdAt.toISOString().slice(0, 10).replace(/-/g, '');
    const ext = doc.kind === 'pdf' ? 'pdf' : 'docx';
    // UC-10: archived versions carry their number (still nothing case-derived
    // — the UC-09 filename discipline, LER-1167, extended per version).
    const versionSuffix = version ? `-v${version.versionNumber}` : '';
    const filename = `${doc.formCode}-draft-${date}${versionSuffix}.${ext}`;
    const contentType =
      doc.kind === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const action = doc.kind === 'docx' ? 'DOCX_EXPORTED' : 'DOCUMENT_DOWNLOADED';
    await this.audit.record(user.id, mode === 'preview' ? 'DOCUMENT_DOWNLOADED' : action, doc.draftId, {
      documentId: doc.id,
      kind: doc.kind,
      mode,
    });

    // Verify BEFORE serving: GCM only authenticates at the end of the
    // stream, and a response that has already sent headers cannot turn into
    // an honest error — so the file is decrypted in memory first (documents
    // are form-sized; sizeBytes is on the row) and a tampered or wrongly
    // keyed file answers 410 with an audit row instead of truncated bytes
    // dressed as success (LER-1165). This trades the PRD's no-buffering line
    // for integrity honesty — recorded as a deviation in the PR body.
    const path = join(documentStoreDir(), doc.storageKey);
    let plaintext: Buffer;
    try {
      const ciphertext = await readFile(path);
      const decipher = documentDecipher(doc.iv, doc.authTag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      await this.audit.record(user.id, 'DOCUMENT_INTEGRITY_FAILED', doc.draftId, {
        documentId: doc.id,
        kind: doc.kind,
      });
      throw new GoneException(
        'The stored document failed integrity verification and will not be served.',
      );
    }
    const stream = Readable.from(plaintext);

    return {
      stream,
      contentType,
      filename,
      disposition: mode === 'preview' ? 'inline' : `attachment; filename="${filename}"`,
    };
  }

  /** GET /documents/:id — metadata for the client (never bytes). */
  async documentMeta(user: User, id: string): Promise<GeneratedDocumentDto> {
    return this.toDocumentDto(await this.ownedDocument(user, id));
  }
}
