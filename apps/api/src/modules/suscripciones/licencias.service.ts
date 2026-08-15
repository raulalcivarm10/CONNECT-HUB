import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { OracleService } from '../../database/oracle.service';
import { JwtUser } from '../../auth/types';
import { CrearLicenciaDto, TipoLicencia } from './dto/suscripciones.dto';
import { diasEntre, hoyEcuador, sumarDias } from './fechas-ecuador.util';

interface FilaLicencia {
  ID_LICENCIA: number;
  ID_INSTITUCION: number;
  ID_SUSCRIPCION: number | null;
  TIPO: string;
  TOKEN_PREFIJO: string;
  FECHA_EMISION: string;
  FECHA_EXP: string | null;
  DIAS: number | null;
  ESTADO: string;
  EMITIDO_POR: string | null;
  REVOCADO_POR: string | null;
  FECHA_REVOCACION: string | null;
  NOTAS: string | null;
}

/** plan del catálogo del que sale la duración de cada tipo de licencia */
const PLAN_DE_TIPO: Record<TipoLicencia, { codigo: string; diasPorDefecto: number | null }> = {
  PRUEBA: { codigo: 'ONPREMISE_PRUEBA', diasPorDefecto: 5 },
  // "permanente" acotado a la duración del plan ONPREMISE (3650 días ≈ 10 años):
  // un token sin fecha de expiración nunca caduca ni aunque se filtre. Si el
  // plan no existiera, se emite sin expiración (FECHA_EXP nula).
  PERMANENTE: { codigo: 'ONPREMISE', diasPorDefecto: null },
};

/**
 * LICENCIAS ON-PREMISE: tokens que habilita el proveedor para instalaciones en
 * el servidor del cliente. Se guarda SOLO el hash SHA-256 y un prefijo visible;
 * el token en claro se devuelve UNA sola vez, al generarlo.
 */
@Injectable()
export class LicenciasService {
  private readonly logger = new Logger(LicenciasService.name);

  constructor(private readonly oracle: OracleService) {}

  private assertSuper(actor: JwtUser): void {
    if (!actor.esSuper) {
      throw new ForbiddenException(
        'Only the superadmin can manage on-premise licenses',
      );
    }
  }

  private mapear(r: FilaLicencia) {
    const hoy = hoyEcuador();
    const diasRestantes = r.FECHA_EXP ? diasEntre(hoy, r.FECHA_EXP) : null;
    return {
      idLicencia: r.ID_LICENCIA,
      idInstitucion: r.ID_INSTITUCION,
      idSuscripcion: r.ID_SUSCRIPCION,
      tipo: r.TIPO,
      // el token en claro NO existe en la BD: solo su hash y este prefijo
      tokenPrefijo: r.TOKEN_PREFIJO,
      fechaEmision: r.FECHA_EMISION,
      fechaExp: r.FECHA_EXP,
      dias: r.DIAS,
      estado: r.ESTADO,
      // FECHA_EXP es el ÚLTIMO día válido (misma regla inclusive que FECHA_FIN)
      diasRestantes,
      vigente:
        r.ESTADO === 'ACTIVA' && (diasRestantes === null || diasRestantes >= 0),
      emitidoPor: r.EMITIDO_POR,
      revocadoPor: r.REVOCADO_POR,
      fechaRevocacion: r.FECHA_REVOCACION,
      notas: r.NOTAS,
    };
  }

  /** columnas de la licencia SIN el token: en la BD solo está su hash */
  private readonly SELECT_LICENCIA = `
    SELECT ID_LICENCIA, ID_INSTITUCION, ID_SUSCRIPCION, TIPO, TOKEN_PREFIJO,
           TO_CHAR(FECHA_EMISION, 'YYYY-MM-DD') AS FECHA_EMISION,
           TO_CHAR(FECHA_EXP, 'YYYY-MM-DD') AS FECHA_EXP,
           DIAS, ESTADO, EMITIDO_POR, REVOCADO_POR,
           TO_CHAR(FECHA_REVOCACION, 'YYYY-MM-DD') AS FECHA_REVOCACION, NOTAS
      FROM LICENCIAS_ONPREMISE`;

  /** Licencias de una institución, SIN el token (solo el prefijo). */
  async listar(actor: JwtUser, idInstitucion: number) {
    this.assertSuper(actor);
    const rows = await this.oracle.query<FilaLicencia>(
      `${this.SELECT_LICENCIA}
        WHERE ID_INSTITUCION = :inst
        ORDER BY FECHA_EMISION DESC, ID_LICENCIA DESC`,
      { inst: idInstitucion },
    );
    // lista pelada (el panel la consume como array, no como {items,total})
    return rows.map((r) => this.mapear(r));
  }

  /**
   * Emite una licencia. El token en claro se devuelve UNA sola vez: de la BD
   * ya no se puede recuperar (solo queda el SHA-256). Si se pierde, se revoca
   * y se emite otra.
   */
  async crear(actor: JwtUser, idInstitucion: number, dto: CrearLicenciaDto) {
    this.assertSuper(actor);
    const inst = await this.oracle.query<{ NOMBRE: string }>(
      `SELECT NOMBRE FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`,
      { id: idInstitucion },
    );
    if (!inst[0]) throw new NotFoundException('Institution not found');

    const tipo = dto.tipo;
    const conf = PLAN_DE_TIPO[tipo];
    const plan = await this.oracle.query<{ DIAS: number }>(
      `SELECT DIAS FROM PLANES WHERE CODIGO = :codigo`,
      { codigo: conf.codigo },
    );
    const dias = plan[0]?.DIAS ?? conf.diasPorDefecto;
    // FECHA_EXP = último día válido, inclusive (igual que FECHA_FIN de las
    // suscripciones): una PRUEBA de 5 días emitida hoy sirve hoy + 4 días más.
    const fechaExp = dias ? sumarDias(hoyEcuador(), dias - 1) : null;

    // se cuelga de la suscripción vigente si la hay (solo informativo)
    const susc = await this.oracle.query<{ ID_SUSCRIPCION: number }>(
      `SELECT MAX(ID_SUSCRIPCION) AS ID_SUSCRIPCION FROM SUSCRIPCIONES
        WHERE ID_INSTITUCION = :inst AND ESTADO = 'ACTIVA'`,
      { inst: idInstitucion },
    );
    const idSuscripcion = susc[0]?.ID_SUSCRIPCION ?? null;

    const token = `lic_${randomBytes(32).toString('base64url')}`;
    const hash = createHash('sha256').update(token).digest('hex');
    const prefijo = token.slice(0, 12);

    const r = await this.oracle.execute(
      `INSERT INTO LICENCIAS_ONPREMISE
         (ID_INSTITUCION, ID_SUSCRIPCION, TIPO, TOKEN_HASH, TOKEN_PREFIJO,
          FECHA_EXP, DIAS, ESTADO, EMITIDO_POR, NOTAS)
       VALUES
         (:inst, :susc, :tipo, :hash, :prefijo,
          TO_DATE(:exp, 'YYYY-MM-DD'),   -- TO_DATE(NULL) = NULL: sin expiración
          :dias, 'ACTIVA', :emitidoPor, :notas)
       RETURNING ID_LICENCIA INTO :out`,
      {
        inst: idInstitucion,
        susc: { val: idSuscripcion, type: this.oracle.NUMBER },
        tipo,
        hash,
        prefijo,
        exp: fechaExp,
        dias: { val: dias ?? null, type: this.oracle.NUMBER },
        emitidoPor: actor.sub.slice(0, 60),
        notas: dto.notas?.trim() || null,
        out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
      },
    );
    const idLicencia = (r.outBinds as { out: number[] }).out[0];
    this.logger.log(
      `Licencia on-premise ${tipo} ${idLicencia} emitida para institución ${idInstitucion} por ${actor.sub}`,
    );
    // se relee la fila para devolver EXACTAMENTE la misma forma que la lista
    // (más el token en claro, que no vuelve a estar disponible nunca)
    const fila = await this.oracle.query<FilaLicencia>(
      `${this.SELECT_LICENCIA} WHERE ID_LICENCIA = :id`,
      { id: idLicencia },
    );
    return {
      ...this.mapear(fila[0]),
      token,
      aviso: 'Save this token now — it will not be shown again',
    };
  }

  /** Revoca la licencia: el token deja de valer al instante. */
  async revocar(actor: JwtUser, idLicencia: number) {
    this.assertSuper(actor);
    const r = await this.oracle.execute(
      `UPDATE LICENCIAS_ONPREMISE
          SET ESTADO = 'REVOCADA', REVOCADO_POR = :actor,
              FECHA_REVOCACION = SYSDATE
        WHERE ID_LICENCIA = :id AND ESTADO <> 'REVOCADA'`,
      { actor: actor.sub.slice(0, 60), id: idLicencia },
    );
    if (!(r.rowsAffected ?? 0)) {
      // o no existe, o ya estaba revocada: se distingue para no mentir
      const existe = await this.oracle.query<{ ESTADO: string }>(
        `SELECT ESTADO FROM LICENCIAS_ONPREMISE WHERE ID_LICENCIA = :id`,
        { id: idLicencia },
      );
      if (!existe[0]) throw new NotFoundException('License not found');
      return { idLicencia, estado: existe[0].ESTADO, revocada: false };
    }
    return { idLicencia, estado: 'REVOCADA', revocada: true };
  }
}
