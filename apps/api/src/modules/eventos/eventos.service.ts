import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { OracleService } from '../../database/oracle.service';
import { JwtUser, soloSusEventos } from '../../auth/types';
import { ScopeService } from '../operativa/scope.service';
import { ArchivosService } from '../archivos/archivos.service';
import { PushService } from '../push/push.service';
import { CreateEventoDto, UpdateEventoDto, DiaDto } from './dto/evento.dto';
import { CrearCuponDto } from './dto/cupon.dto';
import {
  EventoDetalleDto,
  CreateExpositorDto,
  UpdateExpositorDto,
} from './dto/detalle.dto';

const TIPOS_IMAGEN_EVENTO = ['PORTADA', 'BANNER', 'GALERIA'];
const TIPOS_IMAGEN_EXPOSITOR = ['PORTADA'];
const MIMES_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];

const toMin = (h: string): number => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
};

/** Fila de EVENTO_HORAS de un evento candidato al comparar choques por día */
interface DiaConflicto {
  ID_EVENTO: number;
  TITULO: string;
  ID_SALON: number | null;
  HORA_INICIO: string;
  HORA_FIN: string;
  TIEMPO_SETUP_MIN: number | null;
  TIEMPO_CLEAN_MIN: number | null;
  SUBS: string | null;
}

@Injectable()
export class EventosService {
  constructor(
    private readonly oracle: OracleService,
    private readonly scope: ScopeService,
    private readonly archivos: ArchivosService,
    private readonly push: PushService,
  ) {}

  list(actor: JwtUser, idInstitucion?: number) {
    const filtro = this.scope.institucionForRead(actor, idInstitucion);
    // Visibilidad por rol: EVENT (sin SYSTEM/ADMINISTRATION) solo ve SUS
    // eventos: los que creó o los de su mismo GRUPO (facultad).
    const usr = soloSusEventos(actor) ? actor.sub : null;
    const grp = actor.grupo ?? null;
    return this.listQuery(usr, grp, filtro);
  }

  private async listQuery(usr: string | null, grp: string | null, filtro: number | null) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT e.ID_EVENTO, e.TITULO, e.DESCRIPCION,
              TO_CHAR(e.FECHA_EVENTO, 'YYYY-MM-DD') AS FECHA_EVENTO,
              TO_CHAR(NVL(e.FECHA_FIN, e.FECHA_EVENTO), 'YYYY-MM-DD') AS FECHA_FIN,
              e.HORA_INICIO, e.HORA_FIN, e.TIEMPO_SETUP_MIN, e.TIEMPO_CLEAN_MIN,
              e.PRECIO, e.PUBLICO_ESPERADO, e.DESTACADO, e.ORDEN_DESTACADO,
              e.COD_ITEM, e.NO_PUBLICAR, e.INCLUYE_IVA, e.MONTO_IVA,
              e.IMAGEN_URL, e.FECHA_REGISTRO,
              e.CREADO_POR, e.GRUPO, e.ESTADO_APROBACION, e.MOTIVO_RECHAZO,
              e.SALON_APROBADO_POR,
              TO_CHAR(e.FECHA_SALON_APROBADO, 'YYYY-MM-DD HH24:MI') AS FECHA_SALON_APROBADO,
              e.PUBLICADO_POR,
              TO_CHAR(e.FECHA_PUBLICADO, 'YYYY-MM-DD HH24:MI') AS FECHA_PUBLICADO,
              e.ID_EVENTO_PADRE, p.TITULO AS PADRE_TITULO,
              e.ID_LOCAL, e.ID_SALON, e.ID_SUBSALON, e.ID_CONFIGURACION,
              l.NOMBRE AS LOCAL_NOMBRE, s.NOMBRE AS SALON_NOMBRE,
              ss.NOMBRE AS SUBSALON_NOMBRE, c.NOMBRE AS CONFIGURACION_NOMBRE,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION,
              i.NOMBRE AS INSTITUCION,
              (SELECT LISTAGG(sx.NOMBRE, ' + ') WITHIN GROUP (ORDER BY sx.NOMBRE)
                 FROM EVENTO_SUBSALONES es JOIN SUBSALONES sx ON sx.ID_SUBSALON = es.ID_SUBSALON
                WHERE es.ID_EVENTO = e.ID_EVENTO) AS SUBSALONES_NOMBRES,
              (SELECT LISTAGG(TO_CHAR(h.FECHA, 'YYYY-MM-DD'), ',') WITHIN GROUP (ORDER BY h.FECHA)
                 FROM EVENTO_HORAS h WHERE h.ID_EVENTO = e.ID_EVENTO) AS DIAS,
              (SELECT COUNT(*) FROM EVENTOS_USUARIOS eu WHERE eu.ID_EVENTO = e.ID_EVENTO) AS INSCRITOS
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
         LEFT JOIN SUBSALONES ss ON ss.ID_SUBSALON = e.ID_SUBSALON
         LEFT JOIN SUBSALON_CONFIGURACIONES c ON c.ID_CONFIGURACION = e.ID_CONFIGURACION
         LEFT JOIN EVENTOS p ON p.ID_EVENTO = e.ID_EVENTO_PADRE
         LEFT JOIN INSTITUCIONES i ON i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)
        WHERE (:filtro IS NULL OR COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) = :filtro)
          AND (:usr IS NULL OR e.CREADO_POR = :usr
               OR (e.GRUPO IS NOT NULL AND e.GRUPO = :grp))
        ORDER BY e.FECHA_EVENTO DESC, e.HORA_INICIO`,
      { filtro, usr, grp },
    );
    // El panel consume los campos de aprobación en camelCase (contrato del UI);
    // el resto de columnas viaja como siempre (mayúsculas de Oracle).
    return rows.map((r) => ({
      ...r,
      creadoPor: (r.CREADO_POR as string | null) ?? null,
      grupo: (r.GRUPO as string | null) ?? null,
      estadoAprobacion: (r.ESTADO_APROBACION as string | null) ?? null,
      motivoRechazo: (r.MOTIVO_RECHAZO as string | null) ?? null,
      salonAprobadoPor: (r.SALON_APROBADO_POR as string | null) ?? null,
      fechaSalonAprobado: (r.FECHA_SALON_APROBADO as string | null) ?? null,
      publicadoPor: (r.PUBLICADO_POR as string | null) ?? null,
      fechaPublicado: (r.FECHA_PUBLICADO as string | null) ?? null,
    }));
  }

  /** Subsalones que reservará el evento según el espacio elegido */
  private async resolverSubsalones(
    idSalon: number,
    idConfiguracion?: number,
    idSubsalon?: number,
  ): Promise<number[]> {
    if (idConfiguracion && idSubsalon) {
      throw new BadRequestException(
        'Choose either a configuration OR a sub-hall, not both',
      );
    }
    if (idConfiguracion) {
      const rows = await this.oracle.query<{
        ID_SUBSALON: number;
        ID_SALON: number;
        ACTIVO: string;
      }>(
        `SELECT scs.ID_SUBSALON, c.ID_SALON, c.ACTIVO
           FROM SUBSALON_CONFIGURACIONES c
           LEFT JOIN SUBSALON_CONFIGURACION_SUBSALONES scs
             ON scs.ID_CONFIGURACION = c.ID_CONFIGURACION
          WHERE c.ID_CONFIGURACION = :id`,
        { id: idConfiguracion },
      );
      if (!rows.length) {
        throw new NotFoundException('The selected configuration does not exist');
      }
      if (rows[0].ID_SALON !== idSalon) {
        throw new BadRequestException(
          'The selected configuration does not belong to that hall',
        );
      }
      if (rows[0].ACTIVO !== 'Y') {
        throw new BadRequestException('The selected configuration is inactive');
      }
      return rows.map((r) => r.ID_SUBSALON).filter((x) => x != null);
    }
    if (idSubsalon) {
      const rows = await this.oracle.query<{ ID_SALON: number }>(
        `SELECT ID_SALON FROM SUBSALONES WHERE ID_SUBSALON = :id`,
        { id: idSubsalon },
      );
      if (!rows.length) throw new NotFoundException('The sub-hall does not exist');
      if (rows[0].ID_SALON !== idSalon) {
        throw new BadRequestException(
          'The selected sub-hall does not belong to that hall',
        );
      }
      return [idSubsalon];
    }
    return []; // salón completo
  }

  /**
   * Valida y normaliza los días del evento:
   *  - al menos 1 día
   *  - por día horaFin > horaInicio (en minutos)
   *  - fechas no repetidas
   * Devuelve los días ordenados por fecha y los valores sincronizados a EVENTOS:
   * FECHA_EVENTO = primer día, FECHA_FIN = último, HORA_INICIO/HORA_FIN = del
   * día más temprano.
   */
  private validarDias(dias: DiaDto[]) {
    if (!dias || dias.length === 0) {
      throw new BadRequestException('The event needs at least one day');
    }
    const vistas = new Set<string>();
    for (const d of dias) {
      if (vistas.has(d.fecha)) {
        throw new BadRequestException(
          `The day ${d.fecha} is repeated; each date can appear only once`,
        );
      }
      vistas.add(d.fecha);
      if (toMin(d.horaFin) <= toMin(d.horaInicio)) {
        throw new BadRequestException(
          `On ${d.fecha}, the end time must be after the start time`,
        );
      }
    }
    const ordenados = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const primero = ordenados[0];
    const ultimo = ordenados[ordenados.length - 1];
    return {
      ordenados,
      fechaEvento: primero.fecha,
      fechaFin: ultimo.fecha,
      horaInicio: primero.horaInicio,
      horaFin: primero.horaFin,
    };
  }

  /**
   * Disponibilidad POR DÍA: para cada día del evento (EVENTO_HORAS que se va a
   * escribir) se busca choque contra los días de OTROS eventos PRINCIPALES del
   * mismo local en esa misma FECHA con horas solapadas. Se excluyen los eventos
   * hijos/workshops (ID_EVENTO_PADRE IS NOT NULL) y el propio evento. La ventana
   * ocupada de cada día es [inicio-setup, fin+limpieza] en minutos del día.
   * La lógica de 'comparten espacio' (local completo vs salón vs subsalones) se
   * mantiene igual que antes.
   *
   * Sólo debe llamarse para eventos PRINCIPALES (idEventoPadre == null); los
   * hijos no validan choque.
   */
  private async validarDisponibilidad(opts: {
    idLocal: number;
    idSalon: number | null;
    dias: DiaDto[];
    setupMin: number;
    cleanMin: number;
    subsalones: number[];
    excluirEvento?: number;
  }) {
    for (const dia of opts.dias) {
      const occStart = toMin(dia.horaInicio) - opts.setupMin;
      const occEnd = toMin(dia.horaFin) + opts.cleanMin;

      const existentes = await this.oracle.query<DiaConflicto>(
        `SELECT eh.ID_EVENTO, e.TITULO, e.ID_SALON,
                eh.HORA_INICIO, eh.HORA_FIN,
                e.TIEMPO_SETUP_MIN, e.TIEMPO_CLEAN_MIN,
                (SELECT LISTAGG(es.ID_SUBSALON, ',') WITHIN GROUP (ORDER BY es.ID_SUBSALON)
                   FROM EVENTO_SUBSALONES es WHERE es.ID_EVENTO = e.ID_EVENTO) AS SUBS
           FROM EVENTO_HORAS eh
           JOIN EVENTOS e ON e.ID_EVENTO = eh.ID_EVENTO
          WHERE e.ID_LOCAL = :idLocal
            AND eh.FECHA = TO_DATE(:fecha, 'YYYY-MM-DD')
            AND e.ID_EVENTO_PADRE IS NULL
            AND e.ID_EVENTO != :excluir`,
        {
          idLocal: opts.idLocal,
          fecha: dia.fecha,
          excluir: opts.excluirEvento ?? -1,
        },
      );

      for (const ev of existentes) {
        const oIni = toMin(ev.HORA_INICIO);
        const oFin = toMin(ev.HORA_FIN);
        if (oFin <= oIni) continue; // datos legados sin horario real

        // ¿comparten espacio? (local completo vs salón vs subsalones)
        let compartenEspacio: boolean;
        let notaEspacio = '';
        if (!opts.idSalon || !ev.ID_SALON) {
          compartenEspacio = true;
          notaEspacio = !ev.ID_SALON
            ? ' (that event reserves the whole venue)'
            : ' (your event would reserve the whole venue)';
        } else if (ev.ID_SALON !== opts.idSalon) {
          compartenEspacio = false; // salones distintos del mismo local
        } else {
          const evSubs = (ev.SUBS ?? '').split(',').filter(Boolean).map(Number);
          compartenEspacio =
            opts.subsalones.length === 0 ||
            evSubs.length === 0 ||
            opts.subsalones.some((s) => evSubs.includes(s));
        }
        if (!compartenEspacio) continue;

        const evOccStart = oIni - (ev.TIEMPO_SETUP_MIN ?? 0);
        const evOccEnd = oFin + (ev.TIEMPO_CLEAN_MIN ?? 0);
        const fmt = (m: number) => {
          const hh = Math.floor(m / 60);
          const mm = m % 60;
          return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        };
        if (occStart < evOccEnd && occEnd > evOccStart) {
          throw new ConflictException(
            `The space is not available on ${dia.fecha}: "${ev.TITULO}" actually occupies it from ` +
              `${fmt(evOccStart)} to ${fmt(evOccEnd)} (event ${fmt(oIni)} → ${fmt(oFin)} ` +
              `+ ${ev.TIEMPO_SETUP_MIN ?? 0} min of setup and ${ev.TIEMPO_CLEAN_MIN ?? 0} min of cleanup)${notaEspacio}, ` +
              `and your event would need the space from ${fmt(occStart)} to ${fmt(occEnd)} ` +
              `(including your setup and cleanup). Adjust the time, the date, or the space.`,
          );
        }
      }
    }
  }

  /**
   * Tarifa de alquiler POR DÍA del espacio reservado, según la granularidad:
   * subsalón(es) → SUM(SUBSALONES.PRECIO) de los reservados; salón completo →
   * SALONES.PRECIO; local completo → sin tarifa (null). Devuelve null cuando no
   * hay tarifa definida. Se usa para CONGELAR el snapshot en EVENTOS
   * (PRECIO_ESPACIO_DIA / PRECIO_ESPACIO): cambiar la tarifa de lista después
   * NO reescribe reservas ya creadas.
   */
  private async tarifaEspacioDia(
    idSalon: number | null | undefined,
    subsalones: number[],
  ): Promise<number | null> {
    if (subsalones.length > 0) {
      const binds: Record<string, number> = {};
      subsalones.forEach((id, i) => (binds[`s${i}`] = id));
      const marcas = subsalones.map((_, i) => `:s${i}`).join(', ');
      const r = await this.oracle.query<{ TARIFA: number | null }>(
        `SELECT SUM(PRECIO) AS TARIFA FROM SUBSALONES WHERE ID_SUBSALON IN (${marcas})`,
        binds,
      );
      return r[0]?.TARIFA != null ? Number(r[0].TARIFA) : null;
    }
    if (idSalon != null) {
      const r = await this.oracle.query<{ PRECIO: number | null }>(
        `SELECT PRECIO FROM SALONES WHERE ID_SALON = :id`,
        { id: idSalon },
      );
      return r[0]?.PRECIO != null ? Number(r[0].PRECIO) : null;
    }
    return null; // local completo: sin tarifa por ahora
  }

  async create(actor: JwtUser, dto: CreateEventoDto) {
    // ámbito: el local debe ser de la institución del actor; el salón (si hay)
    // debe pertenecer a ese local. Sin salón = se reserva el local completo.
    await this.scope.local(actor, dto.idLocal);
    let subsalones: number[] = [];
    if (dto.idSalon) {
      const salon = await this.scope.salon(actor, dto.idSalon);
      if (salon.ID_LOCAL !== dto.idLocal) {
        throw new BadRequestException('The hall does not belong to that venue');
      }
      subsalones = await this.resolverSubsalones(
        dto.idSalon,
        dto.idConfiguracion,
        dto.idSubsalon,
      );
    } else if (dto.idConfiguracion || dto.idSubsalon) {
      throw new BadRequestException(
        'To reserve a layout or sub-hall, first choose a hall',
      );
    }

    const { ordenados, fechaEvento, fechaFin, horaInicio, horaFin } =
      this.validarDias(dto.dias);

    const idEventoPadre = dto.idEventoPadre ?? null;
    if (idEventoPadre != null) {
      await this.validarEventoPadre(actor, idEventoPadre);
    }

    // Sólo los eventos PRINCIPALES (sin padre) validan choque de espacio;
    // los hijos/workshops se saltan la validación.
    if (idEventoPadre == null) {
      await this.validarDisponibilidad({
        idLocal: dto.idLocal,
        idSalon: dto.idSalon ?? null,
        dias: ordenados,
        setupMin: dto.tiempoSetupMin ?? 0,
        cleanMin: dto.tiempoCleanMin ?? 0,
        subsalones,
      });
    }

    // Snapshot CONGELADO de la tarifa del espacio (los hijos/workshops no
    // reservan espacio propio → sin tarifa).
    const tarifaDia =
      idEventoPadre == null
        ? await this.tarifaEspacioDia(dto.idSalon ?? null, subsalones)
        : null;
    const tarifaTotal = tarifaDia != null ? tarifaDia * ordenados.length : null;

    // Flujo de aprobación: el rol EVENT (sin SYSTEM/ADMINISTRATION) crea en
    // BORRADOR con NO_PUBLICAR='S' FORZADO — reutiliza el check de público
    // existente, así la app móvil jamás ve el evento sin aprobar (cero cambios
    // allá). SYSTEM/ADMINISTRATION crean como siempre (publicado directo).
    const requiereAprobacion = soloSusEventos(actor);
    const noPublicarEfectivo = requiereAprobacion ? 'S' : dto.noPublicar ? 'S' : 'N';
    const estadoAprobacion = requiereAprobacion ? 'BORRADOR' : 'PUBLICADO';

    return this.oracle.withConnection(async (conn) => {
      const result = await conn.execute(
        `INSERT INTO EVENTOS
           (TITULO, DESCRIPCION, FECHA_EVENTO, FECHA_FIN, HORA_INICIO, HORA_FIN,
            ID_EVENTO_PADRE, ID_LOCAL, ID_SALON, ID_SUBSALON, ID_CONFIGURACION,
            PRECIO, PUBLICO_ESPERADO, TIEMPO_SETUP_MIN, TIEMPO_CLEAN_MIN,
            COD_ITEM, NO_PUBLICAR, INCLUYE_IVA, MONTO_IVA, IMAGEN_URL,
            PRECIO_ESPACIO_DIA, PRECIO_ESPACIO,
            CREADO_POR, GRUPO, ESTADO_APROBACION, PUBLICADO_POR, FECHA_PUBLICADO)
         VALUES
           (:titulo, :descripcion, TO_DATE(:fecha, 'YYYY-MM-DD'),
            TO_DATE(:fechaFin, 'YYYY-MM-DD'), :horaInicio, :horaFin,
            :idEventoPadre, :idLocal, :idSalon, :idSubsalon, :idConfiguracion,
            :precio, :publico, :setupMin, :cleanMin, :codItem, :noPublicar,
            :incluyeIva, :montoIva, :imagenUrl, :tarifaDia, :tarifaTotal,
            :creadoPor, :grupo, :estadoAprobacion,
            CASE WHEN :estadoAprobacion = 'PUBLICADO' THEN :creadoPor END,
            CASE WHEN :estadoAprobacion = 'PUBLICADO' THEN SYSDATE END)
         RETURNING ID_EVENTO INTO :out`,
        {
          tarifaDia: { val: tarifaDia, type: this.oracle.NUMBER },
          tarifaTotal: { val: tarifaTotal, type: this.oracle.NUMBER },
          titulo: dto.titulo,
          descripcion: dto.descripcion ?? null,
          fecha: fechaEvento,
          fechaFin,
          horaInicio,
          horaFin,
          idEventoPadre: { val: idEventoPadre, type: this.oracle.NUMBER },
          idLocal: dto.idLocal,
          idSalon: { val: dto.idSalon ?? null, type: this.oracle.NUMBER },
          idSubsalon: { val: dto.idSubsalon ?? null, type: this.oracle.NUMBER },
          idConfiguracion: {
            val: dto.idConfiguracion ?? null,
            type: this.oracle.NUMBER,
          },
          precio: dto.precio ?? 0,
          publico: { val: dto.publicoEsperado ?? null, type: this.oracle.NUMBER },
          setupMin: dto.tiempoSetupMin ?? 0,
          cleanMin: dto.tiempoCleanMin ?? 0,
          codItem: dto.codItem ?? null,
          noPublicar: noPublicarEfectivo,
          creadoPor: actor.sub,
          grupo: actor.grupo ?? null,
          estadoAprobacion,
          incluyeIva: dto.incluyeIva ? 'S' : 'N',
          montoIva: {
            val: dto.incluyeIva ? (dto.montoIva ?? null) : null,
            type: this.oracle.NUMBER,
          },
          imagenUrl: dto.imagenUrl ?? null,
          out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
        },
      );
      const idEvento = (result.outBinds as { out: number[] }).out[0];
      for (const idSubsalon of subsalones) {
        await conn.execute(
          `INSERT INTO EVENTO_SUBSALONES (ID_EVENTO, ID_SUBSALON) VALUES (:idEvento, :idSubsalon)`,
          { idEvento, idSubsalon },
        );
      }
      let orden = 0;
      for (const dia of ordenados) {
        await conn.execute(
          `INSERT INTO EVENTO_HORAS (ID_EVENTO, FECHA, HORA_INICIO, HORA_FIN, ORDEN)
           VALUES (:idEvento, TO_DATE(:fecha, 'YYYY-MM-DD'), :horaInicio, :horaFin, :orden)`,
          {
            idEvento,
            fecha: dia.fecha,
            horaInicio: dia.horaInicio,
            horaFin: dia.horaFin,
            orden: orden++,
          },
        );
      }
      await conn.commit();
      // aviso push a los asistentes vinculados a la institución (no bloquea).
      // Un BORRADOR nunca notifica: el push del flujo de aprobación se dispara
      // al aprobar la publicación (aprobarPublicacion).
      if (noPublicarEfectivo === 'N') {
        void this.push.notificarNuevoEvento(idEvento);
      }
      // Auditoría: deja constancia de QUÉ salón/salas y QUÉ días se
      // SOLICITARON originalmente (base del historial de movidas).
      if (requiereAprobacion) {
        void this.espacioSnapshot({
          idLocal: dto.idLocal,
          idSalon: dto.idSalon ?? null,
          idSubsalon: dto.idSubsalon ?? null,
          idConfiguracion: dto.idConfiguracion ?? null,
          dias: ordenados,
        }).then((snap) =>
          this.registrarHistorial(idEvento, 'SOLICITADO', actor.sub, {
            solicitado: snap,
          }),
        );
      }
      return { idEvento, subsalonesReservados: subsalones, estadoAprobacion };
    });
  }

  /** Carga el evento y verifica que pertenezca a la institución del actor */
  private async eventoEnAmbito(actor: JwtUser, idEvento: number) {
    const rows = await this.oracle.query<{
      ID_EVENTO: number;
      ID_LOCAL: number | null;
      ID_SALON: number | null;
      ID_SUBSALON: number | null;
      ID_CONFIGURACION: number | null;
      FECHA_EVENTO: string;
      FECHA_FIN: string;
      HORA_INICIO: string | null;
      HORA_FIN: string | null;
      TIEMPO_SETUP_MIN: number | null;
      TIEMPO_CLEAN_MIN: number | null;
      TITULO: string;
      ID_EVENTO_PADRE: number | null;
      PADRE_TITULO: string | null;
      ID_INSTITUCION: number | null;
      DIAS: string | null;
      CREADO_POR: string | null;
      GRUPO: string | null;
      ESTADO_APROBACION: string | null;
    }>(
      `SELECT e.ID_EVENTO, e.ID_LOCAL, e.ID_SALON, e.ID_SUBSALON, e.ID_CONFIGURACION,
              TO_CHAR(e.FECHA_EVENTO,'YYYY-MM-DD') AS FECHA_EVENTO,
              TO_CHAR(NVL(e.FECHA_FIN, e.FECHA_EVENTO),'YYYY-MM-DD') AS FECHA_FIN,
              e.HORA_INICIO, e.HORA_FIN, e.TIEMPO_SETUP_MIN, e.TIEMPO_CLEAN_MIN, e.TITULO,
              e.ID_EVENTO_PADRE, p.TITULO AS PADRE_TITULO,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION,
              e.CREADO_POR, e.GRUPO, e.ESTADO_APROBACION,
              (SELECT LISTAGG(TO_CHAR(h.FECHA, 'YYYY-MM-DD'), ',') WITHIN GROUP (ORDER BY h.FECHA)
                 FROM EVENTO_HORAS h WHERE h.ID_EVENTO = e.ID_EVENTO) AS DIAS
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
         LEFT JOIN EVENTOS p ON p.ID_EVENTO = e.ID_EVENTO_PADRE
        WHERE e.ID_EVENTO = :id`,
      { id: idEvento },
    );
    const ev = rows[0];
    if (!ev) throw new NotFoundException('Event not found');
    if (!actor.esSuper && ev.ID_INSTITUCION !== actor.idInstitucion) {
      throw new NotFoundException('Event not found');
    }
    // Rol EVENT raso: solo puede tocar SUS eventos (propios o de su grupo).
    // Cierra de una vez update/eliminar/imagen/cupones/etc. (todos pasan por aquí).
    if (
      soloSusEventos(actor) &&
      ev.CREADO_POR !== actor.sub &&
      !(ev.GRUPO != null && ev.GRUPO === (actor.grupo ?? null))
    ) {
      throw new NotFoundException('Event not found');
    }
    return ev;
  }

  /**
   * Valida el evento padre de un workshop: debe existir y estar en el ámbito del
   * actor, ser un evento PRINCIPAL (no se anidan workshops) y no ser el propio evento.
   */
  private async validarEventoPadre(
    actor: JwtUser,
    idEventoPadre: number,
    idEventoActual?: number,
  ) {
    if (idEventoActual && idEventoPadre === idEventoActual) {
      throw new BadRequestException('An event cannot be its own parent');
    }
    const padre = await this.eventoEnAmbito(actor, idEventoPadre);
    if (padre.ID_EVENTO_PADRE != null) {
      throw new BadRequestException(
        'The parent must be a main event (workshops cannot be nested)',
      );
    }
  }

  async update(actor: JwtUser, idEvento: number, dto: UpdateEventoDto) {
    const actual = await this.eventoEnAmbito(actor, idEvento);

    const idLocal = dto.idLocal ?? actual.ID_LOCAL;
    if (!idLocal) {
      throw new BadRequestException('The event needs a venue');
    }
    await this.scope.local(actor, idLocal);

    // localCompleto=true quita el salón (reserva todo el local)
    const idSalon = dto.localCompleto
      ? null
      : (dto.idSalon ?? actual.ID_SALON);

    let subsalones: number[] = [];
    let idConfiguracion: number | undefined;
    let idSubsalon: number | undefined;
    if (idSalon) {
      const salon = await this.scope.salon(actor, idSalon);
      if (salon.ID_LOCAL !== idLocal) {
        throw new BadRequestException('The hall does not belong to that venue');
      }
      const cambiaEspacio =
        dto.idSalon != null ||
        dto.idConfiguracion != null ||
        dto.idSubsalon != null;
      idConfiguracion = cambiaEspacio
        ? dto.idConfiguracion
        : (actual.ID_CONFIGURACION ?? undefined);
      idSubsalon = cambiaEspacio
        ? dto.idSubsalon
        : (actual.ID_SUBSALON ?? undefined);
      subsalones = await this.resolverSubsalones(
        idSalon,
        idConfiguracion,
        idSubsalon,
      );
    } else if (dto.idConfiguracion || dto.idSubsalon) {
      throw new BadRequestException(
        'To reserve a layout or sub-hall, first choose a hall',
      );
    }

    // idEventoPadre: undefined = mantener el actual; null = desasociar (principal);
    // número = asociar como workshop de ese padre.
    const idEventoPadre =
      dto.idEventoPadre === undefined
        ? (actual.ID_EVENTO_PADRE ?? null)
        : (dto.idEventoPadre ?? null);
    if (idEventoPadre != null) {
      await this.validarEventoPadre(actor, idEventoPadre, idEvento);
    }

    // días efectivos: los del body si vienen; si no, los actuales de EVENTO_HORAS.
    let diasCambian = false;
    let diasEfectivos: DiaDto[];
    let fecha: string;
    let fechaFin: string;
    let horaInicio: string;
    let horaFin: string;
    if (dto.dias !== undefined) {
      diasCambian = true;
      const norm = this.validarDias(dto.dias);
      diasEfectivos = norm.ordenados;
      fecha = norm.fechaEvento;
      fechaFin = norm.fechaFin;
      horaInicio = norm.horaInicio;
      horaFin = norm.horaFin;
    } else {
      const existentes = await this.oracle.query<{
        FECHA: string;
        HORA_INICIO: string;
        HORA_FIN: string;
      }>(
        `SELECT TO_CHAR(FECHA, 'YYYY-MM-DD') AS FECHA, HORA_INICIO, HORA_FIN
           FROM EVENTO_HORAS
          WHERE ID_EVENTO = :id
          ORDER BY FECHA`,
        { id: idEvento },
      );
      diasEfectivos = existentes.length
        ? existentes.map((r) => ({
            fecha: r.FECHA,
            horaInicio: r.HORA_INICIO,
            horaFin: r.HORA_FIN,
          }))
        : [
            {
              fecha: actual.FECHA_EVENTO,
              horaInicio: actual.HORA_INICIO ?? '00:00',
              horaFin: actual.HORA_FIN ?? '00:00',
            },
          ];
      fecha = diasEfectivos[0].fecha;
      fechaFin = diasEfectivos[diasEfectivos.length - 1].fecha;
      horaInicio = diasEfectivos[0].horaInicio;
      horaFin = diasEfectivos[0].horaFin;
    }

    // Sólo los eventos PRINCIPALES revalidan choque; los hijos se saltan.
    if (idEventoPadre == null) {
      await this.validarDisponibilidad({
        idLocal,
        idSalon: idSalon ?? null,
        dias: diasEfectivos,
        setupMin: dto.tiempoSetupMin ?? actual.TIEMPO_SETUP_MIN ?? 0,
        cleanMin: dto.tiempoCleanMin ?? actual.TIEMPO_CLEAN_MIN ?? 0,
        subsalones,
        excluirEvento: idEvento,
      });
    }

    // Re-congela el snapshot de la tarifa del espacio con las tarifas VIGENTES:
    // el espacio o los días efectivos pueden haber cambiado en esta edición.
    const tarifaDia =
      idEventoPadre == null
        ? await this.tarifaEspacioDia(idSalon ?? null, subsalones)
        : null;
    const tarifaTotal =
      tarifaDia != null ? tarifaDia * diasEfectivos.length : null;

    // ¿MOVIDA por un aprobador (Gestión Operativa / SYSTEM / ADMINISTRATION)?
    // Si un evento pendiente cambia de espacio o fechas a manos de un rol que
    // NO es el creador raso → se audita {de → a} y pasa a estado REUBICADO
    // (equivale a salón resuelto; sigue la aprobación de publicación).
    const estadoPendiente = ['BORRADOR', 'SALON_APROBADO', 'REUBICADO'].includes(
      actual.ESTADO_APROBACION ?? '',
    );
    const espacioCambio =
      (idLocal ?? null) !== (actual.ID_LOCAL ?? null) ||
      (idSalon ?? null) !== (actual.ID_SALON ?? null) ||
      (idSubsalon ?? null) !== (actual.ID_SUBSALON ?? null) ||
      (idConfiguracion ?? null) !== (actual.ID_CONFIGURACION ?? null);
    let snapshotAntes: Awaited<ReturnType<typeof this.espacioSnapshot>> | null = null;
    if (!soloSusEventos(actor) && estadoPendiente && (espacioCambio || diasCambian)) {
      const diasAntes = await this.oracle.query<{
        FECHA: string;
        HORA_INICIO: string;
        HORA_FIN: string;
      }>(
        `SELECT TO_CHAR(FECHA,'YYYY-MM-DD') AS FECHA, HORA_INICIO, HORA_FIN
           FROM EVENTO_HORAS WHERE ID_EVENTO = :id ORDER BY FECHA`,
        { id: idEvento },
      );
      const antes = diasAntes.map((d) => ({
        fecha: d.FECHA,
        horaInicio: d.HORA_INICIO,
        horaFin: d.HORA_FIN,
      }));
      // días idénticos re-enviados no cuentan como movida
      const diasRealmenteCambian =
        diasCambian && JSON.stringify(antes) !== JSON.stringify(diasEfectivos);
      if (espacioCambio || diasRealmenteCambian) {
        snapshotAntes = await this.espacioSnapshot({
          idLocal: actual.ID_LOCAL,
          idSalon: actual.ID_SALON,
          idSubsalon: actual.ID_SUBSALON,
          idConfiguracion: actual.ID_CONFIGURACION,
          dias: antes,
        });
      }
    }

    await this.oracle.withConnection(async (conn) => {
      await conn.execute(
        `UPDATE EVENTOS SET
           TITULO = NVL(:titulo, TITULO),
           DESCRIPCION = COALESCE(:descripcion, DESCRIPCION),
           FECHA_EVENTO = TO_DATE(:fecha, 'YYYY-MM-DD'),
           FECHA_FIN = TO_DATE(:fechaFin, 'YYYY-MM-DD'),
           HORA_INICIO = :horaInicio,
           HORA_FIN = :horaFin,
           ID_EVENTO_PADRE = :idEventoPadre,
           ID_LOCAL = :idLocal,
           ID_SALON = :idSalon,
           COD_ITEM = COALESCE(:codItem, COD_ITEM),
           NO_PUBLICAR = COALESCE(:noPublicar, NO_PUBLICAR),
           ESTADO_APROBACION = COALESCE(:estadoReset, ESTADO_APROBACION),
           SALON_APROBADO_POR = CASE WHEN :estadoReset IS NULL THEN SALON_APROBADO_POR END,
           FECHA_SALON_APROBADO = CASE WHEN :estadoReset IS NULL THEN FECHA_SALON_APROBADO END,
           PUBLICADO_POR = CASE WHEN :estadoReset IS NULL THEN PUBLICADO_POR END,
           FECHA_PUBLICADO = CASE WHEN :estadoReset IS NULL THEN FECHA_PUBLICADO END,
           INCLUYE_IVA = COALESCE(:incluyeIva, INCLUYE_IVA),
           MONTO_IVA = CASE WHEN :incluyeIva = 'N' THEN NULL
                            ELSE COALESCE(:montoIva, MONTO_IVA) END,
           ID_SUBSALON = :idSubsalon,
           ID_CONFIGURACION = :idConfiguracion,
           PRECIO = COALESCE(:precio, PRECIO),
           PUBLICO_ESPERADO = COALESCE(:publico, PUBLICO_ESPERADO),
           TIEMPO_SETUP_MIN = COALESCE(:setupMin, TIEMPO_SETUP_MIN),
           TIEMPO_CLEAN_MIN = COALESCE(:cleanMin, TIEMPO_CLEAN_MIN),
           IMAGEN_URL = COALESCE(:imagenUrl, IMAGEN_URL),
           PRECIO_ESPACIO_DIA = :tarifaDia,
           PRECIO_ESPACIO = :tarifaTotal
         WHERE ID_EVENTO = :id`,
        {
          tarifaDia: { val: tarifaDia, type: this.oracle.NUMBER },
          tarifaTotal: { val: tarifaTotal, type: this.oracle.NUMBER },
          titulo: dto.titulo ?? null,
          descripcion: dto.descripcion ?? null,
          fecha,
          fechaFin,
          horaInicio,
          horaFin,
          idEventoPadre: { val: idEventoPadre, type: this.oracle.NUMBER },
          idLocal,
          idSalon: { val: idSalon ?? null, type: this.oracle.NUMBER },
          codItem: dto.codItem ?? null,
          // Rol EVENT raso: NUNCA puede poner el evento como público a mano
          // (eso lo hace la aprobación); además cualquier edición suya lo
          // regresa a BORRADOR + oculto para re-aprobar.
          noPublicar: soloSusEventos(actor)
            ? 'S'
            : dto.noPublicar === undefined
              ? null
              : dto.noPublicar
                ? 'S'
                : 'N',
          estadoReset: soloSusEventos(actor) ? 'BORRADOR' : null,
          incluyeIva:
            dto.incluyeIva === undefined ? null : dto.incluyeIva ? 'S' : 'N',
          montoIva: { val: dto.montoIva ?? null, type: this.oracle.NUMBER },
          // binds numéricos nulos deben tiparse: si no, el driver los manda
          // como VARCHAR y Oracle lanza ORA-00932 dentro de COALESCE/NVL
          idSubsalon: { val: idSubsalon ?? null, type: this.oracle.NUMBER },
          idConfiguracion: {
            val: idConfiguracion ?? null,
            type: this.oracle.NUMBER,
          },
          precio: { val: dto.precio ?? null, type: this.oracle.NUMBER },
          publico: {
            val: dto.publicoEsperado ?? null,
            type: this.oracle.NUMBER,
          },
          setupMin: {
            val: dto.tiempoSetupMin ?? null,
            type: this.oracle.NUMBER,
          },
          cleanMin: {
            val: dto.tiempoCleanMin ?? null,
            type: this.oracle.NUMBER,
          },
          imagenUrl: dto.imagenUrl ?? null,
          id: idEvento,
        },
      );
      await conn.execute(
        `DELETE FROM EVENTO_SUBSALONES WHERE ID_EVENTO = :id`,
        { id: idEvento },
      );
      for (const s of subsalones) {
        await conn.execute(
          `INSERT INTO EVENTO_SUBSALONES (ID_EVENTO, ID_SUBSALON) VALUES (:id, :s)`,
          { id: idEvento, s },
        );
      }
      // Sólo reescribimos los días si el body los trae (DELETE + reinsert).
      if (diasCambian) {
        await conn.execute(`DELETE FROM EVENTO_HORAS WHERE ID_EVENTO = :id`, {
          id: idEvento,
        });
        let orden = 0;
        for (const dia of diasEfectivos) {
          await conn.execute(
            `INSERT INTO EVENTO_HORAS (ID_EVENTO, FECHA, HORA_INICIO, HORA_FIN, ORDEN)
             VALUES (:id, TO_DATE(:fecha, 'YYYY-MM-DD'), :horaInicio, :horaFin, :orden)`,
            {
              id: idEvento,
              fecha: dia.fecha,
              horaInicio: dia.horaInicio,
              horaFin: dia.horaFin,
              orden: orden++,
            },
          );
        }
      }
      await conn.commit();
    });

    // Auditoría de la MOVIDA (post-commit; nunca revierte la edición).
    // OJO: mover/editar NO aprueba — Gestión Operativa puede reorganizar
    // libremente y el evento SIGUE pendiente; la aprobación es SIEMPRE el
    // botón explícito "Aprobar salón" (aprobarSalon).
    if (snapshotAntes) {
      const despues = await this.espacioSnapshot({
        idLocal,
        idSalon: idSalon ?? null,
        idSubsalon: idSubsalon ?? null,
        idConfiguracion: idConfiguracion ?? null,
        dias: diasEfectivos,
      });
      await this.registrarHistorial(idEvento, 'MOVIDO', actor.sub, {
        de: snapshotAntes,
        a: despues,
      });
    }
    return { idEvento, subsalonesReservados: subsalones };
  }

  async destacar(
    actor: JwtUser,
    idEvento: number,
    destacado: boolean,
    orden?: number,
  ) {
    await this.eventoEnAmbito(actor, idEvento);
    await this.oracle.execute(
      `UPDATE EVENTOS SET
         DESTACADO = :destacado,
         FECHA_DESTACADO = CASE WHEN :destacado = 1 THEN SYSTIMESTAMP ELSE NULL END,
         ORDEN_DESTACADO = CASE WHEN :destacado = 1 THEN :orden ELSE NULL END
       WHERE ID_EVENTO = :id`,
      {
        destacado: destacado ? 1 : 0,
        orden: { val: orden ?? null, type: this.oracle.NUMBER },
        id: idEvento,
      },
    );
    return { idEvento, destacado, orden: destacado ? (orden ?? null) : null };
  }

  async remove(actor: JwtUser, idEvento: number) {
    const ev = await this.eventoEnAmbito(actor, idEvento);

    const usos: Array<{ sql: string; msg: (n: number) => string }> = [
      {
        sql: `SELECT COUNT(*) AS N FROM EVENTOS_USUARIOS WHERE ID_EVENTO = :id`,
        msg: (n) =>
          `Cannot delete event "${ev.TITULO}": it has ${n} user registration(s). ` +
          `An event with registrations cannot be deleted.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM ENTRADAS_EVENTO WHERE ID_EVENTO = :id`,
        msg: (n) =>
          `Cannot delete event "${ev.TITULO}": it has ${n} issued ticket(s).`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM PAGOS WHERE ID_EVENTO = :id`,
        msg: (n) =>
          `Cannot delete event "${ev.TITULO}": it has ${n} recorded payment(s).`,
      },
    ];
    for (const uso of usos) {
      const r = await this.oracle.query<{ N: number }>(uso.sql, {
        id: idEvento,
      });
      if (r[0].N > 0) throw new ConflictException(uso.msg(r[0].N));
    }

    await this.oracle.withConnection(async (conn) => {
      // los registros de ARCHIVOS tienen FK al evento: se eliminan aquí
      // (el archivo físico queda en el NAS hasta que exista su endpoint de borrado)
      await conn.execute(`DELETE FROM ARCHIVOS WHERE ID_EVENTO = :id`, {
        id: idEvento,
      });
      await conn.execute(
        `DELETE FROM EVENTO_SUBSALONES WHERE ID_EVENTO = :id`,
        { id: idEvento },
      );
      // EVENTO_HORAS y EVENTO_CUPONES tienen FK al evento: se borran antes
      await conn.execute(
        `DELETE FROM EVENTO_HORAS WHERE ID_EVENTO = :id`,
        { id: idEvento },
      );
      await conn.execute(
        `DELETE FROM EVENTO_CUPONES WHERE ID_EVENTO = :id`,
        { id: idEvento },
      );
      await conn.execute(`DELETE FROM EVENTOS WHERE ID_EVENTO = :id`, {
        id: idEvento,
      });
      await conn.commit();
    });
    return { idEvento, eliminado: true };
  }

  /** Sube la imagen del evento al NAS (PORTADA/BANNER/GALERIA) */
  async subirImagen(
    actor: JwtUser,
    idEvento: number,
    archivo: {
      buffer: Buffer;
      filename: string;
      mimetype: string;
    },
    tipoArchivo = 'PORTADA',
  ) {
    await this.eventoEnAmbito(actor, idEvento);
    const tipo = tipoArchivo.toUpperCase();
    if (!TIPOS_IMAGEN_EVENTO.includes(tipo)) {
      throw new BadRequestException(
        `tipoArchivo must be one of: ${TIPOS_IMAGEN_EVENTO.join(', ')}`,
      );
    }
    if (!MIMES_IMAGEN.includes(archivo.mimetype)) {
      throw new BadRequestException(
        `Image type not allowed (${archivo.mimetype}). Use a JPG, PNG or WebP image.`,
      );
    }
    const resultado = await this.archivos.subirYReemplazar({
      tipoEntidad: 'EVENTO',
      id: idEvento,
      tipoArchivo: tipo,
      archivo,
    });
    return { idEvento, tipoArchivo: tipo, ...resultado };
  }

  /** Quita la imagen del evento (deja el ítem sin portada) */
  async eliminarImagen(actor: JwtUser, idEvento: number, tipoArchivo = 'PORTADA') {
    await this.eventoEnAmbito(actor, idEvento);
    const r = await this.archivos.eliminarImagen(
      'EVENTO',
      idEvento,
      tipoArchivo.toUpperCase(),
    );
    return { idEvento, ...r };
  }

  /**
   * Agenda de una fecha para mostrar horarios ocupados en la UI:
   * por salón (eventos de ese salón) o por local (todos los del local).
   */
  async agenda(
    actor: JwtUser,
    filtro: { idSalon?: number; idLocal?: number },
    fecha: string,
  ) {
    if (!filtro.idSalon && !filtro.idLocal) {
      throw new BadRequestException('Provide idSalon or idLocal');
    }
    if (filtro.idSalon) await this.scope.salon(actor, filtro.idSalon);
    else await this.scope.local(actor, filtro.idLocal!);

    const condicion = filtro.idSalon
      ? 'e.ID_SALON = :id'
      : 'e.ID_LOCAL = :id';
    return this.oracle.query(
      `SELECT e.ID_EVENTO, e.TITULO, e.HORA_INICIO, e.HORA_FIN,
              e.TIEMPO_SETUP_MIN, e.TIEMPO_CLEAN_MIN,
              s.NOMBRE AS SALON_NOMBRE,
              (SELECT LISTAGG(sx.NOMBRE, ' + ') WITHIN GROUP (ORDER BY sx.NOMBRE)
                 FROM EVENTO_SUBSALONES es JOIN SUBSALONES sx ON sx.ID_SUBSALON = es.ID_SUBSALON
                WHERE es.ID_EVENTO = e.ID_EVENTO) AS SUBSALONES_NOMBRES
         FROM EVENTOS e
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
        WHERE ${condicion}
          AND TRUNC(e.FECHA_EVENTO) = TO_DATE(:fecha, 'YYYY-MM-DD')
        ORDER BY e.HORA_INICIO`,
      { id: filtro.idSalon ?? filtro.idLocal!, fecha },
    );
  }

  async listarCupones(actor: JwtUser, idEvento: number) {
    await this.eventoEnAmbito(actor, idEvento);
    return this.oracle.query(
      `SELECT ID_CUPON, ID_EVENTO, CODIGO, MONTO_DESCUENTO,
              TIPO_DESCUENTO, MAX_USOS, USOS, ACTIVO,
              TO_CHAR(FECHA_REGISTRO, 'YYYY-MM-DD') AS FECHA_REGISTRO
         FROM EVENTO_CUPONES
        WHERE ID_EVENTO = :id
        ORDER BY ID_CUPON DESC`,
      { id: idEvento },
    );
  }

  async crearCupon(actor: JwtUser, idEvento: number, dto: CrearCuponDto) {
    await this.eventoEnAmbito(actor, idEvento);
    const tipoDescuento = dto.tipoDescuento ?? 'M';
    if (tipoDescuento === 'P' && dto.montoDescuento > 100) {
      throw new BadRequestException(
        'Percentage must be between 0.01 and 100',
      );
    }
    const codigo = dto.codigo.trim().toUpperCase();
    try {
      const r = await this.oracle.execute(
        `INSERT INTO EVENTO_CUPONES
           (ID_EVENTO, CODIGO, MONTO_DESCUENTO, TIPO_DESCUENTO, MAX_USOS)
         VALUES (:id, :codigo, :monto, :tipoDescuento, :maxUsos)
         RETURNING ID_CUPON INTO :out`,
        {
          id: idEvento,
          codigo,
          monto: dto.montoDescuento,
          tipoDescuento,
          maxUsos: { val: dto.maxUsos ?? null, type: this.oracle.NUMBER },
          out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
        },
      );
      return { idCupon: (r.outBinds as { out: number[] }).out[0], codigo };
    } catch (err) {
      if (String(err).includes('ORA-00001')) {
        throw new ConflictException(
          'A coupon with that code already exists for this event',
        );
      }
      throw err;
    }
  }

  async eliminarCupon(actor: JwtUser, idEvento: number, idCupon: number) {
    await this.eventoEnAmbito(actor, idEvento);
    const r = await this.oracle.execute(
      `DELETE FROM EVENTO_CUPONES WHERE ID_CUPON = :c AND ID_EVENTO = :e`,
      { c: idCupon, e: idEvento },
    );
    if (!r.rowsAffected) throw new NotFoundException('Coupon not found');
    return { eliminado: idCupon };
  }

  // ---- Certificados: plantilla-imagen + generación en lote (admin) --------

  /** Sube/actualiza la plantilla-imagen del certificado del evento + overlay. */
  async guardarPlantillaCert(
    actor: JwtUser,
    idEvento: number,
    archivo: { buffer: Buffer; mimetype: string },
    configStr?: string,
  ) {
    await this.eventoEnAmbito(actor, idEvento);
    let config: string | null = null;
    if (configStr) {
      try {
        JSON.parse(configStr);
        config = configStr;
      } catch {
        throw new BadRequestException('config no es JSON válido');
      }
    }
    let ancho: number | null = null;
    let alto: number | null = null;
    try {
      const m = await sharp(archivo.buffer).metadata();
      ancho = m.width ?? null;
      alto = m.height ?? null;
    } catch {
      throw new BadRequestException('La imagen de la plantilla no es válida');
    }
    await this.oracle.execute(
      `MERGE INTO EVENTO_CERT_PLANTILLA t
       USING (SELECT :e AS ID_EVENTO FROM DUAL) s ON (t.ID_EVENTO = s.ID_EVENTO)
       WHEN MATCHED THEN UPDATE
         SET IMAGEN = :img, IMAGEN_MIME = :mime, ANCHO = :w, ALTO = :h,
             CONFIG_JSON = :cfg, FECHA_REGISTRO = SYSDATE
       WHEN NOT MATCHED THEN
         INSERT (ID_EVENTO, IMAGEN, IMAGEN_MIME, ANCHO, ALTO, CONFIG_JSON)
         VALUES (:e, :img, :mime, :w, :h, :cfg)`,
      {
        e: idEvento,
        img: { val: archivo.buffer, type: this.oracle.BLOB },
        mime: archivo.mimetype,
        w: { val: ancho, type: this.oracle.NUMBER },
        h: { val: alto, type: this.oracle.NUMBER },
        cfg: { val: config, type: this.oracle.CLOB },
      },
    );
    return { ok: true, ancho, alto };
  }

  /** Config + dimensiones de la plantilla (sin la imagen). */
  async getPlantillaCert(actor: JwtUser, idEvento: number) {
    await this.eventoEnAmbito(actor, idEvento);
    const rows = await this.oracle.query<{
      ANCHO: number | null;
      ALTO: number | null;
      CONFIG_JSON: string | null;
      IMAGEN_MIME: string | null;
    }>(
      `SELECT ANCHO, ALTO, CONFIG_JSON, IMAGEN_MIME
         FROM EVENTO_CERT_PLANTILLA WHERE ID_EVENTO = :e`,
      { e: idEvento },
    );
    const r = rows[0];
    return {
      tienePlantilla: !!r,
      ancho: r?.ANCHO ?? null,
      alto: r?.ALTO ?? null,
      mime: r?.IMAGEN_MIME ?? null,
      config: r?.CONFIG_JSON ? JSON.parse(r.CONFIG_JSON) : null,
    };
  }

  /** Imagen cruda de la plantilla (para el editor del panel). */
  async plantillaCertImagen(actor: JwtUser, idEvento: number): Promise<{ buffer: Buffer; mime: string }> {
    await this.eventoEnAmbito(actor, idEvento);
    const rows = await this.oracle.query<{ IMAGEN: Buffer; IMAGEN_MIME: string | null }>(
      `SELECT IMAGEN, IMAGEN_MIME FROM EVENTO_CERT_PLANTILLA WHERE ID_EVENTO = :e`,
      { e: idEvento },
    );
    if (!rows[0]) throw new NotFoundException('No template for this event');
    return { buffer: rows[0].IMAGEN, mime: rows[0].IMAGEN_MIME ?? 'image/png' };
  }

  /** Asistentes del evento (para seleccionar y generar certificados). */
  async listarAsistentesCert(actor: JwtUser, idEvento: number) {
    await this.eventoEnAmbito(actor, idEvento);
    const rows = await this.oracle.query<{
      ID_CLIENTE: string;
      ID_EVENTO_USUARIO: number;
      NOMBRE: string | null;
      APELLIDO: string | null;
      EMAIL: string;
      ASISTIO: string | null;
      CERT_CODIGO: string | null;
    }>(
      // COALESCE con LOG_PARTICIPANTES_EVENTO: si la cuenta fue dada de baja
      // (USUARIOS anonimizada), el nombre/correo salen del snapshot de control.
      `SELECT eu.ID_CLIENTE, eu.ID_EVENTO_USUARIO,
              COALESCE(u.NOMBRE, lg.NOMBRE) AS NOMBRE,
              COALESCE(u.APELLIDO, lg.APELLIDO) AS APELLIDO,
              CASE WHEN u.EMAIL LIKE '%@deleted.connecthub.local'
                   THEN COALESCE(lg.EMAIL, u.EMAIL) ELSE u.EMAIL END AS EMAIL,
              eu.ASISTIO, c.CODIGO AS CERT_CODIGO
         FROM EVENTOS_USUARIOS eu
         JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
         LEFT JOIN (SELECT ID_CLIENTE, ID_EVENTO, MAX(NOMBRE) AS NOMBRE,
                           MAX(APELLIDO) AS APELLIDO, MAX(EMAIL) AS EMAIL
                      FROM LOG_PARTICIPANTES_EVENTO GROUP BY ID_CLIENTE, ID_EVENTO) lg
                ON lg.ID_CLIENTE = eu.ID_CLIENTE AND lg.ID_EVENTO = eu.ID_EVENTO
         LEFT JOIN CERTIFICADOS c
                ON c.ID_CLIENTE = eu.ID_CLIENTE AND c.ID_EVENTO = eu.ID_EVENTO
        WHERE eu.ID_EVENTO = :e
        ORDER BY COALESCE(u.NOMBRE, lg.NOMBRE), COALESCE(u.APELLIDO, lg.APELLIDO)`,
      { e: idEvento },
    );
    return rows.map((r) => {
      // Bajas ANTERIORES al log de control: sin snapshot → sin nombre real.
      const eliminado = (r.EMAIL ?? '').endsWith('@deleted.connecthub.local');
      return {
        idCliente: r.ID_CLIENTE,
        idEventoUsuario: r.ID_EVENTO_USUARIO,
        nombre:
          [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ') ||
          (eliminado ? 'Cuenta eliminada' : r.EMAIL),
        email: eliminado ? '' : r.EMAIL,
        asistio: (r.ASISTIO ?? 'N') === 'S',
        certificadoCodigo: r.CERT_CODIGO ?? null,
      };
    });
  }

  /**
   * Gafetes imprimibles: participantes con entrada (en eventos de pago = los que
   * pagaron) con nombre y QR de check-in. Usa el snapshot de control para las
   * cuentas dadas de baja.
   */
  async listarGafetes(actor: JwtUser, idEvento: number) {
    await this.eventoEnAmbito(actor, idEvento);
    const rows = await this.oracle.query<{
      ID_CLIENTE: string;
      NOMBRE: string | null;
      APELLIDO: string | null;
      EMAIL: string | null;
      NUMERO_ID: string | null;
      QR_TOKEN: string;
      TITULO: string;
      ASISTIO: string | null;
    }>(
      `SELECT eu.ID_CLIENTE,
              COALESCE(u.NOMBRE, lg.NOMBRE) AS NOMBRE,
              COALESCE(u.APELLIDO, lg.APELLIDO) AS APELLIDO,
              CASE WHEN u.EMAIL LIKE '%@deleted.connecthub.local'
                   THEN lg.EMAIL ELSE u.EMAIL END AS EMAIL,
              COALESCE(u.NUMERO_ID, lg.NUMERO_ID) AS NUMERO_ID,
              eu.QR_TOKEN, e.TITULO, eu.ASISTIO
         FROM EVENTOS_USUARIOS eu
         JOIN EVENTOS e ON e.ID_EVENTO = eu.ID_EVENTO
         JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
         LEFT JOIN (SELECT ID_CLIENTE, ID_EVENTO, MAX(NOMBRE) AS NOMBRE,
                           MAX(APELLIDO) AS APELLIDO, MAX(EMAIL) AS EMAIL,
                           MAX(NUMERO_ID) AS NUMERO_ID
                      FROM LOG_PARTICIPANTES_EVENTO GROUP BY ID_CLIENTE, ID_EVENTO) lg
                ON lg.ID_CLIENTE = eu.ID_CLIENTE AND lg.ID_EVENTO = eu.ID_EVENTO
        WHERE eu.ID_EVENTO = :e AND eu.QR_TOKEN IS NOT NULL
        ORDER BY COALESCE(u.NOMBRE, lg.NOMBRE), COALESCE(u.APELLIDO, lg.APELLIDO)`,
      { e: idEvento },
    );
    return {
      titulo: rows[0]?.TITULO ?? null,
      asistentes: rows.map((r) => ({
        idCliente: r.ID_CLIENTE,
        nombre: [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ').trim() || 'Participante',
        email: r.EMAIL ?? '',
        numeroId: r.NUMERO_ID ?? '',
        qrToken: r.QR_TOKEN,
        asistio: (r.ASISTIO ?? 'N') === 'S',
      })),
    };
  }

  /**
   * Genera certificados en lote. Si `idsClientes` viene, para esos; si no, para
   * todos los que asistieron. Idempotente (no duplica los que ya tienen).
   */
  async generarCertificadosLote(actor: JwtUser, idEvento: number, idsClientes?: string[]) {
    await this.eventoEnAmbito(actor, idEvento);
    const rows = await this.oracle.query<{
      ID_CLIENTE: string;
      ID_EVENTO_USUARIO: number;
      NOMBRE: string | null;
      APELLIDO: string | null;
      EMAIL: string;
      ASISTIO: string | null;
      TITULO: string;
      INSTITUCION: string | null;
      CERT_TIPO: string | null;
      CERT_CODIGO: string | null;
    }>(
      `SELECT eu.ID_CLIENTE, eu.ID_EVENTO_USUARIO,
              COALESCE(u.NOMBRE, lg.NOMBRE) AS NOMBRE,
              COALESCE(u.APELLIDO, lg.APELLIDO) AS APELLIDO,
              CASE WHEN u.EMAIL LIKE '%@deleted.connecthub.local'
                   THEN COALESCE(lg.EMAIL, u.EMAIL) ELSE u.EMAIL END AS EMAIL,
              eu.ASISTIO,
              e.TITULO, i.NOMBRE AS INSTITUCION, d.CERT_TIPO, c.CODIGO AS CERT_CODIGO
         FROM EVENTOS_USUARIOS eu
         JOIN EVENTOS e ON e.ID_EVENTO = eu.ID_EVENTO
         JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
         LEFT JOIN (SELECT ID_CLIENTE, ID_EVENTO, MAX(NOMBRE) AS NOMBRE,
                           MAX(APELLIDO) AS APELLIDO, MAX(EMAIL) AS EMAIL
                      FROM LOG_PARTICIPANTES_EVENTO GROUP BY ID_CLIENTE, ID_EVENTO) lg
                ON lg.ID_CLIENTE = eu.ID_CLIENTE AND lg.ID_EVENTO = eu.ID_EVENTO
         LEFT JOIN EVENTO_DETALLE d ON d.ID_EVENTO = eu.ID_EVENTO
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
         LEFT JOIN INSTITUCIONES i
                ON i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)
         LEFT JOIN CERTIFICADOS c
                ON c.ID_CLIENTE = eu.ID_CLIENTE AND c.ID_EVENTO = eu.ID_EVENTO
        WHERE eu.ID_EVENTO = :e`,
      { e: idEvento },
    );
    // El panel manda los idCliente en MAYÚSCULAS (política aMayusculas del client),
    // así que se comparan case-insensitive contra el ID_CLIENTE real de la BD.
    const sel =
      idsClientes && idsClientes.length
        ? new Set(idsClientes.map((x) => x.toLowerCase()))
        : null;
    const objetivo = sel
      ? rows.filter((r) => sel.has(r.ID_CLIENTE.toLowerCase()))
      : rows.filter((r) => (r.ASISTIO ?? 'N') === 'S');
    let generados = 0;
    for (const r of objetivo) {
      if (r.CERT_CODIGO) continue; // ya tiene certificado
      const nombre = [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ') || r.EMAIL;
      const codigo = `CERT-${randomBytes(6).toString('hex').toUpperCase()}`;
      // El tipo de certificado se toma de la config del evento (EVENTO_DETALLE.CERT_TIPO);
      // si el evento no lo definió, por defecto es de asistencia.
      const tipo = (r.CERT_TIPO ?? 'ASISTENCIA').toUpperCase();
      try {
        await this.oracle.execute(
          `INSERT INTO CERTIFICADOS
             (ID_CLIENTE, ID_EVENTO, ID_EVENTO_USUARIO, CODIGO, TIPO,
              NOMBRE_ASISTENTE, TITULO_EVENTO, INSTITUCION)
           VALUES (:c, :e, :eu, :codigo, :tipo, :nombre, :titulo, :inst)`,
          {
            c: r.ID_CLIENTE,
            e: idEvento,
            eu: r.ID_EVENTO_USUARIO,
            codigo,
            tipo,
            nombre,
            titulo: r.TITULO,
            inst: r.INSTITUCION ?? null,
          },
        );
        generados++;
      } catch (err) {
        if (!String(err).includes('ORA-00001')) throw err; // ya existía (carrera) → ignora
      }
    }
    return { generados, total: objetivo.length };
  }

  // ---- Días y horas del evento (EVENTO_HORAS) ----------------------------

  /** Días del evento (fecha + rango horario), ordenados por fecha */
  async listarDias(actor: JwtUser, idEvento: number) {
    await this.eventoEnAmbito(actor, idEvento);
    return this.oracle.query(
      `SELECT ID_HORA,
              TO_CHAR(FECHA, 'YYYY-MM-DD') AS FECHA,
              HORA_INICIO, HORA_FIN, ORDEN
         FROM EVENTO_HORAS
        WHERE ID_EVENTO = :id
        ORDER BY FECHA`,
      { id: idEvento },
    );
  }

  // ---- Detalle del evento (EVENTO_DETALLE, 1:1) --------------------------

  /**
   * Los CLOB con CHECK ... IS JSON guardan un array serializado con
   * JSON.stringify; al leer se vuelven a un array con JSON.parse (o [] si el
   * contenido es inválido/NULL). OracleService ya trae los CLOB como string
   * gracias a fetchAsString=[CLOB].
   */
  private parseJsonArray(raw: unknown): string[] {
    if (raw == null) return [];
    try {
      const parsed = JSON.parse(String(raw));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Serializa un array a JSON string para un CLOB IS JSON; null si undefined */
  private serializeJsonArray(arr?: string[]): string | null {
    return arr === undefined ? null : JSON.stringify(arr);
  }

  /**
   * Detalle 1:1 del evento. Devuelve {} si aún no existe la fila.
   * Los campos JSON (QUE_APRENDERAS/TEMAS/REQUISITOS/PUBLICO_OBJETIVO/
   * BIBLIOGRAFIA) vuelven como arrays; CERT_HABILITADO se expone como boolean.
   */
  async getDetalle(actor: JwtUser, idEvento: number) {
    await this.eventoEnAmbito(actor, idEvento);
    const rows = await this.oracle.query<{
      ID_DETALLE: number;
      ID_EVENTO: number;
      DESCRIPCION_CORTA: string | null;
      DESCRIPCION_LARGA: string | null;
      QUE_APRENDERAS: string | null;
      TEMAS: string | null;
      REQUISITOS: string | null;
      PUBLICO_OBJETIVO: string | null;
      BIBLIOGRAFIA: string | null;
      NIVEL: string | null;
      MODALIDAD: string | null;
      RITMO: string | null;
      DURACION_VALOR: number | null;
      DURACION_UNIDAD: string | null;
      ESFUERZO_HS_SEMANA: number | null;
      IDIOMA: string | null;
      IMAGEN_URL: string | null;
      VIDEO_PROMO_URL: string | null;
      CERT_HABILITADO: number | null;
      CERT_TIPO: string | null;
      CERT_ENTREGA: string | null;
      CERT_UMBRAL_ASISTENCIA: number | null;
      FECHA_REGISTRO: string | null;
    }>(
      `SELECT ID_DETALLE, ID_EVENTO, DESCRIPCION_CORTA, DESCRIPCION_LARGA,
              QUE_APRENDERAS, TEMAS, REQUISITOS, PUBLICO_OBJETIVO, BIBLIOGRAFIA,
              NIVEL, MODALIDAD, RITMO, DURACION_VALOR, DURACION_UNIDAD,
              ESFUERZO_HS_SEMANA, IDIOMA, IMAGEN_URL, VIDEO_PROMO_URL,
              CERT_HABILITADO, CERT_TIPO, CERT_ENTREGA, CERT_UMBRAL_ASISTENCIA,
              TO_CHAR(FECHA_REGISTRO, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_REGISTRO
         FROM EVENTO_DETALLE
        WHERE ID_EVENTO = :id`,
      { id: idEvento },
    );
    const d = rows[0];
    if (!d) return {};
    return {
      idDetalle: d.ID_DETALLE,
      idEvento: d.ID_EVENTO,
      descripcionCorta: d.DESCRIPCION_CORTA,
      descripcionLarga: d.DESCRIPCION_LARGA,
      queAprenderas: this.parseJsonArray(d.QUE_APRENDERAS),
      temas: this.parseJsonArray(d.TEMAS),
      requisitos: this.parseJsonArray(d.REQUISITOS),
      publicoObjetivo: this.parseJsonArray(d.PUBLICO_OBJETIVO),
      bibliografia: this.parseJsonArray(d.BIBLIOGRAFIA),
      nivel: d.NIVEL,
      modalidad: d.MODALIDAD,
      ritmo: d.RITMO,
      duracionValor: d.DURACION_VALOR,
      duracionUnidad: d.DURACION_UNIDAD,
      esfuerzoHsSemana: d.ESFUERZO_HS_SEMANA,
      idioma: d.IDIOMA,
      imagenUrl: d.IMAGEN_URL,
      videoPromoUrl: d.VIDEO_PROMO_URL,
      certHabilitado: d.CERT_HABILITADO === 1,
      certTipo: d.CERT_TIPO,
      certEntrega: d.CERT_ENTREGA,
      certUmbralAsistencia: d.CERT_UMBRAL_ASISTENCIA,
      fechaRegistro: d.FECHA_REGISTRO,
    };
  }

  /**
   * Upsert del detalle (1:1 por UNIQUE ID_EVENTO): intenta UPDATE y, si no
   * afectó filas, INSERT. Los arrays se serializan con JSON.stringify (null si
   * el campo no vino), los binds numéricos se tipan y los booleanos van a 0/1.
   * Los CLOB largos (DESCRIPCION_LARGA y los JSON) se bindean como string, que
   * oracledb enlaza a CLOB automáticamente.
   */
  async upsertDetalle(actor: JwtUser, idEvento: number, dto: EventoDetalleDto) {
    await this.eventoEnAmbito(actor, idEvento);
    const binds = {
      idEvento,
      descripcionCorta: dto.descripcionCorta ?? null,
      descripcionLarga: dto.descripcionLarga ?? null,
      queAprenderas: this.serializeJsonArray(dto.queAprenderas),
      temas: this.serializeJsonArray(dto.temas),
      requisitos: this.serializeJsonArray(dto.requisitos),
      publicoObjetivo: this.serializeJsonArray(dto.publicoObjetivo),
      bibliografia: this.serializeJsonArray(dto.bibliografia),
      nivel: dto.nivel ?? null,
      modalidad: dto.modalidad ?? null,
      ritmo: dto.ritmo ?? null,
      duracionValor: { val: dto.duracionValor ?? null, type: this.oracle.NUMBER },
      duracionUnidad: dto.duracionUnidad ?? null,
      esfuerzoHsSemana: {
        val: dto.esfuerzoHsSemana ?? null,
        type: this.oracle.NUMBER,
      },
      idioma: dto.idioma ?? null,
      imagenUrl: dto.imagenUrl ?? null,
      videoPromoUrl: dto.videoPromoUrl ?? null,
      certHabilitado:
        dto.certHabilitado === undefined ? null : dto.certHabilitado ? 1 : 0,
      certTipo: dto.certTipo ?? null,
      certEntrega: dto.certEntrega ?? null,
      certUmbralAsistencia: {
        val: dto.certUmbralAsistencia ?? null,
        type: this.oracle.NUMBER,
      },
    };

    await this.oracle.withConnection(async (conn) => {
      const upd = await conn.execute(
        `UPDATE EVENTO_DETALLE SET
           DESCRIPCION_CORTA = :descripcionCorta,
           DESCRIPCION_LARGA = :descripcionLarga,
           QUE_APRENDERAS = :queAprenderas,
           TEMAS = :temas,
           REQUISITOS = :requisitos,
           PUBLICO_OBJETIVO = :publicoObjetivo,
           BIBLIOGRAFIA = :bibliografia,
           NIVEL = :nivel,
           MODALIDAD = :modalidad,
           RITMO = :ritmo,
           DURACION_VALOR = :duracionValor,
           DURACION_UNIDAD = :duracionUnidad,
           ESFUERZO_HS_SEMANA = :esfuerzoHsSemana,
           IDIOMA = :idioma,
           IMAGEN_URL = :imagenUrl,
           VIDEO_PROMO_URL = :videoPromoUrl,
           CERT_HABILITADO = COALESCE(:certHabilitado, CERT_HABILITADO),
           CERT_TIPO = :certTipo,
           CERT_ENTREGA = :certEntrega,
           CERT_UMBRAL_ASISTENCIA = :certUmbralAsistencia
         WHERE ID_EVENTO = :idEvento`,
        binds,
      );
      if (!upd.rowsAffected) {
        await conn.execute(
          `INSERT INTO EVENTO_DETALLE
             (ID_EVENTO, DESCRIPCION_CORTA, DESCRIPCION_LARGA, QUE_APRENDERAS,
              TEMAS, REQUISITOS, PUBLICO_OBJETIVO, BIBLIOGRAFIA, NIVEL, MODALIDAD,
              RITMO, DURACION_VALOR, DURACION_UNIDAD, ESFUERZO_HS_SEMANA, IDIOMA,
              IMAGEN_URL, VIDEO_PROMO_URL, CERT_HABILITADO, CERT_TIPO,
              CERT_ENTREGA, CERT_UMBRAL_ASISTENCIA)
           VALUES
             (:idEvento, :descripcionCorta, :descripcionLarga, :queAprenderas,
              :temas, :requisitos, :publicoObjetivo, :bibliografia, :nivel,
              :modalidad, :ritmo, :duracionValor, :duracionUnidad,
              :esfuerzoHsSemana, :idioma, :imagenUrl, :videoPromoUrl,
              NVL(:certHabilitado, 0), :certTipo, :certEntrega,
              :certUmbralAsistencia)`,
          binds,
        );
      }
      await conn.commit();
    });
    return this.getDetalle(actor, idEvento);
  }

  // ---- Expositores del evento (EVENTO_EXPOSITORES, 1:N) ------------------

  /**
   * Lista de expositores ordenada por ORDEN y luego por FECHA_REGISTRO.
   * REDES_SOCIALES (CLOB JSON) se devuelve como array; ES_DESTACADO/IS_ACTIVE
   * como boolean.
   */
  async listarExpositores(actor: JwtUser, idEvento: number) {
    await this.eventoEnAmbito(actor, idEvento);
    const rows = await this.oracle.query<{
      ID_EXPOSITOR: number;
      ID_EVENTO: number;
      NOMBRE_COMPLETO: string;
      CARGO: string | null;
      ORGANIZACION: string | null;
      TAGLINE: string | null;
      BIO: string | null;
      BIBLIOGRAFIA: string | null;
      FOTO_URL: string | null;
      EMAIL: string | null;
      UBICACION: string | null;
      SITIO_WEB_URL: string | null;
      REDES_SOCIALES: string | null;
      ROL: string | null;
      ES_DESTACADO: number | null;
      ORDEN: number | null;
      IS_ACTIVE: number | null;
      FECHA_REGISTRO: string | null;
    }>(
      `SELECT ID_EXPOSITOR, ID_EVENTO, NOMBRE_COMPLETO, CARGO, ORGANIZACION,
              TAGLINE, BIO, BIBLIOGRAFIA, FOTO_URL, EMAIL, UBICACION,
              SITIO_WEB_URL, REDES_SOCIALES, ROL, ES_DESTACADO, ORDEN, IS_ACTIVE,
              TO_CHAR(FECHA_REGISTRO, 'YYYY-MM-DD"T"HH24:MI:SS') AS FECHA_REGISTRO
         FROM EVENTO_EXPOSITORES
        WHERE ID_EVENTO = :id
        ORDER BY ORDEN, FECHA_REGISTRO`,
      { id: idEvento },
    );
    return rows.map((e) => ({
      idExpositor: e.ID_EXPOSITOR,
      idEvento: e.ID_EVENTO,
      nombreCompleto: e.NOMBRE_COMPLETO,
      cargo: e.CARGO,
      organizacion: e.ORGANIZACION,
      tagline: e.TAGLINE,
      bio: e.BIO,
      bibliografia: e.BIBLIOGRAFIA,
      fotoUrl: e.FOTO_URL,
      email: e.EMAIL,
      ubicacion: e.UBICACION,
      sitioWebUrl: e.SITIO_WEB_URL,
      redesSociales: this.parseJsonArray(e.REDES_SOCIALES),
      rol: e.ROL,
      esDestacado: e.ES_DESTACADO === 1,
      orden: e.ORDEN,
      isActive: e.IS_ACTIVE === 1,
      fechaRegistro: e.FECHA_REGISTRO,
    }));
  }

  /** Crea un expositor y devuelve su id. esDestacado -> 0/1, orden default 0. */
  async crearExpositor(
    actor: JwtUser,
    idEvento: number,
    dto: CreateExpositorDto,
  ) {
    await this.eventoEnAmbito(actor, idEvento);
    const r = await this.oracle.execute(
      `INSERT INTO EVENTO_EXPOSITORES
         (ID_EVENTO, NOMBRE_COMPLETO, CARGO, ORGANIZACION, TAGLINE, BIO,
          BIBLIOGRAFIA, FOTO_URL, EMAIL, UBICACION, SITIO_WEB_URL, ROL,
          ES_DESTACADO, ORDEN)
       VALUES
         (:idEvento, :nombreCompleto, :cargo, :organizacion, :tagline, :bio,
          :bibliografia, :fotoUrl, :email, :ubicacion, :sitioWebUrl, :rol,
          :esDestacado, :orden)
       RETURNING ID_EXPOSITOR INTO :out`,
      {
        idEvento,
        nombreCompleto: dto.nombreCompleto,
        cargo: dto.cargo ?? null,
        organizacion: dto.organizacion ?? null,
        tagline: dto.tagline ?? null,
        bio: dto.bio ?? null,
        bibliografia: dto.bibliografia ?? null,
        fotoUrl: dto.fotoUrl ?? null,
        email: dto.email ?? null,
        ubicacion: dto.ubicacion ?? null,
        sitioWebUrl: dto.sitioWebUrl ?? null,
        rol: dto.rol ?? null,
        esDestacado: dto.esDestacado ? 1 : 0,
        orden: { val: dto.orden ?? 0, type: this.oracle.NUMBER },
        out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
      },
    );
    return { idExpositor: (r.outBinds as { out: number[] }).out[0] };
  }

  /**
   * Edita un expositor con COALESCE por campo (sólo pisa lo que vino en el
   * body). Los booleanos se envían como 0/1 (null cuando no vinieron para que
   * COALESCE conserve el valor actual). NotFound si no existe en el evento.
   */
  async actualizarExpositor(
    actor: JwtUser,
    idEvento: number,
    idExpositor: number,
    dto: UpdateExpositorDto,
  ) {
    await this.eventoEnAmbito(actor, idEvento);
    const r = await this.oracle.execute(
      `UPDATE EVENTO_EXPOSITORES SET
         NOMBRE_COMPLETO = COALESCE(:nombreCompleto, NOMBRE_COMPLETO),
         CARGO = COALESCE(:cargo, CARGO),
         ORGANIZACION = COALESCE(:organizacion, ORGANIZACION),
         TAGLINE = COALESCE(:tagline, TAGLINE),
         BIO = COALESCE(TO_CLOB(:bio), BIO),
         BIBLIOGRAFIA = COALESCE(TO_CLOB(:bibliografia), BIBLIOGRAFIA),
         FOTO_URL = COALESCE(:fotoUrl, FOTO_URL),
         EMAIL = COALESCE(:email, EMAIL),
         UBICACION = COALESCE(:ubicacion, UBICACION),
         SITIO_WEB_URL = COALESCE(:sitioWebUrl, SITIO_WEB_URL),
         ROL = COALESCE(:rol, ROL),
         ES_DESTACADO = COALESCE(:esDestacado, ES_DESTACADO),
         ORDEN = COALESCE(:orden, ORDEN)
       WHERE ID_EXPOSITOR = :idExpositor AND ID_EVENTO = :idEvento`,
      {
        nombreCompleto: dto.nombreCompleto ?? null,
        cargo: dto.cargo ?? null,
        organizacion: dto.organizacion ?? null,
        tagline: dto.tagline ?? null,
        bio: dto.bio ?? null,
        bibliografia: dto.bibliografia ?? null,
        fotoUrl: dto.fotoUrl ?? null,
        email: dto.email ?? null,
        ubicacion: dto.ubicacion ?? null,
        sitioWebUrl: dto.sitioWebUrl ?? null,
        rol: dto.rol ?? null,
        esDestacado:
          dto.esDestacado === undefined ? null : dto.esDestacado ? 1 : 0,
        orden: { val: dto.orden ?? null, type: this.oracle.NUMBER },
        idExpositor,
        idEvento,
      },
    );
    if (!r.rowsAffected) throw new NotFoundException('Speaker not found');
    return { idExpositor };
  }

  /** Elimina un expositor del evento. NotFound si no existe. */
  async eliminarExpositor(
    actor: JwtUser,
    idEvento: number,
    idExpositor: number,
  ) {
    await this.eventoEnAmbito(actor, idEvento);
    const r = await this.oracle.execute(
      `DELETE FROM EVENTO_EXPOSITORES
        WHERE ID_EXPOSITOR = :idExpositor AND ID_EVENTO = :idEvento`,
      { idExpositor, idEvento },
    );
    if (!r.rowsAffected) throw new NotFoundException('Speaker not found');
    return { eliminado: idExpositor };
  }

  /** Verifica que el expositor exista y pertenezca al evento; NotFound si no. */
  private async expositorEnEvento(idEvento: number, idExpositor: number) {
    const rows = await this.oracle.query<{ ID_EXPOSITOR: number }>(
      `SELECT ID_EXPOSITOR FROM EVENTO_EXPOSITORES
        WHERE ID_EXPOSITOR = :e AND ID_EVENTO = :id`,
      { e: idExpositor, id: idEvento },
    );
    if (!rows[0]) throw new NotFoundException('Speaker not found');
  }

  /** Sube la foto de un expositor al NAS (entidad EXPOSITOR, tipoArchivo FOTO) */
  async subirImagenExpositor(
    actor: JwtUser,
    idEvento: number,
    idExpositor: number,
    archivo: {
      buffer: Buffer;
      filename: string;
      mimetype: string;
    },
    tipoArchivo = 'PORTADA',
  ) {
    await this.eventoEnAmbito(actor, idEvento);
    await this.expositorEnEvento(idEvento, idExpositor);
    const tipo = tipoArchivo.toUpperCase();
    if (!TIPOS_IMAGEN_EXPOSITOR.includes(tipo)) {
      throw new BadRequestException(
        `tipoArchivo must be one of: ${TIPOS_IMAGEN_EXPOSITOR.join(', ')}`,
      );
    }
    if (!MIMES_IMAGEN.includes(archivo.mimetype)) {
      throw new BadRequestException(
        `Image type not allowed (${archivo.mimetype}). Use a JPG, PNG or WebP image.`,
      );
    }
    const resultado = await this.archivos.subirYReemplazar({
      tipoEntidad: 'EXPOSITOR',
      id: idExpositor,
      tipoArchivo: tipo,
      archivo,
    });
    return { idEvento, idExpositor, tipoArchivo: tipo, ...resultado };
  }

  /** Quita la foto del expositor (deja al expositor sin imagen en el NAS) */
  async eliminarImagenExpositor(
    actor: JwtUser,
    idEvento: number,
    idExpositor: number,
    tipoArchivo = 'PORTADA',
  ) {
    await this.eventoEnAmbito(actor, idEvento);
    await this.expositorEnEvento(idEvento, idExpositor);
    const r = await this.archivos.eliminarImagen(
      'EXPOSITOR',
      idExpositor,
      tipoArchivo.toUpperCase(),
    );
    return { idEvento, idExpositor, ...r };
  }

  /* ---------- flujo de aprobación (BORRADOR → SALON_APROBADO → PUBLICADO) ---------- */

  private async estadoActual(actor: JwtUser, idEvento: number) {
    // eventoEnAmbito valida institución (y pertenencia si fuera rol raso; los
    // aprobadores no son rol raso, así que ven todos los de su institución).
    const ev = await this.eventoEnAmbito(actor, idEvento);
    return ev;
  }

  /** Paso 1: aprueba el salón/espacio solicitado. Revalida disponibilidad. */
  async aprobarSalon(actor: JwtUser, idEvento: number) {
    const ev = await this.estadoActual(actor, idEvento);
    if (ev.ESTADO_APROBACION !== 'BORRADOR') {
      throw new BadRequestException('The event is not pending venue approval');
    }
    // La agenda pudo cambiar desde que se creó el borrador → revalidar choques
    // con las horas REALES de cada día (EVENTO_HORAS), excluyéndose a sí mismo.
    const horas = await this.oracle.query<{
      FECHA: string;
      HORA_INICIO: string;
      HORA_FIN: string;
    }>(
      `SELECT TO_CHAR(FECHA,'YYYY-MM-DD') AS FECHA, HORA_INICIO, HORA_FIN
         FROM EVENTO_HORAS WHERE ID_EVENTO = :id ORDER BY FECHA`,
      { id: idEvento },
    );
    if (ev.ID_LOCAL && horas.length) {
      await this.validarDisponibilidad({
        idLocal: ev.ID_LOCAL,
        idSalon: ev.ID_SALON ?? null,
        subsalones: await this.subsalonesDeEvento(idEvento),
        dias: horas.map((h) => ({
          fecha: h.FECHA,
          horaInicio: h.HORA_INICIO,
          horaFin: h.HORA_FIN,
        })),
        setupMin: ev.TIEMPO_SETUP_MIN ?? 0,
        cleanMin: ev.TIEMPO_CLEAN_MIN ?? 0,
        excluirEvento: idEvento,
      });
    }
    await this.oracle.execute(
      `UPDATE EVENTOS SET
         ESTADO_APROBACION = 'SALON_APROBADO',
         SALON_APROBADO_POR = :usr, FECHA_SALON_APROBADO = SYSDATE,
         RECHAZADO_POR = NULL, FECHA_RECHAZO = NULL, MOTIVO_RECHAZO = NULL
       WHERE ID_EVENTO = :id AND ESTADO_APROBACION = 'BORRADOR'`,
      { usr: actor.sub, id: idEvento },
    );
    await this.registrarHistorial(idEvento, 'APROBADO', actor.sub, {
      nota: 'Venue approved',
    });
    return { ok: true, idEvento, estadoAprobacion: 'SALON_APROBADO' };
  }

  /** Paso 2: OK final → publica (NO_PUBLICAR='N') y notifica a los asistentes. */
  async aprobarPublicacion(actor: JwtUser, idEvento: number) {
    const ev = await this.estadoActual(actor, idEvento);
    // SALON_APROBADO (aceptado tal cual) o REUBICADO (movido por Gestión
    // Operativa) — ambos tienen el espacio resuelto y pueden publicarse.
    if (ev.ESTADO_APROBACION !== 'SALON_APROBADO' && ev.ESTADO_APROBACION !== 'REUBICADO') {
      throw new BadRequestException('The event venue must be approved first');
    }
    const r = await this.oracle.execute(
      `UPDATE EVENTOS SET
         ESTADO_APROBACION = 'PUBLICADO',
         PUBLICADO_POR = :usr, FECHA_PUBLICADO = SYSDATE,
         NO_PUBLICAR = 'N',
         RECHAZADO_POR = NULL, FECHA_RECHAZO = NULL, MOTIVO_RECHAZO = NULL
       WHERE ID_EVENTO = :id AND ESTADO_APROBACION IN ('SALON_APROBADO','REUBICADO')`,
      { usr: actor.sub, id: idEvento },
    );
    if (r.rowsAffected) {
      // este es el momento real de publicación → mismo push que create() directo
      void this.push.notificarNuevoEvento(idEvento);
      await this.registrarHistorial(idEvento, 'PUBLICADO', actor.sub, {});
    }
    return { ok: true, idEvento, estadoAprobacion: 'PUBLICADO' };
  }

  /**
   * SUSPENDE un evento publicado: lo retira de la app móvil SIN eliminarlo
   * (conserva inscritos, pagos, entradas y su historial). Reversible con
   * republicar(). Solo ADMINISTRATION/SYSTEM (mismos que publican).
   */
  async suspender(actor: JwtUser, idEvento: number, motivo?: string) {
    const ev = await this.estadoActual(actor, idEvento);
    // legado (NULL) = publicado por el flujo antiguo; también se puede suspender
    if (ev.ESTADO_APROBACION != null && ev.ESTADO_APROBACION !== 'PUBLICADO') {
      throw new BadRequestException('Only a published event can be suspended');
    }
    await this.oracle.execute(
      `UPDATE EVENTOS SET
         ESTADO_APROBACION = 'SUSPENDIDO',
         NO_PUBLICAR = 'S',
         MOTIVO_RECHAZO = :motivo
       WHERE ID_EVENTO = :id`,
      { motivo: motivo?.slice(0, 2000) ?? null, id: idEvento },
    );
    await this.registrarHistorial(idEvento, 'SUSPENDIDO', actor.sub, {
      motivo: motivo ?? null,
    });
    return { ok: true, idEvento, estadoAprobacion: 'SUSPENDIDO' };
  }

  /** Vuelve a publicar un evento suspendido (sin repetir el flujo de aprobación). */
  async republicar(actor: JwtUser, idEvento: number) {
    const ev = await this.estadoActual(actor, idEvento);
    if (ev.ESTADO_APROBACION !== 'SUSPENDIDO') {
      throw new BadRequestException('The event is not suspended');
    }
    await this.oracle.execute(
      `UPDATE EVENTOS SET
         ESTADO_APROBACION = 'PUBLICADO',
         NO_PUBLICAR = 'N',
         PUBLICADO_POR = :usr, FECHA_PUBLICADO = SYSDATE,
         MOTIVO_RECHAZO = NULL
       WHERE ID_EVENTO = :id AND ESTADO_APROBACION = 'SUSPENDIDO'`,
      { usr: actor.sub, id: idEvento },
    );
    await this.registrarHistorial(idEvento, 'REPUBLICADO', actor.sub, {});
    return { ok: true, idEvento, estadoAprobacion: 'PUBLICADO' };
  }

  /** Rechaza (en cualquier paso pendiente) con motivo; vuelve al creador. */
  async rechazar(actor: JwtUser, idEvento: number, motivo: string) {
    const ev = await this.estadoActual(actor, idEvento);
    const pendientes = ['BORRADOR', 'SALON_APROBADO', 'REUBICADO'];
    if (!pendientes.includes(ev.ESTADO_APROBACION ?? '')) {
      throw new BadRequestException('The event is not pending approval');
    }
    await this.oracle.execute(
      `UPDATE EVENTOS SET
         ESTADO_APROBACION = 'RECHAZADO',
         RECHAZADO_POR = :usr, FECHA_RECHAZO = SYSDATE,
         MOTIVO_RECHAZO = :motivo, NO_PUBLICAR = 'S'
       WHERE ID_EVENTO = :id`,
      { usr: actor.sub, motivo: motivo.slice(0, 2000), id: idEvento },
    );
    await this.registrarHistorial(idEvento, 'RECHAZADO', actor.sub, { motivo });
    return { ok: true, idEvento, estadoAprobacion: 'RECHAZADO' };
  }

  /** Subsalones ya reservados por un evento (para revalidar disponibilidad). */
  private async subsalonesDeEvento(idEvento: number): Promise<number[]> {
    const rows = await this.oracle.query<{ ID_SUBSALON: number }>(
      `SELECT ID_SUBSALON FROM EVENTO_SUBSALONES WHERE ID_EVENTO = :id`,
      { id: idEvento },
    );
    return rows.map((r) => r.ID_SUBSALON);
  }

  /* ---------- auditoría de espacio (EVENTO_ESPACIO_HISTORIAL) ---------- */

  /** Foto legible del espacio + días (resuelve NOMBRES al momento de escribir). */
  private async espacioSnapshot(opts: {
    idLocal: number | null;
    idSalon: number | null;
    idSubsalon?: number | null;
    idConfiguracion?: number | null;
    dias: { fecha: string; horaInicio: string; horaFin: string }[];
  }) {
    const nombres = await this.oracle.query<{
      LOCAL_NOMBRE: string | null;
      SALON_NOMBRE: string | null;
      SUBSALON_NOMBRE: string | null;
      CONFIG_NOMBRE: string | null;
    }>(
      `SELECT (SELECT NOMBRE FROM LOCALES WHERE ID_LOCAL = :l) AS LOCAL_NOMBRE,
              (SELECT NOMBRE FROM SALONES WHERE ID_SALON = :s) AS SALON_NOMBRE,
              (SELECT NOMBRE FROM SUBSALONES WHERE ID_SUBSALON = :ss) AS SUBSALON_NOMBRE,
              (SELECT NOMBRE FROM SUBSALON_CONFIGURACIONES WHERE ID_CONFIGURACION = :c) AS CONFIG_NOMBRE
         FROM DUAL`,
      {
        l: opts.idLocal ?? null,
        s: opts.idSalon ?? null,
        ss: opts.idSubsalon ?? null,
        c: opts.idConfiguracion ?? null,
      },
    );
    const n = nombres[0];
    return {
      idLocal: opts.idLocal ?? null,
      local: n?.LOCAL_NOMBRE ?? null,
      idSalon: opts.idSalon ?? null,
      salon: n?.SALON_NOMBRE ?? null,
      idSubsalon: opts.idSubsalon ?? null,
      subsalon: n?.SUBSALON_NOMBRE ?? null,
      idConfiguracion: opts.idConfiguracion ?? null,
      configuracion: n?.CONFIG_NOMBRE ?? null,
      dias: opts.dias,
    };
  }

  private async registrarHistorial(
    idEvento: number,
    tipo:
      | 'SOLICITADO'
      | 'MOVIDO'
      | 'APROBADO'
      | 'PUBLICADO'
      | 'RECHAZADO'
      | 'SUSPENDIDO'
      | 'REPUBLICADO',
    usuario: string,
    detalle: unknown,
  ) {
    try {
      await this.oracle.execute(
        `INSERT INTO EVENTO_ESPACIO_HISTORIAL (ID_EVENTO, TIPO, USUARIO, DETALLE)
         VALUES (:id, :tipo, :usuario, :detalle)`,
        {
          id: idEvento,
          tipo,
          usuario: usuario.slice(0, 150),
          detalle: JSON.stringify(detalle ?? {}),
        },
      );
    } catch {
      /* la auditoría nunca debe tumbar la operación principal */
    }
  }

  /** Trazabilidad del espacio: qué se solicitó, cuándo se movió/aprobó/publicó. */
  async historialEspacio(actor: JwtUser, idEvento: number) {
    await this.eventoEnAmbito(actor, idEvento);
    const rows = await this.oracle.query<{
      ID_HISTORIAL: number;
      TIPO: string;
      USUARIO: string | null;
      FECHA: string;
      DETALLE: string | null;
    }>(
      `SELECT ID_HISTORIAL, TIPO, USUARIO,
              TO_CHAR(FECHA, 'YYYY-MM-DD HH24:MI') AS FECHA, DETALLE
         FROM EVENTO_ESPACIO_HISTORIAL
        WHERE ID_EVENTO = :id
        ORDER BY ID_HISTORIAL`,
      { id: idEvento },
    );
    return rows.map((r) => {
      let detalle: unknown = null;
      try {
        detalle = r.DETALLE ? JSON.parse(r.DETALLE) : null;
      } catch {
        detalle = null;
      }
      return {
        id: r.ID_HISTORIAL,
        tipo: r.TIPO,
        usuario: r.USUARIO,
        fecha: r.FECHA,
        detalle,
      };
    });
  }
}
