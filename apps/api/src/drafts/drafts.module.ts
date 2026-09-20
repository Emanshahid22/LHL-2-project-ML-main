import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { DraftsController } from './drafts.controller';
import { DraftsService } from './drafts.service';

@Module({
  imports: [CasesModule],
  controllers: [DraftsController],
  providers: [DraftsService],
  // UC-09: the documents module re-runs the quality gate through this service.
  exports: [DraftsService],
})
export class DraftsModule {}
