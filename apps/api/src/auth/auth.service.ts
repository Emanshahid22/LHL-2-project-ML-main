/**
 * Release-01 (LER-1013): the platform's own authorization module — OAuth2
 * authorization-code + PKCE for exactly one first-party client, delivered
 * BFF-style: the code exchange creates a SERVER-side session row and the
 * browser holds only an HttpOnly cookie (rulings #2/#3). Failures are
 * content-free and identical for wrong-password and unknown-user (no
 * existence oracle); attempts are rate-limited; every outcome is audited
 * with ids only.
 */
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthSession, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { isDeniedPassword } from './denied-passwords';

/** Ruling #3. */
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const CODE_TTL_MS = 60 * 1000;

/** Ruling #4 (NCSC-style): length + deny-list; no composition rules. */
export const PASSWORD_MIN_LENGTH = 12;

const LOGIN_FAILED_MESSAGE = 'The email address or password is not correct.';
const RATE_LIMIT_MESSAGE = 'Too many attempts — wait a minute and try again.';

/** In-memory limiter: fine for the single-instance deployment shape; a
 *  multi-instance future moves this to the database. Content-free either way. */
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** PKCE step 1: credentials + S256 challenge → single-use code. */
  async login(body: unknown): Promise<{ code: string }> {
    const { email, password, codeChallenge } = this.loginShape(body);
    this.assertNotRateLimited(email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { credential: true },
    });
    const hash = user?.credential?.argon2Hash;
    // Verify against a real hash when we have one, and burn comparable time
    // when we do not — wrong-password and unknown-user must be identical.
    const ok = hash
      ? await argon2.verify(hash, password)
      : (await argon2.hash(password, { type: argon2.argon2id }), false);
    if (!user || !ok) {
      this.recordAttempt(email);
      if (user) {
        await this.audit.record(user.id, 'LOGIN_FAILED', undefined, {});
      }
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    const code = randomBytes(32).toString('base64url');
    await this.prisma.authCode.create({
      data: {
        code,
        userId: user.id,
        pkceChallenge: codeChallenge,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    return { code };
  }

  /** PKCE step 2: code + verifier → server-side session. */
  async exchange(body: unknown): Promise<{ session: AuthSession; user: User }> {
    const { code, codeVerifier } = this.exchangeShape(body);
    const row = await this.prisma.authCode.findUnique({ where: { code } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const a = Buffer.from(challenge);
    const b = Buffer.from(row.pkceChallenge);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }
    await this.prisma.authCode.update({ where: { code }, data: { usedAt: new Date() } });

    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        csrfSecret: randomBytes(32).toString('base64url'),
        expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS),
      },
    });
    await this.audit.record(user.id, 'USER_LOGIN', undefined, { sessionId: session.id });
    return { session, user };
  }

  /** Session validity: revocation, absolute expiry, idle expiry — then touch. */
  async validateSession(sessionId: string): Promise<(AuthSession & { user: User }) | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session || session.revokedAt) return null;
    const now = Date.now();
    if (session.expiresAt.getTime() < now) return null;
    if (session.lastSeenAt.getTime() + SESSION_IDLE_MS < now) return null;
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date(now) },
    });
    return session;
  }

  /** Ruling #3: logout destroys the server-side session row (revocation). */
  async logout(user: User, sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record(user.id, 'USER_LOGOUT', undefined, { sessionId });
  }

  /** Self-service change; also clears ruling #5's forced-change flag. */
  async changePassword(user: User, body: unknown): Promise<void> {
    const { currentPassword, newPassword } = this.changeShape(body);
    const credential = await this.prisma.passwordCredential.findUnique({
      where: { userId: user.id },
    });
    if (!credential || !(await argon2.verify(credential.argon2Hash, currentPassword))) {
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }
    this.assertPasswordPolicy(newPassword);
    await this.prisma.passwordCredential.update({
      where: { userId: user.id },
      data: {
        argon2Hash: await argon2.hash(newPassword, { type: argon2.argon2id }),
        mustChange: false,
      },
    });
    await this.audit.record(user.id, 'PASSWORD_CHANGED', undefined, {});
  }

  /** Ruling #4, enforced everywhere a password is set. */
  assertPasswordPolicy(password: string): void {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
      throw new BadRequestException(
        `Passwords must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
      );
    }
    if (isDeniedPassword(password)) {
      throw new BadRequestException(
        'That password appears on the known-breached list — choose another.',
      );
    }
  }

  private assertNotRateLimited(email: string): void {
    const now = Date.now();
    const recent = (this.attempts.get(email.toLowerCase()) ?? []).filter(
      (t) => t > now - WINDOW_MS,
    );
    if (recent.length >= MAX_ATTEMPTS_PER_WINDOW) {
      throw new UnauthorizedException(RATE_LIMIT_MESSAGE);
    }
  }

  private recordAttempt(email: string): void {
    const key = email.toLowerCase();
    const now = Date.now();
    const recent = (this.attempts.get(key) ?? []).filter((t) => t > now - WINDOW_MS);
    recent.push(now);
    this.attempts.set(key, recent);
  }

  private loginShape(body: unknown): { email: string; password: string; codeChallenge: string } {
    const b = (body ?? {}) as Record<string, unknown>;
    if (
      typeof b['email'] !== 'string' ||
      typeof b['password'] !== 'string' ||
      typeof b['codeChallenge'] !== 'string' ||
      b['codeChallenge'].length < 40
    ) {
      throw new BadRequestException('email, password and codeChallenge are required');
    }
    return {
      email: b['email'].trim().toLowerCase(),
      password: b['password'],
      codeChallenge: b['codeChallenge'],
    };
  }

  private exchangeShape(body: unknown): { code: string; codeVerifier: string } {
    const b = (body ?? {}) as Record<string, unknown>;
    if (typeof b['code'] !== 'string' || typeof b['codeVerifier'] !== 'string') {
      throw new BadRequestException('code and codeVerifier are required');
    }
    return { code: b['code'], codeVerifier: b['codeVerifier'] };
  }

  private changeShape(body: unknown): { currentPassword: string; newPassword: string } {
    const b = (body ?? {}) as Record<string, unknown>;
    if (typeof b['currentPassword'] !== 'string' || typeof b['newPassword'] !== 'string') {
      throw new BadRequestException('currentPassword and newPassword are required');
    }
    return { currentPassword: b['currentPassword'], newPassword: b['newPassword'] };
  }
}
