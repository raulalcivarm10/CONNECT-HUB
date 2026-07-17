import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OracleService } from '../../../database/oracle.service';
import { PerfilService } from '../perfil/perfil.service';

/**
 * Solicitudes de conexión entre asistentes (networking). Una conexión aceptada
 * habilita ver un perfil privado y chatear en privado con él. Un perfil público
 * no requiere conexión para verse ni para iniciar chat.
 */
@Injectable()
export class ConexionesService {
  constructor(
    private readonly oracle: OracleService,
    private readonly perfil: PerfilService,
  ) {}

  private persona(r: Record<string, unknown>) {
    return {
      idCliente: r.ID_CLIENTE as string,
      nombre:
        [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ').trim() ||
        String(r.EMAIL ?? '').split('@')[0],
      fotoUrl: (r.FOTO_URL as string) ?? null,
      profesion: (r.PROFESION as string) ?? null,
    };
  }

  /** Envía una solicitud (o acepta la recíproca si ya existía). */
  async solicitar(me: string, target: string) {
    if (me === target) throw new BadRequestException('Cannot connect with yourself');
    const existe = await this.oracle.query<{ N: number }>(
      `SELECT COUNT(*) N FROM USUARIOS WHERE ID_CLIENTE = :t`,
      { t: target },
    );
    if (!existe[0]?.N) throw new NotFoundException('User not found');

    const rel = await this.perfil.relacion(me, target);
    if (rel === 'conectado') return { relacion: 'conectado' as const };
    if (rel === 'pendiente_enviada') return { relacion: 'pendiente_enviada' as const };
    if (rel === 'pendiente_recibida') {
      await this.oracle.execute(
        `UPDATE CONEXIONES SET ESTADO='ACEPTADA', FECHA_RESPUESTA=SYSTIMESTAMP
          WHERE ID_SOLICITANTE=:t AND ID_DESTINATARIO=:me AND ESTADO='PENDIENTE'`,
        { t: target, me },
      );
      return { relacion: 'conectado' as const };
    }

    // ninguna (o rechazada previa) → crear/reactivar mi solicitud
    const upd = await this.oracle.execute(
      `UPDATE CONEXIONES SET ESTADO='PENDIENTE', FECHA_SOLICITUD=SYSTIMESTAMP, FECHA_RESPUESTA=NULL
        WHERE ID_SOLICITANTE=:me AND ID_DESTINATARIO=:t`,
      { me, t: target },
    );
    if ((upd.rowsAffected ?? 0) === 0) {
      try {
        await this.oracle.execute(
          `INSERT INTO CONEXIONES (ID_SOLICITANTE, ID_DESTINATARIO, ESTADO)
           VALUES (:me, :t, 'PENDIENTE')`,
          { me, t: target },
        );
      } catch (e) {
        if (String(e).includes('ORA-00001')) {
          await this.oracle.execute(
            `UPDATE CONEXIONES SET ESTADO='PENDIENTE', FECHA_SOLICITUD=SYSTIMESTAMP, FECHA_RESPUESTA=NULL
              WHERE ID_SOLICITANTE=:me AND ID_DESTINATARIO=:t`,
            { me, t: target },
          );
        } else throw e;
      }
    }
    return { relacion: 'pendiente_enviada' as const };
  }

  /** Acepta o rechaza una solicitud que YO recibí. */
  async responder(me: string, idConexion: number, aceptar: boolean) {
    const rows = await this.oracle.query<{ ID_DESTINATARIO: string; ESTADO: string; ID_SOLICITANTE: string }>(
      `SELECT ID_SOLICITANTE, ID_DESTINATARIO, ESTADO FROM CONEXIONES WHERE ID_CONEXION = :id`,
      { id: idConexion },
    );
    const r = rows[0];
    if (!r) throw new NotFoundException('Request not found');
    if (r.ID_DESTINATARIO !== me) throw new ForbiddenException('Not your request');
    if (r.ESTADO !== 'PENDIENTE') return { estado: r.ESTADO };
    const estado = aceptar ? 'ACEPTADA' : 'RECHAZADA';
    await this.oracle.execute(
      `UPDATE CONEXIONES SET ESTADO=:e, FECHA_RESPUESTA=SYSTIMESTAMP WHERE ID_CONEXION=:id`,
      { e: estado, id: idConexion },
    );
    return { estado, idCliente: r.ID_SOLICITANTE };
  }

  /** Solicitudes pendientes que recibí. */
  async solicitudesRecibidas(me: string) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT c.ID_CONEXION, c.ID_SOLICITANTE AS ID_CLIENTE,
              TO_CHAR(c.FECHA_SOLICITUD,'YYYY-MM-DD"T"HH24:MI') AS FECHA,
              u.NOMBRE, u.APELLIDO, u.FOTO_URL, u.EMAIL, p.PROFESION
         FROM CONEXIONES c
         JOIN USUARIOS u ON u.ID_CLIENTE = c.ID_SOLICITANTE
         LEFT JOIN PERFIL_ASISTENTE p ON p.ID_CLIENTE = c.ID_SOLICITANTE
        WHERE c.ID_DESTINATARIO = :me AND c.ESTADO = 'PENDIENTE'
        ORDER BY c.FECHA_SOLICITUD DESC`,
      { me },
    );
    return rows.map((r) => ({
      idConexion: Number(r.ID_CONEXION),
      fecha: r.FECHA as string,
      ...this.persona(r),
    }));
  }

  /** Mis conexiones aceptadas. */
  async misConexiones(me: string) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT u.ID_CLIENTE, u.NOMBRE, u.APELLIDO, u.FOTO_URL, u.EMAIL, p.PROFESION
         FROM CONEXIONES c
         JOIN USUARIOS u ON u.ID_CLIENTE = CASE WHEN c.ID_SOLICITANTE = :me THEN c.ID_DESTINATARIO ELSE c.ID_SOLICITANTE END
         LEFT JOIN PERFIL_ASISTENTE p ON p.ID_CLIENTE = u.ID_CLIENTE
        WHERE (c.ID_SOLICITANTE = :me OR c.ID_DESTINATARIO = :me) AND c.ESTADO = 'ACEPTADA'
        ORDER BY c.FECHA_RESPUESTA DESC NULLS LAST`,
      { me },
    );
    return rows.map((r) => this.persona(r));
  }
}
