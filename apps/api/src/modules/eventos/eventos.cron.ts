import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OracleService } from '../../database/oracle.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { hoyEcuador } from '../suscripciones/fechas-ecuador.util';

/**
 * CIERRE AUTOMÁTICO DE EVENTOS PASADOS.
 *
 * Hasta ahora un evento cuya fecha ya pasó seguía saliendo en el catálogo de la
 * app y seguía siendo comprable: ninguna de las consultas del catálogo filtraba
 * por fecha, así que la única forma de sacarlo era suspenderlo a mano, uno por
 * uno.
 *
 * POR QUÉ UN ESTADO NUEVO Y NO "SUSPENDIDO" (esto es lo importante):
 * suspender pone NO_PUBLICAR='S', y ese flag no solo lo saca del catálogo —
 * también hace que la ficha del evento devuelva 404 (catalogo.eventoPublico) y
 * que su muro desaparezca de la comunidad del asistente. Aplicado a un evento
 * que YA OCURRIÓ eso es exactamente al revés de lo que se quiere: justo después
 * del evento es cuando la gente entra a ver el muro, a buscar contactos y a
 * descargar su certificado. Así que FINALIZADO deja NO_PUBLICAR intacto:
 *
 *   deja de venderse y deja de aparecer en el catálogo   <- lo que se buscaba
 *   la ficha, el muro, las entradas y los certificados   <- siguen funcionando
 *
 * ZONA HORARIA: el contenedor corre en UTC y los clientes están en Ecuador
 * (UTC-5 fijo, sin horario de verano). Las dos corridas pedidas son 12:00 y
 * 23:59 de Ecuador, que en UTC son las 17:00 del mismo día y las 04:59 del
 * SIGUIENTE. Y "hoy" se calcula con hoyEcuador(), nunca con la fecha UTC: a las
 * 04:59 UTC en Ecuador todavía es el día anterior, y usar la fecha UTC cerraría
 * los eventos un día antes de tiempo.
 *
 * Es idempotente y se autocorrige: cada UPDATE lleva su condición de estado, y
 * si a un evento ya cerrado le mueven la fecha hacia adelante la siguiente
 * corrida lo vuelve a publicar.
 */
@Injectable()
export class EventosCron {
  private readonly logger = new Logger(EventosCron.name);

  constructor(
    private readonly oracle: OracleService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Último día real del evento. FECHA_EVENTO es el PRIMER día, así que usarla
   * sola cerraría un congreso de tres días al terminar el primero. Se toma el
   * mayor entre la columna de cierre y el último día de EVENTO_HORAS: hoy
   * coinciden siempre, pero si alguien añade un día suelto sin recalcular la
   * columna, el evento no se cierra antes de tiempo.
   */
  private static readonly ULTIMO_DIA = `
    GREATEST(
      TRUNC(NVL(e.FECHA_FIN, e.FECHA_EVENTO)),
      TRUNC(NVL((SELECT MAX(h.FECHA) FROM EVENTO_HORAS h WHERE h.ID_EVENTO = e.ID_EVENTO),
                NVL(e.FECHA_FIN, e.FECHA_EVENTO)))
    )`;

  // 17:00 UTC = 12:00 en Ecuador
  @Cron('0 17 * * *', { name: 'eventos-cierre-mediodia' })
  async cierreMediodia() {
    return this.cerrarPasados('12:00');
  }

  // 04:59 UTC = 23:59 del día ANTERIOR en Ecuador
  @Cron('59 4 * * *', { name: 'eventos-cierre-noche' })
  async cierreNoche() {
    return this.cerrarPasados('23:59');
  }

  /**
   * Cierra los que ya pasaron y reabre los que volvieron al futuro. Las dos
   * mitades van en su propio try: que falle una no puede impedir la otra, y
   * nada de esto puede tumbar el proceso.
   */
  async cerrarPasados(etiqueta = 'manual'): Promise<{ cerrados: number; reabiertos: number }> {
    const hoy = hoyEcuador();
    this.logger.log(`Cierre de eventos pasados [${etiqueta}] (hoy en Ecuador: ${hoy})`);

    let cerrados = 0;
    let reabiertos = 0;
    try {
      cerrados = await this.marcarFinalizados(hoy);
    } catch (err) {
      this.logger.error(`Cierre de eventos falló: ${String(err)}`);
    }
    try {
      reabiertos = await this.reabrirFuturos(hoy);
    } catch (err) {
      this.logger.error(`Reapertura de eventos falló: ${String(err)}`);
    }

    this.logger.log(`Cierre terminado: ${cerrados} finalizados, ${reabiertos} reabiertos`);
    return { cerrados, reabiertos };
  }

  /**
   * PUBLICADO (o legado NULL) + último día ya pasado → FINALIZADO.
   *
   * La comparación es `último día < hoy`: el día del evento se respeta entero y
   * el cierre cae en la corrida siguiente. Por eso la corrida de las 12:00 no
   * cierra nada que termine hoy — cierra lo de ayer que la de las 23:59 no
   * alcanzó, por ejemplo si el servidor estuvo caído.
   */
  private async marcarFinalizados(hoy: string): Promise<number> {
    const filas = await this.oracle.query<{
      ID_EVENTO: number;
      TITULO: string;
      ULTIMO_DIA: string;
      ID_INSTITUCION: number | null;
      INSCRITOS: number;
    }>(
      `SELECT e.ID_EVENTO, e.TITULO,
              TO_CHAR(${EventosCron.ULTIMO_DIA}, 'YYYY-MM-DD') AS ULTIMO_DIA,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION,
              (SELECT COUNT(*) FROM EVENTOS_USUARIOS eu
                WHERE eu.ID_EVENTO = e.ID_EVENTO) AS INSCRITOS
         FROM EVENTOS e
         LEFT JOIN LOCALES l  ON l.ID_LOCAL  = e.ID_LOCAL
         LEFT JOIN SALONES s  ON s.ID_SALON  = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE NVL(e.ESTADO_APROBACION, 'PUBLICADO') = 'PUBLICADO'
          AND NVL(e.NO_PUBLICAR, 'N') = 'N'
          AND ${EventosCron.ULTIMO_DIA} < TO_DATE(:hoy, 'YYYY-MM-DD')`,
      { hoy },
    );

    let cerrados = 0;
    for (const f of filas) {
      // la condición de estado hace el UPDATE idempotente
      const upd = await this.oracle.execute(
        `UPDATE EVENTOS SET ESTADO_APROBACION = 'FINALIZADO'
          WHERE ID_EVENTO = :id
            AND NVL(ESTADO_APROBACION, 'PUBLICADO') = 'PUBLICADO'`,
        { id: f.ID_EVENTO },
      );
      if (!(upd.rowsAffected ?? 0)) continue;
      cerrados++;

      this.logger.log(
        `Evento ${f.ID_EVENTO} finalizado (terminó el ${f.ULTIMO_DIA}, ${f.INSCRITOS} inscritos): ${f.TITULO}`,
      );
      this.auditoria.registrar({
        usuario: 'SISTEMA',
        idInstitucion: f.ID_INSTITUCION,
        accion: 'EVENTO_FINALIZADO',
        metodo: 'CRON',
        ruta: '/eventos/cron/cierre',
        status: 200,
        ip: null,
        detalle: JSON.stringify({
          idEvento: f.ID_EVENTO,
          titulo: f.TITULO,
          ultimoDia: f.ULTIMO_DIA,
          inscritos: f.INSCRITOS,
        }),
      });
    }
    return cerrados;
  }

  /**
   * Autocorrección: si a un evento FINALIZADO le mueven la fecha al futuro,
   * vuelve a PUBLICADO. Sin esto habría que acordarse de reabrirlo a mano y el
   * evento quedaría invisible sin que nada lo explique.
   */
  private async reabrirFuturos(hoy: string): Promise<number> {
    const filas = await this.oracle.query<{
      ID_EVENTO: number;
      TITULO: string;
      ULTIMO_DIA: string;
      ID_INSTITUCION: number | null;
    }>(
      `SELECT e.ID_EVENTO, e.TITULO,
              TO_CHAR(${EventosCron.ULTIMO_DIA}, 'YYYY-MM-DD') AS ULTIMO_DIA,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION
         FROM EVENTOS e
         LEFT JOIN LOCALES l  ON l.ID_LOCAL  = e.ID_LOCAL
         LEFT JOIN SALONES s  ON s.ID_SALON  = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE e.ESTADO_APROBACION = 'FINALIZADO'
          AND ${EventosCron.ULTIMO_DIA} >= TO_DATE(:hoy, 'YYYY-MM-DD')`,
      { hoy },
    );

    let reabiertos = 0;
    for (const f of filas) {
      const upd = await this.oracle.execute(
        `UPDATE EVENTOS SET ESTADO_APROBACION = 'PUBLICADO'
          WHERE ID_EVENTO = :id AND ESTADO_APROBACION = 'FINALIZADO'`,
        { id: f.ID_EVENTO },
      );
      if (!(upd.rowsAffected ?? 0)) continue;
      reabiertos++;

      this.logger.log(
        `Evento ${f.ID_EVENTO} reabierto (ahora termina el ${f.ULTIMO_DIA}): ${f.TITULO}`,
      );
      this.auditoria.registrar({
        usuario: 'SISTEMA',
        idInstitucion: f.ID_INSTITUCION,
        accion: 'EVENTO_REABIERTO',
        metodo: 'CRON',
        ruta: '/eventos/cron/cierre',
        status: 200,
        ip: null,
        detalle: JSON.stringify({
          idEvento: f.ID_EVENTO,
          titulo: f.TITULO,
          ultimoDia: f.ULTIMO_DIA,
        }),
      });
    }
    return reabiertos;
  }
}
