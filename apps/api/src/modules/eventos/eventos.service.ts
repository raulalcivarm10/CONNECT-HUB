import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import { ScopeService } from '../operativa/scope.service';
import { ArchivosService } from '../archivos/archivos.service';
import { CreateEventoDto, UpdateEventoDto } from './dto/evento.dto';

const TIPOS_IMAGEN_EVENTO = ['PORTADA', 'BANNER', 'GALERIA'];
const MIMES_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];

const toMin = (h: string): number => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
};

const toHora = (min: number): string => {
  const m = Math.max(0, Math.min(min, 24 * 60 - 1));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

interface EventoConflicto {
  ID_EVENTO: number;
  TITULO: string;
  ID_SALON: number | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
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
  ) {}

  list(actor: JwtUser, idInstitucion?: number) {
    const filtro = this.scope.institucionForRead(actor, idInstitucion);
    return this.oracle.query(
      `SELECT e.ID_EVENTO, e.TITULO, e.DESCRIPCION,
              TO_CHAR(e.FECHA_EVENTO, 'YYYY-MM-DD') AS FECHA_EVENTO,
              e.HORA_INICIO, e.HORA_FIN, e.TIEMPO_SETUP_MIN, e.TIEMPO_CLEAN_MIN,
              e.PRECIO, e.PUBLICO_ESPERADO, e.DESTACADO, e.ORDEN_DESTACADO,
              e.COD_ITEM, e.IMAGEN_URL, e.FECHA_REGISTRO,
              e.ID_LOCAL, e.ID_SALON, e.ID_SUBSALON, e.ID_CONFIGURACION,
              l.NOMBRE AS LOCAL_NOMBRE, s.NOMBRE AS SALON_NOMBRE,
              ss.NOMBRE AS SUBSALON_NOMBRE, c.NOMBRE AS CONFIGURACION_NOMBRE,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION,
              i.NOMBRE AS INSTITUCION,
              (SELECT LISTAGG(sx.NOMBRE, ' + ') WITHIN GROUP (ORDER BY sx.NOMBRE)
                 FROM EVENTO_SUBSALONES es JOIN SUBSALONES sx ON sx.ID_SUBSALON = es.ID_SUBSALON
                WHERE es.ID_EVENTO = e.ID_EVENTO) AS SUBSALONES_NOMBRES,
              (SELECT COUNT(*) FROM EVENTOS_USUARIOS eu WHERE eu.ID_EVENTO = e.ID_EVENTO) AS INSCRITOS
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
         LEFT JOIN SUBSALONES ss ON ss.ID_SUBSALON = e.ID_SUBSALON
         LEFT JOIN SUBSALON_CONFIGURACIONES c ON c.ID_CONFIGURACION = e.ID_CONFIGURACION
         LEFT JOIN INSTITUCIONES i ON i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)
        WHERE (:filtro IS NULL OR COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) = :filtro)
        ORDER BY e.FECHA_EVENTO DESC, e.HORA_INICIO`,
      { filtro },
    );
  }

  /** Subsalones que reservará el evento según el espacio elegido */
  private async resolverSubsalones(
    idSalon: number,
    idConfiguracion?: number,
    idSubsalon?: number,
  ): Promise<number[]> {
    if (idConfiguracion && idSubsalon) {
      throw new BadRequestException(
        'Elige configuración O subsalón, no ambos',
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
        throw new NotFoundException('La configuración elegida no existe');
      }
      if (rows[0].ID_SALON !== idSalon) {
        throw new BadRequestException(
          'La configuración elegida no pertenece a ese salón',
        );
      }
      if (rows[0].ACTIVO !== 'Y') {
        throw new BadRequestException('La configuración elegida está inactiva');
      }
      return rows.map((r) => r.ID_SUBSALON).filter((x) => x != null);
    }
    if (idSubsalon) {
      const rows = await this.oracle.query<{ ID_SALON: number }>(
        `SELECT ID_SALON FROM SUBSALONES WHERE ID_SUBSALON = :id`,
        { id: idSubsalon },
      );
      if (!rows.length) throw new NotFoundException('El subsalón no existe');
      if (rows[0].ID_SALON !== idSalon) {
        throw new BadRequestException(
          'El subsalón elegido no pertenece a ese salón',
        );
      }
      return [idSubsalon];
    }
    return []; // salón completo
  }

  /**
   * Disponibilidad: el trigger TRG_VALIDAR_EVENTO de la BD está vacío (cuerpo
   * comentado), así que la validación de choques se hace aquí. Se evalúa a
   * nivel de LOCAL: un evento sin salón reserva el local completo y choca con
   * todo; con salón, choca con eventos del mismo salón (o de local completo),
   * afinado por subsalones compartidos. Ventanas = [inicio-setup, fin+limpieza].
   */
  private async validarDisponibilidad(opts: {
    idLocal: number;
    idSalon: number | null;
    fecha: string;
    horaInicio: string;
    horaFin: string;
    setupMin: number;
    cleanMin: number;
    subsalones: number[];
    excluirEvento?: number;
  }) {
    const ini = toMin(opts.horaInicio);
    const fin = toMin(opts.horaFin);
    if (fin <= ini) {
      throw new BadRequestException(
        'La hora de fin debe ser mayor que la hora de inicio',
      );
    }
    const nuevoIni = ini - opts.setupMin;
    const nuevoFin = fin + opts.cleanMin;

    const existentes = await this.oracle.query<EventoConflicto>(
      `SELECT e.ID_EVENTO, e.TITULO, e.ID_SALON, e.HORA_INICIO, e.HORA_FIN,
              e.TIEMPO_SETUP_MIN, e.TIEMPO_CLEAN_MIN,
              (SELECT LISTAGG(es.ID_SUBSALON, ',') WITHIN GROUP (ORDER BY es.ID_SUBSALON)
                 FROM EVENTO_SUBSALONES es WHERE es.ID_EVENTO = e.ID_EVENTO) AS SUBS
         FROM EVENTOS e
        WHERE e.ID_LOCAL = :idLocal
          AND TRUNC(e.FECHA_EVENTO) = TO_DATE(:fecha, 'YYYY-MM-DD')
          AND e.ID_EVENTO != :excluir`,
      {
        idLocal: opts.idLocal,
        fecha: opts.fecha,
        excluir: opts.excluirEvento ?? -1,
      },
    );

    for (const ev of existentes) {
      if (!ev.HORA_INICIO || !ev.HORA_FIN) continue;
      const evIni = toMin(ev.HORA_INICIO);
      const evFin = toMin(ev.HORA_FIN);
      if (evFin <= evIni) continue; // datos legados sin horario real

      // ¿comparten espacio?
      let compartenEspacio: boolean;
      let notaEspacio = '';
      if (!opts.idSalon || !ev.ID_SALON) {
        // alguno de los dos reserva el local completo → choca con todo el local
        compartenEspacio = true;
        notaEspacio = !ev.ID_SALON
          ? ' (ese evento reserva el local completo)'
          : ' (tu evento reservaría el local completo)';
      } else if (ev.ID_SALON !== opts.idSalon) {
        compartenEspacio = false; // salones distintos del mismo local
      } else {
        // mismo salón: salón completo (sin subsalones) choca con todo
        const evSubs = (ev.SUBS ?? '').split(',').filter(Boolean).map(Number);
        compartenEspacio =
          opts.subsalones.length === 0 ||
          evSubs.length === 0 ||
          opts.subsalones.some((s) => evSubs.includes(s));
      }
      if (!compartenEspacio) continue;

      const ocupadoIni = evIni - (ev.TIEMPO_SETUP_MIN ?? 0);
      const ocupadoFin = evFin + (ev.TIEMPO_CLEAN_MIN ?? 0);
      if (nuevoIni < ocupadoFin && nuevoFin > ocupadoIni) {
        throw new ConflictException(
          `El espacio no está disponible: «${ev.TITULO}» ocupa realmente de ` +
            `${toHora(ocupadoIni)} a ${toHora(ocupadoFin)} (evento ${ev.HORA_INICIO}–${ev.HORA_FIN} ` +
            `+ ${ev.TIEMPO_SETUP_MIN ?? 0} min de preparación y ${ev.TIEMPO_CLEAN_MIN ?? 0} min de limpieza)${notaEspacio}, ` +
            `y tu evento necesitaría el espacio de ${toHora(nuevoIni)} a ${toHora(nuevoFin)} ` +
            `(incluyendo tu preparación y limpieza). Ajusta el horario, la fecha o el espacio.`,
        );
      }
    }
  }

  async create(actor: JwtUser, dto: CreateEventoDto) {
    // ámbito: el local debe ser de la institución del actor; el salón (si hay)
    // debe pertenecer a ese local. Sin salón = se reserva el local completo.
    await this.scope.local(actor, dto.idLocal);
    let subsalones: number[] = [];
    if (dto.idSalon) {
      const salon = await this.scope.salon(actor, dto.idSalon);
      if (salon.ID_LOCAL !== dto.idLocal) {
        throw new BadRequestException('El salón no pertenece a ese local');
      }
      subsalones = await this.resolverSubsalones(
        dto.idSalon,
        dto.idConfiguracion,
        dto.idSubsalon,
      );
    } else if (dto.idConfiguracion || dto.idSubsalon) {
      throw new BadRequestException(
        'Para reservar un modelo o subsalón primero elige un salón',
      );
    }
    await this.validarDisponibilidad({
      idLocal: dto.idLocal,
      idSalon: dto.idSalon ?? null,
      fecha: dto.fechaEvento,
      horaInicio: dto.horaInicio,
      horaFin: dto.horaFin,
      setupMin: dto.tiempoSetupMin ?? 0,
      cleanMin: dto.tiempoCleanMin ?? 0,
      subsalones,
    });

    return this.oracle.withConnection(async (conn) => {
      const result = await conn.execute(
        `INSERT INTO EVENTOS
           (TITULO, DESCRIPCION, FECHA_EVENTO, HORA_INICIO, HORA_FIN,
            ID_LOCAL, ID_SALON, ID_SUBSALON, ID_CONFIGURACION,
            PRECIO, PUBLICO_ESPERADO, TIEMPO_SETUP_MIN, TIEMPO_CLEAN_MIN,
            COD_ITEM, IMAGEN_URL)
         VALUES
           (:titulo, :descripcion, TO_DATE(:fecha, 'YYYY-MM-DD'), :horaInicio, :horaFin,
            :idLocal, :idSalon, :idSubsalon, :idConfiguracion,
            :precio, :publico, :setupMin, :cleanMin, :codItem, :imagenUrl)
         RETURNING ID_EVENTO INTO :out`,
        {
          titulo: dto.titulo,
          descripcion: dto.descripcion ?? null,
          fecha: dto.fechaEvento,
          horaInicio: dto.horaInicio,
          horaFin: dto.horaFin,
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
      await conn.commit();
      return { idEvento, subsalonesReservados: subsalones };
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
      HORA_INICIO: string | null;
      HORA_FIN: string | null;
      TIEMPO_SETUP_MIN: number | null;
      TIEMPO_CLEAN_MIN: number | null;
      TITULO: string;
      ID_INSTITUCION: number | null;
    }>(
      `SELECT e.ID_EVENTO, e.ID_LOCAL, e.ID_SALON, e.ID_SUBSALON, e.ID_CONFIGURACION,
              TO_CHAR(e.FECHA_EVENTO,'YYYY-MM-DD') AS FECHA_EVENTO,
              e.HORA_INICIO, e.HORA_FIN, e.TIEMPO_SETUP_MIN, e.TIEMPO_CLEAN_MIN, e.TITULO,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION
         FROM EVENTOS e
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE e.ID_EVENTO = :id`,
      { id: idEvento },
    );
    const ev = rows[0];
    if (!ev) throw new NotFoundException('Evento no encontrado');
    if (!actor.esSuper && ev.ID_INSTITUCION !== actor.idInstitucion) {
      throw new NotFoundException('Evento no encontrado');
    }
    return ev;
  }

  async update(actor: JwtUser, idEvento: number, dto: UpdateEventoDto) {
    const actual = await this.eventoEnAmbito(actor, idEvento);

    const idLocal = dto.idLocal ?? actual.ID_LOCAL;
    if (!idLocal) {
      throw new BadRequestException('El evento necesita un local');
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
        throw new BadRequestException('El salón no pertenece a ese local');
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
        'Para reservar un modelo o subsalón primero elige un salón',
      );
    }

    const fecha = dto.fechaEvento ?? actual.FECHA_EVENTO;
    const horaInicio = dto.horaInicio ?? actual.HORA_INICIO ?? '00:00';
    const horaFin = dto.horaFin ?? actual.HORA_FIN ?? '00:00';
    await this.validarDisponibilidad({
      idLocal,
      idSalon: idSalon ?? null,
      fecha,
      horaInicio,
      horaFin,
      setupMin: dto.tiempoSetupMin ?? actual.TIEMPO_SETUP_MIN ?? 0,
      cleanMin: dto.tiempoCleanMin ?? actual.TIEMPO_CLEAN_MIN ?? 0,
      subsalones,
      excluirEvento: idEvento,
    });

    await this.oracle.withConnection(async (conn) => {
      await conn.execute(
        `UPDATE EVENTOS SET
           TITULO = NVL(:titulo, TITULO),
           DESCRIPCION = COALESCE(:descripcion, DESCRIPCION),
           FECHA_EVENTO = TO_DATE(:fecha, 'YYYY-MM-DD'),
           HORA_INICIO = :horaInicio,
           HORA_FIN = :horaFin,
           ID_LOCAL = :idLocal,
           ID_SALON = :idSalon,
           COD_ITEM = COALESCE(:codItem, COD_ITEM),
           ID_SUBSALON = :idSubsalon,
           ID_CONFIGURACION = :idConfiguracion,
           PRECIO = COALESCE(:precio, PRECIO),
           PUBLICO_ESPERADO = COALESCE(:publico, PUBLICO_ESPERADO),
           TIEMPO_SETUP_MIN = COALESCE(:setupMin, TIEMPO_SETUP_MIN),
           TIEMPO_CLEAN_MIN = COALESCE(:cleanMin, TIEMPO_CLEAN_MIN),
           IMAGEN_URL = COALESCE(:imagenUrl, IMAGEN_URL)
         WHERE ID_EVENTO = :id`,
        {
          titulo: dto.titulo ?? null,
          descripcion: dto.descripcion ?? null,
          fecha,
          horaInicio,
          horaFin,
          idLocal,
          idSalon: { val: idSalon ?? null, type: this.oracle.NUMBER },
          codItem: dto.codItem ?? null,
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
      await conn.commit();
    });
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
          `No se puede eliminar el evento «${ev.TITULO}»: tiene ${n} inscripción(es) de usuarios. ` +
          `Un evento con inscritos no puede eliminarse.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM ENTRADAS_EVENTO WHERE ID_EVENTO = :id`,
        msg: (n) =>
          `No se puede eliminar el evento «${ev.TITULO}»: tiene ${n} entrada(s) emitida(s).`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM PAGOS WHERE ID_EVENTO = :id`,
        msg: (n) =>
          `No se puede eliminar el evento «${ev.TITULO}»: tiene ${n} pago(s) registrado(s).`,
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
        `tipoArchivo debe ser uno de: ${TIPOS_IMAGEN_EVENTO.join(', ')}`,
      );
    }
    if (!MIMES_IMAGEN.includes(archivo.mimetype)) {
      throw new BadRequestException(
        `Tipo de imagen no permitido (${archivo.mimetype}). Usa JPG, PNG o WebP.`,
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
      throw new BadRequestException('Indica idSalon o idLocal');
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
}
