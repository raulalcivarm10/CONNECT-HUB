import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RateLimitGuard } from '../../../auth/rate-limit.guard';
import { AsistenteAuthService } from './asistente-auth.service';
import { AsistenteJwtGuard } from './asistente-auth.guard';
import { Asistente } from './asistente.decorator';
import type { AsistenteUser } from './asistente-jwt';
import {
  AppleDto,
  ForgotDto,
  GoogleDto,
  LoginDto,
  OnboardingDto,
  PagosExchangeDto,
  RefreshDto,
  RegisterDto,
  ResetDto,
  VerifyDto,
} from './dto';

/**
 * Auth de ASISTENTE (app móvil). Vive bajo /public/auth (Caddy → /api/public/auth).
 * Sin relación con el auth admin: guard propio, secretos propios, tabla USUARIOS.
 */
@ApiTags('public-auth')
@Controller('public/auth')
export class AsistenteAuthController {
  constructor(private readonly auth: AsistenteAuthService) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Registro de asistente' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Login de asistente' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('google')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Login/registro con Google (id_token)' })
  google(@Body() dto: GoogleDto) {
    return this.auth.google(dto.idToken);
  }

  @Post('apple')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Login/registro con Apple (identity token)' })
  apple(@Body() dto: AppleDto) {
    return this.auth.apple(dto);
  }

  @Post('pagos-exchange')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Canjea el token del servicio de pagos por una sesión ConnectHub' })
  pagosExchange(@Body() dto: PagosExchangeDto) {
    return this.auth.intercambiarPago(dto.pagosToken);
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verificar email con token' })
  verify(@Body() dto: VerifyDto) {
    return this.auth.verify(dto.token);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar tokens (refresh en el body, no cookie)' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('forgot')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Recuperación: envía enlace de reset (no cambia la clave)' })
  forgot(@Body() dto: ForgotDto) {
    return this.auth.forgot(dto.email);
  }

  @Post('reset')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Confirma reset de contraseña con el token' })
  reset(@Body() dto: ResetDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Get('me')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil del asistente autenticado' })
  me(@Asistente() user: AsistenteUser) {
    return this.auth.me(user.sub);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reenvía el correo de verificación al usuario autenticado' })
  resendVerification(@Asistente() user: AsistenteUser) {
    return this.auth.resendVerification(user.sub);
  }

  @Patch('onboarding')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Completar/actualizar onboarding' })
  onboarding(@Asistente() user: AsistenteUser, @Body() dto: OnboardingDto) {
    return this.auth.onboarding(user.sub, dto);
  }

  @Delete('me')
  @UseGuards(AsistenteJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar la cuenta del asistente (anonimiza + retiene finanzas)' })
  eliminarCuenta(@Asistente() user: AsistenteUser) {
    return this.auth.deleteAccount(user.sub);
  }
}
