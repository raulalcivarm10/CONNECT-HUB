import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { generateTempPassword, hashPassword } from '../../auth/password.util';
import { MailerService } from '../../auth/mailer.service';
import { JwtUser, ROL } from '../../auth/types';
import { ArchivosService } from '../archivos/archivos.service';
import { ArchivoSubido } from '../archivos/multipart.util';
import { AprobarInstitucionDto } from './dto/aprobar.dto';
import { CrearInstitucionDto } from './dto/crear-institucion.dto';
import { EditarInstitucionDto } from './dto/editar-institucion.dto';

@Injectable()
export class InstitucionesService {
  constructor(
    private readonly oracle: OracleService,
    private readonly archivos: ArchivosService,
    private readonly mailer: MailerService,
  ) {}

  private assertSuper(actor: JwtUser) {
    if (!actor.esSuper) {
      throw new ForbiddenException(
        'Only the superadmin can manage institutions',
      );
    }
  }

  async list(actor: JwtUser) {
    const filtro = actor.esSuper ? null : actor.idInstitucion;
    return this.oracle.query(
      `SELECT i.ID_INSTITUCION, i.NOMBRE, i.DIRECCION, i.CIUDAD, i.PAIS,
              i.ESTADO, i.FECHA_REGISTRO, i.FECHA_APROBACION, i.APROBADO_POR,
              (SELECT COUNT(*) FROM USUARIOS_INSTITUCIONES u
                WHERE u.ID_INSTITUCION = i.ID_INSTITUCION) AS TOTAL_USUARIOS
         FROM INSTITUCIONES i
        WHERE (:filtro IS NULL OR i.ID_INSTITUCION = :filtro)
        ORDER BY i.FECHA_REGISTRO DESC NULLS LAST`,
      { filtro },
    );
  }

  /**
   * Crea una institución en estado PENDIENTE (solo superadmin). Luego se aprueba
   * con POST /:id/aprobar, que genera su usuario SYSTEM.
   */
  async crear(actor: JwtUser, dto: CrearInstitucionDto) {
    this.assertSuper(actor);
    const nombre = dto.nombre.trim();
    const dup = await this.oracle.query(
      `SELECT 1 FROM INSTITUCIONES WHERE UPPER(NOMBRE) = UPPER(:nombre)`,
      { nombre },
    );
    if (dup.length) {
      throw new ConflictException(
        'An institution with that name already exists',
      );
    }
    const result = await this.oracle.execute(
      `INSERT INTO INSTITUCIONES (NOMBRE, CIUDAD, PAIS, DIRECCION, ESTADO)
       VALUES (:nombre, :ciudad, :pais, :direccion, 'PENDIENTE')
       RETURNING ID_INSTITUCION INTO :out`,
      {
        nombre,
        ciudad: dto.ciudad?.trim() || null,
        pais: dto.pais?.trim() || null,
        direccion: dto.direccion?.trim() || null,
        out: { dir: this.oracle.BIND_OUT, type: this.oracle.NUMBER },
      },
    );
    const idInstitucion = (result.outBinds as { out: number[] }).out[0];
    return { idInstitucion, nombre, estado: 'PENDIENTE' };
  }

  private async getEstado(id: number): Promise<string> {
    const rows = await this.oracle.query<{ ESTADO: string }>(
      `SELECT ESTADO FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`,
      { id },
    );
    if (!rows[0]) throw new NotFoundException('Institution not found');
    return rows[0].ESTADO;
  }

  /**
   * Aprueba la institución y crea automáticamente su usuario genérico con rol
   * SYSTEM. Devuelve la contraseña temporal generada (se muestra una sola vez).
   */
  async aprobar(actor: JwtUser, id: number, dto: AprobarInstitucionDto) {
    this.assertSuper(actor);
    const estado = await this.getEstado(id);
    if (estado === 'APROBADA') {
      throw new BadRequestException('The institution is already approved');
    }

    const cod = dto.emailUsuarioSistema.toUpperCase();
    const existe = await this.oracle.query(
      `SELECT 1 FROM USUARIOS_INSTITUCIONES WHERE UPPER(COD_USUARIO) = :cod`,
      { cod },
    );
    if (existe.length) {
      throw new ConflictException(
        'A user with that login email already exists',
      );
    }

    const rolSystem = await this.oracle.query<{ ID_ROL: number }>(
      `SELECT ID_ROL FROM ROLES_INSTITUCIONES WHERE NOMBRE = :n`,
      { n: ROL.SYSTEM },
    );
    if (!rolSystem[0]) {
      throw new BadRequestException(
        'The SYSTEM role does not exist in the database',
      );
    }

    const passwordTemporal = generateTempPassword();
    const { clave, salt } = hashPassword(passwordTemporal);
    const nombres = dto.nombres ?? 'USUARIO';
    const apellidos = dto.apellidos ?? 'SISTEMA';

    await this.oracle.withConnection(async (conn) => {
      await conn.execute(
        `UPDATE INSTITUCIONES
            SET ESTADO = 'APROBADA', FECHA_APROBACION = SYSDATE, APROBADO_POR = :actor
          WHERE ID_INSTITUCION = :id`,
        { actor: actor.sub, id },
      );
      await conn.execute(
        `INSERT INTO USUARIOS_INSTITUCIONES
           (COD_USUARIO, NOMBRE_USUARIO, EMAIL, ESTADOS, CLAVE, SALT,
            ID_INSTITUCION, NOMBRES, APELLIDOS, ES_SUPER, DEBE_CAMBIAR_CLAVE)
         VALUES (:cod, :nombreUsuario, :cod, 'A', :clave, :salt, :id,
                 :nombres, :apellidos, 'N', 'S')`,
        {
          cod,
          nombreUsuario: `${nombres} ${apellidos}`.trim(),
          clave,
          salt,
          id,
          nombres,
          apellidos,
        },
      );
      await conn.execute(
        `INSERT INTO USUARIO_ROL_INSTITUCION (COD_USUARIO, ID_ROL) VALUES (:cod, :idRol)`,
        { cod, idRol: rolSystem[0].ID_ROL },
      );
      await conn.commit();
    });

    const correoEnviado = await this.mailer.enviarCredenciales(
      dto.emailUsuarioSistema.toLowerCase(),
      nombres,
      apellidos,
      cod,
      passwordTemporal,
    );

    return {
      idInstitucion: id,
      estado: 'APROBADA',
      usuarioSistema: cod,
      passwordTemporal,
      correoEnviado,
    };
  }

  /** super, o SYSTEM/ADMINISTRATIVO de la propia institución */
  private assertGestionInstitucion(actor: JwtUser, id: number, accion: string) {
    const permitido =
      actor.esSuper ||
      (actor.idInstitucion === id &&
        actor.roles.some((r) => r === ROL.SYSTEM));
    if (!permitido) {
      throw new ForbiddenException(
        `Only the superadmin or a SYSTEM/ADMINISTRATIVE user of the institution can ${accion}`,
      );
    }
  }

  /** Edición del perfil; las credenciales de pasarela son write-only */
  async editarPerfil(actor: JwtUser, id: number, dto: EditarInstitucionDto) {
    this.assertGestionInstitucion(actor, id, 'edit the profile');
    await this.getEstado(id); // valida existencia
    // El código de conexión debe ser único entre instituciones. El frontend lo
    // hará de solo-lectura, pero validamos aquí para proteger de llamadas directas.
    if (dto.codigoConexion) {
      const dup = await this.oracle.query(
        `SELECT 1 FROM INSTITUCIONES
          WHERE UPPER(CODIGO_CONEXION) = UPPER(:c) AND ID_INSTITUCION != :id`,
        { c: dto.codigoConexion, id },
      );
      if (dup.length) {
        throw new ConflictException(
          'That connection code is already used by another institution',
        );
      }
    }
    await this.oracle.execute(
      `UPDATE INSTITUCIONES SET
         NOMBRE = NVL(:nombre, NOMBRE),
         DIRECCION = COALESCE(:direccion, DIRECCION),
         CIUDAD = COALESCE(:ciudad, CIUDAD),
         PAIS = COALESCE(:pais, PAIS),
         CODIGO_CONEXION = COALESCE(:codigoConexion, CODIGO_CONEXION),
         PROVEEDOR_PAGO = COALESCE(:proveedorPago, PROVEEDOR_PAGO),
         PAYMENT_ENVIROMENT = COALESCE(:paymentEnvironment, PAYMENT_ENVIROMENT),
         URL_COD_PAGO = COALESCE(:urlCodPago, URL_COD_PAGO),
         URL_PROCESO_PAGO = COALESCE(:urlProcesoPago, URL_PROCESO_PAGO),
         USUARIO_PASARELA = COALESCE(:usuarioPasarela, USUARIO_PASARELA),
         CONTRASENA_PASARELA = COALESCE(:contrasenaPasarela, CONTRASENA_PASARELA),
         TOKEN_PASARELA = COALESCE(:tokenPasarela, TOKEN_PASARELA),
         APP_CODE_TOKENIZATION = COALESCE(:appCodeTokenization, APP_CODE_TOKENIZATION),
         APP_KEY_TOKENIZATION = COALESCE(:appKeyTokenization, APP_KEY_TOKENIZATION),
         APP_CODE_CHECKOUT = COALESCE(:appCodeCheckout, APP_CODE_CHECKOUT),
         APP_KEY_CHECKOUT = COALESCE(:appKeyCheckout, APP_KEY_CHECKOUT)
       WHERE ID_INSTITUCION = :id`,
      {
        nombre: dto.nombre ?? null,
        direccion: dto.direccion ?? null,
        ciudad: dto.ciudad ?? null,
        pais: dto.pais ?? null,
        codigoConexion: dto.codigoConexion ?? null,
        proveedorPago: dto.proveedorPago ?? null,
        paymentEnvironment: dto.paymentEnvironment ?? null,
        urlCodPago: dto.urlCodPago ?? null,
        urlProcesoPago: dto.urlProcesoPago ?? null,
        usuarioPasarela: dto.usuarioPasarela ?? null,
        contrasenaPasarela: dto.contrasenaPasarela ?? null,
        tokenPasarela: dto.tokenPasarela ?? null,
        appCodeTokenization: dto.appCodeTokenization ?? null,
        appKeyTokenization: dto.appKeyTokenization ?? null,
        appCodeCheckout: dto.appCodeCheckout ?? null,
        appKeyCheckout: dto.appKeyCheckout ?? null,
        id,
      },
    );
    return this.leerPerfil(id);
  }

  /**
   * Perfil sin credenciales; incluye banderas TIENE_* que indican si cada
   * credencial de pasarela está configurada (sin revelar su valor).
   */
  private async leerPerfil(id: number) {
    const filas = await this.oracle.query(
      `SELECT ID_INSTITUCION, NOMBRE, DIRECCION, CIUDAD, PAIS, ESTADO,
              CODIGO_CONEXION, PROVEEDOR_PAGO, PAYMENT_ENVIROMENT,
              URL_COD_PAGO, URL_PROCESO_PAGO, FECHA_REGISTRO, FECHA_APROBACION,
              CASE WHEN USUARIO_PASARELA IS NOT NULL THEN 1 ELSE 0 END AS TIENE_USUARIO_PASARELA,
              CASE WHEN CONTRASENA_PASARELA IS NOT NULL THEN 1 ELSE 0 END AS TIENE_CONTRASENA_PASARELA,
              CASE WHEN TOKEN_PASARELA IS NOT NULL THEN 1 ELSE 0 END AS TIENE_TOKEN_PASARELA,
              CASE WHEN APP_CODE_TOKENIZATION IS NOT NULL THEN 1 ELSE 0 END AS TIENE_APP_CODE_TOKENIZATION,
              CASE WHEN APP_KEY_TOKENIZATION IS NOT NULL THEN 1 ELSE 0 END AS TIENE_APP_KEY_TOKENIZATION,
              CASE WHEN APP_CODE_CHECKOUT IS NOT NULL THEN 1 ELSE 0 END AS TIENE_APP_CODE_CHECKOUT,
              CASE WHEN APP_KEY_CHECKOUT IS NOT NULL THEN 1 ELSE 0 END AS TIENE_APP_KEY_CHECKOUT
         FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`,
      { id },
    );
    if (!filas[0]) throw new NotFoundException('Institution not found');
    return filas[0];
  }

  /** Perfil (sin credenciales) para la página Mi Institución */
  async perfil(actor: JwtUser, id: number) {
    this.assertGestionInstitucion(actor, id, 'view the profile');
    return this.leerPerfil(id);
  }

  /** Eliminar institución (solo super) con validaciones exhaustivas */
  async eliminar(actor: JwtUser, id: number) {
    this.assertSuper(actor);
    const nom = await this.oracle.query<{ NOMBRE: string }>(
      `SELECT NOMBRE FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`,
      { id },
    );
    if (!nom[0]) throw new NotFoundException('Institution not found');
    const nombre = nom[0].NOMBRE;

    const usos: Array<{ sql: string; msg: (n: number) => string }> = [
      {
        sql: `SELECT COUNT(*) AS N FROM USUARIOS_INSTITUCIONES WHERE ID_INSTITUCION = :id`,
        msg: (n) =>
          `Cannot delete "${nombre}": it has ${n} panel user(s). Delete them first.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM LOCALES WHERE ID_INSTITUCION = :id`,
        msg: (n) =>
          `Cannot delete "${nombre}": it has ${n} venue(s) with their infrastructure. Delete them first.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM INSTITUCION_MAPAS WHERE ID_INSTITUCION = :id`,
        msg: (n) =>
          `Cannot delete "${nombre}": it has ${n} map(s)/floor plan(s).`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM TARJETAS_USUARIO WHERE ID_INSTITUCION = :id`,
        msg: (n) =>
          `Cannot delete "${nombre}": it has ${n} tokenized client card(s).`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM USUARIO_INSTITUCIONES WHERE ID_INSTITUCION = :id`,
        msg: (n) =>
          `Cannot delete "${nombre}": it has ${n} client(s) linked from the mobile app.`,
      },
    ];
    for (const uso of usos) {
      const r = await this.oracle.query<{ N: number }>(uso.sql, { id });
      if (r[0].N > 0) throw new ConflictException(uso.msg(r[0].N));
    }

    await this.oracle.withConnection(async (conn) => {
      // su logo en ARCHIVOS (FK) se elimina junto con la institución
      await conn.execute(`DELETE FROM ARCHIVOS WHERE ID_INSTITUCION = :id`, {
        id,
      });
      await conn.execute(
        `DELETE FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`,
        { id },
      );
      await conn.commit();
    });
    return { idInstitucion: id, eliminado: true };
  }

  /** Logo de la institución → NAS (deja de usarse el BLOB de INSTITUCIONES) */
  async subirLogo(actor: JwtUser, id: number, archivo: ArchivoSubido) {
    const puedeGestionar =
      actor.esSuper ||
      (actor.idInstitucion === id &&
        actor.roles.some((r) =>
          [ROL.SYSTEM].includes(
            r as typeof ROL.SYSTEM,
          ),
        ));
    if (!puedeGestionar) {
      throw new ForbiddenException(
        'Only the superadmin or a SYSTEM/ADMINISTRATIVE user of the institution can change the logo',
      );
    }
    await this.getEstado(id); // valida existencia
    const resultado = await this.archivos.subirYReemplazar({
      tipoEntidad: 'INSTITUCION',
      id,
      tipoArchivo: 'LOGO',
      archivo,
    });
    return { idInstitucion: id, ...resultado };
  }

  /** Quita el logo de la institución */
  async eliminarLogo(actor: JwtUser, id: number) {
    this.assertGestionInstitucion(actor, id, 'remove the logo');
    await this.getEstado(id);
    const r = await this.archivos.eliminarImagen('INSTITUCION', id, 'LOGO');
    return { idInstitucion: id, ...r };
  }

  async cambiarEstado(
    actor: JwtUser,
    id: number,
    estado: 'RECHAZADA' | 'SUSPENDIDA' | 'APROBADA',
  ) {
    this.assertSuper(actor);
    await this.getEstado(id);
    const campos =
      estado === 'APROBADA'
        ? `ESTADO = :estado, FECHA_APROBACION = SYSDATE, APROBADO_POR = :actor`
        : `ESTADO = :estado, APROBADO_POR = :actor`;
    await this.oracle.execute(
      `UPDATE INSTITUCIONES SET ${campos} WHERE ID_INSTITUCION = :id`,
      { estado, actor: actor.sub, id },
    );
    return { idInstitucion: id, estado };
  }
}
