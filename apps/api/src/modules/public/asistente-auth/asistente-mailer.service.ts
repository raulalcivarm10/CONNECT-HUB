import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Mailer AISLADO del asistente. Reutiliza las MISMAS env vars SMTP que el admin
 * pero con su propio transporter (no toca MailerService del panel). Fail-soft:
 * si no hay SMTP_HOST no envía y devuelve false (en dev el token se muestra en
 * la respuesta). Nunca lanza por falta de correo.
 */
@Injectable()
export class AsistenteMailerService {
  private readonly logger = new Logger(AsistenteMailerService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    this.from =
      this.config.get<string>('SMTP_FROM') ?? 'no-reply@connect-hub.local';
    this.appUrl =
      this.config.get<string>('APP_URL') ??
      'https://connecthub.fourstacklabs.com';
    if (host) {
      const port = Number(this.config.get('SMTP_PORT') ?? 587);
      const user = this.config.get<string>('SMTP_USER');
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user
          ? { user, pass: this.config.get<string>('SMTP_PASS') }
          : undefined,
      });
    } else {
      this.transporter = null;
      this.logger.warn('SMTP no configurado: correos de asistente deshabilitados');
    }
  }

  get habilitado(): boolean {
    return this.transporter !== null;
  }

  private async enviar(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      return true;
    } catch (err) {
      this.logger.error(`No se pudo enviar a ${to}: ${String(err)}`);
      return false;
    }
  }

  /** Verificación de cuenta con enlace + código. */
  enviarVerificacion(to: string, nombre: string | null, token: string): Promise<boolean> {
    const link = `${this.appUrl}/verify?token=${encodeURIComponent(token)}`;
    return this.enviar(
      to,
      'Verify your ConnectHub account',
      `<p>Hi ${nombre ?? ''},</p>
       <p>Confirm your email to start exploring events:</p>
       <p><a href="${link}">Verify my account</a></p>
       <p>Or use this code: <b>${token}</b></p>`,
    );
  }

  /** Confirmación de compra/inscripción a un evento (tras pago aprobado). */
  enviarConfirmacionPago(
    to: string,
    nombre: string,
    evento: string,
    monto: number,
    transactionId: string,
  ): Promise<boolean> {
    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;background:#ffffff">
      <div style="background:linear-gradient(135deg,#0e7490,#1e293b);padding:32px 24px;text-align:center;border-radius:8px 8px 0 0">
        <div style="color:#ffffff;font-size:24px;font-weight:700">Compra exitosa</div>
        <div style="color:#cbd5e1;font-size:14px;margin-top:4px">Confirmación de inscripción</div>
      </div>
      <div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        <p>Estimado/a <b>${nombre}</b>,</p>
        <p>Tu inscripción al evento ha sido <b>confirmada</b>.</p>
        <div style="border-left:4px solid #0e7490;background:#f1f5f9;padding:16px 20px;border-radius:6px;margin:16px 0">
          <div style="font-size:18px;font-weight:700;color:#0f172a">${evento}</div>
          <div style="margin-top:8px;color:#334155">Estado: <b>PAGADO</b></div>
          <div style="color:#334155">Monto: <b>$${monto.toFixed(2)}</b></div>
          <div style="color:#334155">Transacción: <b>${transactionId}</b></div>
        </div>
        <p>Puedes encontrar tu código QR en la sección de información del evento dentro de la aplicación.</p>
        <p>Te recomendamos tenerlo listo el día del evento para un acceso más ágil.</p>
        <p>Gracias por usar nuestra aplicación.</p>
      </div>
    </div>`;
    return this.enviar(to, 'Compra exitosa · Confirmación de inscripción', html);
  }

  /** Recuperación: enlace de reset (el token NO cambia la clave hasta /reset). */
  enviarReset(to: string, nombre: string | null, token: string): Promise<boolean> {
    const link = `${this.appUrl}/reset?token=${encodeURIComponent(token)}`;
    return this.enviar(
      to,
      'Reset your ConnectHub password',
      `<p>Hi ${nombre ?? ''},</p>
       <p>We received a request to reset your password. This link expires in 1 hour:</p>
       <p><a href="${link}">Reset my password</a></p>
       <p>If you didn’t request this, you can safely ignore this email — your password won’t change.</p>`,
    );
  }
}
