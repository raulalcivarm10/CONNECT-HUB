/**
 * Marca como VERIFICADAS las cuentas de prueba (IS_VERIFIED=1 + sin token
 * pendiente), para descartar el gate de verificación del login del servicio de
 * pagos. La verificación es POR CUENTA (columna compartida) — esto equivale a
 * haber confirmado el correo.
 */
const oracledb = require('oracledb');

const EMAILS = ['raul.alcivarm10@gmail.com', 'raul.alcivarm10+revisor@gmail.com'];

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  for (const email of EMAILS) {
    const r = await c.execute(
      `UPDATE USUARIOS
          SET IS_VERIFIED = 1, VERIFICATION_TOKEN = NULL, TOKEN_EXPIRA = NULL,
              FECHA_ACTUALIZACION = SYSTIMESTAMP
        WHERE LOWER(EMAIL) = :e`,
      { e: email.toLowerCase() },
      { autoCommit: true },
    );
    console.log(email, '→ filas:', r.rowsAffected);
  }
  const chk = await c.execute(
    `SELECT EMAIL, TIPO_USUARIO, IS_VERIFIED,
            CASE WHEN CLAVE_HASH LIKE '%:%' THEN 'EQUIPO' ELSE 'OTRO' END AS FORMATO_CLAVE
       FROM USUARIOS
      WHERE LOWER(EMAIL) IN ('raul.alcivarm10@gmail.com','raul.alcivarm10+revisor@gmail.com')`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log(JSON.stringify(chk.rows, null, 1));
  await c.close();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
