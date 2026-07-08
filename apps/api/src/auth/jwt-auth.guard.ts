import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { JwtUser } from './types';

/** Rutas permitidas mientras la clave temporal no haya sido cambiada */
const RUTAS_CAMBIO_CLAVE = [
  '/auth/cambiar-clave',
  '/auth/logout',
  '/auth/me',
  '/auth/refresh',
];

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: JwtUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token requerido');
    }
    let user: JwtUser;
    try {
      user = this.jwt.verify<JwtUser>(header.slice(7), {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (
      user.debeCambiarClave &&
      !RUTAS_CAMBIO_CLAVE.some((r) => req.url.startsWith(r))
    ) {
      throw new ForbiddenException(
        'Ingresaste con una contraseña temporal: debes cambiarla antes de continuar',
      );
    }
    req.user = user;
    return true;
  }
}
