import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import {
  ASISTENTE_AUD,
  ASISTENTE_ACCESS_SECRET_ENV,
  AsistenteUser,
} from './asistente-jwt';

/**
 * Guard del asistente. STATELESS como el admin, pero:
 *  - verifica con JWT_ASISTENTE_SECRET (NO con JWT_SECRET);
 *  - EXIGE aud === 'asistente'.
 * Un token admin (firmado con otro secreto, sin aud) nunca lo pasa.
 * Se aplica SOLO en los controladores del asistente con @UseGuards.
 */
@Injectable()
export class AsistenteJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { asistente?: AsistenteUser }>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token required');
    }
    const token = header.slice('Bearer '.length);
    let payload: AsistenteUser;
    try {
      payload = this.jwt.verify<AsistenteUser>(token, {
        secret: this.config.getOrThrow<string>(ASISTENTE_ACCESS_SECRET_ENV),
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    // EXIGE aud + typ:'access'. Sin el chequeo de typ, un token de reset/refresh
    // (mismo aud, y el de reset firmado con el mismo secreto) pasaría como access.
    if (payload.aud !== ASISTENTE_AUD || payload.typ !== 'access' || !payload.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    req.asistente = payload;
    return true;
  }
}
