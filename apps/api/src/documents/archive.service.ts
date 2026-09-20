/**
 * UC-10: the archive read/link surface — version listings, the Documents
 * section, the personal archive with LER-1186's filters, the field-level
 * diff, and manual case-linking. Read scope (PRD §9, stage-3 item 6): the
 * OWNER sees everything of their own; CASE ACCESS grants the version list
 * and downloads of attached lineages — but never widens the UC-07 boundary
 * (sensitive-bearing versions stay 403 without the permission, enforced at
 * serve time in DocumentsService). Diff and link stay owner-only: the diff
 * exposes value snapshots and the link is a write. Append-only throughout:
 * no delete, rename or renumber exists on this surface, by construction
 * (LER-1182).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ArchivedVersion, User } from '@prisma/client';
import {
  ArchiveDiffResponse,
  ArchiveLineageEntryDto,
  ArchiveListResponse,
  ArchivedVersionDto,
  CaseDocumentsResponse,
  diffArchivedValues,
  getFormTemplate,
} from '@mgs/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CasesService } from '../cases/cases.service';

export interface ArchiveListFilters {
  formCode?: string;
  /** A case id, or the literal 'standalone' for unlinked lineages. */
  caseId?: string;
  /** ISO dates, inclusive, applied to the CURRENT version's created date. */
  from?: string;
  to?: string;
  status?: string;
}

@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cases: CasesService,
  ) {}

  /** The lineage's versions, oldest first — the drawer's data (LER-1178/79).
   *  Owner or case-access holder (attached lineages). */
  async versions(user: User, lineageId: string): Promise<ArchivedVersionDto[]> {
    const rows = await this.accessibleLineage(user, lineageId);
    return rows.map((v) => this.toDto(v));
  }

  /**
   * The case's Documents section — the "MG Forms" folder (LER-1172/1173).
   * ONE primary entry per lineage, and it is always the CURRENT version
   * (DoD line 4); superseded versions appear only in the drawer.
   */
  async caseDocuments(user: User, caseId: string): Promise<CaseDocumentsResponse> {
    const target = await this.cases.findForUser(user.id, caseId);
    if (!target) {
      throw new NotFoundException('Case not found');
    }
    const rows = await this.prisma.archivedVersion.findMany({
      where: { caseId: target.id },
      orderBy: { versionNumber: 'asc' },
    });
    const lineages = await this.toLineageEntries(rows);
    return { caseId: target.id, lineages };
  }

  /**
   * The caller's archive (LER-1184/1186): their own lineages — standalone
   * and case-linked — with the scope's four filters (case, form type, date,
   * status), applied SERVER-side.
   */
  async list(user: User, filters: ArchiveListFilters): Promise<ArchiveListResponse> {
    const rows = await this.prisma.archivedVersion.findMany({
      where: {
        userId: user.id,
        ...(filters.formCode ? { formCode: filters.formCode } : {}),
        ...(filters.caseId
          ? { caseId: filters.caseId === 'standalone' ? null : filters.caseId }
          : {}),
      },
      orderBy: { versionNumber: 'asc' },
    });
    let entries = await this.toLineageEntries(rows);
    if (filters.from) {
      entries = entries.filter((e) => e.current.createdAt.slice(0, 10) >= filters.from!);
    }
    if (filters.to) {
      entries = entries.filter((e) => e.current.createdAt.slice(0, 10) <= filters.to!);
    }
    if (filters.status) {
      entries = entries.filter((e) => e.status === filters.status);
    }
    return { entries };
  }

  /** Group version rows into one entry per lineage, current version primary,
   *  newest lineages first; status derives from open drafts on the lineage. */
  private async toLineageEntries(rows: ArchivedVersion[]): Promise<ArchiveLineageEntryDto[]> {
    const byLineage = new Map<string, ArchivedVersion[]>();
    for (const row of rows) {
      const list = byLineage.get(row.lineageId) ?? [];
      list.push(row);
      byLineage.set(row.lineageId, list);
    }
    const lineageIds = [...byLineage.keys()];
    // 'Amendment in progress' means a REOPENED copy is open (amendedFromId
    // set). An original still in DRAFT is not an amendment — its generated
    // version is Final exactly as the scope's Documents entry says.
    const openDrafts = lineageIds.length
      ? await this.prisma.formDraft.findMany({
          where: {
            lineageId: { in: lineageIds },
            status: { in: ['DRAFT', 'REVIEWED'] },
            amendedFromId: { not: null },
          },
          select: { lineageId: true },
        })
      : [];
    const amending = new Set(openDrafts.map((d) => d.lineageId));
    const entries = lineageIds.map((lineageId) => {
      const versions = byLineage.get(lineageId)!;
      const current = versions[versions.length - 1];
      return {
        lineageId,
        formCode: current.formCode,
        caseId: current.caseId,
        versionCount: versions.length,
        current: this.toDto(current),
        status: (amending.has(lineageId) ? 'Amendment in progress' : 'Final') as
          | 'Final'
          | 'Amendment in progress',
      };
    });
    entries.sort((a, b) => b.current.createdAt.localeCompare(a.current.createdAt));
    return entries;
  }

  /**
   * Field-level diff between two versions (LER-1183), inside the UC-07
   * boundary: the shared diffArchivedValues redacts BOTH sides before
   * comparing for a caller without the permission, and a permitted caller's
   * diff that touches sensitive fields is a recorded access.
   */
  async diff(
    user: User,
    lineageId: string,
    fromNumber: number,
    toNumber: number,
  ): Promise<ArchiveDiffResponse> {
    const rows = await this.ownedLineage(user, lineageId);
    const from = rows.find((v) => v.versionNumber === fromNumber);
    const to = rows.find((v) => v.versionNumber === toNumber);
    if (!from || !to) {
      throw new NotFoundException('Version not found');
    }
    const template = getFormTemplate(to.formCode);
    if (!template) {
      throw new NotFoundException('Version not found');
    }
    const sensitivePermitted = user.sensitiveMaterialAccess === true;
    const result = diffArchivedValues(
      template,
      JSON.parse(from.valuesSnapshotJson) as Record<string, unknown>,
      JSON.parse(to.valuesSnapshotJson) as Record<string, unknown>,
      { sensitivePermitted },
    );
    if (result.containsSensitiveChanges) {
      // Only ever true for a permitted caller (redaction precedes the diff
      // otherwise) — the same audit family as every other UC-07 view.
      await this.audit.record(user.id, 'SENSITIVE_SECTION_VIEWED', to.draftId, {
        via: 'version-diff',
        lineageId,
        from: fromNumber,
        to: toNumber,
      });
    }
    return { lineageId, from: fromNumber, to: toNumber, entries: result.entries };
  }

  /**
   * Manual case-linking of a standalone lineage (LER-1185, DoD 3). The whole
   * history attaches — versions never split across cases. There is no
   * un-link: a mislink is corrected by the case's own record, and the
   * CASE_LINKED audit rows carry the trail.
   */
  async link(
    user: User,
    lineageId: string,
    caseId: unknown,
  ): Promise<{ lineageId: string; caseId: string }> {
    if (typeof caseId !== 'string' || caseId.length === 0) {
      throw new NotFoundException('Case not found');
    }
    // Existence is only confirmed through the caller's own access — a caller
    // without access learns nothing about whether the case id is real.
    const target = await this.cases.findForUser(user.id, caseId);
    if (!target) {
      throw new NotFoundException('Case not found');
    }
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.archivedVersion.findMany({
        where: { lineageId, userId: user.id },
        select: { id: true, caseId: true, draftId: true },
      });
      if (rows.length === 0) {
        throw new NotFoundException('Archive entry not found');
      }
      if (rows.some((v) => v.caseId !== null)) {
        throw new ConflictException('This form is already linked to a case.');
      }
      await tx.archivedVersion.updateMany({
        where: { lineageId },
        data: { caseId: target.id },
      });
      await tx.formDraft.updateMany({
        where: { lineageId },
        data: { caseId: target.id },
      });
      // The documents' archiveStatus follows the lineage; their storage keys
      // do NOT — a storage path is a mint-time fact and stored ciphertext is
      // never moved or rewritten (the UC-09 immutability discipline).
      await tx.generatedDocument.updateMany({
        where: { draftId: { in: rows.map((v) => v.draftId) } },
        data: { archiveStatus: 'attached' },
      });
    });
    await this.audit.record(user.id, 'CASE_LINKED', lineageId, {
      lineageId,
      caseId: target.id,
    });
    return { lineageId, caseId: target.id };
  }

  /** Owner-scoped lineage fetch: 404 when it has no versions the caller owns. */
  private async ownedLineage(user: User, lineageId: string): Promise<ArchivedVersion[]> {
    const rows = await this.prisma.archivedVersion.findMany({
      where: { lineageId, userId: user.id },
      orderBy: { versionNumber: 'asc' },
    });
    if (rows.length === 0) {
      throw new NotFoundException('Archive entry not found');
    }
    return rows;
  }

  /**
   * Owner OR case-access read scope (stage-3 item 6). 404 either way when
   * neither holds — a caller without access learns nothing about whether the
   * lineage exists. Case access never implies the UC-07 permission: the
   * sensitive serve-time re-check sits on the download path itself.
   */
  private async accessibleLineage(user: User, lineageId: string): Promise<ArchivedVersion[]> {
    const rows = await this.prisma.archivedVersion.findMany({
      where: { lineageId },
      orderBy: { versionNumber: 'asc' },
    });
    if (rows.length > 0) {
      if (rows[0].userId === user.id) return rows;
      const caseId = rows[rows.length - 1].caseId;
      if (caseId && (await this.cases.findForUser(user.id, caseId))) return rows;
    }
    throw new NotFoundException('Archive entry not found');
  }

  private toDto(v: ArchivedVersion): ArchivedVersionDto {
    return {
      id: v.id,
      lineageId: v.lineageId,
      versionNumber: v.versionNumber,
      label: v.label,
      cycle: v.cycle,
      formCode: v.formCode,
      templateVersion: v.templateVersion,
      documentId: v.documentId,
      docxDocumentId: v.docxDocumentId ?? undefined,
      contentHash: v.contentHash,
      caseId: v.caseId,
      generatedByName: v.generatedByName,
      containsSensitive: v.containsSensitive,
      createdAt: v.createdAt.toISOString(),
    };
  }
}
