# Configuración del cliente SMTP (Node + nodemailer) con Gmail / Google Workspace

Guía reutilizable para habilitar el envío de correos en una app Node/NestJS.

## ⚠️ El punto clave (lo que casi siempre falla)

Si el dominio usa **Google Workspace / Gmail**, el SMTP **NO acepta la contraseña
normal** de la cuenta. Hay que usar un **App Password de 16 caracteres**, que
requiere **verificación en 2 pasos** activada.

**Cómo generarlo:** cuenta de Google → *Security* → activar *2-Step Verification*
→ *App passwords* → generar una para "Mail" → salen 16 caracteres (se muestran con
espacios; **úsalos sin espacios**).

> Cómo saber qué proveedor usa un dominio:
> `nslookup -type=mx eldominio.com`
> Si el MX apunta a `smtp.google.com` / `google.com` → Google Workspace.
> Otros: `smtp.office365.com` (Microsoft 365), `smtp.zoho.com` (Zoho).

## 1) Variables de entorno (`.env`)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=support@tudominio.com
SMTP_PASS=xxxxxxxxxxxxxxxx        # App Password de 16 chars, SIN espacios
SMTP_FROM=TuApp <support@tudominio.com>
APP_URL=https://tuapp.com          # para el enlace/botón del correo
```

Puerto 587 = STARTTLS; puerto 465 = SSL.

## 2) Cliente (transporter) con nodemailer

```ts
import nodemailer from 'nodemailer';

const port = Number(process.env.SMTP_PORT ?? 587);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,            // true solo en 465; false en 587 (STARTTLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
```

## 3) Enviar un correo

```ts
await transporter.sendMail({
  from: process.env.SMTP_FROM,     // "Nombre <correo@dominio.com>"
  to: destino,
  subject: 'Your access',
  html: `<p>Hi ${nombre}, your credentials: <b>${usuario}</b> / <b>${clave}</b></p>
         <a href="${process.env.APP_URL}">Sign in</a>`,
});
```

## 4) Docker (si aplica)

- Con `env_file: .env` en el `docker-compose.yml`, todas las variables llegan al
  contenedor.
- Al cambiar el `.env` hay que **recrear** el contenedor, no basta `restart`
  (el `env_file` solo se relee al recrear):

```bash
docker compose up -d api      # relee el .env; "restart" NO lo hace
```

## 5) Probar la autenticación SIN enviar nada

Python (rápido para validar el App Password):

```python
import smtplib
s = smtplib.SMTP('smtp.gmail.com', 587, timeout=25)
s.ehlo(); s.starttls(); s.ehlo()
s.login('support@tudominio.com', 'xxxxxxxxxxxxxxxx')   # lanza error si es inválido
s.noop(); s.quit()
print('SMTP OK')
```

En Node: `await transporter.verify()` → resuelve si las credenciales son válidas.

## Notas / gotchas

- **Contraseña normal ≠ App Password.** Con la normal, Gmail rechaza el login
  (error `535 Username and Password not accepted`).
- Cambiar la contraseña de la cuenta **no** revoca los App Passwords existentes.
- Los App Passwords son **revocables** individualmente sin tocar la cuenta.
- El primer correo puede caer en **spam** hasta que el dominio tenga
  **SPF / DKIM / DMARC** configurados.
- Buena práctica: envío **best-effort** — si falla, la app no se cae; devuelve un
  flag (p. ej. `correoEnviado: boolean`) y como fallback muestra/retorna la clave
  para entregarla manualmente.
- Límites de envío de Gmail/Workspace: ~500 (Gmail) / ~2000 (Workspace) correos
  por día. Para volumen alto, usar un proveedor transaccional (SendGrid, SES,
  Resend, Mailgun).
