import { Body, Controller, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import type {
  AutoFillResultDto,
  CreateDraftRequest,
  CreateDraftResponse,
  FinaliseRequest,
  FinaliseResponse,
  FormDraftDto,
  LanguageInsertRequest,
  QualityReviewResponse,
  SensitiveConfirmRequest,
  SensitiveConfirmResponse,
  ReopenResponse,
  UpdateDraftRequest,
} from '@mgs/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { Requires } from '../auth/requires.decorator';
import { DraftsService } from './drafts.service';

@Controller('drafts')
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Requires('forms.edit')
  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateDraftRequest): Promise<CreateDraftResponse> {
    return this.drafts.create(user, body);
  }

  @Requires('forms.read')
  @Get()
  list(@CurrentUser() user: User): Promise<FormDraftDto[]> {
    return this.drafts.listForUser(user);
  }

  @Requires('forms.read')
  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string): Promise<FormDraftDto> {
    return this.drafts.getForUser(user, id);
  }

  @Requires('forms.edit')
  @Post(':id/autofill')
  autoFill(@CurrentUser() user: User, @Param('id') id: string): Promise<AutoFillResultDto> {
    return this.drafts.autoFill(user, id);
  }

  /**
   * UC-06: records that the user inserted a language-assistance suggestion.
   *
   * It RECORDS; it does not modify the draft. The narrative reaches the server
   * by the ordinary autosave PATCH, unchanged — adding a second write path for
   * narrative text is exactly what the "nothing is ever auto-applied" guarantee
   * exists to prevent. 204 because there is nothing to return.
   */
  @Requires('forms.edit')
  @Post(':id/language-insert')
  @HttpCode(204)
  recordLanguageInsert(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: LanguageInsertRequest,
  ): Promise<void> {
    return this.drafts.recordLanguageInsert(user, id, body);
  }

  @Requires('forms.edit')
  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateDraftRequest,
  ): Promise<FormDraftDto> {
    return this.drafts.update(user, id, body);
  }

  /**
   * UC-08: run the quality suite. Server-side because two of the four checks
   * cannot run anywhere else, and because the finalise gate must rest on
   * results no client curated.
   */
  @Requires('forms.edit')
  @Post(':id/review')
  review(@CurrentUser() user: User, @Param('id') id: string): Promise<QualityReviewResponse> {
    return this.drafts.review(user, id);
  }

  /**
   * UC-08: the finalise gate. Re-runs the engine at the boundary; 409 with an
   * audited refusal while blocking issues, incomplete checks, or
   * unacknowledged advisories stand.
   */
  @Requires('forms.finalise')
  @Post(':id/finalise')
  finalise(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: FinaliseRequest,
  ): Promise<FinaliseResponse> {
    return this.drafts.finalise(user, id, body);
  }

  /**
   * UC-10: reopen a finalised form for amendment. Creates the editable copy
   * and supersedes the source in one transaction; 409 (content-free) on a
   * superseded version, a non-finalised draft, or an already-open amendment.
   * No body — the only input is the draft id in the URL.
   */
  @Requires('forms.finalise')
  @Post(':id/reopen')
  reopen(@CurrentUser() user: User, @Param('id') id: string): Promise<ReopenResponse> {
    return this.drafts.reopen(user, id);
  }

  /**
   * UC-07: records a handling-instructions confirmation or a PII-steps
   * acknowledgement. Step-up by design: the client asks again on every access,
   * and each ask is a new appended row — there is no "already confirmed" reply.
   * 403 without the permission; 409 while the section is not active.
   */
  @Requires('forms.edit')
  @Post(':id/sensitive/confirmations')
  confirmSensitive(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: SensitiveConfirmRequest,
  ): Promise<SensitiveConfirmResponse> {
    return this.drafts.recordSensitiveConfirmation(user, id, body);
  }

  /**
   * UC-07: the non-sensitive schedule export — a CSV that excludes sensitive
   * rows and the whole MG6D section by construction (one shared builder). A
   * plain GET so the UI can offer it as an ordinary download link.
   */
  @Requires('forms.read')
  @Get(':id/export/non-sensitive-schedule')
  async exportNonSensitiveSchedule(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { filename, csv } = await this.drafts.exportNonSensitiveSchedule(user, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
