import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import { EntradasService } from '../public/entradas/entradas.service';
import { ApiKeyCtx } from './api-key.guard';

export type ResultadoAcceso = 'PERMITIDO' | 'YA_REGISTRADO' | 'DENEGADO';

/**
 * Integración con lectores de QR externos (la app de la institución).
 * El lector envía el contenido del QR y recibe una respuesta lista para
 * mostrar en pantalla: acceso permitido / ya registrado / denegado, con el
 * nombre del participante y el evento.
 */
@Injectable()
export class IntegracionService {
  private readonly logger = new Logger(IntegracionService.name);

  constructor(
    private readonly oracle: OracleService,
    private readonly entradas: EntradasService,
  ) {}

  /**
   * El QR puede venir como token pelado (TCK-XXXX-XXXX) o dentro de una URL
   * si el lector entrega el contenido completo. Se normaliza en ambos casos.
   */
  private normalizarToken(valor: string): string {
    const limpio = valor.trim();
    const m = limpio.match(/TCK-[A-Z0-9]{4}-[A-Z0-9]{4}/i);
    return (m ? m[0] : limpio).toUpperCase();
  }

  /** Busca la entrada y valida que pertenezca a la institución de la API key. */
  private async buscarEntrada(qrToken: string, idInstitucion: number) {
    const rows = await this.oracle.query<{
      ID_EVENTO_USUARIO: number;
      ID_EVENTO: number;
      TITULO: string;
      FECHA_EVENTO: string;
      ASISTIO: string | null;
      FECHA_ENTRADA: string | null;
      NOMBRE: string | null;
      APELLIDO: string | null;
      EMAIL: string;
      TIPO_ID: string | null;
      NUMERO_ID: string | null;
      ID_INSTITUCION: number | null;
      ESTADO_APROBACION: string | null;
    }>(
      `SELECT eu.ID_EVENTO_USUARIO, eu.ID_EVENTO, e.TITULO,
              TO_CHAR(e.FECHA_EVENTO, 'YYYY-MM-DD') AS FECHA_EVENTO,
              eu.ASISTIO,
              TO_CHAR(eu.FECHA_ENTRADA, 'YYYY-MM-DD HH24:MI') AS FECHA_ENTRADA,
              u.NOMBRE, u.APELLIDO, u.EMAIL, u.TIPO_ID, u.NUMERO_ID,
              COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) AS ID_INSTITUCION,
              e.ESTADO_APROBACION
         FROM EVENTOS_USUARIOS eu
         JOIN EVENTOS e ON e.ID_EVENTO = eu.ID_EVENTO
         JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
         LEFT JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
         LEFT JOIN SALONES s ON s.ID_SALON = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE eu.QR_TOKEN = :qr`,
      { qr: qrToken },
    );
    const r = rows[0];
    if (!r) return { error: 'TICKET_NO_ENCONTRADO' as const };
    // aislamiento multi-cliente: la llave solo abre puertas de SU institución
    if (r.ID_INSTITUCION !== idInstitucion) {
      return { error: 'OTRA_INSTITUCION' as const };
    }
    return { fila: r };
  }

  private participante(r: {
    NOMBRE: string | null;
    APELLIDO: string | null;
    EMAIL: string;
    TIPO_ID: string | null;
    NUMERO_ID: string | null;
  }) {
    return {
      nombre: [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ') || r.EMAIL,
      email: r.EMAIL,
      documento: r.NUMERO_ID ? `${r.TIPO_ID ?? ''}${r.NUMERO_ID}` : null,
    };
  }

  /**
   * CONFIRMAR ACCESO: marca al participante como ingresado (ASISTIO='S' +
   * FECHA_ENTRADA) y emite su certificado. Idempotente: un segundo escaneo
   * devuelve YA_REGISTRADO con la hora del primer ingreso (no lo bloquea, solo
   * informa — el personal decide).
   */
  async checkin(
    ctx: ApiKeyCtx,
    qrToken: string,
    idEvento?: number,
  ): Promise<{
    acceso: ResultadoAcceso;
    motivo?: string;
    participante?: ReturnType<IntegracionService['participante']>;
    evento?: { id: number; titulo: string; fecha: string };
    fechaIngreso?: string | null;
    certificado?: string | null;
  }> {
    const token = this.normalizarToken(qrToken);
    const res = await this.buscarEntrada(token, ctx.idInstitucion);
    if ('error' in res) {
      return {
        acceso: 'DENEGADO',
        motivo:
          res.error === 'OTRA_INSTITUCION'
            ? 'The ticket belongs to another institution'
            : 'Ticket not found',
      };
    }
    const r = res.fila;
    // puerta de un evento concreto: rechaza entradas de otro evento
    if (idEvento != null && r.ID_EVENTO !== idEvento) {
      return {
        acceso: 'DENEGADO',
        motivo: 'The ticket is for a different event',
        participante: this.participante(r),
        evento: { id: r.ID_EVENTO, titulo: r.TITULO, fecha: r.FECHA_EVENTO },
      };
    }

    const base = {
      participante: this.participante(r),
      evento: { id: r.ID_EVENTO, titulo: r.TITULO, fecha: r.FECHA_EVENTO },
    };
    if ((r.ASISTIO ?? 'N') === 'S') {
      return { acceso: 'YA_REGISTRADO', ...base, fechaIngreso: r.FECHA_ENTRADA };
    }
    // reutiliza el check-in oficial (marca asistencia + emite certificado)
    const v = await this.entradas.validar(token);
    return {
      acceso: 'PERMITIDO',
      ...base,
      fechaIngreso: null,
      certificado: v.certificadoCodigo ?? null,
    };
  }

  /** CONSULTA sin marcar: para pre-validar antes de abrir la puerta. */
  async verificar(ctx: ApiKeyCtx, qrToken: string) {
    const token = this.normalizarToken(qrToken);
    const res = await this.buscarEntrada(token, ctx.idInstitucion);
    if ('error' in res) {
      return {
        valido: false,
        motivo:
          res.error === 'OTRA_INSTITUCION'
            ? 'The ticket belongs to another institution'
            : 'Ticket not found',
      };
    }
    const r = res.fila;
    return {
      valido: true,
      yaRegistrado: (r.ASISTIO ?? 'N') === 'S',
      fechaIngreso: r.FECHA_ENTRADA,
      participante: this.participante(r),
      evento: { id: r.ID_EVENTO, titulo: r.TITULO, fecha: r.FECHA_EVENTO },
    };
  }

  /* ---------- administración de llaves (panel) ---------- */

  private institucionDe(actor: JwtUser, idInstitucion?: number): number {
    if (actor.esSuper && idInstitucion != null) return idInstitucion;
    if (actor.idInstitucion == null) {
      throw new Error('The user has no institution associated');
    }
    return actor.idInstitucion;
  }

  /**
   * Llave PROPIA de la institución (INSTITUCIONES.API_KEY_CHECKIN): existe
   * para todas, se puede consultar cuando haga falta y regenerar. Es la que se
   * entrega al proveedor del lector de QR.
   */
  async llaveInstitucion(actor: JwtUser, idInstitucion?: number) {
    const inst = this.institucionDe(actor, idInstitucion);
    const rows = await this.oracle.query<{
      NOMBRE: string;
      API_KEY_CHECKIN: string | null;
      API_KEY_FECHA: string | null;
    }>(
      `SELECT NOMBRE, API_KEY_CHECKIN,
              TO_CHAR(API_KEY_FECHA, 'YYYY-MM-DD HH24:MI') AS API_KEY_FECHA
         FROM INSTITUCIONES WHERE ID_INSTITUCION = :i`,
      { i: inst },
    );
    const r = rows[0];
    // si por algún motivo no tuviera, se provisiona al vuelo
    if (r && !r.API_KEY_CHECKIN) return this.regenerarLlaveInstitucion(actor, idInstitucion);
    return {
      idInstitucion: inst,
      institucion: r?.NOMBRE ?? null,
      apiKey: r?.API_KEY_CHECKIN ?? null,
      desde: r?.API_KEY_FECHA ?? null,
    };
  }

  /** Regenera la llave propia (la anterior deja de funcionar al instante). */
  async regenerarLlaveInstitucion(actor: JwtUser, idInstitucion?: number) {
    const inst = this.institucionDe(actor, idInstitucion);
    const clave = `chk_${randomBytes(24).toString('base64url')}`;
    await this.oracle.execute(
      `UPDATE INSTITUCIONES SET API_KEY_CHECKIN = :k, API_KEY_FECHA = SYSDATE
        WHERE ID_INSTITUCION = :i`,
      { k: clave, i: inst },
    );
    this.logger.log(`API key de check-in regenerada (institución ${inst}) por ${actor.sub}`);
    return { idInstitucion: inst, apiKey: clave, desde: null, regenerada: true };
  }

  async listarKeys(actor: JwtUser, idInstitucion?: number) {
    const inst = this.institucionDe(actor, idInstitucion);
    return this.oracle.query(
      `SELECT ID_API_KEY, NOMBRE, PREFIJO, ACTIVO, CREADO_POR,
              TO_CHAR(FECHA_REGISTRO, 'YYYY-MM-DD HH24:MI') AS FECHA_REGISTRO,
              TO_CHAR(ULTIMO_USO, 'YYYY-MM-DD HH24:MI') AS ULTIMO_USO, USOS
         FROM INSTITUCION_API_KEYS
        WHERE ID_INSTITUCION = :i
        ORDER BY FECHA_REGISTRO DESC`,
      { i: inst },
    );
  }

  /** Genera una llave nueva. El valor en claro se devuelve UNA sola vez. */
  async crearKey(actor: JwtUser, nombre: string, idInstitucion?: number) {
    const inst = this.institucionDe(actor, idInstitucion);
    const clave = `chk_${randomBytes(24).toString('base64url')}`;
    const hash = createHash('sha256').update(clave).digest('hex');
    const prefijo = clave.slice(0, 12);
    await this.oracle.execute(
      `INSERT INTO INSTITUCION_API_KEYS
         (ID_INSTITUCION, NOMBRE, PREFIJO, CLAVE_HASH, CREADO_POR)
       VALUES (:i, :n, :p, :h, :u)`,
      { i: inst, n: nombre.slice(0, 150), p: prefijo, h: hash, u: actor.sub },
    );
    return { clave, prefijo, nombre, aviso: 'Save this key now — it will not be shown again' };
  }

  async revocarKey(actor: JwtUser, idApiKey: number) {
    const inst = this.institucionDe(actor);
    const r = await this.oracle.execute(
      `UPDATE INSTITUCION_API_KEYS SET ACTIVO = 'N'
        WHERE ID_API_KEY = :id AND (:inst IS NULL OR ID_INSTITUCION = :inst)`,
      { id: idApiKey, inst: actor.esSuper ? null : inst },
    );
    return { ok: (r.rowsAffected ?? 0) > 0 };
  }
}
