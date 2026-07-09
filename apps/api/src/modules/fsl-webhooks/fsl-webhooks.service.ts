import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OracleService } from '../../database/oracle.service';
import { MailerService } from '../../auth/mailer.service';
import { generateTempPassword, hashPassword } from '../../auth/password.util';
import { ROL } from '../../auth/types';
import { generarCodigoConexion, verifyFslSignature } from './fsl-webhooks.util';

interface FslEvent {
  id?: string;
  type: string;
  livemode?: boolean;
  data?: {
    institution?: {
      name?: string;
      address?: string;
      city?: string;
      country?: string;
    };
    admin?: { email?: string; firstNames?: string; lastNames?: string };
  };
}

interface Respuesta {
  status: number;
  body: Record<string, unknown>;
}

function esViolacionUnica(err: unknown): boolean {
  const e = err as { errorNum?: number };
  return e?.errorNum === 1 || String(err).includes('ORA-00001');
}

@Injectable()
export class FslWebhooksService {
  private readonly logger = new Logger(FslWebhooksService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly oracle: OracleService,
    private readonly mailer: MailerService,
  ) {}

  async procesar(
    rawBody: string,
    firma: string | undefined,
    eventIdHeader: string | undefined,
  ): Promise<Respuesta> {
    const secret = this.config.get<string>('FSL_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('FSL_WEBHOOK_SECRET no configurado');
      return { status: 503, body: { error: 'webhook_not_configured' } };
    }

    const { ok, reason } = verifyFslSignature(rawBody, firma, secret);
    if (!ok) {
      this.logger.warn(`Webhook rechazado: ${reason}`);
      return {
        status: reason === 'timestamp' ? 400 : 401,
        body: { error: reason },
      };
    }

    let event: FslEvent;
    try {
      event = JSON.parse(rawBody) as FslEvent;
    } catch {
      return { status: 400, body: { error: 'invalid_json' } };
    }
    const eventId = eventIdHeader ?? event.id;
    if (!eventId) return { status: 400, body: { error: 'missing_event_id' } };

    // compatibilidad hacia adelante: otros eventos se aceptan sin procesar
    if (event.type !== 'subscription.created') {
      return { status: 200, body: { received: true, ignored: event.type } };
    }

    // idempotencia rápida
    const dup = await this.oracle.query(
      `SELECT 1 FROM FSL_WEBHOOK_EVENTS WHERE EVENT_ID = :id`,
      { id: eventId },
    );
    if (dup.length) {
      return { status: 200, body: { received: true, duplicate: true } };
    }

    const inst = event.data?.institution;
    const admin = event.data?.admin;
    if (!inst?.name || !admin?.email || !admin?.firstNames) {
      return {
        status: 400,
        body: {
          error: 'missing_fields',
          need: [
            'data.institution.name',
            'data.admin.email',
            'data.admin.firstNames',
          ],
        },
      };
    }

    const cod = admin.email.trim().toUpperCase();
    const userExiste = await this.oracle.query(
      `SELECT 1 FROM USUARIOS_INSTITUCIONES WHERE UPPER(COD_USUARIO) = :c`,
      { c: cod },
    );
    if (userExiste.length) {
      await this.marcarEvento(eventId, event.type, 'SKIPPED_USER_EXISTS');
      return { status: 200, body: { received: true, note: 'user_already_exists' } };
    }

    try {
      const r = await this.provisionar(eventId, event.type, inst, admin, cod);
      const correoEnviado = await this.mailer.enviarBienvenidaInstitucion({
        destino: admin.email.trim().toLowerCase(),
        nombres: admin.firstNames,
        apellidos: admin.lastNames ?? null,
        usuario: cod,
        claveTemporal: r.passwordTemporal,
        institucion: inst.name,
        codigoConexion: r.codigoConexion,
      });
      this.logger.log(
        `Provisionada institución ${r.idInstitucion} (${r.codigoConexion}) + SYSTEM ${cod}; correo=${correoEnviado}`,
      );
      return {
        status: 200,
        body: {
          received: true,
          idInstitucion: r.idInstitucion,
          codigoConexion: r.codigoConexion,
          usuarioSistema: cod,
          correoEnviado,
        },
      };
    } catch (err) {
      if (esViolacionUnica(err)) {
        // carrera con un reintento concurrente ya procesado
        return { status: 200, body: { received: true, duplicate: true } };
      }
      this.logger.error(`Provisión falló: ${String(err)}`);
      return { status: 500, body: { error: 'provision_failed' } };
    }
  }

  private async marcarEvento(eventId: string, tipo: string, estado: string) {
    try {
      await this.oracle.execute(
        `INSERT INTO FSL_WEBHOOK_EVENTS (EVENT_ID, EVENT_TYPE, STATUS, PROCESSED_AT)
         VALUES (:id, :t, :s, SYSDATE)`,
        { id: eventId, t: tipo, s: estado },
      );
    } catch (err) {
      if (!esViolacionUnica(err)) throw err;
    }
  }

  private async generarCodigoUnico(
    conn: {
      execute: (sql: string, binds: unknown) => Promise<{ rows?: unknown[] }>;
    },
    nombre: string,
  ): Promise<string> {
    for (let i = 0; i < 25; i++) {
      const sufijo = i === 0 ? '' : String(i + 1);
      const codigo = generarCodigoConexion(nombre, sufijo);
      const r = await conn.execute(
        `SELECT 1 FROM INSTITUCIONES WHERE UPPER(CODIGO_CONEXION) = UPPER(:c)`,
        { c: codigo },
      );
      if (!r.rows?.length) return codigo;
    }
    return generarCodigoConexion(nombre, Math.random().toString(36).slice(2, 5));
  }

  private async provisionar(
    eventId: string,
    tipo: string,
    inst: NonNullable<NonNullable<FslEvent['data']>['institution']>,
    admin: NonNullable<NonNullable<FslEvent['data']>['admin']>,
    cod: string,
  ): Promise<{
    idInstitucion: number;
    codigoConexion: string;
    passwordTemporal: string;
  }> {
    const rolSystem = await this.oracle.query<{ ID_ROL: number }>(
      `SELECT ID_ROL FROM ROLES_INSTITUCIONES WHERE NOMBRE = :n`,
      { n: ROL.SYSTEM },
    );
    if (!rolSystem[0]) throw new Error('No existe el rol SYSTEM en la BD');

    const passwordTemporal = generateTempPassword();
    const { clave, salt } = hashPassword(passwordTemporal);

    let idInstitucion = 0;
    let codigoConexion = '';
    await this.oracle.withConnection(async (conn) => {
      codigoConexion = await this.generarCodigoUnico(conn, inst.name!);

      // registra el evento DENTRO de la transacción (idempotencia atómica)
      await conn.execute(
        `INSERT INTO FSL_WEBHOOK_EVENTS (EVENT_ID, EVENT_TYPE, STATUS, PROCESSED_AT)
         VALUES (:id, :t, 'PROCESSED', SYSDATE)`,
        { id: eventId, t: tipo },
      );

      const out = { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER };
      const inserted = await conn.execute(
        `INSERT INTO INSTITUCIONES
           (NOMBRE, DIRECCION, CIUDAD, PAIS, CODIGO_CONEXION, ESTADO,
            FECHA_APROBACION, APROBADO_POR)
         VALUES (:nombre, :direccion, :ciudad, :pais, :codigo, 'APROBADA',
                 SYSDATE, 'FSL-WEBHOOK')
         RETURNING ID_INSTITUCION INTO :out`,
        {
          nombre: inst.name,
          direccion: inst.address ?? null,
          ciudad: inst.city ?? null,
          pais: inst.country ?? null,
          codigo: codigoConexion,
          out,
        },
      );
      idInstitucion = (inserted.outBinds as { out: number[] }).out[0];

      await conn.execute(
        `INSERT INTO USUARIOS_INSTITUCIONES
           (COD_USUARIO, NOMBRE_USUARIO, EMAIL, ESTADOS, CLAVE, SALT,
            ID_INSTITUCION, NOMBRES, APELLIDOS, ES_SUPER, DEBE_CAMBIAR_CLAVE)
         VALUES (:cod, :nu, :cod, 'A', :clave, :salt, :id, :nombres, :apellidos, 'N', 'S')`,
        {
          cod,
          nu: `${admin.firstNames} ${admin.lastNames ?? ''}`.trim(),
          clave,
          salt,
          id: idInstitucion,
          nombres: admin.firstNames,
          apellidos: admin.lastNames ?? null,
        },
      );
      await conn.execute(
        `INSERT INTO USUARIO_ROL_INSTITUCION (COD_USUARIO, ID_ROL) VALUES (:cod, :idRol)`,
        { cod, idRol: rolSystem[0].ID_ROL },
      );
      await conn.commit();
    });

    return { idInstitucion, codigoConexion, passwordTemporal };
  }
}
