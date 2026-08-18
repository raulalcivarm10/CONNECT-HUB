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
    cupon?: string | null,
  ): Promise<boolean> {
    // Línea extra solo cuando la inscripción usó cupón (el servidor la lee de
    // EVENTOS_USUARIOS.CUPON_CODIGO, así que no depende de lo que mande la app).
    const lineaCupon = cupon
      ? `<div style="color:#334155">Coupon: <b>${cupon}</b></div>`
      : '';
    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;background:#ffffff">
      <div style="background:linear-gradient(135deg,#0e7490,#1e293b);padding:32px 24px;text-align:center;border-radius:8px 8px 0 0">
        <div style="color:#ffffff;font-size:24px;font-weight:700">Payment successful</div>
        <div style="color:#cbd5e1;font-size:14px;margin-top:4px">Registration confirmed</div>
      </div>
      <div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        <p>Hi <b>${nombre}</b>,</p>
        <p>Your registration for this event has been <b>confirmed</b>.</p>
        <div style="border-left:4px solid #0e7490;background:#f1f5f9;padding:16px 20px;border-radius:6px;margin:16px 0">
          <div style="font-size:18px;font-weight:700;color:#0f172a">${evento}</div>
          <div style="margin-top:8px;color:#334155">Status: <b>PAID</b></div>
          <div style="color:#334155">Amount: <b>$${monto.toFixed(2)}</b></div>
          ${lineaCupon}
          <div style="color:#334155">Transaction: <b>${transactionId}</b></div>
        </div>
        <p>You can find your QR code in the event information section of the app.</p>
        <p>Have it ready on the day of the event for faster entry.</p>
        <p>Thank you for using ConnectHub.</p>
      </div>
    </div>`;
    return this.enviar(to, 'Payment successful · Registration confirmed', html);
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
