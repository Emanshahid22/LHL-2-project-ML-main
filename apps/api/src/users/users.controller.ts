import { Controller, Get } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { CurrentUserDto } from '@mgs/shared';
import { capabilitySetOf } from '@mgs/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('me')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Session-only (no capability): identity + presentation hints. Every
   *  actual access is re-checked at the API (LER-1015). */
  @Get()
  async me(@CurrentUser() user: User): Promise<CurrentUserDto> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    });
    const credential = await this.prisma.passwordCredential.findUnique({
      where: { userId: user.id },
      select: { mustChange: true },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      sensitiveMaterialAccess: user.sensitiveMaterialAccess === true,
      roles: roles.map((r) => r.role.name),
      capabilities: [...capabilitySetOf(roles.map((r) => JSON.parse(r.role.capabilitiesJson)))],
      mustChange: credential?.mustChange === true,
    };
  }
}
