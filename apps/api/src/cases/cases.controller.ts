import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { CaseSummaryDto } from '@mgs/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { Requires } from '../auth/requires.decorator';
import { CasesService } from './cases.service';

@Controller('cases')
@Requires('cases.read')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  async list(@CurrentUser() user: User): Promise<CaseSummaryDto[]> {
    const cases = await this.cases.listForUser(user.id);
    return cases.map((c) => this.cases.toDto(c));
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @Param('id') id: string): Promise<CaseSummaryDto> {
    const found = await this.cases.findForUser(user.id, id);
    if (!found) {
      // 404 for both "doesn't exist" and "no access" — don't leak existence.
      throw new NotFoundException('Case not found');
    }
    return this.cases.toDto(found);
  }
}
