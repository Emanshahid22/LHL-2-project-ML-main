import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { OversightController } from './oversight.controller';

@Global()
@Module({
  controllers: [OversightController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
