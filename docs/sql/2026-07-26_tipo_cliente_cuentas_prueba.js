/**
 * Workaround al bug del servidor DESPLEGADO del servicio de pagos: su login
 * responde 403 "Debes verificar tu cuenta" a TODA cuenta TIPO_USUARIO='NORMAL'
 * aunque IS_VERIFIED=1 (probado el 2026-07-26 con cuentas QA idénticas: NORMAL
 * → 403, CLIENTE → 200). Mientras el equipo corrige su deploy, las cuentas de
 * prueba pasan a 'CLIENTE' (el tipo que crea ConnectHub y que SÍ entra).
 * Reversible: UPDATE ... SET TIPO_USUARIO='NORMAL' con los mismos emails.
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
      `UPDATE USUARIOS SET TIPO_USUARIO = 'CLIENTE', FECHA_ACTUALIZACION = SYSTIMESTAMP
        WHERE LOWER(EMAIL) = :e AND TIPO_USUARIO = 'NORMAL'`,
      { e: email.toLowerCase() },
      { autoCommit: true },
    );
    console.log(email, '→ filas actualizadas:', r.rowsAffected);
  }
  const chk = await c.execute(
    `SELECT EMAIL, TIPO_USUARIO, IS_VERIFIED FROM USUARIOS
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
