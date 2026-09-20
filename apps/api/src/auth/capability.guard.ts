/**
 * Release-01 (LER-1014/1015): the capability layer. Resolves the session
 * user's role rows (data — the client can amend them at ratification) into
 * a capability set and compares against the route's @Requires declaration.
 * 403 names the required level, never content (the UC-07 message pattern).
 * Deeper scoping (ownership, CaseAccess, the sensitive grant) stays inside
 * services — defence in depth, not consolidation.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { capabilitySetOf, hasCapability, type Capability } from '@mgs/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from './authenticated-request';
import { IS_PUBLIC_KEY } from './public.decorator';
import { REQUIRES_KEY } from './requires.decorator';

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Capability | undefined>(REQUIRES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No declaration = session-only route (e.g. /api/me, logout). The
    // boot-time completeness check decides which routes may say that.
    if (!required) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const roles = await this.prisma.userRole.findMany({
      where: { userId: req.user.id },
      include: { role: { select: { capabilitiesJson: true } } },
    });
    const set = capabilitySetOf(
      roles.map((r) => JSON.parse(r.role.capabilitiesJson) as string[]),
    );
    if (!hasCapability(set, required)) {
      throw new ForbiddenException(
        `This action requires the '${required}' permission, which your role does not include.`,
      );
    }
    req.capabilities = set;
    return true;
  }
}
