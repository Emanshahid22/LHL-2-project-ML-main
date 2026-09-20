import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CapabilityGuard } from './capability.guard';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionAuthGuard, CapabilityGuard],
  exports: [AuthService, SessionAuthGuard, CapabilityGuard],
})
export class AuthModule {}
