import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/cookie';
import { AuthService } from './auth.service';
import { CambiarClaveDto, LoginDto, RecuperarDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { CurrentUser } from './current-user.decorator';
import { JwtUser } from './types';

const REFRESH_COOKIE = 'ch_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setRefreshCookie(res: FastifyReply, token: string) {
    res.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      // detrás de HTTPS (proxy Caddy) → COOKIE_SECURE=true
      secure: process.env.COOKIE_SECURE === 'true',
      // path '/' para que viaje también cuando la API va tras /api en el proxy
      path: '/',
      maxAge: 7 * 24 * 3600,
    });
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Login con COD_USUARIO (correo) y contraseña' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const user = await this.auth.validateUser(dto.usuario, dto.password);
    const { accessToken, refreshToken } = this.auth.issueTokens(user);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renueva el access token usando la cookie de refresh' })
  async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { user, accessToken, refreshToken } = await this.auth.refresh(
      req.cookies[REFRESH_COOKIE],
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cierra la sesión (borra la cookie de refresh)' })
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil del usuario autenticado (desde el token)' })
  me(@CurrentUser() user: JwtUser) {
    return user;
  }

  @Post('recuperar')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @ApiOperation({
    summary:
      'Olvidé mi contraseña: genera una temporal aleatoria y la envía por correo (fuerza cambio al ingresar)',
  })
  recuperar(@Body() dto: RecuperarDto) {
    return this.auth.recuperar(dto.usuario);
  }

  @Post('cambiar-clave')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cambiar contraseña (obligatorio tras ingresar con temporal)',
  })
  async cambiarClave(
    @CurrentUser() actor: JwtUser,
    @Body() dto: CambiarClaveDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { user, accessToken, refreshToken } = await this.auth.cambiarClave(
      actor.sub,
      dto.claveActual,
      dto.claveNueva,
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }
}
