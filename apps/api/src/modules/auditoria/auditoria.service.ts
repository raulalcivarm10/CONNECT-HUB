import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';

export interface EntradaAuditoria {
  usuario: string | null;
  idInstitucion: number | null;
  accion: string;
  metodo: string;
  ruta: string;
  status: number;
  ip: string | null;
  detalle: string | null;
}

/** claves cuyo valor jamás debe quedar en el log */
const SENSIBLE = /pass|clave|secret|token|key|salt|credencial/i;

/** Serializa un body redactando valores sensibles y recortando el tamaño. */
export function resumirBody(body: unknown): string | null {
  if (body == null || typeof body !== 'object') return null;
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    limpio[k] = SENSIBLE.test(k) ? '***' : v;
  }
  try {
    return JSON.stringify(limpio).slice(0, 1900);
  } catch {
    return null;
  }
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly oracle: OracleService) {}

  /** Inserta sin bloquear la respuesta; un fallo del log nunca rompe la API. */
  registrar(e: EntradaAuditoria): void {
    void this.oracle
      .execute(
        `INSERT INTO AUDITORIA_LOG
           (USUARIO, ID_INSTITUCION, ACCION, METODO, RUTA, STATUS, IP, DETALLE)
         VALUES (:usuario, :idInstitucion, :accion, :metodo, :ruta, :status, :ip, :detalle)`,
        {
          usuario: e.usuario?.slice(0, 150) ?? null,
          idInstitucion:
            e.idInstitucion != null
              ? { val: e.idInstitucion, type: this.oracle.NUMBER }
              : { val: null, type: this.oracle.NUMBER },
          accion: e.accion.slice(0, 20),
          metodo: e.metodo.slice(0, 10),
          ruta: e.ruta.slice(0, 300),
          status: e.status,
          ip: e.ip?.slice(0, 60) ?? null,
          detalle: e.detalle?.slice(0, 2000) ?? null,
        },
      )
      .catch((err) => this.logger.error(`Auditoría falló: ${String(err)}`));
  }

  async listar(
    actor: JwtUser,
    filtros: {
      accion?: string;
      usuario?: string;
      desde?: string;
      hasta?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    if (!actor.esSuper) {
      throw new ForbiddenException(
        'Solo el superadmin puede ver el registro de actividad',
      );
    }
    const limit = Math.min(Math.max(Number(filtros.limit) || 100, 1), 500);
    const offset = Math.max(Number(filtros.offset) || 0, 0);
    return this.oracle.query(
      `SELECT ID_LOG, TO_CHAR(FECHA, 'YYYY-MM-DD HH24:MI:SS') AS FECHA,
              USUARIO, ID_INSTITUCION, ACCION, METODO, RUTA, STATUS, IP, DETALLE
         FROM AUDITORIA_LOG
        WHERE (:accion IS NULL OR ACCION = :accion)
          AND (:usuario IS NULL OR UPPER(USUARIO) LIKE '%' || UPPER(:usuario) || '%')
          AND (:desde IS NULL OR FECHA >= TO_TIMESTAMP(:desde, 'YYYY-MM-DD'))
          AND (:hasta IS NULL OR FECHA < TO_TIMESTAMP(:hasta, 'YYYY-MM-DD') + 1)
        ORDER BY FECHA DESC, ID_LOG DESC
        OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`,
      {
        accion: filtros.accion?.trim() || null,
        usuario: filtros.usuario?.trim() || null,
        desde: filtros.desde?.trim() || null,
        hasta: filtros.hasta?.trim() || null,
        off: offset,
        lim: limit,
      },
    );
  }
}
