/**
 * Protege la revisión de APPLE (iOS "Pendiente de revisión"): las cuentas demo
 * reviewer1/reviewer2 son TIPO_USUARIO='NORMAL' y el servidor DESPLEGADO del
 * servicio de pagos rechaza a TODA cuenta NORMAL con 403 "Debes verificar tu
 * cuenta" aunque IS_VERIFIED=1 (bug probado el 2026-07-26; CLIENTE sí entra).
 * El binario iOS en cola valida el login SOLO contra ese servicio → sin este
 * cambio, el revisor de Apple fallaría el login igual que pasó con Google.
 * Reversible: SET TIPO_USUARIO='NORMAL'.
 */
const oracledb = require('oracledb');

const EMAILS = [
  'reviewer1@connecthub.fourstacklabs.com',
  'reviewer2@connecthub.fourstacklabs.com',
];

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  for (const email of EMAILS) {
    const r = await c.execute(
      `UPDATE USUARIOS
          SET TIPO_USUARIO = 'CLIENTE', IS_VERIFIED = 1,
              VERIFICATION_TOKEN = NULL, TOKEN_EXPIRA = NULL,
              FECHA_ACTUALIZACION = SYSTIMESTAMP
        WHERE LOWER(EMAIL) = :e`,
      { e: email.toLowerCase() },
      { autoCommit: true },
    );
    console.log(email, '→ filas:', r.rowsAffected);
  }
  const chk = await c.execute(
    `SELECT EMAIL, TIPO_USUARIO, IS_VERIFIED,
            CASE WHEN INSTR(CLAVE_HASH, ':') > 0 THEN 'EQUIPO' ELSE 'REVISAR' END AS FORMATO
       FROM USUARIOS WHERE LOWER(EMAIL) IN (:a, :b)`,
    { a: EMAILS[0], b: EMAILS[1] },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log(JSON.stringify(chk.rows, null, 1));
  await c.close();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
