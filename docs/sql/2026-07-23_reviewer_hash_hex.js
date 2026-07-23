/**
 * Cambia el CLAVE_HASH de las 2 cuentas demo de revisor al formato SHA-256 hex
 * (el que valida el servicio de pagos / app Ionic), para que el login de la app
 * móvil (que autentica contra ese servicio) funcione en la revisión de las tiendas.
 *
 * Contexto: ConnectHub las creó con formato pbkdf2sha256$..., pero la app móvil
 * NO usa /public/auth/login: hace login en api-ligaprocorp (SHA-256 hex sobre la
 * MISMA tabla USUARIOS compartida) y canjea el token. Por eso el revisor de
 * Google vio "Wrong email or password" — y el de Apple vería lo mismo.
 *
 * Solo toca las 2 filas demo. Reversible (re-crear clave desde el panel/forgot).
 * Ejecutar:  docker exec -e NEWHASH=<sha256hex> connect-hub-api-1 node /app/docs/sql/2026-07-23_reviewer_hash_hex.js
 *   (o copiar el archivo al contenedor con docker cp si /app no monta docs/)
 */
const oracledb = require('oracledb');
(async () => {
  const h = process.env.NEWHASH;
  if (!h || !/^[0-9a-f]{64}$/.test(h)) {
    console.log('Falta NEWHASH (sha256 hex de la clave demo)');
    process.exit(1);
  }
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const r = await c.execute(
    `UPDATE USUARIOS SET CLAVE_HASH = :h, FECHA_ACTUALIZACION = SYSTIMESTAMP
      WHERE EMAIL IN ('reviewer1@connecthub.fourstacklabs.com','reviewer2@connecthub.fourstacklabs.com')`,
    { h },
    { autoCommit: true },
  );
  console.log('filas actualizadas:', r.rowsAffected);
  const v = await c.execute(
    `SELECT EMAIL, SUBSTR(CLAVE_HASH,1,8) AS PREF, LENGTH(CLAVE_HASH) AS LEN
       FROM USUARIOS WHERE EMAIL LIKE 'reviewer%@connecthub.fourstacklabs.com' ORDER BY EMAIL`,
  );
  v.rows.forEach((x) => console.log(' ', x[0], '| hash:', x[1] + '... len', x[2], '(esperado: 64)'));
  await c.close();
})().catch((e) => {
  console.log('ERROR:', e.message);
  process.exit(1);
});
