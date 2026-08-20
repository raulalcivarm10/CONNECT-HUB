/**
 * Medición (SOLO LECTURA): cuánto tardan las consultas que alimentan la pestaña
 * Community. Sirve para saber si el indicador de refresco se queda girando
 * porque la petición realmente tarda, o por otra causa.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_medir-comunidad.js <correo>
 */
const oracledb = require('oracledb');

const correo = process.argv[2];
if (!correo) {
  console.error('Uso: node _medir-comunidad.js <correo>');
  process.exit(1);
}

const CHATS = `
  SELECT ch.ID_CHAT,
         CASE WHEN ch.ID_CLIENTE_A = :me THEN ch.ID_CLIENTE_B ELSE ch.ID_CLIENTE_A END AS OTRO_ID,
         u.NOMBRE, u.APELLIDO, u.FOTO_URL, u.EMAIL, p.PROFESION,
         (SELECT MAX(TO_CHAR(mp.FECHA_REGISTRO,'YYYY-MM-DD"T"HH24:MI')) FROM MENSAJE_PRIVADO mp WHERE mp.ID_CHAT = ch.ID_CHAT) AS ULTIMA_FECHA,
         (SELECT MENSAJE FROM (SELECT mp.MENSAJE FROM MENSAJE_PRIVADO mp WHERE mp.ID_CHAT = ch.ID_CHAT ORDER BY mp.FECHA_REGISTRO DESC) WHERE ROWNUM = 1) AS ULTIMO_MSG,
         (SELECT COUNT(*) FROM MENSAJE_PRIVADO mp WHERE mp.ID_CHAT = ch.ID_CHAT AND mp.LEIDO = 'N' AND mp.ID_REMITENTE <> :me) AS NO_LEIDOS
    FROM CHAT_PRIVADO ch
    JOIN USUARIOS u ON u.ID_CLIENTE = CASE WHEN ch.ID_CLIENTE_A = :me THEN ch.ID_CLIENTE_B ELSE ch.ID_CLIENTE_A END
    LEFT JOIN PERFIL_ASISTENTE p ON p.ID_CLIENTE = u.ID_CLIENTE
   WHERE ch.ID_CLIENTE_A = :me OR ch.ID_CLIENTE_B = :me
   ORDER BY ULTIMA_FECHA DESC NULLS LAST`;

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const u = await c.execute(
    `SELECT ID_CLIENTE FROM USUARIOS WHERE UPPER(EMAIL) = UPPER(:e)`,
    { e: correo }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (!u.rows.length) { console.log(`Sin usuario para ${correo}`); return c.close(); }
  const me = u.rows[0].ID_CLIENTE;
  console.log(`Usuario ${correo} -> ${me}\n`);

  // Tres pasadas: la primera incluye el parseo del plan, las siguientes son el
  // coste real en caliente (que es lo que vive quien usa la app).
  for (let i = 1; i <= 3; i++) {
    const t0 = process.hrtime.bigint();
    const r = await c.execute(CHATS, { me }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`  misChats  pasada ${i}: ${ms.toFixed(0)} ms  (${r.rows.length} chats)`);
  }

  const cnt = await c.execute(
    `SELECT (SELECT COUNT(*) FROM CHAT_PRIVADO) AS CHATS,
            (SELECT COUNT(*) FROM MENSAJE_PRIVADO) AS MENSAJES
       FROM DUAL`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log(`\n  Tamano: ${cnt.rows[0].CHATS} chats, ${cnt.rows[0].MENSAJES} mensajes`);

  const idx = await c.execute(
    `SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, COLUMN_POSITION
       FROM USER_IND_COLUMNS
      WHERE TABLE_NAME IN ('MENSAJE_PRIVADO','CHAT_PRIVADO')
      ORDER BY TABLE_NAME, INDEX_NAME, COLUMN_POSITION`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log('\n  Indices:');
  if (!idx.rows.length) console.log('    (ninguno)');
  for (const r of idx.rows) {
    console.log(`    ${r.TABLE_NAME}.${r.INDEX_NAME} [${r.COLUMN_POSITION}] ${r.COLUMN_NAME}`);
  }

  await c.close();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
