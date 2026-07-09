import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

/**
 * Envío de correos. Se activa solo si hay SMTP_HOST configurado en el .env
 * (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM). Sin SMTP, los
 * endpoints siguen funcionando y devuelven la clave temporal en la respuesta
 * (modo desarrollo) para no bloquear el flujo.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null = null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('SMTP_FROM') ?? 'no-reply@connect-hub.local';
    this.appUrl =
      config.get<string>('APP_URL') ?? 'https://connecthub.fourstacklabs.com';
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(config.get('SMTP_PORT') ?? 587),
        secure: Number(config.get('SMTP_PORT') ?? 587) === 465,
        auth: config.get('SMTP_USER')
          ? {
              user: config.get<string>('SMTP_USER'),
              pass: config.get<string>('SMTP_PASS'),
            }
          : undefined,
      });
      this.logger.log(`SMTP configurado: ${host}`);
    } else {
      this.logger.warn(
        'SMTP no configurado: las claves temporales se devuelven en la respuesta (solo desarrollo)',
      );
    }
  }

  get habilitado(): boolean {
    return this.transporter !== null;
  }

  async enviarClaveTemporal(
    destino: string,
    nombre: string,
    claveTemporal: string,
  ): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: destino,
        subject: 'ConnectHub — Password recovery',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#7c3aed">ConnectHub</h2>
            <p>Hi ${nombre},</p>
            <p>We received a request to reset your password. Your temporary password is:</p>
            <p style="font-size:22px;font-weight:bold;letter-spacing:2px;background:#f1f5f9;padding:12px;border-radius:8px;text-align:center">${claveTemporal}</p>
            <p>When you sign in with it, the system will ask you to create a new password.</p>
            <p style="color:#64748b;font-size:12px">If you didn't request this change, please ignore this email.</p>
          </div>`,
      });
      return true;
    } catch (err) {
      this.logger.error(`Error enviando correo a ${destino}: ${String(err)}`);
      return false;
    }
  }

  /** Correo de bienvenida con las credenciales de acceso recién creadas */
  async enviarCredenciales(
    destino: string,
    nombres: string | null,
    apellidos: string | null,
    usuario: string,
    claveTemporal: string,
  ): Promise<boolean> {
    if (!this.transporter) return false;
    const nombre = [nombres, apellidos].filter(Boolean).join(' ') || usuario;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: destino,
        subject: 'ConnectHub — Your platform access',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
            <h2 style="color:#7c3aed">ConnectHub</h2>
            <p>Dear ${nombre},</p>
            <p>An account has been created for you on the ConnectHub platform. Your access credentials are:</p>
            <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:12px 0">
              <p style="margin:4px 0"><b>Username:</b> ${usuario}</p>
              <p style="margin:4px 0"><b>Password:</b>
                <span style="font-weight:bold;letter-spacing:1px">${claveTemporal}</span>
              </p>
            </div>
            <p>Sign in to the platform here:</p>
            <p style="text-align:center;margin:16px 0">
              <a href="${this.appUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block">Sign in to ConnectHub</a>
            </p>
            <p style="color:#64748b;font-size:13px">${this.appUrl}</p>
            <p>For your security, you'll be asked to set a new password the first time you sign in.</p>
            <p style="color:#64748b;font-size:12px">If you weren't expecting this email, please ignore it.</p>
          </div>`,
      });
      return true;
    } catch (err) {
      this.logger.error(`Error enviando credenciales a ${destino}: ${String(err)}`);
      return false;
    }
  }

  /**
   * Correo de bienvenida al aprovisionar una institución vía webhook: incluye
   * las credenciales del usuario SYSTEM y el código de conexión de la institución.
   */
  async enviarBienvenidaInstitucion(opts: {
    destino: string;
    nombres: string | null;
    apellidos: string | null;
    usuario: string;
    claveTemporal: string;
    institucion: string;
    codigoConexion: string;
  }): Promise<boolean> {
    if (!this.transporter) return false;
    const nombre =
      [opts.nombres, opts.apellidos].filter(Boolean).join(' ') || opts.usuario;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: opts.destino,
        subject: `Welcome to ConnectHub — ${opts.institucion}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
            <h2 style="color:#7c3aed">ConnectHub</h2>
            <p>Dear ${nombre},</p>
            <p>Your institution <b>${opts.institucion}</b> has been created on the
               ConnectHub platform, and an administrator account (SYSTEM role) was
               set up for you. Your access credentials are:</p>
            <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:12px 0">
              <p style="margin:4px 0"><b>Username:</b> ${opts.usuario}</p>
              <p style="margin:4px 0"><b>Password:</b>
                <span style="font-weight:bold;letter-spacing:1px">${opts.claveTemporal}</span>
              </p>
            </div>
            <p>Your institution's <b>connection code</b> is:</p>
            <p style="font-size:20px;font-weight:bold;letter-spacing:2px;background:#ede9fe;color:#5b21b6;padding:12px;border-radius:8px;text-align:center">${opts.codigoConexion}</p>
            <p style="font-size:13px;color:#475569">Enter this code in the mobile app to load
               <b>${opts.institucion}</b>'s events.</p>
            <p style="text-align:center;margin:16px 0">
              <a href="${this.appUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block">Sign in to ConnectHub</a>
            </p>
            <p style="color:#64748b;font-size:13px">${this.appUrl}</p>
            <p>For your security, you'll be asked to set a new password the first time you sign in.</p>
          </div>`,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Error enviando bienvenida a ${opts.destino}: ${String(err)}`,
      );
      return false;
    }
  }
}
