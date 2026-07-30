/**
 * PRECIOS DE ESPACIOS (pedido por Raúl 2026-07-30): tarifa de alquiler por día
 * en salones y subsalones + snapshot congelado en la reserva (= fila de EVENTOS).
 *
 * Cambios 100% ADITIVOS y NULLABLE (SALONES/SUBSALONES/EVENTOS son tablas
 * preexistentes del esquema COMPARTIDO con la app externa — nunca DROP/rename):
 *   SALONES.PRECIO            NUMBER(10,2) NULL  → tarifa/día del salón completo
 *   SUBSALONES.PRECIO         NUMBER(10,2) NULL  → tarifa/día del subsalón
 *   EVENTOS.PRECIO_ESPACIO_DIA NUMBER(10,2) NULL → tarifa/día APLICADA (snapshot al reservar)
 *   EVENTOS.PRECIO_ESPACIO    NUMBER(10,2) NULL  → total = tarifa/día × nº de días
 *
 * El snapshot lo escribe la API (eventos.service.ts create/update); cambiar la
 * tarifa de lista NO reescribe reservas existentes. NULL = sin tarifa definida
 * (retrocompatible: eventos históricos y app externa no se ven afectados).
 * Idempotente: ORA-01430 (columna ya existe) se ignora.
 */
const oracledb = require('oracledb');

const ALTERS = [
  `ALTER TABLE SALONES ADD (PRECIO NUMBER(10,2))`,
  `ALTER TABLE SUBSALONES ADD (PRECIO NUMBER(10,2))`,
  `ALTER TABLE EVENTOS ADD (PRECIO_ESPACIO_DIA NUMBER(10,2))`,
  `ALTER TABLE EVENTOS ADD (PRECIO_ESPACIO NUMBER(10,2))`,
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
      if (String(e.message).includes('ORA-01430')) {
        console.log('YA EXISTÍA →', sql);
      } else {
        throw e;
      }
    }
  }
  const chk = await c.execute(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_PRECISION, DATA_SCALE, NULLABLE
       FROM USER_TAB_COLUMNS
      WHERE (TABLE_NAME = 'SALONES' AND COLUMN_NAME = 'PRECIO')
         OR (TABLE_NAME = 'SUBSALONES' AND COLUMN_NAME = 'PRECIO')
         OR (TABLE_NAME = 'EVENTOS' AND COLUMN_NAME IN ('PRECIO_ESPACIO_DIA','PRECIO_ESPACIO'))
      ORDER BY TABLE_NAME, COLUMN_NAME`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log(JSON.stringify(chk.rows, null, 1));
  await c.close();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
