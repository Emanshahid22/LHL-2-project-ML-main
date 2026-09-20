import { Module } from '@nestjs/common';
import { LanguageController } from './language.controller';
import { LanguageAssistClient } from './language-assist.client';

/**
 * UC-06 language assistance.
 *
 * Imports nothing. It has no PrismaModule, no DraftsModule and no AuditModule,
 * which is the structural half of the guarantee that assistance can never edit a
 * draft: there is no dependency here through which it could. The insertion the
 * user accepts is recorded by the drafts module, from the user's own request.
 */
@Module({
  controllers: [LanguageController],
  providers: [LanguageAssistClient],
})
export class LanguageModule {}
