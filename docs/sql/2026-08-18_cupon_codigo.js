/**
 * EVENTOS_USUARIOS.CUPON_CODIGO — columna ADITIVA y NULLABLE sobre tabla
 * compartida (regla del proyecto: solo cambios aditivos).
 *
 * Guarda el código del cupón cuando una inscripción salió SIN pago porque el
 * cupón cubría el 100% del total. Así queda constancia consultable de que esa
 * entrada fue con descuento total (el servicio de pagos externo no registra
 * nada en ese caso: nunca se le llega a pedir referencia).
 *
 * Ejecutar:
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/2026-08-18_cupon_codigo.js
 */
const oracledb = require('oracledb');

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  try {
    await c.execute(`ALTER TABLE EVENTOS_USUARIOS ADD (CUPON_CODIGO VARCHAR2(40))`);
    console.log('OK    columna CUPON_CODIGO creada');
  } catch (e) {
    if (/ORA-01430/.test(e.message)) console.log('YA    la columna ya existía');
    else throw e;
  }
  await c.close();
  console.log('Listo.');
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
