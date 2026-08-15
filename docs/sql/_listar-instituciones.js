/**
 * Consulta de apoyo (SOLO LECTURA): lista las instituciones con su estado, para
 * identificar a cuál corresponde una suscripción antes de sembrarla.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_listar-instituciones.js
 */
const oracledb = require('oracledb');

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const { rows } = await c.execute(
    `SELECT i.ID_INSTITUCION, i.NOMBRE, i.ESTADO, i.CODIGO_CONEXION,
            TO_CHAR(i.FECHA_REGISTRO,'YYYY-MM-DD') AS REGISTRO,
            (SELECT COUNT(*) FROM USUARIOS_INSTITUCIONES u
              WHERE u.ID_INSTITUCION = i.ID_INSTITUCION) AS USUARIOS,
            (SELECT COUNT(*) FROM EVENTOS e
               JOIN LOCALES l ON l.ID_LOCAL = e.ID_LOCAL
              WHERE l.ID_INSTITUCION = i.ID_INSTITUCION) AS EVENTOS
       FROM INSTITUCIONES i
      ORDER BY i.ID_INSTITUCION`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  console.log('ID   ESTADO       USUARIOS EVENTOS  CODIGO      NOMBRE');
  for (const r of rows) {
    console.log(
      String(r.ID_INSTITUCION).padEnd(5) +
        String(r.ESTADO ?? '-').padEnd(13) +
        String(r.USUARIOS).padStart(5) +
        String(r.EVENTOS).padStart(9) +
        '  ' +
        String(r.CODIGO_CONEXION ?? '-').padEnd(12) +
        r.NOMBRE,
    );
  }
  console.log(`\n${rows.length} instituciones.`);
  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
