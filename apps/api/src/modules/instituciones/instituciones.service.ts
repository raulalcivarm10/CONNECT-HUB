import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OracleService } from '../../database/oracle.service';
import { generateTempPassword, hashPassword } from '../../auth/password.util';
import { JwtUser, ROL } from '../../auth/types';
import { ArchivosService } from '../archivos/archivos.service';
import { ArchivoSubido } from '../archivos/multipart.util';
import { AprobarInstitucionDto } from './dto/aprobar.dto';
import { EditarInstitucionDto } from './dto/editar-institucion.dto';

@Injectable()
export class InstitucionesService {
  constructor(
    private readonly oracle: OracleService,
    private readonly archivos: ArchivosService,
  ) {}

  private assertSuper(actor: JwtUser) {
    if (!actor.esSuper) {
      throw new ForbiddenException(
        'Solo el superadmin puede gestionar instituciones',
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

  private async getEstado(id: number): Promise<string> {
    const rows = await this.oracle.query<{ ESTADO: string }>(
      `SELECT ESTADO FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`,
      { id },
    );
    if (!rows[0]) throw new NotFoundException('Institución no encontrada');
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
      throw new BadRequestException('La institución ya está aprobada');
    }

    const cod = dto.emailUsuarioSistema.toUpperCase();
    const existe = await this.oracle.query(
      `SELECT 1 FROM USUARIOS_INSTITUCIONES WHERE UPPER(COD_USUARIO) = :cod`,
      { cod },
    );
    if (existe.length) {
      throw new ConflictException(
        'Ya existe un usuario con ese correo de login',
      );
    }

    const rolSystem = await this.oracle.query<{ ID_ROL: number }>(
      `SELECT ID_ROL FROM ROLES_INSTITUCIONES WHERE NOMBRE = :n`,
      { n: ROL.SYSTEM },
    );
    if (!rolSystem[0]) {
      throw new BadRequestException('No existe el rol SYSTEM en la BD');
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
            ID_INSTITUCION, NOMBRES, APELLIDOS, ES_SUPER)
         VALUES (:cod, :nombreUsuario, :cod, 'A', :clave, :salt, :id,
                 :nombres, :apellidos, 'N')`,
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

    return {
      idInstitucion: id,
      estado: 'APROBADA',
      usuarioSistema: cod,
      passwordTemporal,
    };
  }

  /** super, o SYSTEM/ADMINISTRATIVO de la propia institución */
  private assertGestionInstitucion(actor: JwtUser, id: number, accion: string) {
    const permitido =
      actor.esSuper ||
      (actor.idInstitucion === id &&
        actor.roles.some((r) => r === ROL.SYSTEM || r === ROL.ADMINISTRATIVO));
    if (!permitido) {
      throw new ForbiddenException(
        `Solo el superadmin o un usuario SYSTEM/ADMINISTRATIVO de la institución puede ${accion}`,
      );
    }
  }

  /** Edición del perfil; las credenciales de pasarela son write-only */
  async editarPerfil(actor: JwtUser, id: number, dto: EditarInstitucionDto) {
    this.assertGestionInstitucion(actor, id, 'editar el perfil');
    await this.getEstado(id); // valida existencia
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
    if (!filas[0]) throw new NotFoundException('Institución no encontrada');
    return filas[0];
  }

  /** Perfil (sin credenciales) para la página Mi Institución */
  async perfil(actor: JwtUser, id: number) {
    this.assertGestionInstitucion(actor, id, 'ver el perfil');
    return this.leerPerfil(id);
  }

  /** Eliminar institución (solo super) con validaciones exhaustivas */
  async eliminar(actor: JwtUser, id: number) {
    this.assertSuper(actor);
    const nom = await this.oracle.query<{ NOMBRE: string }>(
      `SELECT NOMBRE FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`,
      { id },
    );
    if (!nom[0]) throw new NotFoundException('Institución no encontrada');
    const nombre = nom[0].NOMBRE;

    const usos: Array<{ sql: string; msg: (n: number) => string }> = [
      {
        sql: `SELECT COUNT(*) AS N FROM USUARIOS_INSTITUCIONES WHERE ID_INSTITUCION = :id`,
        msg: (n) =>
          `No se puede eliminar «${nombre}»: tiene ${n} usuario(s) del panel. Elimínalos primero.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM LOCALES WHERE ID_INSTITUCION = :id`,
        msg: (n) =>
          `No se puede eliminar «${nombre}»: tiene ${n} local(es) con su infraestructura. Elimínalos primero.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM INSTITUCION_MAPAS WHERE ID_INSTITUCION = :id`,
        msg: (n) => `No se puede eliminar «${nombre}»: tiene ${n} mapa(s)/croquis.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM TARJETAS_USUARIO WHERE ID_INSTITUCION = :id`,
        msg: (n) =>
          `No se puede eliminar «${nombre}»: tiene ${n} tarjeta(s) tokenizada(s) de clientes.`,
      },
      {
        sql: `SELECT COUNT(*) AS N FROM USUARIO_INSTITUCIONES WHERE ID_INSTITUCION = :id`,
        msg: (n) =>
          `No se puede eliminar «${nombre}»: tiene ${n} cliente(s) vinculado(s) desde la app móvil.`,
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
          [ROL.SYSTEM, ROL.ADMINISTRATIVO].includes(
            r as typeof ROL.SYSTEM | typeof ROL.ADMINISTRATIVO,
          ),
        ));
    if (!puedeGestionar) {
      throw new ForbiddenException(
        'Solo el superadmin o un usuario SYSTEM/ADMINISTRATIVO de la institución puede cambiar el logo',
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
