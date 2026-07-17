import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { RedisService } from '../redis/redis.service';

const MAX_INTENTOS = 5;
const VENTANA_SEG = 60;

/**
 * Límite de intentos por IP para endpoints sensibles (login/recuperar):
 * 5 por minuto. Contador en Redis (INCR + EXPIRE); si Redis falla, no
 * bloquea el servicio (fail-open).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    // req.ip lo resuelve Fastify con trustProxy:1 (main.ts) → IP real del cliente
    // detrás de Caddy. NO parsear X-Forwarded-For a mano: su valor izquierdo lo
    // controla el cliente y permitía saltarse el límite con una IP falsa por request.
    const ip = req.ip;
    const ruta = req.url.split('?')[0];
    const key = `rl:${ruta}:${ip}`;

    try {
      const n = await this.redis.client.incr(key);
      if (n === 1) await this.redis.client.expire(key, VENTANA_SEG);
      if (n > MAX_INTENTOS) {
        this.logger.warn(`Rate limit superado: ${ip} en ${ruta} (${n})`);
        throw new HttpException(
          'Too many attempts; please wait a minute and try again.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Redis caído: no tumbar el login por el limitador
      this.logger.error(`Rate limit sin Redis: ${String(err)}`);
      return true;
    }
  }
}
