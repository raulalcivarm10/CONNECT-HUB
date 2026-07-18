import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { OracleService } from '../../../database/oracle.service';
import { hashPassword, verifyPassword } from '../../../auth/password.util';
import { AsistenteMailerService } from './asistente-mailer.service';
import {
  ASISTENTE_ACCESS_SECRET_ENV,
  ASISTENTE_ACCESS_TTL,
  ASISTENTE_AUD,
  ASISTENTE_REFRESH_SECRET_ENV,
  ASISTENTE_REFRESH_TTL,
  ASISTENTE_RESET_TTL,
  AsistenteRefreshPayload,
  AsistenteResetPayload,
} from './asistente-jwt';
import { AppleDto, LoginDto, OnboardingDto, RegisterDto } from './dto';

/** JWKS remoto de Apple (cacheado por jose) para verificar la FIRMA del identity token. */
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const APPLE_ISSUER = 'https://appleid.apple.com';

/**
 * Anonimización de cuenta (Apple 5.1.1v): no se agrega columna de estado. La cuenta
 * eliminada se marca cambiando su EMAIL a un centinela con este dominio y anulando
 * TODAS las credenciales (clave/google/apple). Los lectores tratan estas cuentas
 * como inexistentes → no se puede volver a iniciar sesión, pero la fila USUARIOS
 * persiste para no romper los FK de los registros financieros retenidos.
 */
const DELETED_EMAIL_DOMAIN = '@deleted.connecthub.local';
function esAnonima(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(DELETED_EMAIL_DOMAIN);
}

/** Lee el idCliente del payload de un JWT SIN verificar firma (solo para canje;
 * la validez real la confirma la introspección al servicio externo). */
function decodeIdCliente(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const p = JSON.parse(json) as { idCliente?: string; sub?: string };
    return p.idCliente ?? p.sub ?? null;
  } catch {
    return null;
  }
}

/** CLAVE_HASH es una sola columna → empaquetamos 'salt$clave' del password.util. */
function packHash(clave: string, salt: string): string {
  return `${salt}$${clave}`; // pbkdf2sha256$100000$<hex>$<base64>  (4 partes)
}
function verifyPacked(password: string, packed: string | null): boolean {
  if (!packed) return false;
  const parts = packed.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2sha256') return false; // formato ajeno → no valida
  const saltMeta = `${parts[0]}$${parts[1]}$${parts[2]}`;
  return verifyPassword(password, parts[3], saltMeta);
}

/**
 * Hash señuelo (formato válido) para equalizar el tiempo de login cuando el
 * email no existe o no tiene clave: así el PBKDF2 corre SIEMPRE y no se filtra
 * por timing si la cuenta existe. Se computa una sola vez.
 */
const DUMMY_PACKED = (() => {
  const { clave, salt } = hashPassword('__decoy__');
  return packHash(clave, salt);
})();

interface UsuarioRow {
  ID_CLIENTE: string;
  EMAIL: string;
  NOMBRE: string | null;
  APELLIDO: string | null;
  FOTO_URL: string | null;
  NUMERO_CELULAR: string | null;
  IS_VERIFIED: number | null;
  ONBOARDING_COMPLETO: string | null;
  GOOGLE_ID: string | null;
  APPLE_ID?: string | null;
  TIPO_ID?: string | null;
  NUMERO_ID?: string | null;
  CLAVE_HASH?: string | null;
}

@Injectable()
export class AsistenteAuthService {
  constructor(
    private readonly oracle: OracleService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: AsistenteMailerService,
  ) {}

  /**
   * Exponer tokens de verificación/reset en la RESPUESTA solo si un flag
   * explícito lo habilita (ASISTENTE_DEV_TOKENS=true), que vive ÚNICAMENTE en el
   * override local (gitignored). NUNCA depende de si el mailer está o no
   * configurado → en producción jamás se filtra el secreto al llamante.
   */
  private get devTokens(): boolean {
    return this.config.get<string>('ASISTENTE_DEV_TOKENS') === 'true';
  }

  /* ---------- tokens ---------- */
  private async issueTokens(sub: string, email: string) {
    const accessToken = await this.jwt.signAsync(
      { sub, email, aud: ASISTENTE_AUD, typ: 'access' },
      {
        secret: this.config.getOrThrow(ASISTENTE_ACCESS_SECRET_ENV),
        expiresIn: ASISTENTE_ACCESS_TTL,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub, aud: ASISTENTE_AUD, typ: 'refresh' },
      {
        secret: this.config.getOrThrow(ASISTENTE_REFRESH_SECRET_ENV),
        expiresIn: ASISTENTE_REFRESH_TTL,
      },
    );
    return { accessToken, refreshToken };
  }

  /**
   * Canje de sesión: el móvil se autentica SOLO en el servicio de pagos externo
   * (api-ligaprocorp) y trae su token; ConnectHub lo valida por introspección
   * (GET /usuario/me) — sin necesitar el secreto del otro servicio — y, si es
   * válido, emite SU propia sesión para el mismo ID_CLIENTE (BD compartida).
   * Así hay un solo login (el externo) y los usuarios reales entran directo.
   */
  async intercambiarPago(pagosToken: string) {
    const secret = this.config.get<string>('PAGOS_JWT_SECRET');
    let idCliente: string | null = null;

    if (secret) {
      // Preferido: verificar la FIRMA + expiración localmente con el secreto del servicio.
      try {
        const payload = await this.jwt.verifyAsync<{ idCliente?: string; sub?: string }>(pagosToken, { secret });
        idCliente = payload.idCliente ?? payload.sub ?? null;
      } catch {
        throw new UnauthorizedException('Invalid payments token');
      }
    } else {
      // Respaldo: introspección contra el servicio (valida firma/expiración allá).
      idCliente = decodeIdCliente(pagosToken);
      if (!idCliente) throw new UnauthorizedException('Invalid payments token');
      const base = this.config.get<string>('PAGOS_API_URL') ?? 'https://api-ligaprocorp.ec:3443/api';
      let ok = false;
      try {
        const res = await fetch(`${base}/usuario/me`, { headers: { Authorization: `Bearer ${pagosToken}` } });
        ok = res.ok;
      } catch {
        throw new ServiceUnavailableException('Payments service unavailable');
      }
      if (!ok) throw new UnauthorizedException('Invalid payments token');
    }

    if (!idCliente) throw new UnauthorizedException('Invalid payments token');
    const u = await this.findById(idCliente);
    if (!u) throw new UnauthorizedException('User not found');

    const tokens = await this.issueTokens(u.ID_CLIENTE, u.EMAIL);
    return { ...tokens, user: this.mapUser(u) };
  }

  private mapUser(u: UsuarioRow) {
    return {
      id: u.ID_CLIENTE,
      email: u.EMAIL,
      nombre: u.NOMBRE,
      apellido: u.APELLIDO,
      fotoUrl: u.FOTO_URL,
      numeroCelular: u.NUMERO_CELULAR,
      tipoId: u.TIPO_ID ?? null,
      numeroId: u.NUMERO_ID ?? null,
      // Los usuarios de login social (Apple/Google) están verificados por el
      // proveedor: no hay correo que confirmar. Cubre también a los creados por
      // el servicio externo de pagos, que pone APPLE_ID/GOOGLE_ID pero no toca
      // la columna IS_VERIFIED de ConnectHub.
      isVerified: (u.IS_VERIFIED ?? 0) === 1 || !!u.GOOGLE_ID || !!u.APPLE_ID,
      onboardingCompleto: (u.ONBOARDING_COMPLETO ?? 'N') === 'S',
      tieneGoogle: !!u.GOOGLE_ID,
      tieneApple: !!u.APPLE_ID,
    };
  }

  private async findByEmail(email: string): Promise<UsuarioRow | null> {
    const rows = await this.oracle.query<UsuarioRow>(
      `SELECT ID_CLIENTE, EMAIL, NOMBRE, APELLIDO, FOTO_URL, NUMERO_CELULAR,
              IS_VERIFIED, ONBOARDING_COMPLETO, GOOGLE_ID, APPLE_ID, TIPO_ID, NUMERO_ID, CLAVE_HASH
         FROM USUARIOS WHERE UPPER(EMAIL) = UPPER(:email)`,
      { email },
    );
    const u = rows[0] ?? null;
    // una cuenta anonimizada (eliminada) no debe poder encontrarse/loguearse
    return u && !esAnonima(u.EMAIL) ? u : null;
  }

  private async findById(id: string): Promise<UsuarioRow | null> {
    const rows = await this.oracle.query<UsuarioRow>(
      `SELECT ID_CLIENTE, EMAIL, NOMBRE, APELLIDO, FOTO_URL, NUMERO_CELULAR,
              IS_VERIFIED, ONBOARDING_COMPLETO, GOOGLE_ID, APPLE_ID, TIPO_ID, NUMERO_ID
         FROM USUARIOS WHERE ID_CLIENTE = :id`,
      { id },
    );
    const u = rows[0] ?? null;
    return u && !esAnonima(u.EMAIL) ? u : null;
  }

  /* ---------- register ---------- */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }
    const id = randomUUID();
    const { clave, salt } = hashPassword(dto.password);
    const claveHash = packHash(clave, salt);
    const verificationToken = randomBytes(24).toString('hex');

    try {
      await this.oracle.execute(
        `INSERT INTO USUARIOS
           (ID_CLIENTE, EMAIL, NOMBRE, APELLIDO, CLAVE_HASH, TIPO_USUARIO,
            IS_VERIFIED, VERIFICATION_TOKEN, TOKEN_EXPIRA,
            PERFIL_COMPLETO, ONBOARDING_COMPLETO, FECHA_CREACION, FECHA_ACTUALIZACION)
         VALUES
           (:id, :email, :nombre, :apellido, :claveHash, 'CLIENTE',
            0, :vtoken, SYSTIMESTAMP + INTERVAL '1' DAY,
            'N', 'N', SYSTIMESTAMP, SYSTIMESTAMP)`,
        {
          id,
          email,
          nombre: dto.nombre ?? null,
          apellido: dto.apellido ?? null,
          claveHash,
          vtoken: verificationToken,
        },
      );
    } catch (err) {
      // respaldo por el UNIQUE de EMAIL (carrera)
      if (String(err).includes('ORA-00001')) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }

    await this.mailer.enviarVerificacion(email, dto.nombre ?? null, verificationToken);
    const tokens = await this.issueTokens(id, email);
    const user = this.mapUser({
      ID_CLIENTE: id,
      EMAIL: email,
      NOMBRE: dto.nombre ?? null,
      APELLIDO: dto.apellido ?? null,
      FOTO_URL: null,
      NUMERO_CELULAR: null,
      IS_VERIFIED: 0,
      ONBOARDING_COMPLETO: 'N',
      GOOGLE_ID: null,
    });
    return {
      ...tokens,
      user,
      // SOLO en dev (flag explícito local) devolvemos el token para verificar
      // sin correo. En producción jamás se filtra.
      ...(this.devTokens ? { devVerificationToken: verificationToken } : {}),
    };
  }

  /* ---------- login ---------- */
  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const u = await this.findByEmail(email);
    // corre PBKDF2 SIEMPRE (incluso si no existe el usuario) para no filtrar
    // la existencia de la cuenta por timing.
    const ok = verifyPacked(dto.password, u?.CLAVE_HASH ?? DUMMY_PACKED);
    if (!u || !ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tokens = await this.issueTokens(u.ID_CLIENTE, u.EMAIL);
    return { ...tokens, user: this.mapUser(u) };
  }

  /* ---------- Google Sign-In ---------- */
  async google(idToken: string) {
    const allowed = (this.config.get<string>('GOOGLE_CLIENT_IDS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowed.length) {
      throw new ServiceUnavailableException('Google sign-in not configured');
    }
    // Google verifica firma + expiración y devuelve el payload decodificado.
    let p: {
      sub?: string;
      email?: string;
      email_verified?: string | boolean;
      aud?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
    };
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
      if (!res.ok) throw new Error('tokeninfo ' + res.status);
      p = (await res.json()) as typeof p;
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (!p.sub || !p.email || !p.aud || !allowed.includes(p.aud)) {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (p.email_verified !== true && p.email_verified !== 'true') {
      throw new UnauthorizedException('Google email not verified');
    }
    const email = p.email.toLowerCase();

    // buscar por GOOGLE_ID; si no, por email (vincula Google a cuenta existente)
    let u =
      (
        await this.oracle.query<UsuarioRow>(
          `SELECT ID_CLIENTE, EMAIL, NOMBRE, APELLIDO, FOTO_URL, NUMERO_CELULAR,
                  IS_VERIFIED, ONBOARDING_COMPLETO, GOOGLE_ID, TIPO_ID, NUMERO_ID
             FROM USUARIOS WHERE GOOGLE_ID = :g`,
          { g: p.sub },
        )
      )[0] ?? null;

    if (!u) {
      const existing = await this.findByEmail(email);
      if (existing) {
        // vincula el GOOGLE_ID a la cuenta de ese email
        await this.oracle.execute(
          `UPDATE USUARIOS SET GOOGLE_ID = :g, IS_VERIFIED = 1,
                  FECHA_ACTUALIZACION = SYSTIMESTAMP
            WHERE ID_CLIENTE = :id`,
          { g: p.sub, id: existing.ID_CLIENTE },
        );
        u = { ...existing, GOOGLE_ID: p.sub, IS_VERIFIED: 1 };
      } else {
        const id = randomUUID();
        await this.oracle.execute(
          `INSERT INTO USUARIOS
             (ID_CLIENTE, EMAIL, NOMBRE, APELLIDO, FOTO_URL, GOOGLE_ID,
              TIPO_USUARIO, IS_VERIFIED, PERFIL_COMPLETO, ONBOARDING_COMPLETO,
              FECHA_CREACION, FECHA_ACTUALIZACION)
           VALUES
             (:id, :email, :nombre, :apellido, :foto, :g,
              'CLIENTE', 1, 'N', 'N', SYSTIMESTAMP, SYSTIMESTAMP)`,
          {
            id,
            email,
            nombre: p.given_name ?? null,
            apellido: p.family_name ?? null,
            foto: p.picture ?? null,
            g: p.sub,
          },
        );
        u = {
          ID_CLIENTE: id,
          EMAIL: email,
          NOMBRE: p.given_name ?? null,
          APELLIDO: p.family_name ?? null,
          FOTO_URL: p.picture ?? null,
          NUMERO_CELULAR: null,
          IS_VERIFIED: 1,
          ONBOARDING_COMPLETO: 'N',
          GOOGLE_ID: p.sub,
        };
      }
    }

    const tokens = await this.issueTokens(u.ID_CLIENTE, u.EMAIL);
    return { ...tokens, user: this.mapUser(u) };
  }

  /* ---------- Sign in with Apple (nativo) ---------- */
  async apple(dto: AppleDto) {
    const allowed = (this.config.get<string>('APPLE_CLIENT_IDS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowed.length) {
      throw new ServiceUnavailableException('Apple sign-in not configured');
    }

    // Verifica firma (JWKS de Apple) + issuer + audience (bundle id) + expiración.
    let claims: { sub?: string; email?: unknown; email_verified?: unknown };
    try {
      const { payload } = await jwtVerify(dto.identityToken, APPLE_JWKS, {
        issuer: APPLE_ISSUER,
        audience: allowed,
      });
      claims = payload as typeof claims;
    } catch {
      throw new UnauthorizedException('Invalid Apple token');
    }
    const sub = typeof claims.sub === 'string' ? claims.sub : null;
    if (!sub) throw new UnauthorizedException('Invalid Apple token');

    // El email del TOKEN es la fuente confiable; Apple lo marca verificado.
    const tokenEmail = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';

    // 1) por APPLE_ID (identidad estable).
    let u: UsuarioRow | null =
      (
        await this.oracle.query<UsuarioRow>(
          `SELECT ID_CLIENTE, EMAIL, NOMBRE, APELLIDO, FOTO_URL, NUMERO_CELULAR,
                  IS_VERIFIED, ONBOARDING_COMPLETO, GOOGLE_ID, APPLE_ID, TIPO_ID, NUMERO_ID
             FROM USUARIOS WHERE APPLE_ID = :a`,
          { a: sub },
        )
      )[0] ?? null;
    if (u && esAnonima(u.EMAIL)) u = null; // cuenta eliminada → no revive

    if (!u) {
      // 2) vincular a cuenta existente SOLO por email VERIFICADO del token
      //    (nunca por el email del DTO, para no permitir apropiación de cuenta).
      if (tokenEmail && emailVerified) {
        const existing = await this.findByEmail(tokenEmail);
        if (existing) {
          await this.oracle.execute(
            `UPDATE USUARIOS SET APPLE_ID = :a, IS_VERIFIED = 1,
                    FECHA_ACTUALIZACION = SYSTIMESTAMP
              WHERE ID_CLIENTE = :id`,
            { a: sub, id: existing.ID_CLIENTE },
          );
          u = { ...existing, APPLE_ID: sub, IS_VERIFIED: 1 };
        }
      }

      // 3) crear cuenta nueva SOLO con el email VERIFICADO del token. Nunca con el
      //    email del DTO (lo controla el cliente): crear una cuenta con un email no
      //    probado y marcarla verificada permitiría pre-registrar/secuestrar la
      //    cuenta de una víctima. (nombre/apellido del DTO sí, son solo display.)
      if (!u) {
        if (!tokenEmail || !emailVerified) {
          throw new UnauthorizedException('Apple did not provide a verified email');
        }
        const email = tokenEmail;
        const id = randomUUID();
        try {
          await this.oracle.execute(
            `INSERT INTO USUARIOS
               (ID_CLIENTE, EMAIL, NOMBRE, APELLIDO, APPLE_ID,
                TIPO_USUARIO, IS_VERIFIED, PERFIL_COMPLETO, ONBOARDING_COMPLETO,
                FECHA_CREACION, FECHA_ACTUALIZACION)
             VALUES
               (:id, :email, :nombre, :apellido, :a,
                'CLIENTE', 1, 'N', 'N', SYSTIMESTAMP, SYSTIMESTAMP)`,
            {
              id,
              email,
              nombre: dto.nombre ?? null,
              apellido: dto.apellido ?? null,
              a: sub,
            },
          );
        } catch (err) {
          if (String(err).includes('ORA-00001')) {
            // el email ya existe pero no pudimos vincular (no venía verificado del token)
            throw new ConflictException('Email already registered');
          }
          throw err;
        }
        u = {
          ID_CLIENTE: id,
          EMAIL: email,
          NOMBRE: dto.nombre ?? null,
          APELLIDO: dto.apellido ?? null,
          FOTO_URL: null,
          NUMERO_CELULAR: null,
          IS_VERIFIED: 1,
          ONBOARDING_COMPLETO: 'N',
          GOOGLE_ID: null,
          APPLE_ID: sub,
        };
      }
    }

    const tokens = await this.issueTokens(u.ID_CLIENTE, u.EMAIL);
    return { ...tokens, user: this.mapUser(u) };
  }

  /* ---------- verify email ---------- */
  async verify(token: string) {
    const res = await this.oracle.execute(
      `UPDATE USUARIOS
          SET IS_VERIFIED = 1, VERIFICATION_TOKEN = NULL, TOKEN_EXPIRA = NULL,
              FECHA_ACTUALIZACION = SYSTIMESTAMP
        WHERE VERIFICATION_TOKEN = :token AND TOKEN_EXPIRA > SYSTIMESTAMP`,
      { token },
    );
    if (!res.rowsAffected) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    return { verified: true };
  }

  /** Reenvía el correo de verificación (nuevo token) al usuario autenticado. */
  async resendVerification(idCliente: string) {
    const rows = await this.oracle.query<{ EMAIL: string; NOMBRE: string | null; IS_VERIFIED: number | null }>(
      `SELECT EMAIL, NOMBRE, IS_VERIFIED FROM USUARIOS WHERE ID_CLIENTE = :id`,
      { id: idCliente },
    );
    const u = rows[0];
    if (!u) throw new BadRequestException('User not found');
    if ((u.IS_VERIFIED ?? 0) === 1) return { alreadyVerified: true };
    const token = randomBytes(24).toString('hex');
    await this.oracle.execute(
      `UPDATE USUARIOS
          SET VERIFICATION_TOKEN = :t, TOKEN_EXPIRA = SYSTIMESTAMP + INTERVAL '1' DAY,
              FECHA_ACTUALIZACION = SYSTIMESTAMP
        WHERE ID_CLIENTE = :id`,
      { t: token, id: idCliente },
    );
    await this.mailer.enviarVerificacion(u.EMAIL, u.NOMBRE, token);
    return { sent: true };
  }

  /* ---------- refresh ---------- */
  async refresh(refreshToken: string) {
    let payload: AsistenteRefreshPayload;
    try {
      payload = this.jwt.verify<AsistenteRefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow(ASISTENTE_REFRESH_SECRET_ENV),
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    if (payload.aud !== ASISTENTE_AUD || payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid token');
    }
    const u = await this.findById(payload.sub);
    if (!u) throw new UnauthorizedException('Invalid token');
    const tokens = await this.issueTokens(u.ID_CLIENTE, u.EMAIL);
    return { ...tokens, user: this.mapUser(u) };
  }

  /* ---------- me ---------- */
  async me(id: string) {
    const u = await this.findById(id);
    if (!u) throw new UnauthorizedException('Invalid token');
    return this.mapUser(u);
  }

  /* ---------- onboarding ---------- */
  async onboarding(id: string, dto: OnboardingDto) {
    // Guard de escritura: findById devuelve null para cuentas anonimizadas
    // (eliminadas). Sin esto, un access token aún vigente (15m) tras el borrado
    // podría re-inyectar PII en la cuenta ya anonimizada.
    const actual = await this.findById(id);
    if (!actual) throw new UnauthorizedException('Invalid token');
    await this.oracle.execute(
      `UPDATE USUARIOS
          SET NOMBRE = COALESCE(:nombre, NOMBRE),
              APELLIDO = COALESCE(:apellido, APELLIDO),
              NUMERO_CELULAR = COALESCE(:cel, NUMERO_CELULAR),
              GENERO = COALESCE(:genero, GENERO),
              TIPO_ID = COALESCE(:tipoId, TIPO_ID),
              NUMERO_ID = COALESCE(:numeroId, NUMERO_ID),
              ONBOARDING_COMPLETO = 'S',
              FECHA_ACTUALIZACION = SYSTIMESTAMP
        WHERE ID_CLIENTE = :id`,
      {
        id,
        nombre: dto.nombre ?? null,
        apellido: dto.apellido ?? null,
        cel: dto.numeroCelular ?? null,
        genero: dto.genero ?? null,
        tipoId: dto.tipoId ?? null,
        numeroId: dto.numeroId ?? null,
      },
    );
    return this.me(id);
  }

  /* ---------- forgot (reset token, NO destructivo) ---------- */
  async forgot(email: string) {
    const norm = email.trim().toLowerCase();
    const u = await this.findByEmail(norm);
    // Siempre responde igual (no revela si el email existe). NO toca la clave:
    // solo emite un reset token firmado (stateless) y lo manda por correo. La
    // clave únicamente cambia en /reset con prueba de propiedad (el token).
    if (!u) return { sent: true };
    const resetToken = await this.jwt.signAsync(
      { sub: u.ID_CLIENTE, aud: ASISTENTE_AUD, typ: 'reset' },
      {
        secret: this.config.getOrThrow(ASISTENTE_ACCESS_SECRET_ENV),
        expiresIn: ASISTENTE_RESET_TTL,
      },
    );
    await this.mailer.enviarReset(u.EMAIL, u.NOMBRE, resetToken);
    return {
      sent: true,
      ...(this.devTokens ? { devResetToken: resetToken } : {}),
    };
  }

  /* ---------- reset (confirma con el token) ---------- */
  async resetPassword(token: string, newPassword: string) {
    let payload: AsistenteResetPayload;
    try {
      payload = this.jwt.verify<AsistenteResetPayload>(token, {
        secret: this.config.getOrThrow(ASISTENTE_ACCESS_SECRET_ENV),
      });
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (payload.aud !== ASISTENTE_AUD || payload.typ !== 'reset') {
      throw new BadRequestException('Invalid reset token');
    }
    // No permitir resetear la clave de una cuenta anonimizada (eliminada).
    const actual = await this.findById(payload.sub);
    if (!actual) throw new BadRequestException('Invalid reset token');
    const { clave, salt } = hashPassword(newPassword);
    const res = await this.oracle.execute(
      `UPDATE USUARIOS SET CLAVE_HASH = :h, FECHA_ACTUALIZACION = SYSTIMESTAMP
        WHERE ID_CLIENTE = :id`,
      { h: packHash(clave, salt), id: payload.sub },
    );
    if (!res.rowsAffected) throw new BadRequestException('Invalid reset token');
    return { reset: true };
  }

  /* ---------- eliminar cuenta (Apple 5.1.1v) ---------- */
  /**
   * Borrado de cuenta ANONIMIZANDO + reteniendo registros financieros:
   *  - borra el footprint personal/networking (perfil, conexiones, chats, comunidad,
   *    push, tarjetas guardadas, vínculos de institución, archivos);
   *  - limpia PII libre en registros retenidos (email en el log de tarjetas, nombre
   *    en certificados);
   *  - anonimiza la fila USUARIOS (email centinela + todas las credenciales/PII a NULL),
   *    conservándola para no romper los FK de pagos/entradas/log de tarjetas.
   * Todo en UNA transacción (atómico). Idempotente: si ya está anonimizada, no hace nada.
   */
  async deleteAccount(id: string) {
    const rows = await this.oracle.query<{ EMAIL: string }>(
      `SELECT EMAIL FROM USUARIOS WHERE ID_CLIENTE = :id`,
      { id },
    );
    if (!rows[0]) throw new UnauthorizedException('Invalid token');
    if (esAnonima(rows[0].EMAIL)) return { deleted: true }; // ya eliminada

    const sentinel = `deleted-${id}${DELETED_EMAIL_DOMAIN}`;
    await this.oracle.withConnection(async (conn) => {
      const del = (sql: string) => conn.execute(sql, { id });
      // 0) CONTROL: snapshot de participación ANTES de anonimizar. El borrado
      //    deja al usuario sin nombre/correo, así que perdíamos el inventario de
      //    QUIÉN participó en cada evento; aquí se conserva ese registro (solo
      //    lectura interna, para control/inventario). Ver docs/sql/2026-07-17_log_participantes.sql
      await conn.execute(
        `INSERT INTO LOG_PARTICIPANTES_EVENTO
           (ID_CLIENTE, ID_EVENTO, NOMBRE, APELLIDO, EMAIL, TIPO_ID, NUMERO_ID, TITULO_EVENTO, ASISTIO, ESTADO, FECHA_ENTRADA)
         SELECT u.ID_CLIENTE, eu.ID_EVENTO, u.NOMBRE, u.APELLIDO, u.EMAIL, u.TIPO_ID, u.NUMERO_ID,
                e.TITULO, eu.ASISTIO, eu.ESTADO, eu.FECHA_ENTRADA
           FROM EVENTOS_USUARIOS eu
           JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
           JOIN EVENTOS e ON e.ID_EVENTO = eu.ID_EVENTO
          WHERE eu.ID_CLIENTE = :id`,
        { id },
      );
      // 1) footprint personal / networking (mensajes primero para no dejar huérfanos)
      await del(
        `DELETE FROM MENSAJE_PRIVADO
          WHERE ID_CHAT IN (SELECT ID_CHAT FROM CHAT_PRIVADO
                             WHERE ID_CLIENTE_A = :id OR ID_CLIENTE_B = :id)`,
      );
      await del(`DELETE FROM CHAT_PRIVADO WHERE ID_CLIENTE_A = :id OR ID_CLIENTE_B = :id`);
      await del(`DELETE FROM CONEXIONES WHERE ID_SOLICITANTE = :id OR ID_DESTINATARIO = :id`);
      await del(`DELETE FROM COMUNIDAD_MENSAJES WHERE ID_CLIENTE = :id`);
      await del(`DELETE FROM COMUNIDAD_MIEMBROS WHERE ID_CLIENTE = :id`);
      await del(`DELETE FROM PERFIL_ASISTENTE WHERE ID_CLIENTE = :id`);
      await del(`DELETE FROM USUARIO_PUSH_TOKENS WHERE ID_CLIENTE = :id`);
      await del(`DELETE FROM TARJETAS_USUARIO WHERE ID_CLIENTE = :id`);
      await del(`DELETE FROM USUARIO_INSTITUCIONES WHERE ID_CLIENTE = :id`);
      await del(`DELETE FROM ARCHIVOS WHERE ID_USUARIO = :id`);
      // 2) retener financieros/asistencia pero quitar PII libre
      await conn.execute(`UPDATE TARJETAS_EVENTOS_LOG SET EMAIL = NULL WHERE ID_CLIENTE = :id`, { id });
      await conn.execute(
        `UPDATE CERTIFICADOS SET NOMBRE_ASISTENTE = :anon WHERE ID_CLIENTE = :id`,
        { id, anon: 'Cuenta eliminada' },
      );
      // 3) anonimizar la cuenta (conserva la fila → FKs financieros intactos)
      await conn.execute(
        `UPDATE USUARIOS
            SET EMAIL = :sentinel, NOMBRE = NULL, APELLIDO = NULL, FOTO_URL = NULL,
                NUMERO_CELULAR = NULL, GOOGLE_ID = NULL, APPLE_ID = NULL, DIRECCION = NULL,
                FECHA_NACIMIENTO = NULL, GENERO = NULL, TIPO_ID = NULL, NUMERO_ID = NULL,
                CLAVE_HASH = NULL, REFRESH_TOKEN = NULL, VERIFICATION_TOKEN = NULL, TOKEN_EXPIRA = NULL,
                IS_VERIFIED = 0, PERFIL_COMPLETO = 'N', ONBOARDING_COMPLETO = 'N',
                FECHA_ACTUALIZACION = SYSTIMESTAMP
          WHERE ID_CLIENTE = :id`,
        { id, sentinel },
      );
      await conn.commit();
    });
    return { deleted: true };
  }
}
