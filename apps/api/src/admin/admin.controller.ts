/**
 * Ruling #6: exactly four admin actions, all @Requires('admin.users') — and
 * the Administrator role holds NOTHING content-bearing (D-G4, tested).
 */
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Requires } from '../auth/requires.decorator';
import { AdminService, AdminUserDto } from './admin.service';

@Controller('admin/users')
@Requires('admin.users')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list(): Promise<AdminUserDto[]> {
    return this.admin.listUsers();
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: unknown): Promise<AdminUserDto> {
    return this.admin.createUser(user, body);
  }

  @Patch(':id/roles')
  setRoles(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminUserDto> {
    return this.admin.setRoles(user, id, body);
  }

  @Patch(':id/grant')
  setGrant(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminUserDto> {
    return this.admin.setGrant(user, id, body);
  }

  @Post(':id/password-reset')
  resetPassword(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    return this.admin.resetPassword(user, id, body);
  }
}
