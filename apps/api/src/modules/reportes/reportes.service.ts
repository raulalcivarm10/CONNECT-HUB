import { BadRequestException, Injectable } from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import { ScopeService } from '../operativa/scope.service';

/**
 * Reportes de asistencia a eventos. La asistencia se lee de EVENTOS_USUARIOS:
 * ESTADO ('A'=asistió, 'S'=registrado/pendiente, 'N'=no asistió, 'C'=cancelado)
 * combinado con ASISTIO ('S'/'N', marcado por la app móvil en el check-in).
 * La institución del evento se resuelve por LOCAL o por SALÓN→LOCAL.
 */
const INSCRIPCIONES = `
  SELECT eu.ID_EVENTO, e.TITULO, e.FECHA_EVENTO, e.PUBLICO_ESPERADO,
         COALESCE(l1.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION,
         eu.ESTADO, eu.ASISTIO, eu.ID_CLIENTE, eu.FECHA_ENTRADA,
         CASE WHEN eu.ASISTIO = 'S' OR eu.ESTADO = 'A' THEN 1 ELSE 0 END AS ASISTIO_SI,
         CASE WHEN eu.ASISTIO = 'N' OR eu.ESTADO = 'N' THEN 1 ELSE 0 END AS ASISTIO_NO,
         CASE WHEN eu.ESTADO = 'C' THEN 1 ELSE 0 END AS CANCELADO
    FROM EVENTOS_USUARIOS eu
    JOIN EVENTOS e ON e.ID_EVENTO = eu.ID_EVENTO
    LEFT JOIN LOCALES l1 ON l1.ID_LOCAL = e.ID_LOCAL
    LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
    LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
`;

@Injectable()
export class ReportesService {
  constructor(
    private readonly oracle: OracleService,
    private readonly scope: ScopeService,
  ) {}

  /** filtro de meses validado (1-12) → cláusula IN con binds */
  private mesesClause(
    meses: number[] | undefined,
    binds: Record<string, number | null>,
  ): string {
    if (!meses || meses.length === 0) return '';
    const validos = meses.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
    if (validos.length === 0) return '';
    const ph = validos.map((m, i) => {
      binds[`mes${i}`] = m;
      return `:mes${i}`;
    });
    return ` AND EXTRACT(MONTH FROM p.FECHA_EVENTO) IN (${ph.join(',')})`;
  }

  async asistencia(
    actor: JwtUser,
    filtros: {
      idInstitucion?: number;
      anio?: number;
      meses?: number[];
      idEvento?: number;
    },
  ) {
    const inst = this.scope.institucionForRead(actor, filtros.idInstitucion);
    const binds: Record<string, number | null> = { inst };
    let where = ' WHERE (:inst IS NULL OR p.ID_INSTITUCION = :inst)';
    if (filtros.anio) {
      binds.anio = filtros.anio;
      where += ' AND EXTRACT(YEAR FROM p.FECHA_EVENTO) = :anio';
    }
    where += this.mesesClause(filtros.meses, binds);
    if (filtros.idEvento) {
      binds.idEvento = filtros.idEvento;
      where += ' AND p.ID_EVENTO = :idEvento';
    }

    const [totales, porEvento, anios] = await Promise.all([
      this.oracle.query<{
        EVENTOS: number;
        INSCRITOS: number;
        ASISTIERON: number;
        NO_ASISTIERON: number;
        CANCELADOS: number;
      }>(
        `SELECT COUNT(DISTINCT p.ID_EVENTO) AS EVENTOS,
                COUNT(*) AS INSCRITOS,
                SUM(p.ASISTIO_SI) AS ASISTIERON,
                SUM(p.ASISTIO_NO) AS NO_ASISTIERON,
                SUM(p.CANCELADO) AS CANCELADOS
           FROM (${INSCRIPCIONES}) p ${where}`,
        binds,
      ),
      this.oracle.query(
        `SELECT p.ID_EVENTO, p.TITULO,
                TO_CHAR(p.FECHA_EVENTO, 'YYYY-MM-DD') AS FECHA,
                p.PUBLICO_ESPERADO,
                COUNT(*) AS INSCRITOS,
                SUM(p.ASISTIO_SI) AS ASISTIERON,
                SUM(p.ASISTIO_NO) AS NO_ASISTIERON,
                SUM(p.CANCELADO) AS CANCELADOS,
                COUNT(*) - SUM(p.ASISTIO_SI) - SUM(p.ASISTIO_NO) - SUM(p.CANCELADO) AS PENDIENTES
           FROM (${INSCRIPCIONES}) p ${where}
          GROUP BY p.ID_EVENTO, p.TITULO, p.FECHA_EVENTO, p.PUBLICO_ESPERADO
          ORDER BY p.FECHA_EVENTO DESC`,
        binds,
      ),
      // años disponibles para el selector (respeta el ámbito de institución)
      this.oracle.query<{ ANIO: number }>(
        `SELECT DISTINCT EXTRACT(YEAR FROM p.FECHA_EVENTO) AS ANIO
           FROM (${INSCRIPCIONES}) p
          WHERE (:inst IS NULL OR p.ID_INSTITUCION = :inst)
            AND p.FECHA_EVENTO IS NOT NULL
          ORDER BY ANIO DESC`,
        { inst },
      ),
    ]);

    const tot = totales[0];
    const asistieron = Number(tot?.ASISTIERON ?? 0);
    const noAsistieron = Number(tot?.NO_ASISTIERON ?? 0);
    const base = asistieron + noAsistieron;

    return {
      idInstitucion: inst,
      totales: {
        eventos: Number(tot?.EVENTOS ?? 0),
        inscritos: Number(tot?.INSCRITOS ?? 0),
        asistieron,
        noAsistieron,
        cancelados: Number(tot?.CANCELADOS ?? 0),
        pendientes:
          Number(tot?.INSCRITOS ?? 0) -
          asistieron -
          noAsistieron -
          Number(tot?.CANCELADOS ?? 0),
        // tasa sobre quienes tienen check-in registrado (asistió + no asistió)
        tasaAsistencia: base > 0 ? Math.round((asistieron / base) * 100) : 0,
      },
      porEvento,
      aniosDisponibles: anios.map((a) => Number(a.ANIO)),
    };
  }

  /** Detalle: inscritos de un evento con su estado de asistencia */
  async inscritos(actor: JwtUser, idEvento: number) {
    // valida ámbito del evento: su institución debe ser la del actor
    const amb = await this.oracle.query<{ ID_INSTITUCION: number | null }>(
      `SELECT COALESCE(l1.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION
         FROM EVENTOS e
         LEFT JOIN LOCALES l1 ON l1.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE e.ID_EVENTO = :id`,
      { id: idEvento },
    );
    if (!amb[0]) throw new BadRequestException('Evento no encontrado');
    if (!actor.esSuper && amb[0].ID_INSTITUCION !== actor.idInstitucion) {
      throw new BadRequestException('El evento pertenece a otra institución');
    }

    return this.oracle.query(
      `SELECT u.NOMBRE, u.APELLIDO, u.EMAIL, u.NUMERO_CELULAR,
              eu.ESTADO, eu.ASISTIO,
              TO_CHAR(eu.FECHA_REGISTRO, 'YYYY-MM-DD') AS FECHA_REGISTRO,
              TO_CHAR(eu.FECHA_ENTRADA, 'YYYY-MM-DD HH24:MI') AS FECHA_ENTRADA,
              CASE
                WHEN eu.ESTADO = 'C' THEN 'CANCELADO'
                WHEN eu.ASISTIO = 'S' OR eu.ESTADO = 'A' THEN 'ASISTIO'
                WHEN eu.ASISTIO = 'N' OR eu.ESTADO = 'N' THEN 'NO_ASISTIO'
                ELSE 'PENDIENTE'
              END AS ASISTENCIA
         FROM EVENTOS_USUARIOS eu
         LEFT JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
        WHERE eu.ID_EVENTO = :id
        ORDER BY ASISTENCIA, u.APELLIDO, u.NOMBRE`,
      { id: idEvento },
    );
  }
}
