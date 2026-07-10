import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailerService } from './mailer.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [
    AuthService,
    MailerService,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
  ],
  exports: [AuthService, MailerService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
