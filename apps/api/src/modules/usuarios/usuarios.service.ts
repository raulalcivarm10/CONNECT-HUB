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
import { JwtUser } from '../../auth/types';
import { CreateUsuarioDto, UpdateUsuarioDto } from './dto/create-usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly oracle: OracleService,
    private readonly mailer: MailerService,
  ) {}

  /** Institución sobre la que puede actuar el usuario; el super puede elegir */
  private resolveInstitucion(actor: JwtUser, requested?: number): number {
    if (actor.esSuper) {
      if (requested == null) {
        throw new BadRequestException(
          'As a superadmin you must provide idInstitucion',
        );
      }
      return requested;
    }
    if (actor.idInstitucion == null) {
      throw new ForbiddenException('User has no institution');
    }
    return actor.idInstitucion;
  }

  async list(actor: JwtUser, idInstitucion?: number) {
    const filtro = actor.esSuper ? (idInstitucion ?? null) : actor.idInstitucion;
    return this.oracle.query(
      `SELECT u.COD_USUARIO, u.EMAIL, u.NOMBRES, u.APELLIDOS, u.NOMBRE_USUARIO,
              u.ESTADOS, u.ES_SUPER, u.ID_INSTITUCION, u.FECHA_REGISTRO, u.GRUPO,
              i.NOMBRE AS INSTITUCION,
              (SELECT LISTAGG(r.NOMBRE, ',') WITHIN GROUP (ORDER BY r.NOMBRE)
                 FROM USUARIO_ROL_INSTITUCION uri
                 JOIN ROLES_INSTITUCIONES r ON r.ID_ROL = uri.ID_ROL
                WHERE uri.COD_USUARIO = u.COD_USUARIO) AS ROLES
         FROM USUARIOS_INSTITUCIONES u
         LEFT JOIN INSTITUCIONES i ON i.ID_INSTITUCION = u.ID_INSTITUCION
        WHERE (:filtro IS NULL OR u.ID_INSTITUCION = :filtro)
        ORDER BY u.FECHA_REGISTRO DESC NULLS LAST, u.COD_USUARIO`,
      { filtro },
    );
  }

  private async rolIds(nombres: string[]): Promise<Map<string, number>> {
    const binds: Record<string, string> = {};
    nombres.forEach((n, i) => (binds[`r${i}`] = n));
    const placeholders = nombres.map((_, i) => `:r${i}`).join(',');
    const rows = await this.oracle.query<{ ID_ROL: number; NOMBRE: string }>(
      `SELECT ID_ROL, NOMBRE FROM ROLES_INSTITUCIONES WHERE NOMBRE IN (${placeholders})`,
      binds,
    );
    const map = new Map(rows.map((r) => [r.NOMBRE, r.ID_ROL]));
    const faltantes = nombres.filter((n) => !map.has(n));
    if (faltantes.length) {
      throw new BadRequestException(
        `The following roles do not exist: ${faltantes.join(', ')}`,
      );
    }
    return map;
  }

  async create(actor: JwtUser, dto: CreateUsuarioDto) {
    const idInstitucion = this.resolveInstitucion(actor, dto.idInstitucion);
    const cod = dto.usuario.toUpperCase();

    const inst = await this.oracle.query<{ ESTADO: string }>(
      `SELECT ESTADO FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`,
      { id: idInstitucion },
    );
    if (!inst[0]) throw new NotFoundException('Institution not found');
    if (inst[0].ESTADO !== 'APROBADA') {
      throw new BadRequestException('The institution is not approved');
    }

    const existe = await this.oracle.query(
      `SELECT 1 FROM USUARIOS_INSTITUCIONES WHERE UPPER(COD_USUARIO) = :cod`,
      { cod },
    );
    if (existe.length) {
      throw new ConflictException(
        'A user with that login email already exists',
      );
    }

    const roles = await this.rolIds(dto.roles);
    // sin password explícito -> se autogenera y se obliga a cambiarla al ingresar
    const passwordPlano = dto.password ?? generateTempPassword();
    const debeCambiar = dto.password ? 'N' : 'S';
    const { clave, salt } = hashPassword(passwordPlano);
    const correoContacto = (dto.email ?? dto.usuario).toLowerCase();

    await this.oracle.withConnection(async (conn) => {
      await conn.execute(
        `INSERT INTO USUARIOS_INSTITUCIONES
           (COD_USUARIO, NOMBRE_USUARIO, EMAIL, ESTADOS, CLAVE, SALT,
            ID_INSTITUCION, NOMBRES, APELLIDOS, ES_SUPER, DEBE_CAMBIAR_CLAVE, GRUPO)
         VALUES (:cod, :nombreUsuario, :email, 'A', :clave, :salt,
                 :idInstitucion, :nombres, :apellidos, 'N', :debeCambiar, :grupo)`,
        {
          cod,
          nombreUsuario: `${dto.nombres} ${dto.apellidos}`.trim(),
          email: (dto.email ?? dto.usuario).toUpperCase(),
          clave,
          salt,
          idInstitucion,
          nombres: dto.nombres,
          apellidos: dto.apellidos,
          grupo: dto.grupo ?? null,
          debeCambiar,
        },
      );
      for (const [, idRol] of roles) {
        await conn.execute(
          `INSERT INTO USUARIO_ROL_INSTITUCION (COD_USUARIO, ID_ROL) VALUES (:cod, :idRol)`,
          { cod, idRol },
        );
      }
      await conn.commit();
    });

    const correoEnviado = await this.mailer.enviarCredenciales(
      correoContacto,
      dto.nombres,
      dto.apellidos,
      cod,
      passwordPlano,
    );

    return {
      codUsuario: cod,
      idInstitucion,
      roles: dto.roles,
      passwordTemporal: passwordPlano,
      correoEnviado,
    };
  }

  /** Verifica que el usuario objetivo pertenezca al ámbito del actor */
  private async targetUsuario(actor: JwtUser, cod: string) {
    const rows = await this.oracle.query<{
      COD_USUARIO: string;
      ID_INSTITUCION: number | null;
      ES_SUPER: string;
    }>(
      `SELECT COD_USUARIO, ID_INSTITUCION, ES_SUPER
         FROM USUARIOS_INSTITUCIONES WHERE UPPER(COD_USUARIO) = UPPER(:cod)`,
      { cod },
    );
    const target = rows[0];
    if (!target) throw new NotFoundException('User not found');
    if (target.ES_SUPER === 'S' && !actor.esSuper) {
      throw new ForbiddenException('You cannot modify a superadmin');
    }
    if (!actor.esSuper && target.ID_INSTITUCION !== actor.idInstitucion) {
      throw new ForbiddenException('The user belongs to another institution');
    }
    return target;
  }

  /** Editar datos personales y/o restablecer la contraseña */
  async update(actor: JwtUser, cod: string, dto: UpdateUsuarioDto) {
    const target = await this.targetUsuario(actor, cod);
    const credenciales = dto.password ? hashPassword(dto.password) : null;
    await this.oracle.execute(
      `UPDATE USUARIOS_INSTITUCIONES SET
         NOMBRES = NVL(:nombres, NOMBRES),
         APELLIDOS = NVL(:apellidos, APELLIDOS),
         EMAIL = NVL(:email, EMAIL),
         NOMBRE_USUARIO = NVL(:nombreUsuario, NOMBRE_USUARIO),
         CLAVE = NVL(:clave, CLAVE),
         SALT = NVL(:salt, SALT),
         DEBE_CAMBIAR_CLAVE = CASE WHEN :clave IS NULL THEN DEBE_CAMBIAR_CLAVE ELSE 'N' END,
         GRUPO = CASE WHEN :grupoSet = 1 THEN :grupo ELSE GRUPO END
       WHERE COD_USUARIO = :cod`,
      {
        grupoSet: dto.grupo === undefined ? 0 : 1,
        grupo: dto.grupo ?? null,
        nombres: dto.nombres ?? null,
        apellidos: dto.apellidos ?? null,
        email: dto.email ? dto.email.toUpperCase() : null,
        nombreUsuario:
          dto.nombres || dto.apellidos
            ? `${dto.nombres ?? ''} ${dto.apellidos ?? ''}`.trim() || null
            : null,
        clave: credenciales?.clave ?? null,
        salt: credenciales?.salt ?? null,
        cod: target.COD_USUARIO,
      },
    );
    return {
      codUsuario: target.COD_USUARIO,
      claveRestablecida: credenciales !== null,
    };
  }

  /** Eliminación definitiva (para desactivar temporalmente usa setEstado) */
  async remove(actor: JwtUser, cod: string) {
    if (cod.toUpperCase() === actor.sub.toUpperCase()) {
      throw new BadRequestException('You cannot delete your own user account');
    }
    const target = await this.targetUsuario(actor, cod);
    const superRow = await this.oracle.query<{ ES_SUPER: string }>(
      `SELECT ES_SUPER FROM USUARIOS_INSTITUCIONES WHERE COD_USUARIO = :cod`,
      { cod: target.COD_USUARIO },
    );
    if (superRow[0]?.ES_SUPER === 'S') {
      throw new ForbiddenException(
        'A platform superadmin cannot be deleted from the panel',
      );
    }
    await this.oracle.withConnection(async (conn) => {
      await conn.execute(
        `DELETE FROM USUARIO_ROL_INSTITUCION WHERE COD_USUARIO = :cod`,
        { cod: target.COD_USUARIO },
      );
      await conn.execute(
        `DELETE FROM USUARIOS_INSTITUCIONES WHERE COD_USUARIO = :cod`,
        { cod: target.COD_USUARIO },
      );
      await conn.commit();
    });
    return { codUsuario: target.COD_USUARIO, eliminado: true };
  }

  async setEstado(actor: JwtUser, cod: string, estado: 'A' | 'I') {
    if (cod.toUpperCase() === actor.sub.toUpperCase()) {
      throw new BadRequestException(
        'You cannot deactivate your own user account',
      );
    }
    const target = await this.targetUsuario(actor, cod);
    await this.oracle.execute(
      `UPDATE USUARIOS_INSTITUCIONES SET ESTADOS = :estado WHERE COD_USUARIO = :cod`,
      { estado, cod: target.COD_USUARIO },
    );
    return { codUsuario: target.COD_USUARIO, estado };
  }

  async setRoles(actor: JwtUser, cod: string, nombres: string[]) {
    const target = await this.targetUsuario(actor, cod);
    const roles = await this.rolIds(nombres);
    await this.oracle.withConnection(async (conn) => {
      await conn.execute(
        `DELETE FROM USUARIO_ROL_INSTITUCION WHERE COD_USUARIO = :cod`,
        { cod: target.COD_USUARIO },
      );
      for (const [, idRol] of roles) {
        await conn.execute(
          `INSERT INTO USUARIO_ROL_INSTITUCION (COD_USUARIO, ID_ROL) VALUES (:cod, :idRol)`,
          { cod: target.COD_USUARIO, idRol },
        );
      }
      await conn.commit();
    });
    return { codUsuario: target.COD_USUARIO, roles: nombres };
  }
}
