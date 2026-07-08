import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OracleService } from '../database/oracle.service';
import { RedisService } from '../redis/redis.service';

type DependencyHealth =
  | { ok: true; latencyMs: number }
  | { ok: false; error: string };

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly oracle: OracleService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado de la API y sus dependencias (Oracle, Redis)' })
  async health() {
    const [oracle, redis] = await Promise.allSettled([
      this.oracle.ping(),
      this.redis.ping(),
    ]);

    const toHealth = (r: PromiseSettledResult<number>): DependencyHealth =>
      r.status === 'fulfilled'
        ? { ok: true, latencyMs: r.value }
        : { ok: false, error: String((r.reason as Error)?.message ?? r.reason) };

    const oracleHealth = toHealth(oracle);
    const redisHealth = toHealth(redis);

    return {
      status: oracleHealth.ok && redisHealth.ok ? 'ok' : 'degraded',
      oracle: oracleHealth,
      redis: redisHealth,
      timestamp: new Date().toISOString(),
    };
  }
}
