/**
 * BORRADO de toda la participación en eventos, para volver a probar los pagos
 * desde cero: "como que no hemos pagado ningún evento aún".
 *
 * SE BORRA (datos de participación):
 *   CERTIFICADOS              certificados emitidos
 *   LOG_PARTICIPANTES_EVENTO  historial de check-in
 *   PAGOS                     pagos
 *   EVENTOS_USUARIOS          inscripciones y entradas (aquí vive el QR_TOKEN)
 *
 * SE CONSERVA:
 *   USUARIOS, PERFIL_ASISTENTE   las cuentas de la app siguen existiendo
 *   TARJETAS_USUARIO             tarjetas guardadas
 *   EVENTO_CERT_PLANTILLA        plantillas de certificado: son CONFIGURACIÓN
 *                                del evento, no participación. Borrarlas
 *                                obligaría a volver a subirlas.
 *
 * SE REINICIA:
 *   EVENTO_CUPONES.USOS = 0      si no, los cupones se quedan agotados y no se
 *                                puede volver a probar con ellos (varios están
 *                                al tope: 1/1, 2/2…).
 *
 * OJO: esto NO deshace nada en la pasarela ni en el servicio del equipo. Las
 * transacciones siguen existiendo allí; solo desaparecen de esta base.
 *
 * Antes de borrar deja un respaldo JSON en /root/app/respaldos/.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     -v /root/app/respaldos:/app/respaldos \
 *     --entrypoint node api /app/migraciones/2026-08-20_limpiar-participacion.js
 */
const oracledb = require('oracledb');
const fs = require('fs');

const A_BORRAR = [
  'CERTIFICADOS',
  'LOG_PARTICIPANTES_EVENTO',
  'PAGOS',
  'EVENTOS_USUARIOS',
];
const DIR_RESPALDO = '/app/respaldos';

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  // ── 1. Respaldo ────────────────────────────────────────────────────────────
  if (!fs.existsSync(DIR_RESPALDO)) fs.mkdirSync(DIR_RESPALDO, { recursive: true });
  const marca = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const respaldo = {};
  for (const tabla of A_BORRAR) {
    const r = await c.execute(`SELECT * FROM ${tabla}`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    respaldo[tabla] = r.rows;
    console.log(`  respaldado ${tabla.padEnd(26)} ${r.rows.length} filas`);
  }
  const cup = await c.execute(
    `SELECT ID_CUPON, ID_EVENTO, CODIGO, USOS FROM EVENTO_CUPONES WHERE NVL(USOS,0) > 0`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  respaldo.EVENTO_CUPONES_USOS = cup.rows;

  const ruta = `${DIR_RESPALDO}/participacion-${marca}.json`;
  fs.writeFileSync(ruta, JSON.stringify(respaldo, null, 1), 'utf8');
  console.log(`\n  Respaldo en ${ruta}\n`);

  // ── 2. Borrado ─────────────────────────────────────────────────────────────
  // Orden: primero lo que depende de la inscripción, al final la inscripción.
  for (const tabla of A_BORRAR) {
    const r = await c.execute(`DELETE FROM ${tabla}`, {}, { autoCommit: false });
    console.log(`  borradas ${String(r.rowsAffected).padStart(4)} de ${tabla}`);
  }

  // ── 3. Cupones a cero ──────────────────────────────────────────────────────
  const rc = await c.execute(
    `UPDATE EVENTO_CUPONES SET USOS = 0 WHERE NVL(USOS,0) > 0`,
    {}, { autoCommit: false },
  );
  console.log(`  reiniciados ${rc.rowsAffected} cupón(es) a 0 usos`);

  await c.commit();

  // ── 4. Verificación ────────────────────────────────────────────────────────
  console.log('\nDESPUÉS:');
  for (const tabla of [...A_BORRAR, 'EVENTO_CERT_PLANTILLA', 'USUARIOS', 'PERFIL_ASISTENTE', 'TARJETAS_USUARIO']) {
    const r = await c.execute(`SELECT COUNT(*) AS N FROM ${tabla}`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    console.log(`  ${tabla.padEnd(26)} ${r.rows[0].N}`);
  }
  const q = await c.execute(
    `SELECT COUNT(*) AS N FROM EVENTO_CUPONES WHERE NVL(USOS,0) > 0`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log(`  cupones con usos > 0       ${q.rows[0].N}`);

  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
