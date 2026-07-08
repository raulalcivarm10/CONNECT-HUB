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

  async resumen(actor: JwtUser, idInstitucion?: number) {
    const filtro = this.scope.institucionForRead(actor, idInstitucion);

    const [totales, porEvento, porEstado, ultimos] = await Promise.all([
      this.oracle.query<{
        RECAUDADO: number | null;
        PENDIENTE: number | null;
        NUM_PAGOS: number;
        NUM_GRATUITOS: number;
      }>(
        `SELECT SUM(CASE WHEN pi.ESTADO = 'APPROVED' THEN pi.MONTO ELSE 0 END) AS RECAUDADO,
                SUM(CASE WHEN pi.ESTADO = 'PENDIENTE' THEN pi.MONTO ELSE 0 END) AS PENDIENTE,
                COUNT(*) AS NUM_PAGOS,
                SUM(CASE WHEN pi.ESTADO = 'GRATUITO' THEN 1 ELSE 0 END) AS NUM_GRATUITOS
           FROM (${PAGOS_INSTITUCION}) pi
          WHERE (:filtro IS NULL OR pi.ID_INSTITUCION = :filtro)`,
        { filtro },
      ),
      this.oracle.query(
        `SELECT pi.ID_EVENTO, pi.TITULO, pi.FECHA_EVENTO,
                SUM(CASE WHEN pi.ESTADO = 'APPROVED' THEN pi.MONTO ELSE 0 END) AS RECAUDADO,
                SUM(CASE WHEN pi.ESTADO = 'PENDIENTE' THEN pi.MONTO ELSE 0 END) AS PENDIENTE,
                COUNT(*) AS NUM_PAGOS
           FROM (${PAGOS_INSTITUCION}) pi
          WHERE (:filtro IS NULL OR pi.ID_INSTITUCION = :filtro)
          GROUP BY pi.ID_EVENTO, pi.TITULO, pi.FECHA_EVENTO
          ORDER BY RECAUDADO DESC, PENDIENTE DESC`,
        { filtro },
      ),
      this.oracle.query(
        `SELECT pi.ESTADO, COUNT(*) AS N, SUM(pi.MONTO) AS TOTAL
           FROM (${PAGOS_INSTITUCION}) pi
          WHERE (:filtro IS NULL OR pi.ID_INSTITUCION = :filtro)
          GROUP BY pi.ESTADO ORDER BY TOTAL DESC`,
        { filtro },
      ),
      this.oracle.query(
        `SELECT * FROM (
           SELECT pi.ID_PAGO, pi.TITULO, pi.MONTO, pi.MONEDA, pi.ESTADO,
                  pi.METODO_PAGO, pi.ULTIMOS_4,
                  COALESCE(pi.FECHA_PAGO, pi.FECHA_REGISTRO) AS FECHA
             FROM (${PAGOS_INSTITUCION}) pi
            WHERE (:filtro IS NULL OR pi.ID_INSTITUCION = :filtro)
            ORDER BY COALESCE(pi.FECHA_PAGO, pi.FECHA_REGISTRO) DESC
         ) WHERE ROWNUM <= 10`,
        { filtro },
      ),
    ]);

    return {
      idInstitucion: filtro,
      totales: {
        recaudado: totales[0]?.RECAUDADO ?? 0,
        pendiente: totales[0]?.PENDIENTE ?? 0,
        numPagos: totales[0]?.NUM_PAGOS ?? 0,
        numGratuitos: totales[0]?.NUM_GRATUITOS ?? 0,
      },
      porEvento,
      porEstado,
      ultimosPagos: ultimos,
    };
  }
}
