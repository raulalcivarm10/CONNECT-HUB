/**
 * Envío PUNTUAL de un seguimiento de renovación al comprador de una suscripción.
 *
 * El aviso automático (suscripciones.cron.ts) ya sale solo N días antes y marca
 * AVISO_ENVIADO para no repetirse. Esto es distinto: un seguimiento manual,
 * redactado para cuando ya queda poco y conviene insistir.
 *
 * Usa la MISMA configuración SMTP que el resto del sistema, así que el correo
 * sale desde la dirección de ConnectHub de siempre.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_enviar-aviso-renovacion.js <idSuscripcion>
 */
const oracledb = require('oracledb');
const nodemailer = require('nodemailer');

const ID = Number(process.argv[2]);
if (!Number.isInteger(ID) || ID <= 0) {
  console.error('Uso: node _enviar-aviso-renovacion.js <idSuscripcion>');
  process.exit(1);
}

/** 2026-09-12 → "Saturday, 12 September 2026" */
function fechaLarga(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

(async () => {
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error('SMTP_HOST no configurado: no se puede enviar.');

  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const { rows } = await c.execute(
    `SELECT s.ID_SUSCRIPCION, i.NOMBRE AS INSTITUCION, s.COMPRADOR_EMAIL,
            s.COMPRADOR_NOMBRE, s.ESTADO,
            TO_CHAR(s.FECHA_FIN, 'YYYY-MM-DD') AS FIN,
            TRUNC(s.FECHA_FIN) - TRUNC(SYSDATE) AS DIAS
       FROM SUSCRIPCIONES s
       JOIN INSTITUCIONES i ON i.ID_INSTITUCION = s.ID_INSTITUCION
      WHERE s.ID_SUSCRIPCION = :id`,
    { id: ID },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const s = rows[0];
  if (!s) throw new Error(`No existe la suscripción ${ID}`);
  await c.close();

  const dias = Number(s.DIAS);
  const plazo = dias === 0 ? 'today' : dias === 1 ? 'in 1 day' : `in ${dias} days`;
  const nombre = (s.COMPRADOR_NOMBRE || '').trim().split(' ')[0] || 'there';

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  const asunto = `ConnectHub — Subscription for ${s.INSTITUCION} expires ${plazo}`;
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <h2 style="color:#7c3aed">ConnectHub</h2>
      <p>Dear ${nombre},</p>
      <p>Following up on our earlier notice: the ConnectHub subscription for
         <b>${s.INSTITUCION}</b> expires on <b>${fechaLarga(s.FIN)}</b>,
         which is the last day of service.</p>
      <p>If it is not renewed by then, access to the admin panel will be suspended
         and the institution's events will stop being visible in the mobile app.
         <b>Tickets already issued and event check-in are not affected.</b></p>
      <p>We would be glad to extend the subscription. Simply reply to this message
         and we will take care of the renewal.</p>
      <p style="color:#64748b;font-size:12px">If the renewal is already in progress
         on your side, please disregard this message.</p>
      <p style="color:#64748b;font-size:12px">Kind regards,<br>ConnectHub</p>
    </div>`;

  console.log(`Para   : ${s.COMPRADOR_EMAIL}`);
  console.log(`Asunto : ${asunto}`);
  console.log(`Vence  : ${s.FIN} (${dias} día(s))`);
  console.log(`Estado : ${s.ESTADO}\n`);

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'no-reply@connect-hub.local',
    to: s.COMPRADOR_EMAIL,
    subject: asunto,
    html,
  });
  console.log(`ENVIADO. id=${info.messageId}`);
  console.log(`aceptado por el servidor: ${JSON.stringify(info.accepted)}`);
  if (info.rejected?.length) console.log(`RECHAZADO: ${JSON.stringify(info.rejected)}`);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
