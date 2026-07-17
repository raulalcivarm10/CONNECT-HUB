import { Injectable, Logger } from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';

/**
 * Notificaciones push (Expo). Registra el token del dispositivo del asistente
 * y, cuando una institución crea un evento, avisa a todos los usuarios
 * vinculados a esa institución (USUARIO_INSTITUCIONES). Envío por Expo Push API.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly oracle: OracleService) {}

  /** Registra/actualiza el Expo push token de un asistente (idempotente). */
  async registrarToken(idCliente: string, expoToken: string, platform?: string) {
    const tok = expoToken.trim();
    // el token pertenece a UN dispositivo → si estaba en otro cliente, re-asigna
    await this.oracle.execute(
      `DELETE FROM USUARIO_PUSH_TOKENS WHERE EXPO_TOKEN = :tok AND ID_CLIENTE <> :c`,
      { tok, c: idCliente },
    );
    const ex = await this.oracle.query<{ ID_TOKEN: number }>(
      `SELECT ID_TOKEN FROM USUARIO_PUSH_TOKENS WHERE EXPO_TOKEN = :tok`,
      { tok },
    );
    if (ex[0]) {
      await this.oracle.execute(
        `UPDATE USUARIO_PUSH_TOKENS
            SET ID_CLIENTE = :c, PLATFORM = :p, ESTADO = 'ACTIVO',
                FECHA_ACTUALIZACION = SYSTIMESTAMP
          WHERE EXPO_TOKEN = :tok`,
        { c: idCliente, p: platform ?? null, tok },
      );
    } else {
      await this.oracle.execute(
        `INSERT INTO USUARIO_PUSH_TOKENS (ID_CLIENTE, EXPO_TOKEN, PLATFORM)
         VALUES (:c, :tok, :p)`,
        { c: idCliente, tok, p: platform ?? null },
      );
    }
    return { ok: true };
  }

  /**
   * Avisa a los usuarios vinculados a la institución del evento. Fire-and-forget:
   * nunca lanza (no debe frenar la creación del evento en el panel).
   */
  async notificarNuevoEvento(idEvento: number): Promise<void> {
    try {
      const info = await this.oracle.query<{
        TITULO: string;
        INSTITUCION: string | null;
        ID_INSTITUCION: number | null;
      }>(
        `SELECT e.TITULO, i.NOMBRE AS INSTITUCION,
                COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION
           FROM EVENTOS e
           LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
           LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
           LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
           LEFT JOIN INSTITUCIONES i
                  ON i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)
          WHERE e.ID_EVENTO = :id AND NVL(e.NO_PUBLICAR,'N') = 'N'`,
        { id: idEvento },
      );
      const ev = info[0];
      if (!ev?.ID_INSTITUCION) return;

      const tokens = await this.oracle.query<{ EXPO_TOKEN: string }>(
        `SELECT DISTINCT pt.EXPO_TOKEN
           FROM USUARIO_PUSH_TOKENS pt
           JOIN USUARIO_INSTITUCIONES ui ON ui.ID_CLIENTE = pt.ID_CLIENTE
          WHERE ui.ID_INSTITUCION = :inst AND pt.ESTADO = 'ACTIVO'`,
        { inst: ev.ID_INSTITUCION },
      );
      if (!tokens.length) return;

      await this.enviarPush(
        tokens.map((t) => t.EXPO_TOKEN),
        ev.INSTITUCION ?? 'ConnectHub',
        `Nuevo evento: ${ev.TITULO}`,
        { idEvento, tipo: 'nuevo_evento' },
      );
    } catch (err) {
      this.logger.error(`notificarNuevoEvento(${idEvento}) falló: ${String(err)}`);
    }
  }

  /** Envía a Expo Push API en lotes de 100. Fail-soft. */
  async enviarPush(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const validos = tokens.filter((t) => t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken'));
    if (!validos.length) return;
    for (let i = 0; i < validos.length; i += 100) {
      const batch = validos.slice(i, i + 100).map((to) => ({
        to,
        title,
        body,
        data: data ?? {},
        sound: 'default',
      }));
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
        });
        if (!res.ok) this.logger.warn(`Expo push HTTP ${res.status}`);
      } catch (err) {
        this.logger.error(`Expo push falló: ${String(err)}`);
      }
    }
  }
}
