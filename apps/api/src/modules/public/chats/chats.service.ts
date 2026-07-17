import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OracleService } from '../../../database/oracle.service';
import { PerfilService } from '../perfil/perfil.service';

/**
 * Chats privados 1-a-1 entre asistentes. Puedes iniciar chat con un perfil
 * PÚBLICO libremente; con un perfil PRIVADO solo si hay conexión aceptada.
 * La pareja se normaliza (A < B) para deduplicar la conversación.
 */
@Injectable()
export class ChatsService {
  constructor(
    private readonly oracle: OracleService,
    private readonly perfil: PerfilService,
  ) {}

  private persona(r: Record<string, unknown>) {
    return {
      idCliente: r.OTRO_ID as string,
      nombre:
        [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ').trim() ||
        String(r.EMAIL ?? '').split('@')[0],
      fotoUrl: (r.FOTO_URL as string) ?? null,
      profesion: (r.PROFESION as string) ?? null,
    };
  }

  /** Abre (o reutiliza) el chat con otro asistente. */
  async abrir(me: string, target: string) {
    if (me === target) throw new BadRequestException('Cannot chat with yourself');
    const perfil = await this.perfil.perfilPublico(me, target);
    if (!perfil.puedeChatear) {
      throw new ForbiddenException({
        code: 'CONEXION_REQUERIDA',
        message: 'This profile is private. Send a connection request first.',
      });
    }
    const [a, b] = me < target ? [me, target] : [target, me];
    let idChat = await this.buscarChat(a, b);
    if (idChat == null) {
      try {
        const ins = await this.oracle.execute<{ out: number[] }>(
          `INSERT INTO CHAT_PRIVADO (ID_CLIENTE_A, ID_CLIENTE_B) VALUES (:a, :b)
           RETURNING ID_CHAT INTO :out`,
          { a, b, out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER } },
        );
        idChat = Number(ins.outBinds?.out?.[0]);
      } catch (e) {
        if (String(e).includes('ORA-00001')) idChat = await this.buscarChat(a, b);
        else throw e;
      }
    }
    return { idChat: idChat!, otro: { idCliente: target, nombre: perfil.nombre, fotoUrl: perfil.fotoUrl, profesion: perfil.profesion } };
  }

  private async buscarChat(a: string, b: string): Promise<number | null> {
    const rows = await this.oracle.query<{ ID_CHAT: number }>(
      `SELECT ID_CHAT FROM CHAT_PRIVADO WHERE ID_CLIENTE_A = :a AND ID_CLIENTE_B = :b`,
      { a, b },
    );
    return rows[0] ? Number(rows[0].ID_CHAT) : null;
  }

  private async chatDeMiembro(me: string, idChat: number) {
    const rows = await this.oracle.query<{ ID_CHAT: number; OTRO_ID: string }>(
      `SELECT ID_CHAT,
              CASE WHEN ID_CLIENTE_A = :me THEN ID_CLIENTE_B ELSE ID_CLIENTE_A END AS OTRO_ID
         FROM CHAT_PRIVADO
        WHERE ID_CHAT = :id AND (ID_CLIENTE_A = :me OR ID_CLIENTE_B = :me)`,
      { me, id: idChat },
    );
    if (!rows[0]) throw new NotFoundException('Chat not found');
    return rows[0];
  }

  /** Lista de mis chats privados (para el hub). */
  async misChats(me: string) {
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT ch.ID_CHAT,
              CASE WHEN ch.ID_CLIENTE_A = :me THEN ch.ID_CLIENTE_B ELSE ch.ID_CLIENTE_A END AS OTRO_ID,
              u.NOMBRE, u.APELLIDO, u.FOTO_URL, u.EMAIL, p.PROFESION,
              (SELECT MAX(TO_CHAR(mp.FECHA_REGISTRO,'YYYY-MM-DD"T"HH24:MI')) FROM MENSAJE_PRIVADO mp WHERE mp.ID_CHAT = ch.ID_CHAT) AS ULTIMA_FECHA,
              (SELECT MENSAJE FROM (SELECT mp.MENSAJE FROM MENSAJE_PRIVADO mp WHERE mp.ID_CHAT = ch.ID_CHAT ORDER BY mp.FECHA_REGISTRO DESC) WHERE ROWNUM = 1) AS ULTIMO_MSG,
              (SELECT COUNT(*) FROM MENSAJE_PRIVADO mp WHERE mp.ID_CHAT = ch.ID_CHAT AND mp.LEIDO = 'N' AND mp.ID_REMITENTE <> :me) AS NO_LEIDOS
         FROM CHAT_PRIVADO ch
         JOIN USUARIOS u ON u.ID_CLIENTE = CASE WHEN ch.ID_CLIENTE_A = :me THEN ch.ID_CLIENTE_B ELSE ch.ID_CLIENTE_A END
         LEFT JOIN PERFIL_ASISTENTE p ON p.ID_CLIENTE = u.ID_CLIENTE
        WHERE ch.ID_CLIENTE_A = :me OR ch.ID_CLIENTE_B = :me
        ORDER BY ULTIMA_FECHA DESC NULLS LAST`,
      { me },
    );
    return rows.map((r) => ({
      idChat: Number(r.ID_CHAT),
      ...this.persona(r),
      ultimoMensaje: (r.ULTIMO_MSG as string) ?? null,
      ultimaFecha: (r.ULTIMA_FECHA as string) ?? null,
      noLeidos: Number(r.NO_LEIDOS ?? 0),
    }));
  }

  /** Mensajes de un chat (marca como leídos los recibidos). */
  async mensajes(me: string, idChat: number, page = 1, size = 30) {
    const chat = await this.chatDeMiembro(me, idChat);
    await this.oracle.execute(
      `UPDATE MENSAJE_PRIVADO SET LEIDO='S' WHERE ID_CHAT=:id AND ID_REMITENTE<>:me AND LEIDO='N'`,
      { id: idChat, me },
    );
    const otroRows = await this.oracle.query<Record<string, unknown>>(
      `SELECT u.ID_CLIENTE AS OTRO_ID, u.NOMBRE, u.APELLIDO, u.FOTO_URL, u.EMAIL, p.PROFESION
         FROM USUARIOS u LEFT JOIN PERFIL_ASISTENTE p ON p.ID_CLIENTE = u.ID_CLIENTE
        WHERE u.ID_CLIENTE = :id`,
      { id: chat.OTRO_ID },
    );
    const p = Math.max(1, Number(page) || 1);
    const s = Math.min(50, Math.max(1, Number(size) || 30));
    const rows = await this.oracle.query<Record<string, unknown>>(
      `SELECT ID_MENSAJE, ID_REMITENTE, MENSAJE,
              TO_CHAR(FECHA_REGISTRO,'YYYY-MM-DD"T"HH24:MI') AS FECHA
         FROM MENSAJE_PRIVADO
        WHERE ID_CHAT = :id
        ORDER BY FECHA_REGISTRO DESC, ID_MENSAJE DESC
        OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`,
      { id: idChat, off: (p - 1) * s, lim: s },
    );
    return {
      idChat,
      otro: this.persona(otroRows[0] ?? {}),
      items: rows.map((r) => ({
        id: Number(r.ID_MENSAJE),
        idRemitente: r.ID_REMITENTE as string,
        mensaje: r.MENSAJE as string,
        fecha: r.FECHA as string,
        esMio: r.ID_REMITENTE === me,
      })),
    };
  }

  /** Envía un mensaje privado. */
  async enviar(me: string, idChat: number, mensaje: string) {
    const chat = await this.chatDeMiembro(me, idChat);
    // Re-evaluar el gate: si el otro se volvió privado y no hay conexión, bloquear
    // (el permiso pudo cambiar desde que se abrió el chat).
    const perfil = await this.perfil.perfilPublico(me, chat.OTRO_ID);
    if (!perfil.puedeChatear) {
      throw new ForbiddenException({
        code: 'CONEXION_REQUERIDA',
        message: 'This profile is private. Send a connection request first.',
      });
    }
    const res = await this.oracle.execute<{ out: number[] }>(
      `INSERT INTO MENSAJE_PRIVADO (ID_CHAT, ID_REMITENTE, MENSAJE)
       VALUES (:id, :me, :m) RETURNING ID_MENSAJE INTO :out`,
      { id: idChat, me, m: mensaje.trim(), out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER } },
    );
    const idMensaje = Number(res.outBinds?.out?.[0]);
    return {
      id: idMensaje,
      idRemitente: me,
      mensaje: mensaje.trim(),
      esMio: true,
    };
  }
}
