import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OracleService } from '../database/oracle.service';
import {
  generateTempPassword,
  hashPassword,
  verifyPassword,
} from './password.util';
import { MailerService } from './mailer.service';
import { JwtUser } from './types';

interface UsuarioRow {
  COD_USUARIO: string;
  EMAIL: string;
  NOMBRES: string | null;
  APELLIDOS: string | null;
  NOMBRE_USUARIO: string;
  ESTADOS: string;
  CLAVE: string | null;
  SALT: string | null;
  ES_SUPER: string;
  ID_INSTITUCION: number | null;
  DEBE_CAMBIAR_CLAVE: string;
  GRUPO: string | null;
  ESTADO_INSTITUCION: string | null;
  NOMBRE_INSTITUCION: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly oracle: OracleService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  private async loadUsuario(codUsuario: string): Promise<UsuarioRow | null> {
    const rows = await this.oracle.query<UsuarioRow>(
      `SELECT u.COD_USUARIO, u.EMAIL, u.NOMBRES, u.APELLIDOS, u.NOMBRE_USUARIO,
              u.ESTADOS, u.CLAVE, u.SALT, u.ES_SUPER, u.ID_INSTITUCION,
              u.DEBE_CAMBIAR_CLAVE, u.GRUPO,
              i.ESTADO AS ESTADO_INSTITUCION, i.NOMBRE AS NOMBRE_INSTITUCION
         FROM USUARIOS_INSTITUCIONES u
         LEFT JOIN INSTITUCIONES i ON i.ID_INSTITUCION = u.ID_INSTITUCION
        WHERE UPPER(u.COD_USUARIO) = UPPER(:cod)`,
      { cod: codUsuario },
    );
    return rows[0] ?? null;
  }

  private async loadRoles(codUsuario: string): Promise<string[]> {
    const rows = await this.oracle.query<{ NOMBRE: string }>(
      `SELECT r.NOMBRE
         FROM USUARIO_ROL_INSTITUCION uri
         JOIN ROLES_INSTITUCIONES r ON r.ID_ROL = uri.ID_ROL
        WHERE uri.COD_USUARIO = :cod
        ORDER BY r.NOMBRE`,
      { cod: codUsuario },
    );
    return rows.map((r) => r.NOMBRE);
  }

  /** Valida credenciales y estado de usuario/institución; arma el perfil JWT */
  async validateUser(codUsuario: string, password: string): Promise<JwtUser> {
    const row = await this.loadUsuario(codUsuario);
    if (!row || !verifyPassword(password, row.CLAVE, row.SALT)) {
      throw new UnauthorizedException('Incorrect username or password');
    }
    if (row.ESTADOS !== 'A') {
      throw new ForbiddenException('The user account is inactive');
    }
    const esSuper = row.ES_SUPER === 'S';
    if (!esSuper) {
      if (row.ESTADO_INSTITUCION !== 'APROBADA') {
        throw new ForbiddenException(
          `The institution is not enabled (status: ${row.ESTADO_INSTITUCION ?? 'no institution'})`,
        );
      }
    }
    const roles = await this.loadRoles(row.COD_USUARIO);
    if (!esSuper && roles.length === 0) {
      throw new ForbiddenException('The user has no roles assigned');
    }
    return {
      sub: row.COD_USUARIO,
      email: row.EMAIL,
      nombres: row.NOMBRES,
      apellidos: row.APELLIDOS,
      nombreCompleto:
        [row.NOMBRES, row.APELLIDOS].filter(Boolean).join(' ') ||
        row.NOMBRE_USUARIO,
      esSuper,
      idInstitucion: row.ID_INSTITUCION,
      institucion: row.NOMBRE_INSTITUCION,
      roles,
      grupo: row.GRUPO ?? null,
      debeCambiarClave: row.DEBE_CAMBIAR_CLAVE === 'S',
    };
  }

  /**
   * Genera una clave temporal aleatoria, marca el usuario para cambio
   * obligatorio y la envía por correo (o la devuelve si no hay SMTP).
   */
  async recuperar(codUsuario: string): Promise<{
    mensaje: string;
    passwordTemporal?: string;
  }> {
    const row = await this.loadUsuario(codUsuario);
    // respuesta genérica para no revelar qué usuarios existen
    const generico = {
      mensaje:
        'If the user exists, a temporary password has been sent to their email.',
    };
    if (!row || row.ESTADOS !== 'A') return generico;

    const passwordTemporal = generateTempPassword();
    const { clave, salt } = hashPassword(passwordTemporal);
    await this.oracle.execute(
      `UPDATE USUARIOS_INSTITUCIONES
          SET CLAVE = :clave, SALT = :salt, DEBE_CAMBIAR_CLAVE = 'S'
        WHERE COD_USUARIO = :cod`,
      { clave, salt, cod: row.COD_USUARIO },
    );

    const nombre = row.NOMBRES ?? row.NOMBRE_USUARIO;
    const enviado = await this.mailer.enviarClaveTemporal(
      row.EMAIL,
      nombre,
      passwordTemporal,
    );
    if (enviado) return generico;
    // sin SMTP configurado: modo desarrollo, se entrega en la respuesta
    return {
      mensaje:
        'SMTP is not configured: deliver this temporary password to the user securely.',
      passwordTemporal,
    };
  }

  /** Cambia la contraseña verificando la actual y levanta el bloqueo */
  async cambiarClave(
    codUsuario: string,
    claveActual: string,
    claveNueva: string,
  ): Promise<{ user: JwtUser; accessToken: string; refreshToken: string }> {
    const row = await this.loadUsuario(codUsuario);
    if (!row || !verifyPassword(claveActual, row.CLAVE, row.SALT)) {
      throw new UnauthorizedException('The current password is incorrect');
    }
    if (claveActual === claveNueva) {
      throw new BadRequestException(
        'The new password must be different from the current one',
      );
    }
    const { clave, salt } = hashPassword(claveNueva);
    await this.oracle.execute(
      `UPDATE USUARIOS_INSTITUCIONES
          SET CLAVE = :clave, SALT = :salt, DEBE_CAMBIAR_CLAVE = 'N'
        WHERE COD_USUARIO = :cod`,
      { clave, salt, cod: row.COD_USUARIO },
    );
    // sesión fresca sin el bloqueo de cambio de clave
    return this.refreshFromRow(row.COD_USUARIO);
  }

  private async refreshFromRow(codUsuario: string) {
    const row = await this.loadUsuario(codUsuario);
    if (!row) throw new UnauthorizedException('User not available');
    const esSuper = row.ES_SUPER === 'S';
    const roles = await this.loadRoles(row.COD_USUARIO);
    const user: JwtUser = {
      sub: row.COD_USUARIO,
      email: row.EMAIL,
      nombres: row.NOMBRES,
      apellidos: row.APELLIDOS,
      nombreCompleto:
        [row.NOMBRES, row.APELLIDOS].filter(Boolean).join(' ') ||
        row.NOMBRE_USUARIO,
      esSuper,
      idInstitucion: row.ID_INSTITUCION,
      institucion: row.NOMBRE_INSTITUCION,
      roles,
      grupo: row.GRUPO ?? null,
      debeCambiarClave: row.DEBE_CAMBIAR_CLAVE === 'S',
    };
    return { user, ...this.issueTokens(user) };
  }

  issueTokens(user: JwtUser): { accessToken: string; refreshToken: string } {
    const accessToken = this.jwt.sign(
      { ...user },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.sub, typ: 'refresh' },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );
    return { accessToken, refreshToken };
  }

  /** Rota el refresh token releyendo el usuario desde la BD (roles/estado frescos) */
  async refresh(refreshToken: string | undefined): Promise<{
    user: JwtUser;
    accessToken: string;
    refreshToken: string;
  }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Session expired');
    }
    let payload: { sub: string; typ?: string };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Session expired');
    }
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid token');
    }
    const row = await this.loadUsuario(payload.sub);
    if (!row || row.ESTADOS !== 'A') {
      throw new UnauthorizedException('User not available');
    }
    const esSuper = row.ES_SUPER === 'S';
    if (!esSuper && row.ESTADO_INSTITUCION !== 'APROBADA') {
      throw new ForbiddenException('The institution is not enabled');
    }
    const roles = await this.loadRoles(row.COD_USUARIO);
    const user: JwtUser = {
      sub: row.COD_USUARIO,
      email: row.EMAIL,
      nombres: row.NOMBRES,
      apellidos: row.APELLIDOS,
      nombreCompleto:
        [row.NOMBRES, row.APELLIDOS].filter(Boolean).join(' ') ||
        row.NOMBRE_USUARIO,
      esSuper,
      idInstitucion: row.ID_INSTITUCION,
      institucion: row.NOMBRE_INSTITUCION,
      roles,
      grupo: row.GRUPO ?? null,
      debeCambiarClave: row.DEBE_CAMBIAR_CLAVE === 'S',
    };
    return { user, ...this.issueTokens(user) };
  }
}
