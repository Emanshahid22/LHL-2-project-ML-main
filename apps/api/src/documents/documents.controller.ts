/**
 * UC-09 routes (PRD §5). No endpoint accepts layout, wording or filename
 * input from a client: POST carries no body, the GETs carry only ids — the
 * layout is data in the repo, the declaration stays hash-pinned, filenames
 * are derived server-side at download time.
 */
import { Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import type { GeneratedDocumentDto, PdfJobDto, StartPdfResponse } from '@mgs/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { Requires } from '../auth/requires.decorator';
import { DocumentsService } from './documents.service';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Start generation. 404 unowned; 409 while the quality gate fails. */
  @Requires('documents.generate')
  @Post('drafts/:id/pdf')
  startPdf(@CurrentUser() user: User, @Param('id') id: string): Promise<StartPdfResponse> {
    return this.documents.startPdf(user, id);
  }

  @Requires('documents.generate')
  @Get('pdf-jobs/:id')
  jobStatus(@CurrentUser() user: User, @Param('id') id: string): Promise<PdfJobDto> {
    return this.documents.jobStatus(user, id);
  }

  @Requires('documents.read')
  @Get('documents/:id')
  meta(@CurrentUser() user: User, @Param('id') id: string): Promise<GeneratedDocumentDto> {
    return this.documents.documentMeta(user, id);
  }

  @Requires('documents.read')
  @Get('documents/:id/preview')
  async preview(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.stream(user, id, 'preview', res);
  }

  @Requires('documents.read')
  @Get('documents/:id/download')
  async download(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.stream(user, id, 'download', res);
  }

  /** The DOCX paired with a PDF document — same job, same render model. */
  @Requires('documents.read')
  @Get('documents/:id/docx')
  async docx(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.stream(user, id, 'docx', res);
  }

  private async stream(
    user: User,
    id: string,
    mode: 'preview' | 'download' | 'docx',
    res: Response,
  ): Promise<void> {
    const { stream, contentType, disposition } = await this.documents.openDocument(user, id, mode);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', disposition);
    // A tampered file fails GCM verification mid-stream: end the response
    // rather than serving altered bytes (the client sees a truncated body,
    // never wrong content presented as right).
    stream.on('error', () => res.end());
    stream.pipe(res);
  }
}
