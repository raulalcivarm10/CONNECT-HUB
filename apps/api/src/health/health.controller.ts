import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OracleService } from '../database/oracle.service';
import { RedisService } from '../redis/redis.service';
import { MailerService } from '../auth/mailer.service';

type DependencyHealth =
  | { ok: true; latencyMs: number }
  | { ok: false; error: string };

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly nasUrl: string;

  constructor(
    private readonly oracle: OracleService,
    private readonly redis: RedisService,
    private readonly mailer: MailerService,
    config: ConfigService,
  ) {
    this.nasUrl =
      config.get<string>('NAS_URL') ?? 'https://api-ligaprocorp.ec:3443/api';
  }

  /** El NAS está "vivo" si responde HTTP (aunque sea 404) dentro del timeout. */
  private async pingNas(): Promise<number> {
    const t0 = Date.now();
    await fetch(`${this.nasUrl}/archivos/activo?tipoEntidad=EVENTO&id=0&tipoArchivo=PORTADA`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    return Date.now() - t0;
  }

  @Get()
  @ApiOperation({
    summary: 'Estado de la API y sus dependencias (Oracle, Redis, NAS, SMTP)',
  })
  async health() {
    const [oracle, redis, nas] = await Promise.allSettled([
      this.oracle.ping(),
      this.redis.ping(),
      this.pingNas(),
    ]);

    const toHealth = (r: PromiseSettledResult<number>): DependencyHealth =>
      r.status === 'fulfilled'
        ? { ok: true, latencyMs: r.value }
        : { ok: false, error: String((r.reason as Error)?.message ?? r.reason) };

    const oracleHealth = toHealth(oracle);
    const redisHealth = toHealth(redis);
    const nasHealth = toHealth(nas);

    return {
      // el NAS es externo: si cae, la API sigue operativa (solo degradada)
      status: oracleHealth.ok && redisHealth.ok ? 'ok' : 'degraded',
      oracle: oracleHealth,
      redis: redisHealth,
      nas: nasHealth,
      smtp: { configured: this.mailer.habilitado },
      timestamp: new Date().toISOString(),
    };
  }
}
