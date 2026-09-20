/**
 * Ruling #9: the Senior Solicitor's read-only advisory-bypass listing —
 * ADVISORY_BYPASSED audit rows with their verbatim reasons. No
 * approve/reject workflow in v1 (Husnain's open Q8 noted in the register).
 * A read surface: scoped by capability, not audited (writes-only trail).
 */
import { Controller, Get } from '@nestjs/common';
import { Requires } from '../auth/requires.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('oversight')
export class OversightController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('bypasses')
  @Requires('oversight.bypasses')
  async bypasses(): Promise<
    { draftId: string | null; userEmail: string; reason: unknown; at: string }[]
  > {
    const rows = await this.prisma.auditEvent.findMany({
      where: { action: 'ADVISORY_BYPASSED' },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      draftId: r.formDraftId,
      userEmail: r.user.email,
      reason: r.metadataJson ? JSON.parse(r.metadataJson) : null,
      at: r.createdAt.toISOString(),
    }));
  }
}
