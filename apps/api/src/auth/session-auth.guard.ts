/**
 * Release-01 (LER-1013/1015): the session boundary, replacing the demo
 * header shim. Guard-by-default: @Public() is the only way past it, the
 * boot-time completeness check refuses undeclared routes, and mutations
 * additionally require the CSRF header to match the SESSION's server-side
 * secret (the readable XSRF cookie is just Angular's carrier).
 *
 * Ruling #5: a user whose credential is flagged mustChange may reach only
 * the change-password and logout routes until they set their own password.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './authenticated-request';
import { readCookie, SESSION_COOKIE, XSRF_HEADER } from './cookies';
import { IS_PUBLIC_KEY } from './public.decorator';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
/**
 * A mustChange session may do three things: learn its own state, change the
 * password, or leave. /api/me is the client's state oracle — the login page
 * routes to /change-password by reading mustChange from it, so confining it
 * strands the user on /login with an error instead (the staging P1 follow-up:
 * the forced-change flow was unreachable through the UI). It exposes only the
 * caller's own identity and flags, never content.
 */
const MUST_CHANGE_ALLOWED = new Set(['/api/auth/change-password', '/api/auth/logout', '/api/me']);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionId = readCookie(req, SESSION_COOKIE);
    if (!sessionId) throw new UnauthorizedException('Sign in to continue.');
    const session = await this.auth.validateSession(sessionId);
    if (!session) throw new UnauthorizedException('Your session has ended — sign in again.');

    if (MUTATING.has(req.method)) {
      const header = req.headers[XSRF_HEADER];
      if (typeof header !== 'string' || header !== session.csrfSecret) {
        throw new ForbiddenException('The request could not be verified — reload and try again.');
      }
    }

    const credential = await this.prisma.passwordCredential.findUnique({
      where: { userId: session.userId },
      select: { mustChange: true },
    });
    if (credential?.mustChange && !MUST_CHANGE_ALLOWED.has(req.path)) {
      throw new ForbiddenException('Set a new password to continue.');
    }

    req.user = session.user;
    req.sessionId = session.id;
    return true;
  }
}
