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

  /**
   * Reporte de INGRESOS Y OCUPACIÓN POR SALÓN. Ocupación = días reales de
   * EVENTO_HORAS de eventos principales (los workshops hijos no ocupan espacio
   * propio). Ingreso de ALQUILER = snapshot congelado EVENTOS.PRECIO_ESPACIO_DIA
   * (tarifa aplicada al reservar; cambiar la tarifa de lista no reescribe la
   * historia). Ingreso de ENTRADAS = PAGOS APPROVED del evento, por fecha de
   * cobro. Son conceptos separados y se reportan por separado.
   */
  async salones(
    actor: JwtUser,
    filtros: {
      idInstitucion?: number;
      anio?: number;
      meses?: number[];
      idLocal?: number;
    },
  ) {
    const inst = this.scope.institucionForRead(actor, filtros.idInstitucion);
    const OCUPACION = `
      SELECT e.ID_EVENTO, e.ID_SALON, s.NOMBRE AS SALON, l.NOMBRE AS NOMBRE_LOCAL,
             l.ID_LOCAL, l.ID_INSTITUCION, eh.FECHA,
             NVL(e.PRECIO_ESPACIO_DIA, 0) AS ALQUILER_DIA
        FROM EVENTO_HORAS eh
        JOIN EVENTOS e ON e.ID_EVENTO = eh.ID_EVENTO
        JOIN SALONES s ON s.ID_SALON = e.ID_SALON
        JOIN LOCALES l ON l.ID_LOCAL = s.ID_LOCAL
       WHERE e.ID_EVENTO_PADRE IS NULL`;
    const ENTRADAS = `
      SELECT p.MONTO, NVL(p.FECHA_PAGO, p.FECHA_REGISTRO) AS FECHA,
             e.ID_SALON, l.ID_LOCAL, l.ID_INSTITUCION
        FROM PAGOS p
        JOIN EVENTOS e ON e.ID_EVENTO = p.ID_EVENTO
        JOIN SALONES s ON s.ID_SALON = e.ID_SALON
        JOIN LOCALES l ON l.ID_LOCAL = s.ID_LOCAL
       WHERE p.ESTADO = 'APPROVED'`;

    // filtros comunes (institución + año + meses + local) sobre p.FECHA
    const armarWhere = (binds: Record<string, number | null>) => {
      let where = ' WHERE (:inst IS NULL OR p.ID_INSTITUCION = :inst)';
      if (filtros.anio) {
        binds.anio = filtros.anio;
        where += ' AND EXTRACT(YEAR FROM p.FECHA) = :anio';
      }
      const validos = (filtros.meses ?? []).filter(
        (m) => Number.isInteger(m) && m >= 1 && m <= 12,
      );
      if (validos.length > 0) {
        const ph = validos.map((m, i) => {
          binds[`mes${i}`] = m;
          return `:mes${i}`;
        });
        where += ` AND EXTRACT(MONTH FROM p.FECHA) IN (${ph.join(',')})`;
      }
      if (filtros.idLocal) {
        binds.idLocal = filtros.idLocal;
        where += ' AND p.ID_LOCAL = :idLocal';
      }
      return where;
    };
    const binds: Record<string, number | null> = { inst };
    const where = armarWhere(binds);
    const bindsPag: Record<string, number | null> = { inst };
    const wherePag = armarWhere(bindsPag);

    const [resumen, porSalon, porDia, anios, entradas, salonesAmbito] =
      await Promise.all([
        this.oracle.query<{
          RESERVAS: number;
          DIAS_OCUPADOS: number;
          SALONES_USADOS: number;
          INGRESO_ALQUILER: number;
        }>(
          `SELECT COUNT(DISTINCT p.ID_EVENTO) AS RESERVAS,
                  COUNT(DISTINCT p.ID_SALON || '-' || TO_CHAR(p.FECHA, 'YYYYMMDD')) AS DIAS_OCUPADOS,
                  COUNT(DISTINCT p.ID_SALON) AS SALONES_USADOS,
                  NVL(SUM(p.ALQUILER_DIA), 0) AS INGRESO_ALQUILER
             FROM (${OCUPACION}) p ${where}`,
          binds,
        ),
        this.oracle.query(
          `SELECT p.ID_SALON, p.SALON, p.NOMBRE_LOCAL,
                  COUNT(DISTINCT p.ID_EVENTO) AS RESERVAS,
                  COUNT(DISTINCT TO_CHAR(p.FECHA, 'YYYYMMDD')) AS DIAS_OCUPADOS,
                  NVL(SUM(p.ALQUILER_DIA), 0) AS INGRESO_ALQUILER
             FROM (${OCUPACION}) p ${where}
            GROUP BY p.ID_SALON, p.SALON, p.NOMBRE_LOCAL
            ORDER BY DIAS_OCUPADOS DESC, INGRESO_ALQUILER DESC`,
          binds,
        ),
        this.oracle.query(
          `SELECT TO_CHAR(p.FECHA, 'YYYY-MM-DD') AS FECHA,
                  COUNT(DISTINCT p.ID_EVENTO) AS RESERVAS,
                  COUNT(DISTINCT p.ID_SALON) AS SALONES,
                  NVL(SUM(p.ALQUILER_DIA), 0) AS INGRESO_ALQUILER
             FROM (${OCUPACION}) p ${where}
            GROUP BY TO_CHAR(p.FECHA, 'YYYY-MM-DD')
            ORDER BY FECHA`,
          binds,
        ),
        this.oracle.query<{ ANIO: number }>(
          `SELECT DISTINCT EXTRACT(YEAR FROM p.FECHA) AS ANIO
             FROM (${OCUPACION}) p
            WHERE (:inst IS NULL OR p.ID_INSTITUCION = :inst)
            ORDER BY ANIO DESC`,
          { inst },
        ),
        this.oracle.query<{ ID_SALON: number; INGRESO_ENTRADAS: number }>(
          `SELECT p.ID_SALON, NVL(SUM(p.MONTO), 0) AS INGRESO_ENTRADAS
             FROM (${ENTRADAS}) p ${wherePag}
            GROUP BY p.ID_SALON`,
          bindsPag,
        ),
        // salones del ámbito (denominador de la tasa de ocupación)
        this.oracle.query<{ TOTAL: number }>(
          `SELECT COUNT(*) AS TOTAL
             FROM SALONES s JOIN LOCALES l ON l.ID_LOCAL = s.ID_LOCAL
            WHERE (:inst IS NULL OR l.ID_INSTITUCION = :inst)
              AND (:idLocal IS NULL OR l.ID_LOCAL = :idLocal)`,
          {
            inst,
            idLocal: { val: filtros.idLocal ?? null, type: this.oracle.NUMBER },
          },
        ),
      ]);

    // días del período: meses elegidos del año (o el año completo)
    const anioRef = filtros.anio ?? new Date().getFullYear();
    const mesesRef =
      filtros.meses && filtros.meses.length > 0
        ? filtros.meses.filter((m) => m >= 1 && m <= 12)
        : Array.from({ length: 12 }, (_, i) => i + 1);
    const diasPeriodo = mesesRef.reduce(
      (acc, m) => acc + new Date(anioRef, m, 0).getDate(),
      0,
    );

    const entradasMap = new Map(
      entradas.map((e) => [Number(e.ID_SALON), Number(e.INGRESO_ENTRADAS)]),
    );
    const r = resumen[0];
    const totalSalones = Number(salonesAmbito[0]?.TOTAL ?? 0);
    const diasOcupados = Number(r?.DIAS_OCUPADOS ?? 0);
    const capacidadDias = totalSalones * diasPeriodo;
    const ingresoEntradasTotal = [...entradasMap.values()].reduce(
      (a, b) => a + b,
      0,
    );

    return {
      idInstitucion: inst,
      resumen: {
        reservas: Number(r?.RESERVAS ?? 0),
        diasOcupados,
        salonesUsados: Number(r?.SALONES_USADOS ?? 0),
        totalSalones,
        ingresoAlquiler: Number(r?.INGRESO_ALQUILER ?? 0),
        ingresoEntradas: ingresoEntradasTotal,
        tasaOcupacion:
          capacidadDias > 0
            ? Math.round((diasOcupados / capacidadDias) * 1000) / 10
            : 0,
      },
      porSalon: (porSalon as Array<Record<string, unknown>>).map((s) => ({
        idSalon: Number(s.ID_SALON),
        salon: s.SALON,
        local: s.NOMBRE_LOCAL,
        reservas: Number(s.RESERVAS),
        diasOcupados: Number(s.DIAS_OCUPADOS),
        ingresoAlquiler: Number(s.INGRESO_ALQUILER),
        ingresoEntradas: entradasMap.get(Number(s.ID_SALON)) ?? 0,
        tasaOcupacion:
          diasPeriodo > 0
            ? Math.round((Number(s.DIAS_OCUPADOS) / diasPeriodo) * 1000) / 10
            : 0,
      })),
      porDia: (porDia as Array<Record<string, unknown>>).map((d) => ({
        fecha: d.FECHA,
        reservas: Number(d.RESERVAS),
        salones: Number(d.SALONES),
        ingresoAlquiler: Number(d.INGRESO_ALQUILER),
      })),
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
    if (!amb[0]) throw new BadRequestException('Event not found');
    if (!actor.esSuper && amb[0].ID_INSTITUCION !== actor.idInstitucion) {
      throw new BadRequestException('The event belongs to another institution');
    }

    return this.oracle.query(
      // COALESCE con LOG_PARTICIPANTES_EVENTO: las cuentas dadas de baja siguen
      // mostrando nombre/correo (snapshot de control tomado antes de anonimizar).
      `SELECT COALESCE(u.NOMBRE, lg.NOMBRE) AS NOMBRE,
              COALESCE(u.APELLIDO, lg.APELLIDO) AS APELLIDO,
              CASE WHEN u.EMAIL LIKE '%@deleted.connecthub.local'
                   THEN COALESCE(lg.EMAIL, 'Cuenta eliminada') ELSE u.EMAIL END AS EMAIL,
              u.NUMERO_CELULAR,
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
         LEFT JOIN (SELECT ID_CLIENTE, ID_EVENTO, MAX(NOMBRE) AS NOMBRE,
                           MAX(APELLIDO) AS APELLIDO, MAX(EMAIL) AS EMAIL
                      FROM LOG_PARTICIPANTES_EVENTO GROUP BY ID_CLIENTE, ID_EVENTO) lg
                ON lg.ID_CLIENTE = eu.ID_CLIENTE AND lg.ID_EVENTO = eu.ID_EVENTO
        WHERE eu.ID_EVENTO = :id
        ORDER BY ASISTENCIA, COALESCE(u.APELLIDO, lg.APELLIDO), COALESCE(u.NOMBRE, lg.NOMBRE)`,
      { id: idEvento },
    );
  }
}
