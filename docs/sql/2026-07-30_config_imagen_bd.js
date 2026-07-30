/**
 * Imagen de CONFIGURACIONES en NUESTRA BD (el NAS desplegado no soporta la
 * entidad CONFIGURACION — docs/nas-espacios.md sigue pendiente con su equipo).
 * Patrón de INSTITUCION_MAPAS: BLOB + mime + filename + last_update.
 * Aditivo y NULLABLE. Idempotente (ORA-01430 ignorado).
 */
const oracledb = require('oracledb');

const ALTERS = [
  `ALTER TABLE SUBSALON_CONFIGURACIONES ADD (IMAGEN BLOB)`,
  `ALTER TABLE SUBSALON_CONFIGURACIONES ADD (IMAGEN_MIME_TYPE VARCHAR2(100))`,
  `ALTER TABLE SUBSALON_CONFIGURACIONES ADD (IMAGEN_FILENAME VARCHAR2(255))`,
  `ALTER TABLE SUBSALON_CONFIGURACIONES ADD (IMAGEN_LAST_UPDATE DATE)`,
];

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  for (const sql of ALTERS) {
    try {
      await c.execute(sql);
      console.log('OK  →', sql);
    } catch (e) {
      if (String(e.message).includes('ORA-01430')) console.log('YA EXISTÍA →', sql);
      else throw e;
    }
  }
  const chk = await c.execute(
    `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE FROM USER_TAB_COLUMNS
      WHERE TABLE_NAME = 'SUBSALON_CONFIGURACIONES' AND COLUMN_NAME LIKE 'IMAGEN%'
      ORDER BY COLUMN_NAME`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log(JSON.stringify(chk.rows, null, 1));
  await c.close();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
