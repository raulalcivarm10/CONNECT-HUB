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

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('SMTP_FROM') ?? 'no-reply@connect-hub.local';
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
        subject: 'CONNECT-HUB — Recuperación de contraseña',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#7c3aed">CONNECT-HUB</h2>
            <p>Hola ${nombre},</p>
            <p>Recibimos una solicitud para restablecer tu contraseña. Tu contraseña temporal es:</p>
            <p style="font-size:22px;font-weight:bold;letter-spacing:2px;background:#f1f5f9;padding:12px;border-radius:8px;text-align:center">${claveTemporal}</p>
            <p>Al ingresar con ella, el sistema te pedirá crear una contraseña nueva.</p>
            <p style="color:#64748b;font-size:12px">Si no solicitaste este cambio, ignora este correo.</p>
          </div>`,
      });
      return true;
    } catch (err) {
      this.logger.error(`Error enviando correo a ${destino}: ${String(err)}`);
      return false;
    }
  }
}
