import { BadRequestException, Injectable } from '@nestjs/common';
import oracledb from 'oracledb';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import { EventosService } from './eventos.service';
import { AgendaItemDto } from './dto/agenda.dto';

/**
 * Largo MÁXIMO de cada columna de texto de EVENTO_AGENDA. Se valida en BYTES
 * (UTF-8) además del @MaxLength en caracteres del DTO: si el esquema usa
 * semántica de bytes, un texto con tildes puede pasar la validación de
 * caracteres y reventar con ORA-12899 a mitad del INSERT masivo. Mejor un 400
 * claro con el número de fila que un 500 en producción.
 */
const LARGO_COLUMNA = {
  horaInicio: 5,
  horaFin: 5,
  salon: 120,
  area: 80,
  tema: 600,
  conferencista: 200,
  nacionalidad: 80,
  tipo: 20,
  patrocinador: 160,
} as const;

type CampoTexto = keyof typeof LARGO_COLUMNA;

/** '' y espacios en blanco → null (la BD guarda NULL, no cadenas vacías). */
function txt(v: string | undefined | null): string | null {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}

/**
 * Agenda detallada del evento (EVENTO_AGENDA) para el PANEL: filas PLANAS, una
 * por línea del Excel del cliente. El agrupado en sesiones/charlas NO se guarda
 * ni se calcula aquí; eso lo hace el catálogo público al leer
 * (`modules/public/catalogo/catalogo.service.ts`).
 *
 * El panel parsea el Excel en el navegador y manda el JSON ya limpio: aquí NO
 * hay subida de archivos ni dependencias de Excel a propósito.
 *
 * Control de acceso: reutiliza `EventosService.eventoEnAmbito()`, el mismo que
 * usan todos los endpoints de eventos (institución del actor y, para el rol
 * EVENT raso, solo sus propios eventos o los de su GRUPO).
 */
@Injectable()
export class AgendaService {
  constructor(
    private readonly oracle: OracleService,
    private readonly eventos: EventosService,
  ) {}

  /** Filas planas del evento, listas para editar en el panel. */
  async listar(actor: JwtUser, idEvento: number) {
    await this.eventos.eventoEnAmbito(actor, idEvento);
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT ID_AGENDA, DIA_ORDEN, HORA_INICIO, HORA_FIN, SALON, AREA, TEMA,
              CONFERENCISTA, NACIONALIDAD, TIPO, PATROCINADOR, ORDEN
         FROM EVENTO_AGENDA
        WHERE ID_EVENTO = :id
        ORDER BY DIA_ORDEN, NVL(ORDEN, 999999), ID_AGENDA`,
      { id: idEvento },
    );
    return {
      items: rows.map((r) => ({
        idAgenda: Number(r.ID_AGENDA),
        diaOrden: Number(r.DIA_ORDEN),
        horaInicio: (r.HORA_INICIO as string) ?? null,
        horaFin: (r.HORA_FIN as string) ?? null,
        salon: (r.SALON as string) ?? null,
        area: (r.AREA as string) ?? null,
        tema: (r.TEMA as string) ?? null,
        conferencista: (r.CONFERENCISTA as string) ?? null,
        nacionalidad: (r.NACIONALIDAD as string) ?? null,
        tipo: (r.TIPO as string) ?? 'PONENCIA',
        patrocinador: (r.PATROCINADOR as string) ?? null,
        orden: r.ORDEN == null ? null : Number(r.ORDEN),
      })),
    };
  }

  /**
   * REEMPLAZA la agenda completa del evento en UNA transacción (DELETE +
   * INSERT; si algo falla se hace rollback y no queda a medias).
   *
   * - `diaOrden` debe ser >= 1 y no superar el número de días del evento
   *   (EVENTO_HORAS). Se valida ANTES de tocar nada.
   * - `ORDEN` se asigna por la posición en el array (1..n), conservando el
   *   orden del Excel dentro de cada día.
   * - Los textos se guardan TAL CUAL llegan (el panel los manda en MAYÚSCULAS).
   */
  async reemplazar(actor: JwtUser, idEvento: number, items: AgendaItemDto[]) {
    const ev = await this.eventos.eventoEnAmbito(actor, idEvento);
    const numDias = ev.DIAS ? String(ev.DIAS).split(',').length : 0;
    if (numDias === 0) {
      throw new BadRequestException(
        'The event has no days configured (EVENTO_HORAS); set them before loading the agenda',
      );
    }

    const filas = (items ?? []).map((it, i) => {
      const fila = i + 1;
      if (!Number.isInteger(it.diaOrden) || it.diaOrden < 1 || it.diaOrden > numDias) {
        throw new BadRequestException(
          `Row ${fila}: diaOrden must be between 1 and ${numDias} (days of the event)`,
        );
      }
      const valores = {
        diaOrden: it.diaOrden,
        horaInicio: txt(it.horaInicio),
        horaFin: txt(it.horaFin),
        salon: txt(it.salon),
        area: txt(it.area),
        tema: txt(it.tema),
        conferencista: txt(it.conferencista),
        nacionalidad: txt(it.nacionalidad),
        tipo: (txt(it.tipo) ?? 'PONENCIA').toUpperCase(),
        patrocinador: txt(it.patrocinador),
      };
      for (const [campo, max] of Object.entries(LARGO_COLUMNA)) {
        const v = valores[campo as CampoTexto];
        if (typeof v === 'string' && Buffer.byteLength(v, 'utf8') > max) {
          throw new BadRequestException(
            `Row ${fila}: "${campo}" exceeds the ${max}-character limit of the column`,
          );
        }
      }
      return { idEvento, orden: fila, creadoPor: actor.sub, ...valores };
    });

    await this.oracle.withConnection(async (conn) => {
      try {
        await conn.execute(`DELETE FROM EVENTO_AGENDA WHERE ID_EVENTO = :id`, {
          id: idEvento,
        });
        if (filas.length) {
          // executeMany con bindDefs explícitos: sin ellos node-oracledb infiere
          // los tipos de la PRIMERA fila y revienta si ahí viene un NULL.
          await conn.executeMany(
            `INSERT INTO EVENTO_AGENDA
               (ID_EVENTO, DIA_ORDEN, HORA_INICIO, HORA_FIN, SALON, AREA, TEMA,
                CONFERENCISTA, NACIONALIDAD, TIPO, PATROCINADOR, ORDEN, CREADO_POR)
             VALUES
               (:idEvento, :diaOrden, :horaInicio, :horaFin, :salon, :area, :tema,
                :conferencista, :nacionalidad, :tipo, :patrocinador, :orden, :creadoPor)`,
            filas,
            {
              bindDefs: {
                idEvento: { type: oracledb.NUMBER },
                diaOrden: { type: oracledb.NUMBER },
                horaInicio: { type: oracledb.STRING, maxSize: LARGO_COLUMNA.horaInicio },
                horaFin: { type: oracledb.STRING, maxSize: LARGO_COLUMNA.horaFin },
                salon: { type: oracledb.STRING, maxSize: LARGO_COLUMNA.salon },
                area: { type: oracledb.STRING, maxSize: LARGO_COLUMNA.area },
                tema: { type: oracledb.STRING, maxSize: LARGO_COLUMNA.tema },
                conferencista: {
                  type: oracledb.STRING,
                  maxSize: LARGO_COLUMNA.conferencista,
                },
                nacionalidad: { type: oracledb.STRING, maxSize: LARGO_COLUMNA.nacionalidad },
                tipo: { type: oracledb.STRING, maxSize: LARGO_COLUMNA.tipo },
                patrocinador: { type: oracledb.STRING, maxSize: LARGO_COLUMNA.patrocinador },
                orden: { type: oracledb.NUMBER },
                creadoPor: { type: oracledb.STRING, maxSize: 60 },
              },
            },
          );
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback().catch(() => undefined);
        throw err;
      }
    });

    return { idEvento, filas: filas.length };
  }

  /** Vacía la agenda del evento. */
  async vaciar(actor: JwtUser, idEvento: number) {
    await this.eventos.eventoEnAmbito(actor, idEvento);
    const r = await this.oracle.execute(
      `DELETE FROM EVENTO_AGENDA WHERE ID_EVENTO = :id`,
      { id: idEvento },
    );
    return { idEvento, eliminadas: r.rowsAffected ?? 0 };
  }
}
