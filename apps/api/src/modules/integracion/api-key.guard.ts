import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { OracleService } from '../../database/oracle.service';

export interface ApiKeyCtx {
  idApiKey: number;
  idInstitucion: number;
  nombre: string;
}

/** Request con la institución resuelta desde la API key */
export type ReqConApiKey = FastifyRequest & { apiKey?: ApiKeyCtx };

/**
 * Autentica integraciones externas (p. ej. el lector de QR de la universidad)
 * por API key: header `X-API-Key` (o `Authorization: ApiKey <clave>`). La clave
 * viaja solo en el header; en BD se guarda su SHA-256. Resuelve la INSTITUCIÓN
 * dueña de la llave → cada cliente solo puede operar sobre sus propios eventos.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly oracle: OracleService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ReqConApiKey>();
    const header = req.headers['x-api-key'];
    const auth = req.headers.authorization;
    const clave =
      (Array.isArray(header) ? header[0] : header)?.trim() ||
      (auth?.toLowerCase().startsWith('apikey ')
        ? auth.slice(7).trim()
        : undefined);
    if (!clave) {
      throw new UnauthorizedException('Missing API key (header X-API-Key)');
    }
    const hash = createHash('sha256').update(clave).digest('hex');
    const rows = await this.oracle.query<{
      ID_API_KEY: number;
      ID_INSTITUCION: number;
      NOMBRE: string;
    }>(
      `SELECT ID_API_KEY, ID_INSTITUCION, NOMBRE
         FROM INSTITUCION_API_KEYS
        WHERE CLAVE_HASH = :h AND ACTIVO = 'S'`,
      { h: hash },
    );
    const k = rows[0];
    if (!k) throw new UnauthorizedException('Invalid or revoked API key');

    // marca de uso (best-effort: nunca bloquea la operación)
    void this.oracle
      .execute(
        `UPDATE INSTITUCION_API_KEYS
            SET ULTIMO_USO = SYSDATE, USOS = USOS + 1
          WHERE ID_API_KEY = :id`,
        { id: k.ID_API_KEY },
      )
      .catch(() => undefined);

    req.apiKey = {
      idApiKey: k.ID_API_KEY,
      idInstitucion: k.ID_INSTITUCION,
      nombre: k.NOMBRE,
    };
    return true;
  }
}
