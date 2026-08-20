/**
 * Crea 3 eventos de PRUEBA DE PAGO en Demo Institution (104): $100, $200 y $300.
 *
 * OJO CON EL SALÓN: van con ID_SALON asignado A PROPÓSITO. El backend del equipo
 * resuelve la institución del evento SOLO por el salón (INNER JOIN sobre
 * e.ID_SALON), así que un evento con local pero sin salón es IMPOSIBLE de pagar:
 * responde 404 "Institución no encontrada para el evento". Ver
 * docs/fix-institucion-por-local.md.
 *
 * Es idempotente: si los eventos ya existen no los duplica.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/2026-08-20_eventos-prueba-pago.js
 */
const oracledb = require('oracledb');

const ID_LOCAL = 145; // Main Campus
const ID_SALON = 187; // Grand Auditorium
const CREADO_POR = 'RAUL.ALCIVARM10@GMAIL.COM';

const EVENTOS = [
  { titulo: 'PRUEBA PAGO 100', precio: 100, fecha: '2026-11-10', codItem: '9100' },
  { titulo: 'PRUEBA PAGO 200', precio: 200, fecha: '2026-11-11', codItem: '9200' },
  { titulo: 'PRUEBA PAGO 300', precio: 300, fecha: '2026-11-12', codItem: '9300' },
];

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  // Comprobación previa: el salón debe colgar de la institución 104.
  const chk = await c.execute(
    `SELECT l.ID_INSTITUCION, l.NOMBRE AS LOCAL, s.NOMBRE AS SALON
       FROM SALONES s JOIN LOCALES l ON l.ID_LOCAL = s.ID_LOCAL
      WHERE s.ID_SALON = :s AND s.ID_LOCAL = :l`,
    { s: ID_SALON, l: ID_LOCAL },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (!chk.rows.length) throw new Error('El salón no pertenece a ese local');
  console.log(
    `Sede: ${chk.rows[0].LOCAL} · ${chk.rows[0].SALON} (institución ${chk.rows[0].ID_INSTITUCION})\n`,
  );

  for (const ev of EVENTOS) {
    const yaEsta = await c.execute(
      `SELECT ID_EVENTO FROM EVENTOS WHERE TITULO = :t`,
      { t: ev.titulo },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (yaEsta.rows.length) {
      console.log(`  = ${ev.titulo} ya existe [${yaEsta.rows[0].ID_EVENTO}], no se toca`);
      continue;
    }

    const r = await c.execute(
      `INSERT INTO EVENTOS
         (TITULO, DESCRIPCION, FECHA_EVENTO, FECHA_FIN, HORA_INICIO, HORA_FIN,
          ID_LOCAL, ID_SALON, PRECIO, PUBLICO_ESPERADO,
          TIEMPO_SETUP_MIN, TIEMPO_CLEAN_MIN, COD_ITEM,
          NO_PUBLICAR, INCLUYE_IVA, MONTO_IVA,
          CREADO_POR, ESTADO_APROBACION, PUBLICADO_POR, FECHA_PUBLICADO)
       VALUES
         (:titulo, :descripcion, TO_DATE(:fecha,'YYYY-MM-DD'), TO_DATE(:fecha,'YYYY-MM-DD'),
          '09:00', '13:00',
          :idLocal, :idSalon, :precio, 50,
          0, 0, :codItem,
          'N', 'N', NULL,
          :creadoPor, 'PUBLICADO', :creadoPor, SYSDATE)
       RETURNING ID_EVENTO INTO :out`,
      {
        titulo: ev.titulo,
        descripcion: `Evento de prueba para validar el cobro de $${ev.precio}.`,
        fecha: ev.fecha,
        idLocal: ID_LOCAL,
        idSalon: ID_SALON,
        precio: ev.precio,
        codItem: ev.codItem,
        creadoPor: CREADO_POR,
        out: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: false },
    );
    console.log(`  + ${ev.titulo}  $${ev.precio}  -> ID ${r.outBinds.out[0]}`);
  }

  await c.commit();
  console.log('\nListo.');
  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
