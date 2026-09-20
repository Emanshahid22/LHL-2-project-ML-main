/**
 * Release-01 ruling #6: the minimal admin surface — exactly four actions
 * (list users, create user, assign/revoke role and grant, reset password).
 * Nothing content-bearing lives here or is reachable by the Administrator
 * role (D-G4 — a tested property). Every mutation is audited with ids only.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { grantAssignableTo, ROLE_NAMES } from '@mgs/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  roles: string[];
  sensitiveMaterialAccess: boolean;
  mustChange: boolean;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async listUsers(): Promise<AdminUserDto[]> {
    const users = await this.prisma.user.findMany({
      include: { roles: { include: { role: true } }, credential: { select: { mustChange: true } } },
      orderBy: { email: 'asc' },
    });
    return users.map((u) => this.dto(u));
  }

  async createUser(actor: User, body: unknown): Promise<AdminUserDto> {
    const b = (body ?? {}) as Record<string, unknown>;
    const email = typeof b['email'] === 'string' ? b['email'].trim().toLowerCase() : '';
    const name = typeof b['name'] === 'string' ? b['name'].trim() : '';
    const role = typeof b['role'] === 'string' ? b['role'] : '';
    const temporaryPassword = typeof b['temporaryPassword'] === 'string' ? b['temporaryPassword'] : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
      throw new BadRequestException('A valid email and a name are required.');
    }
    if (!(ROLE_NAMES as readonly string[]).includes(role)) {
      throw new BadRequestException('Unknown role.');
    }
    this.auth.assertPasswordPolicy(temporaryPassword);
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('A user with that email already exists.');
    }
    const roleRow = await this.prisma.role.findUnique({ where: { name: role } });
    if (!roleRow) throw new BadRequestException('Unknown role.');
    const hash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        roles: { create: { roleId: roleRow.id } },
        credential: { create: { argon2Hash: hash, mustChange: true } },
      },
    });
    await this.audit.record(actor.id, 'USER_CREATED', undefined, { subjectUserId: user.id, role });
    return this.dto(await this.reload(user.id));
  }

  async setRoles(actor: User, userId: string, body: unknown): Promise<AdminUserDto> {
    const b = (body ?? {}) as Record<string, unknown>;
    const roles = Array.isArray(b['roles']) ? (b['roles'] as unknown[]) : null;
    if (!roles || roles.length === 0 || !roles.every((r) => typeof r === 'string')) {
      throw new BadRequestException('roles must be a non-empty array of role names.');
    }
    for (const r of roles as string[]) {
      if (!(ROLE_NAMES as readonly string[]).includes(r)) {
        throw new BadRequestException('Unknown role.');
      }
    }
    const subject = await this.subject(userId);
    const roleRows = await this.prisma.role.findMany({ where: { name: { in: roles as string[] } } });
    // Ruling #8: revoking practitioner roles from a grant-holder would leave
    // an unassignable grant standing — refuse until the grant is revoked.
    if (subject.sensitiveMaterialAccess && !grantAssignableTo(roles as string[])) {
      throw new ConflictException(
        'This user holds the Sensitive Material Access grant, which cannot stack on the requested roles — revoke the grant first.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: subject.id } }),
      this.prisma.userRole.createMany({
        data: roleRows.map((r) => ({ userId: subject.id, roleId: r.id })),
      }),
    ]);
    await this.audit.record(actor.id, 'USER_ROLE_CHANGED', undefined, {
      subjectUserId: subject.id,
      roles,
    });
    return this.dto(await this.reload(subject.id));
  }

  async setGrant(actor: User, userId: string, body: unknown): Promise<AdminUserDto> {
    const b = (body ?? {}) as Record<string, unknown>;
    if (typeof b['sensitiveMaterialAccess'] !== 'boolean') {
      throw new BadRequestException('sensitiveMaterialAccess must be a boolean.');
    }
    const grant = b['sensitiveMaterialAccess'];
    const subject = await this.reload(userId);
    if (grant) {
      const roleNames = subject.roles.map((r) => r.role.name);
      if (!grantAssignableTo(roleNames)) {
        throw new ConflictException(
          'The Sensitive Material Access grant stacks on Senior Solicitor and Paralegal only (ruling #8).',
        );
      }
    }
    await this.prisma.user.update({
      where: { id: subject.id },
      data: { sensitiveMaterialAccess: grant },
    });
    await this.audit.record(actor.id, 'GRANT_CHANGED', undefined, {
      subjectUserId: subject.id,
      sensitiveMaterialAccess: grant,
    });
    return this.dto(await this.reload(subject.id));
  }

  /** Ruling #5: admin sets a single-use temporary password; the user is
   *  forced to change it at next login; both events audited. */
  async resetPassword(actor: User, userId: string, body: unknown): Promise<{ ok: true }> {
    const b = (body ?? {}) as Record<string, unknown>;
    const temporaryPassword =
      typeof b['temporaryPassword'] === 'string' ? b['temporaryPassword'] : '';
    this.auth.assertPasswordPolicy(temporaryPassword);
    const subject = await this.subject(userId);
    const hash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    await this.prisma.passwordCredential.upsert({
      where: { userId: subject.id },
      update: { argon2Hash: hash, mustChange: true },
      create: { userId: subject.id, argon2Hash: hash, mustChange: true },
    });
    // Every live session for the subject dies with the reset.
    await this.prisma.authSession.updateMany({
      where: { userId: subject.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record(actor.id, 'PASSWORD_RESET', undefined, { subjectUserId: subject.id });
    return { ok: true };
  }

  private async subject(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async reload(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } }, credential: { select: { mustChange: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dto(u: any): AdminUserDto {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      roles: u.roles.map((r: { role: { name: string } }) => r.role.name),
      sensitiveMaterialAccess: u.sensitiveMaterialAccess === true,
      mustChange: u.credential?.mustChange === true,
    };
  }
}
