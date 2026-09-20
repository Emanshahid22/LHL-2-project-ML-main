/**
 * UC-10 archive routes. Reads and one write (link) — there is deliberately
 * no DELETE and no endpoint that accepts a version number to assign
 * (LER-1177/1182: numbers come from the engine, history is append-only).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type {
  ArchiveDiffResponse,
  ArchiveListResponse,
  ArchivedVersionDto,
  CaseDocumentsResponse,
} from '@mgs/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { Requires } from '../auth/requires.decorator';
import { ArchiveService } from './archive.service';

@Controller()
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  /** The case's Documents section — "MG Forms" folder, current version as
   *  the primary entry per lineage (DoD line 4). Case access required. */
  @Requires('archive.read')
  @Get('cases/:id/documents')
  caseDocuments(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<CaseDocumentsResponse> {
    return this.archive.caseDocuments(user, id);
  }

  /** The caller's archive with LER-1186's filters, applied server-side. */
  @Requires('archive.read')
  @Get('archive')
  list(
    @CurrentUser() user: User,
    @Query('formCode') formCode?: string,
    @Query('caseId') caseId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ): Promise<ArchiveListResponse> {
    return this.archive.list(user, { formCode, caseId, from, to, status });
  }

  /** The version history drawer's data — every version, oldest first. */
  @Requires('archive.read')
  @Get('archive/lineages/:id/versions')
  versions(@CurrentUser() user: User, @Param('id') id: string): Promise<ArchivedVersionDto[]> {
    return this.archive.versions(user, id);
  }

  /** Field-level diff between any two versions (LER-1183). */
  @Requires('archive.read')
  @Get('archive/lineages/:id/diff')
  diff(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<ArchiveDiffResponse> {
    const fromNumber = Number(from);
    const toNumber = Number(to);
    if (!Number.isInteger(fromNumber) || !Number.isInteger(toNumber)) {
      throw new BadRequestException('from and to must be version numbers');
    }
    return this.archive.diff(user, id, fromNumber, toNumber);
  }

  /** Manual case-linking of a standalone lineage (LER-1185). */
  @Requires('archive.link')
  @Post('archive/lineages/:id/link')
  link(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { caseId?: unknown },
  ): Promise<{ lineageId: string; caseId: string }> {
    return this.archive.link(user, id, body?.caseId);
  }
}
