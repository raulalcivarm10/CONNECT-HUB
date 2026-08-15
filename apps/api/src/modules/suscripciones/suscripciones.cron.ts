import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OracleService } from '../../database/oracle.service';
import { MailerService } from '../../auth/mailer.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { hoyEcuador } from './fechas-ecuador.util';

/** días de antelación con que se avisa del vencimiento */
const DIAS_AVISO = 3;

/**
 * TRABAJO NOCTURNO — corte por vencimiento y aviso previo.
 *
 * ZONA HORARIA (leer antes de tocar el cron):
 * el contenedor corre en UTC y los clientes están en Ecuador (UTC-5 fijo). El
 * corte se pidió "a las 23:00" hora de Ecuador, que son las 04:00 UTC del día
 * SIGUIENTE — de ahí '0 4 * * *'. Y "hoy" se calcula con hoyEcuador(), no con
 * la fecha UTC: a las 04:00 UTC del día D en Ecuador todavía son las 23:00 del
 * día D-1, así que usar la fecha UTC cortaría un día antes de tiempo.
 *
 * Es idempotente: cada UPDATE lleva su propia condición de estado, así que
 * repetir la corrida (o lanzarla a mano) no duplica cortes ni avisos.
 */
@Injectable()
export class SuscripcionesCron {
  private readonly logger = new Logger(SuscripcionesCron.name);

  constructor(
    private readonly oracle: OracleService,
    private readonly mailer: MailerService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // 04:00 UTC = 23:00 en Ecuador (America/Guayaquil, UTC-5 todo el año)
  @Cron('0 4 * * *', { name: 'suscripciones-nocturno' })
  async trabajoNocturno(): Promise<{ vencidas: number; avisadas: number }> {
    const hoy = hoyEcuador();
    this.logger.log(`Trabajo nocturno de suscripciones (hoy en Ecuador: ${hoy})`);
    let vencidas = 0;
    let avisadas = 0;
    // cada mitad en su try: que falle el correo no puede impedir el corte, ni
    // al revés, y NADA de esto puede tumbar el proceso
    try {
      vencidas = await this.cortarVencidas(hoy);
    } catch (err) {
      this.logger.error(`Corte por vencimiento falló: ${String(err)}`);
    }
    try {
      avisadas = await this.avisarProximas(hoy);
    } catch (err) {
      this.logger.error(`Aviso de vencimiento falló: ${String(err)}`);
    }
    this.logger.log(
      `Trabajo nocturno terminado: ${vencidas} cortadas, ${avisadas} avisadas`,
    );
    return { vencidas, avisadas };
  }

  /**
   * Marca VENCIDA toda suscripción ACTIVA cuya FECHA_FIN ya pasó y suspende la
   * institución. FECHA_FIN es el último día CON servicio, y la comparación es
   * `FECHA_FIN < hoy`: la corrida de las 23:00 del día D corta lo que venció el
   * D-1 o antes. Es decir, el último día se respeta entero y el corte cae la
   * noche siguiente. Es un día de gracia deliberado: se prefiere cortar tarde
   * que cortarle el servicio a un cliente que sí pagó.
   */
  private async cortarVencidas(hoy: string): Promise<number> {
    const filas = await this.oracle.query<{
      ID_SUSCRIPCION: number;
      ID_INSTITUCION: number;
      INSTITUCION: string;
      FECHA_FIN: string;
    }>(
      `SELECT s.ID_SUSCRIPCION, s.ID_INSTITUCION, i.NOMBRE AS INSTITUCION,
              TO_CHAR(s.FECHA_FIN, 'YYYY-MM-DD') AS FECHA_FIN
         FROM SUSCRIPCIONES s
         JOIN INSTITUCIONES i ON i.ID_INSTITUCION = s.ID_INSTITUCION
        WHERE s.ESTADO = 'ACTIVA'
          AND s.FECHA_FIN < TO_DATE(:hoy, 'YYYY-MM-DD')`,
      { hoy },
    );

    let cortadas = 0;
    for (const f of filas) {
      // la condición ESTADO='ACTIVA' hace el UPDATE idempotente
      const upd = await this.oracle.execute(
        `UPDATE SUSCRIPCIONES
            SET ESTADO = 'VENCIDA', FECHA_CORTE = SYSDATE,
                MODIFICADO_POR = 'SISTEMA', FECHA_MODIFICACION = SYSDATE
          WHERE ID_SUSCRIPCION = :id AND ESTADO = 'ACTIVA'`,
        { id: f.ID_SUSCRIPCION },
      );
      if (!(upd.rowsAffected ?? 0)) continue;
      cortadas++;

      // renovación solapada: si le queda otra suscripción vigente NO se corta
      const otras = await this.oracle.query<{ N: number }>(
        `SELECT COUNT(*) AS N FROM SUSCRIPCIONES
          WHERE ID_INSTITUCION = :inst AND ESTADO = 'ACTIVA'
            AND FECHA_FIN >= TO_DATE(:hoy, 'YYYY-MM-DD')`,
        { inst: f.ID_INSTITUCION, hoy },
      );
      if ((otras[0]?.N ?? 0) > 0) {
        this.logger.log(
          `Suscripción ${f.ID_SUSCRIPCION} vencida, pero ${f.INSTITUCION} tiene otra vigente: no se suspende`,
        );
        continue;
      }

      // EL CORTE: suspender la institución basta. Ya bloquea el login del panel
      // y esconde sus eventos de las apps (todo filtra por ESTADO='APROBADA').
      // El guard ESTADO='APROBADA' evita pisar PENDIENTE/RECHAZADA.
      const susp = await this.oracle.execute(
        `UPDATE INSTITUCIONES
            SET ESTADO = 'SUSPENDIDA', APROBADO_POR = 'SISTEMA'
          WHERE ID_INSTITUCION = :inst AND ESTADO = 'APROBADA'`,
        { inst: f.ID_INSTITUCION },
      );
      const suspendida = (susp.rowsAffected ?? 0) > 0;
      this.logger.warn(
        `Corte por vencimiento: ${f.INSTITUCION} (${f.ID_INSTITUCION}), ` +
          `suscripción ${f.ID_SUSCRIPCION} venció el ${f.FECHA_FIN}` +
          (suspendida ? ' — institución SUSPENDIDA' : ' — la institución no estaba APROBADA'),
      );
      this.auditoria.registrar({
        usuario: 'SISTEMA',
        idInstitucion: f.ID_INSTITUCION,
        accion: 'SUSC_CORTE',
        metodo: 'CRON',
        ruta: '/suscripciones/cron/corte',
        status: 200,
        ip: null,
        detalle: JSON.stringify({
          idSuscripcion: f.ID_SUSCRIPCION,
          fechaFin: f.FECHA_FIN,
          institucion: f.INSTITUCION,
          suspendida,
        }),
      });
    }
    return cortadas;
  }

  /**
   * Aviso al COMPRADOR_EMAIL DIAS_AVISO días antes de vencer. AVISO_ENVIADO
   * guarda con cuántos días de antelación ya se avisó, y solo se avisa cuando
   * está en NULL: así no se repite el mismo aviso cada noche. Al mover la fecha
   * de fin (PATCH) se limpia la columna y el aviso vuelve a salir.
   */
  private async avisarProximas(hoy: string): Promise<number> {
    if (!this.mailer.habilitado) {
      this.logger.warn('SMTP no configurado: no se envían avisos de vencimiento');
      return 0;
    }
    const filas = await this.oracle.query<{
      ID_SUSCRIPCION: number;
      ID_INSTITUCION: number;
      INSTITUCION: string;
      COMPRADOR_EMAIL: string;
      COMPRADOR_NOMBRE: string | null;
      FECHA_FIN: string;
      DIAS_RESTANTES: number;
    }>(
      `SELECT s.ID_SUSCRIPCION, s.ID_INSTITUCION, i.NOMBRE AS INSTITUCION,
              s.COMPRADOR_EMAIL, s.COMPRADOR_NOMBRE,
              TO_CHAR(s.FECHA_FIN, 'YYYY-MM-DD') AS FECHA_FIN,
              TRUNC(s.FECHA_FIN) - TO_DATE(:hoy, 'YYYY-MM-DD') AS DIAS_RESTANTES
         FROM SUSCRIPCIONES s
         JOIN INSTITUCIONES i ON i.ID_INSTITUCION = s.ID_INSTITUCION
        WHERE s.ESTADO = 'ACTIVA'
          AND s.AVISO_ENVIADO IS NULL
          AND s.FECHA_FIN >= TO_DATE(:hoy, 'YYYY-MM-DD')
          AND s.FECHA_FIN <= TO_DATE(:hoy, 'YYYY-MM-DD') + :antelacion`,
      { hoy, antelacion: DIAS_AVISO },
    );

    let avisadas = 0;
    for (const f of filas) {
      const enviado = await this.mailer.enviarAvisoVencimiento({
        destino: f.COMPRADOR_EMAIL,
        nombre: f.COMPRADOR_NOMBRE,
        institucion: f.INSTITUCION,
        fechaFin: f.FECHA_FIN,
        diasRestantes: f.DIAS_RESTANTES,
      });
      if (!enviado) {
        // no se marca: se reintenta la noche siguiente
        this.logger.error(
          `No se pudo avisar a ${f.COMPRADOR_EMAIL} (suscripción ${f.ID_SUSCRIPCION})`,
        );
        continue;
      }
      await this.oracle.execute(
        `UPDATE SUSCRIPCIONES SET AVISO_ENVIADO = :dias
          WHERE ID_SUSCRIPCION = :id AND AVISO_ENVIADO IS NULL`,
        { dias: f.DIAS_RESTANTES, id: f.ID_SUSCRIPCION },
      );
      avisadas++;
      this.auditoria.registrar({
        usuario: 'SISTEMA',
        idInstitucion: f.ID_INSTITUCION,
        accion: 'SUSC_AVISO',
        metodo: 'CRON',
        ruta: '/suscripciones/cron/aviso',
        status: 200,
        ip: null,
        detalle: JSON.stringify({
          idSuscripcion: f.ID_SUSCRIPCION,
          fechaFin: f.FECHA_FIN,
          diasRestantes: f.DIAS_RESTANTES,
          destino: f.COMPRADOR_EMAIL,
        }),
      });
    }
    return avisadas;
  }
}
