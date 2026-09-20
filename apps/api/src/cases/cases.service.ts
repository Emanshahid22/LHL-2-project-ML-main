import { Injectable } from '@nestjs/common';
import type { Case, CaseOffence } from '@prisma/client';
import type { CaseSummaryDto } from '@mgs/shared';
import { PrismaService } from '../prisma/prisma.service';

export type CaseWithOffences = Case & { offences: CaseOffence[] };

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All cases the user has been granted access to, newest activity first. */
  async listForUser(userId: string): Promise<CaseWithOffences[]> {
    return this.prisma.case.findMany({
      where: { access: { some: { userId } } },
      include: { offences: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** A single case, only if the user can access it — null otherwise
   *  (callers 404 rather than reveal that the case exists). */
  async findForUser(userId: string, caseId: string): Promise<CaseWithOffences | null> {
    return this.prisma.case.findFirst({
      where: { id: caseId, access: { some: { userId } } },
      include: { offences: true },
    });
  }

  toDto(c: CaseWithOffences): CaseSummaryDto {
    return {
      id: c.id,
      urn: c.urn,
      defendantName: c.defendantName,
      offenceSummary: c.offenceSummary,
      courtName: c.courtName,
      nextHearingAt: c.nextHearingAt?.toISOString() ?? null,
      cpsReference: c.cpsReference,
      officerInCase: c.officerInCase,
      defendantAddress: c.defendantAddress,
      defendantDob: c.defendantDob?.toISOString() ?? null,
      offences: c.offences.map((o) => ({
        id: o.id,
        offenceDate: o.offenceDate.toISOString(),
        chargeWording: o.chargeWording,
      })),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
