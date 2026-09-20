import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { DraftsModule } from '../drafts/drafts.module';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [CasesModule, DraftsModule],
  controllers: [ArchiveController, DocumentsController],
  providers: [ArchiveService, DocumentsService],
})
export class DocumentsModule {}
