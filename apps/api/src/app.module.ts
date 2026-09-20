import { Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CapabilityGuard } from './auth/capability.guard';
import { SessionAuthGuard } from './auth/session-auth.guard';
import { AuditModule } from './audit/audit.module';
import { FormTemplatesController } from './form-templates/form-templates.controller';
import { CasesModule } from './cases/cases.module';
import { DraftsModule } from './drafts/drafts.module';
import { DocumentsModule } from './documents/documents.module';
import { LanguageModule } from './language/language.module';
import { UsersController } from './users/users.controller';

@Module({
  imports: [DiscoveryModule, PrismaModule, AuthModule, AdminModule, AuditModule, CasesModule, DraftsModule, DocumentsModule, LanguageModule],
  controllers: [FormTemplatesController, UsersController],
  providers: [
    // Release-01 (LER-1013/1015): guard-by-default, in order — a valid
    // session first, then the route's declared capability. @Public is the
    // only way past either, and the boot-time completeness check refuses
    // undeclared routes. The demo header shim is gone.
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: CapabilityGuard },
  ],
})
export class AppModule {}
