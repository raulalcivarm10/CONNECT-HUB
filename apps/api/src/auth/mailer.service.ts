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

  /**
   * Aviso de vencimiento de la suscripción (lo dispara el trabajo nocturno de
   * suscripciones unos días antes de la fecha de fin). Va al comprador, en
   * inglés y sobrio: es una comunicación administrativa, no una promoción.
   */
  async enviarAvisoVencimiento(opts: {
    destino: string;
    nombre: string | null;
    institucion: string;
    /** último día CON servicio, 'YYYY-MM-DD' */
    fechaFin: string;
    diasRestantes: number;
  }): Promise<boolean> {
    if (!this.transporter) return false;
    const saludo = opts.nombre?.trim() ? opts.nombre.trim() : 'there';
    const plazo =
      opts.diasRestantes === 0
        ? 'today'
        : opts.diasRestantes === 1
          ? 'in 1 day'
          : `in ${opts.diasRestantes} days`;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: opts.destino,
        subject: `ConnectHub — Your subscription expires ${plazo}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
            <h2 style="color:#7c3aed">ConnectHub</h2>
            <p>Dear ${saludo},</p>
            <p>The ConnectHub subscription for <b>${opts.institucion}</b> expires
               <b>${plazo}</b>, on <b>${opts.fechaFin}</b> (last day of service).</p>
            <p>If the subscription is not renewed, access to the admin panel will be
               suspended and the institution's events will stop being visible in the
               mobile app until it is renewed.</p>
            <p>To renew, please reply to this email or contact your ConnectHub
               representative.</p>
            <p style="color:#64748b;font-size:12px">If the renewal is already in
               progress, please disregard this message.</p>
          </div>`,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Error enviando aviso de vencimiento a ${opts.destino}: ${String(err)}`,
      );
      return false;
    }
  }

  /**
   * Correo de acceso a la demo (evento demo.requested del webhook FSL):
   * credenciales del entorno demo, un usuario por rol.
   */
  async enviarCredencialesDemo(
    destino: string,
    nombres: string | null,
    apellidos: string | null,
  ): Promise<boolean> {
    if (!this.transporter) return false;
    const nombre = [nombres, apellidos].filter(Boolean).join(' ') || destino;
    const usuarios: [string, string][] = [
      ['usersystem@demo.com', 'Full administration (SYSTEM)'],
      ['useradmin@demo.com', 'Administration'],
      ['userfinance@demo.com', 'Finance dashboard'],
      ['useroperations@demo.com', 'Venues and spaces'],
      ['userevents@demo.com', 'Events and attendance'],
    ];
    const filas = usuarios
      .map(
        ([u, rol]) =>
          `<tr><td style="padding:3px 0;font-weight:bold">${u}</td>` +
          `<td style="text-align:right;color:#475569">${rol}</td></tr>`,
      )
      .join('');
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: destino,
        subject: 'Your ConnectHub demo access',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
            <h2 style="color:#7c3aed">ConnectHub</h2>
            <p>Dear ${nombre},</p>
            <p>Thanks for your interest in ConnectHub. We prepared a demo environment
               with sample data so you can explore the admin panel from every angle.
               Each user below opens a different role, so you can see exactly what
               your team would see:</p>
            <div style="background:#f1f5f9;padding:14px 16px;border-radius:8px;margin:12px 0">
              <table style="width:100%;font-size:13px;border-collapse:collapse">${filas}</table>
              <div style="border-top:1px solid #e2e8f0;margin-top:10px;padding-top:10px;font-size:13px">
                Password for all users:
                <span style="font-weight:bold;letter-spacing:1px">Demo2026!</span>
              </div>
            </div>
            <p style="text-align:center;margin:18px 0">
              <a href="${this.appUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block">Try the ConnectHub demo</a>
            </p>
            <p style="text-align:center;color:#64748b;font-size:12px">${this.appUrl}</p>
            <p style="color:#475569;font-size:13px">This is a shared demo environment with
               sample data (Demo Institution: venues, three events, attendance and revenue).
               Please don't enter real information.</p>
            <p style="color:#94a3b8;font-size:12px">If you weren't expecting this email, please ignore it.</p>
          </div>`,
      });
      return true;
    } catch (err) {
      this.logger.error(`Error enviando demo a ${destino}: ${String(err)}`);
      return false;
    }
  }
}
