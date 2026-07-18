import { Injectable } from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import { ScopeService } from '../operativa/scope.service';

/**
 * La institución de un pago se resuelve por su evento:
 * EVENTOS.ID_LOCAL → LOCALES.ID_INSTITUCION, con respaldo por
 * EVENTOS.ID_SALON → SALONES.ID_LOCAL → LOCALES (no hay FKs declaradas).
 * Estados reales en la BD: APPROVED (recaudado), PENDIENTE, GRATUITO.
 */
const PAGOS_INSTITUCION = `
  SELECT p.ID_PAGO, p.MONTO, p.ESTADO, p.METODO_PAGO, p.PASARELA, p.MONEDA,
         p.TIPO_PAGO, p.FECHA_PAGO, p.FECHA_REGISTRO, p.ULTIMOS_4,
         p.ID_EVENTO, e.TITULO, e.FECHA_EVENTO,
         COALESCE(l1.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION
    FROM PAGOS p
    LEFT JOIN EVENTOS e ON e.ID_EVENTO = p.ID_EVENTO
    LEFT JOIN LOCALES l1 ON l1.ID_LOCAL = e.ID_LOCAL
    LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
    LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
`;

@Injectable()
export class FinanzasService {
  constructor(
    private readonly oracle: OracleService,
    private readonly scope: ScopeService,
  ) {}

  async resumen(
    actor: JwtUser,
    idInstitucion?: number,
    idEvento?: number,
    mes?: number,
    anio?: number,
  ) {
    const filtro = this.scope.institucionForRead(actor, idInstitucion);
    // Filtros opcionales: evento + mes/año (sobre la fecha efectiva del pago).
    const binds = { filtro, ev: idEvento ?? null, mes: mes ?? null, anio: anio ?? null };
    const COND = `WHERE (:filtro IS NULL OR pi.ID_INSTITUCION = :filtro)
            AND (:ev IS NULL OR pi.ID_EVENTO = :ev)
            AND (:anio IS NULL OR EXTRACT(YEAR FROM COALESCE(pi.FECHA_PAGO, pi.FECHA_REGISTRO)) = :anio)
            AND (:mes IS NULL OR EXTRACT(MONTH FROM COALESCE(pi.FECHA_PAGO, pi.FECHA_REGISTRO)) = :mes)`;

    // SOLO pagos APROBADOS: los "pendientes" son intentos de checkout que el
    // usuario abrió y no completó (puede abrir/cerrar la pasarela N veces antes
    // de pagar) → ruido, no dinero. No se muestran en el financiero.
    const [totales, porEvento, porMes, ultimos, eventos] = await Promise.all([
      this.oracle.query<{
        RECAUDADO: number | null;
        NUM_PAGOS: number;
        NUM_GRATUITOS: number;
      }>(
        `SELECT SUM(CASE WHEN pi.ESTADO = 'APPROVED' THEN pi.MONTO ELSE 0 END) AS RECAUDADO,
                SUM(CASE WHEN pi.ESTADO = 'APPROVED' THEN 1 ELSE 0 END) AS NUM_PAGOS,
                SUM(CASE WHEN pi.ESTADO = 'GRATUITO' THEN 1 ELSE 0 END) AS NUM_GRATUITOS
           FROM (${PAGOS_INSTITUCION}) pi
          ${COND}`,
        binds,
      ),
      this.oracle.query(
        `SELECT pi.ID_EVENTO, pi.TITULO, pi.FECHA_EVENTO,
                SUM(pi.MONTO) AS RECAUDADO,
                COUNT(*) AS NUM_PAGOS
           FROM (${PAGOS_INSTITUCION}) pi
          ${COND} AND pi.ESTADO = 'APPROVED'
          GROUP BY pi.ID_EVENTO, pi.TITULO, pi.FECHA_EVENTO
          ORDER BY RECAUDADO DESC`,
        binds,
      ),
      // Ingresos por mes (respetando los filtros activos) — para ver por mes/año.
      this.oracle.query(
        `SELECT TO_CHAR(COALESCE(pi.FECHA_PAGO, pi.FECHA_REGISTRO), 'YYYY-MM') AS MES,
                SUM(pi.MONTO) AS RECAUDADO,
                COUNT(*) AS NUM_PAGOS
           FROM (${PAGOS_INSTITUCION}) pi
          ${COND} AND pi.ESTADO = 'APPROVED'
          GROUP BY TO_CHAR(COALESCE(pi.FECHA_PAGO, pi.FECHA_REGISTRO), 'YYYY-MM')
          ORDER BY MES DESC`,
        binds,
      ),
      this.oracle.query(
        `SELECT * FROM (
           SELECT pi.ID_PAGO, pi.TITULO, pi.MONTO, pi.MONEDA, pi.ESTADO,
                  pi.METODO_PAGO, pi.ULTIMOS_4,
                  COALESCE(pi.FECHA_PAGO, pi.FECHA_REGISTRO) AS FECHA
             FROM (${PAGOS_INSTITUCION}) pi
            ${COND} AND pi.ESTADO = 'APPROVED'
            ORDER BY COALESCE(pi.FECHA_PAGO, pi.FECHA_REGISTRO) DESC
         ) WHERE ROWNUM <= 10`,
        binds,
      ),
      // Opciones del selector de evento (sin filtros de evento/fecha; solo con pagos reales).
      this.oracle.query(
        `SELECT DISTINCT pi.ID_EVENTO, pi.TITULO
           FROM (${PAGOS_INSTITUCION}) pi
          WHERE (:filtro IS NULL OR pi.ID_INSTITUCION = :filtro)
            AND pi.ID_EVENTO IS NOT NULL
          ORDER BY pi.TITULO`,
        { filtro },
      ),
    ]);

    return {
      idInstitucion: filtro,
      totales: {
        recaudado: totales[0]?.RECAUDADO ?? 0,
        numPagos: totales[0]?.NUM_PAGOS ?? 0,
        numGratuitos: totales[0]?.NUM_GRATUITOS ?? 0,
      },
      porEvento,
      porMes,
      ultimosPagos: ultimos,
      eventos,
    };
  }
}
