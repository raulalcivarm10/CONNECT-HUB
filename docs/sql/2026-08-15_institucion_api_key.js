/**
 * Llave de integración DIRECTA en INSTITUCIONES (dinámica para todas): cada
 * institución tiene su propia API key de check-in, visible en el panel y
 * regenerable. Convive con INSTITUCION_API_KEYS (llaves adicionales/rotables).
 * Aditivo y NULLABLE sobre tabla compartida.
 */
const oracledb = require('oracledb');
const { randomBytes } = require('node:crypto');

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  for (const sql of [
    `ALTER TABLE INSTITUCIONES ADD (API_KEY_CHECKIN VARCHAR2(80))`,
    `ALTER TABLE INSTITUCIONES ADD (API_KEY_FECHA DATE)`,
  ]) {
    try {
      await c.execute(sql, [], { autoCommit: true });
      console.log('OK  →', sql);
    } catch (e) {
      if (String(e.message).includes('ORA-01430')) console.log('YA EXISTÍA →', sql);
      else throw e;
    }
  }

  // provisiona una llave a TODA institución que no tenga (dinámico para todas)
  const sinKey = await c.execute(
    `SELECT ID_INSTITUCION, NOMBRE FROM INSTITUCIONES WHERE API_KEY_CHECKIN IS NULL`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  for (const row of sinKey.rows) {
    const clave = `chk_${randomBytes(24).toString('base64url')}`;
    await c.execute(
      `UPDATE INSTITUCIONES SET API_KEY_CHECKIN = :k, API_KEY_FECHA = SYSDATE
        WHERE ID_INSTITUCION = :i`,
      { k: clave, i: row.ID_INSTITUCION },
      { autoCommit: true },
    );
    console.log(`  llave generada → ${row.NOMBRE} (id ${row.ID_INSTITUCION})`);
  }
  const chk = await c.execute(
    `SELECT COUNT(*) AS TOTAL,
            SUM(CASE WHEN API_KEY_CHECKIN IS NOT NULL THEN 1 ELSE 0 END) AS CON_KEY
       FROM INSTITUCIONES`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log('INSTITUCIONES:', JSON.stringify(chk.rows[0]));
  await c.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
