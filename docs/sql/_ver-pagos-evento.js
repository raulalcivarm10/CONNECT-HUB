/**
 * Consulta de apoyo (SOLO LECTURA): pagos de un evento con la persona, el
 * monto y la referencia, mas el estado de sus cupones.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_ver-pagos-evento.js DYNAMIND
 */
const oracledb = require('oracledb');

const filtro = process.argv[2] || 'DYNAMIND';

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };

  const evs = await c.execute(
    `SELECT ID_EVENTO, TITULO, PRECIO FROM EVENTOS
      WHERE UPPER(TITULO) LIKE '%' || UPPER(:f) || '%'`,
    { f: filtro },
    opts,
  );
  for (const ev of evs.rows) {
    console.log(`\n=== ${ev.TITULO} (id ${ev.ID_EVENTO}, precio $${ev.PRECIO}) ===`);

    const pagos = await c.execute(
      `SELECT p.ID_PAGO, p.VALOR_PAGO, p.ESTADO, p.METODO_PAGO,
              TO_CHAR(p.FECHA_PAGO, 'YYYY-MM-DD HH24:MI') AS FECHA,
              SUBSTR(p.REFERENCIA, 1, 40) AS REFERENCIA,
              u.NOMBRE, u.APELLIDO, u.EMAIL
         FROM PAGOS p
         LEFT JOIN USUARIOS u ON u.ID_CLIENTE = p.ID_CLIENTE
        WHERE p.ID_EVENTO = :e
        ORDER BY p.FECHA_PAGO DESC`,
      { e: ev.ID_EVENTO },
      opts,
    ).catch(async (err) => {
      // nombres de columna distintos segun el esquema del equipo: descubre y reintenta
      console.log('  (ajustando columnas: ' + err.message.split('\n')[0] + ')');
      const cols = await c.execute(
        `SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'PAGOS' ORDER BY COLUMN_ID`,
        {},
        opts,
      );
      console.log('  columnas reales de PAGOS:', cols.rows.map((r) => r.COLUMN_NAME).join(', '));
      return null;
    });

    if (pagos) {
      for (const p of pagos.rows) {
        console.log(
          `  $${String(p.VALOR_PAGO).padEnd(7)} ${p.ESTADO ?? '-'}  ${p.FECHA ?? '-'}  ` +
            `${[p.NOMBRE, p.APELLIDO].filter(Boolean).join(' ') || '(sin nombre)'}  ` +
            `<${p.EMAIL ?? '-'}>  ref=${p.REFERENCIA ?? '-'}`,
        );
      }
      if (!pagos.rows.length) console.log('  (sin pagos)');
    }

    const cupones = await c.execute(
      `SELECT CODIGO, MONTO_DESCUENTO, TIPO_DESCUENTO, USOS, MAX_USOS
         FROM EVENTO_CUPONES WHERE ID_EVENTO = :e`,
      { e: ev.ID_EVENTO },
      opts,
    );
    for (const k of cupones.rows) {
      console.log(
        `  cupon ${k.CODIGO}: ${k.MONTO_DESCUENTO}${k.TIPO_DESCUENTO === 'P' ? '%' : ' USD'}  usos ${k.USOS ?? 0}/${k.MAX_USOS ?? '∞'}`,
      );
    }
  }
  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
