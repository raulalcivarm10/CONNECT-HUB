import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OracleService } from '../../../database/oracle.service';

const NAS_URL = process.env.NAS_URL ?? 'https://api-ligaprocorp.ec:3443/api';
function portadaUrl(id: number) {
  return `${NAS_URL}/archivos/activo?tipoEntidad=EVENTO&id=${id}&tipoArchivo=PORTADA`;
}

/**
 * Comunidad/chat POR EVENTO. Cada evento tiene su propio muro de networking; el
 * asistente solo accede a la comunidad de un evento si tiene entrada para él
 * (EVENTOS_USUARIOS). Además puede SALIR de la comunidad de un evento y volver a
 * INGRESAR cuando quiera (COMUNIDAD_MIEMBROS = opt-out por defecto: con entrada
 * estás dentro salvo que hayas salido). No altera tablas de la app externa.
 */
@Injectable()
export class ComunidadService {
  constructor(private readonly oracle: OracleService) {}

  /** Requiere entrada para el evento (única puerta de acceso a su comunidad). */
  private async exigirTicket(idCliente: string, idEvento: number) {
    const rows = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM EVENTOS_USUARIOS
        WHERE ID_CLIENTE = :c AND ID_EVENTO = :e`,
      { c: idCliente, e: idEvento },
    );
    if (!rows[0]?.N) {
      throw new ForbiddenException('You need a ticket for this event to access its community');
    }
  }

  private async saliDeComunidad(idCliente: string, idEvento: number): Promise<boolean> {
    const rows = await this.oracle.query<{ ESTADO: string }>(
      `SELECT ESTADO FROM COMUNIDAD_MIEMBROS WHERE ID_CLIENTE = :c AND ID_EVENTO = :e`,
      { c: idCliente, e: idEvento },
    );
    return rows[0]?.ESTADO === 'SALIO';
  }

  /** Participantes activos = con entrada al evento que no han salido. */
  private async contarParticipantes(idEvento: number): Promise<number> {
    const rows = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(DISTINCT eu.ID_CLIENTE) AS N FROM EVENTOS_USUARIOS eu
        WHERE eu.ID_EVENTO = :e
          AND NOT EXISTS (
            SELECT 1 FROM COMUNIDAD_MIEMBROS cm
             WHERE cm.ID_EVENTO = eu.ID_EVENTO
               AND cm.ID_CLIENTE = eu.ID_CLIENTE
               AND cm.ESTADO = 'SALIO')`,
      { e: idEvento },
    );
    return rows[0]?.N ?? 0;
  }

  /**
   * Hub: las comunidades (eventos) del asistente = eventos con entrada. Cada una
   * con su último mensaje, conteo y si sigue dentro. Ordenadas por actividad.
   */
  async misComunidades(idCliente: string) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT eu.ID_EVENTO, e.TITULO,
              TO_CHAR(e.FECHA_EVENTO,'YYYY-MM-DD') AS FECHA,
              (SELECT COUNT(DISTINCT eu2.ID_CLIENTE) FROM EVENTOS_USUARIOS eu2
                WHERE eu2.ID_EVENTO = eu.ID_EVENTO
                  AND NOT EXISTS (SELECT 1 FROM COMUNIDAD_MIEMBROS cm WHERE cm.ID_EVENTO = eu2.ID_EVENTO AND cm.ID_CLIENTE = eu2.ID_CLIENTE AND cm.ESTADO = 'SALIO')
              ) AS PARTICIPANTES,
              (SELECT CASE WHEN COUNT(*) > 0 THEN 0 ELSE 1 END FROM COMUNIDAD_MIEMBROS cm
                WHERE cm.ID_EVENTO = eu.ID_EVENTO AND cm.ID_CLIENTE = :c AND cm.ESTADO = 'SALIO') AS SOY_MIEMBRO,
              (SELECT COUNT(*) FROM COMUNIDAD_MENSAJES m WHERE m.ID_EVENTO = eu.ID_EVENTO AND m.ESTADO = 'ACTIVO') AS TOTAL,
              (SELECT MAX(TO_CHAR(m.FECHA_REGISTRO,'YYYY-MM-DD"T"HH24:MI')) FROM COMUNIDAD_MENSAJES m WHERE m.ID_EVENTO = eu.ID_EVENTO AND m.ESTADO = 'ACTIVO') AS ULTIMA_FECHA,
              (SELECT MENSAJE FROM (SELECT m.MENSAJE FROM COMUNIDAD_MENSAJES m WHERE m.ID_EVENTO = eu.ID_EVENTO AND m.ESTADO = 'ACTIVO' ORDER BY m.FECHA_REGISTRO DESC) WHERE ROWNUM = 1) AS ULTIMO_MSG
         FROM EVENTOS_USUARIOS eu
         JOIN EVENTOS e ON e.ID_EVENTO = eu.ID_EVENTO
        WHERE eu.ID_CLIENTE = :c AND NVL(e.NO_PUBLICAR,'N') = 'N'
        ORDER BY ULTIMA_FECHA DESC NULLS LAST, e.FECHA_EVENTO DESC`,
      { c: idCliente },
    );
    return rows.map((r) => ({
      idEvento: Number(r.ID_EVENTO),
      titulo: r.TITULO as string,
      fechaInicio: r.FECHA as string,
      portadaUrl: portadaUrl(Number(r.ID_EVENTO)),
      participantes: Number(r.PARTICIPANTES ?? 0),
      soyMiembro: Number(r.SOY_MIEMBRO ?? 1) === 1,
      total: Number(r.TOTAL ?? 0),
      ultimoMensaje: (r.ULTIMO_MSG as string) ?? null,
      ultimaFecha: (r.ULTIMA_FECHA as string) ?? null,
    }));
  }

  private async eventoInfo(idEvento: number) {
    const rows = await this.oracle.query<{ TITULO: string }>(
      `SELECT TITULO FROM EVENTOS WHERE ID_EVENTO = :e`,
      { e: idEvento },
    );
    if (!rows[0]) throw new NotFoundException('Event not found');
    return rows[0];
  }

  /** Muro de un evento (más recientes primero), paginado. */
  async listar(idCliente: string, idEvento: number, page = 1, size = 30) {
    await this.exigirTicket(idCliente, idEvento);
    const ev = await this.eventoInfo(idEvento);
    const participantes = await this.contarParticipantes(idEvento);
    const base = {
      idEvento,
      titulo: ev.TITULO,
      portadaUrl: portadaUrl(idEvento),
      participantes,
    };

    if (await this.saliDeComunidad(idCliente, idEvento)) {
      return { ...base, page: 1, size, total: 0, soyMiembro: false, items: [] };
    }

    const p = Math.max(1, Number(page) || 1);
    const s = Math.min(50, Math.max(1, Number(size) || 30));
    const offset = (p - 1) * s;

    const totalRows = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) AS N FROM COMUNIDAD_MENSAJES WHERE ID_EVENTO = :e AND ESTADO = 'ACTIVO'`,
      { e: idEvento },
    );

    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT m.ID_MENSAJE, m.MENSAJE, m.ID_CLIENTE,
              TO_CHAR(m.FECHA_REGISTRO,'YYYY-MM-DD"T"HH24:MI') AS FECHA,
              u.NOMBRE, u.APELLIDO, u.FOTO_URL, u.EMAIL
         FROM COMUNIDAD_MENSAJES m
         JOIN USUARIOS u ON u.ID_CLIENTE = m.ID_CLIENTE
        WHERE m.ID_EVENTO = :e AND m.ESTADO = 'ACTIVO'
        ORDER BY m.FECHA_REGISTRO DESC, m.ID_MENSAJE DESC
        OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`,
      { e: idEvento, off: offset, lim: s },
    );

    return {
      ...base,
      page: p,
      size: s,
      total: totalRows[0]?.N ?? 0,
      soyMiembro: true,
      items: rows.map((r) => this.mapMensaje(r, idCliente)),
    };
  }

  /** Publica un mensaje en la comunidad de un evento. */
  async publicar(idCliente: string, idEvento: number, mensaje: string) {
    await this.exigirTicket(idCliente, idEvento);
    if (await this.saliDeComunidad(idCliente, idEvento)) {
      throw new ForbiddenException('You have left this community. Join again to post.');
    }
    const res = await this.oracle.execute<{ out: number[] }>(
      `INSERT INTO COMUNIDAD_MENSAJES (ID_EVENTO, ID_CLIENTE, MENSAJE)
       VALUES (:e, :c, :m)
       RETURNING ID_MENSAJE INTO :out`,
      {
        e: idEvento,
        c: idCliente,
        m: mensaje.trim(),
        out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
      },
    );
    const idMensaje = res.outBinds?.out?.[0];
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT m.ID_MENSAJE, m.MENSAJE, m.ID_CLIENTE,
              TO_CHAR(m.FECHA_REGISTRO,'YYYY-MM-DD"T"HH24:MI') AS FECHA,
              u.NOMBRE, u.APELLIDO, u.FOTO_URL, u.EMAIL
         FROM COMUNIDAD_MENSAJES m JOIN USUARIOS u ON u.ID_CLIENTE = m.ID_CLIENTE
        WHERE m.ID_MENSAJE = :id`,
      { id: idMensaje },
    );
    return this.mapMensaje(rows[0], idCliente);
  }

  /** Salir de la comunidad de un evento (puede volver a ingresar). */
  async salir(idCliente: string, idEvento: number) {
    await this.exigirTicket(idCliente, idEvento);
    await this.setEstadoMiembro(idEvento, idCliente, 'SALIO');
    return { soyMiembro: false };
  }

  /** Volver a ingresar a la comunidad de un evento. */
  async ingresar(idCliente: string, idEvento: number) {
    await this.exigirTicket(idCliente, idEvento);
    await this.setEstadoMiembro(idEvento, idCliente, 'ACTIVO');
    return { soyMiembro: true };
  }

  /**
   * Upsert robusto del estado de membresía (UPDATE→INSERT→UPDATE) — idempotente
   * y seguro ante concurrencia sin depender de MERGE (evita ORA-00001 al primer
   * salir/ingresar simultáneo).
   */
  private async setEstadoMiembro(idEvento: number, idCliente: string, estado: 'ACTIVO' | 'SALIO') {
    const setSql =
      estado === 'SALIO'
        ? `ESTADO='SALIO', FECHA_SALIDA=SYSTIMESTAMP`
        : `ESTADO='ACTIVO', FECHA_INGRESO=SYSTIMESTAMP, FECHA_SALIDA=NULL`;
    const binds = { ev: idEvento, c: idCliente };
    const upd = await this.oracle.execute(
      `UPDATE COMUNIDAD_MIEMBROS SET ${setSql} WHERE ID_EVENTO=:ev AND ID_CLIENTE=:c`,
      binds,
    );
    if ((upd.rowsAffected ?? 0) > 0) return;
    try {
      await this.oracle.execute(
        `INSERT INTO COMUNIDAD_MIEMBROS (ID_EVENTO, ID_CLIENTE, ESTADO, FECHA_INGRESO, FECHA_SALIDA)
         VALUES (:ev, :c, :estado, SYSTIMESTAMP, ${estado === 'SALIO' ? 'SYSTIMESTAMP' : 'NULL'})`,
        { ...binds, estado },
      );
    } catch (e) {
      if (String(e).includes('ORA-00001')) {
        await this.oracle.execute(
          `UPDATE COMUNIDAD_MIEMBROS SET ${setSql} WHERE ID_EVENTO=:ev AND ID_CLIENTE=:c`,
          binds,
        );
      } else {
        throw e;
      }
    }
  }

  private mapMensaje(r: Record<string, unknown>, idCliente: string) {
    const nombre =
      [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ').trim() ||
      String(r.EMAIL ?? '').split('@')[0];
    return {
      id: Number(r.ID_MENSAJE),
      idCliente: r.ID_CLIENTE as string,
      mensaje: r.MENSAJE as string,
      autor: nombre,
      fotoUrl: (r.FOTO_URL as string) ?? null,
      fecha: r.FECHA as string,
      esMio: r.ID_CLIENTE === idCliente,
    };
  }
}
