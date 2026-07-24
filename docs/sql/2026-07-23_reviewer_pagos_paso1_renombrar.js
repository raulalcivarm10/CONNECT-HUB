/**
 * PASO 1 de la recreación de las cuentas demo de revisor:
 * renombra las filas viejas (creadas por ConnectHub con hash pbkdf2/hex que el
 * servicio de pagos NO valida) para liberar los correos reviewer1/2@… y que el
 * propio servicio de pagos pueda crearlas con SU formato de hash (161 chars).
 * Solo toca las 2 filas demo. No borra nada (auditable/reversible).
 */
const oracledb = require('oracledb');
(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const r = await c.execute(
    `UPDATE USUARIOS
        SET EMAIL = REPLACE(EMAIL, '@connecthub.', '-old@connecthub.'),
            FECHA_ACTUALIZACION = SYSTIMESTAMP
      WHERE EMAIL IN ('reviewer1@connecthub.fourstacklabs.com','reviewer2@connecthub.fourstacklabs.com')`,
    {},
    { autoCommit: true },
  );
  console.log('filas renombradas:', r.rowsAffected);
  const v = await c.execute(
    `SELECT EMAIL FROM USUARIOS WHERE EMAIL LIKE 'reviewer%' ORDER BY EMAIL`,
  );
  v.rows.forEach((x) => console.log(' ', x[0]));
  await c.close();
})().catch((e) => {
  console.log('ERROR:', e.message);
  process.exit(1);
});
