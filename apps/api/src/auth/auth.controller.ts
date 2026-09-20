/**
 * Release-01 (LER-1013): the login surface — the only public routes besides
 * /api/health. PKCE both hops; the exchange sets the HttpOnly session
 * cookie and the readable XSRF carrier (BFF — no token ever in a response
 * body or browser JS).
 */
import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { AuthService, SESSION_ABSOLUTE_MS } from './auth.service';
import type { AuthenticatedRequest } from './authenticated-request';
import { clearSessionCookies, setSessionCookies } from './cookies';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: unknown): Promise<{ code: string }> {
    return this.auth.login(body);
  }

  @Public()
  @Post('token')
  async token(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const { session } = await this.auth.exchange(body);
    setSessionCookies(res, session.id, session.csrfSecret, SESSION_ABSOLUTE_MS);
    return { ok: true };
  }

  @Post('logout')
  async logout(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const sessionId = (req as AuthenticatedRequest).sessionId;
    if (sessionId) await this.auth.logout(user, sessionId);
    clearSessionCookies(res);
    return { ok: true };
  }

  @Post('change-password')
  async changePassword(@CurrentUser() user: User, @Body() body: unknown): Promise<{ ok: true }> {
    await this.auth.changePassword(user, body);
    return { ok: true };
  }
}
