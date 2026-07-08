import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];
oracledb.fetchAsBuffer = [oracledb.BLOB];

export type BindParameters = oracledb.BindParameters;
export type ExecuteOptions = oracledb.ExecuteOptions;

@Injectable()
export class OracleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OracleService.name);
  private pool: oracledb.Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    // si Oracle no está disponible al arrancar, la API igual levanta:
    // /health reporta el estado y el pool se reintenta en el primer uso
    try {
      await this.createPool();
    } catch (err) {
      this.logger.error(`No se pudo crear el pool Oracle: ${String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.close(10).catch(() => undefined);
      this.pool = null;
    }
  }

  private async createPool(): Promise<oracledb.Pool> {
    if (this.pool) return this.pool;
    this.pool = await oracledb.createPool({
      user: this.config.getOrThrow<string>('ORACLE_USER'),
      password: this.config.getOrThrow<string>('ORACLE_PASSWORD'),
      connectString: this.config.getOrThrow<string>('ORACLE_CONNECT_STRING'),
      poolMin: Number(this.config.get('ORACLE_POOL_MIN') ?? 2),
      poolMax: Number(this.config.get('ORACLE_POOL_MAX') ?? 10),
      poolIncrement: 1,
      poolTimeout: 60,
    });
    this.logger.log('Pool Oracle creado (modo thin)');
    return this.pool;
  }

  async withConnection<T>(
    fn: (conn: oracledb.Connection) => Promise<T>,
  ): Promise<T> {
    const pool = await this.createPool();
    const conn = await pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      await conn.close();
    }
  }

  /** SELECT: devuelve las filas como objetos { COLUMNA: valor } */
  async query<T = Record<string, unknown>>(
    sql: string,
    binds: BindParameters = {},
    options: ExecuteOptions = {},
  ): Promise<T[]> {
    return this.withConnection(async (conn) => {
      const result = await conn.execute<T>(sql, binds, options);
      return result.rows ?? [];
    });
  }

  /** INSERT/UPDATE/DELETE con autoCommit; devuelve el resultado completo */
  async execute<T = unknown>(
    sql: string,
    binds: BindParameters = {},
    options: ExecuteOptions = {},
  ): Promise<oracledb.Result<T>> {
    return this.withConnection((conn) =>
      conn.execute<T>(sql, binds, { autoCommit: true, ...options }),
    );
  }

  /** atajos para binds OUT en INSERT ... RETURNING */
  readonly BIND_OUT = oracledb.BIND_OUT;
  readonly NUMBER = oracledb.NUMBER;

  /** latencia de un round-trip real a la BD */
  async ping(): Promise<number> {
    const start = Date.now();
    await this.query('SELECT 1 AS OK FROM DUAL');
    return Date.now() - start;
  }
}
