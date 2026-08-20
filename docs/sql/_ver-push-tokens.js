/**
 * Consulta de apoyo (SOLO LECTURA): tokens de notificación registrados,
 * por plataforma. Sirve para saber si las notificaciones realmente pueden
 * llegar a cada tienda o si falta configuración (p.ej. FCM en Android).
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_ver-push-tokens.js
 */
const oracledb = require('oracledb');

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const { rows } = await c.execute(
    `SELECT NVL(PLATFORM,'(sin dato)') AS PLATFORM, ESTADO, COUNT(*) AS N,
            COUNT(DISTINCT ID_CLIENTE) AS PERSONAS
       FROM USUARIO_PUSH_TOKENS
      GROUP BY NVL(PLATFORM,'(sin dato)'), ESTADO
      ORDER BY 1, 2`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  if (!rows.length) console.log('No hay ningún token registrado.');
  for (const r of rows) {
    console.log(
      `  ${r.PLATFORM.padEnd(12)} ${String(r.ESTADO).padEnd(10)} ` +
        `${r.N} token(s), ${r.PERSONAS} persona(s)`,
    );
  }
  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
