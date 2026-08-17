/**
 * Consulta de apoyo (SOLO LECTURA): muestra qué agenda hay guardada por evento.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_ver-agenda.js [idEvento]
 */
const oracledb = require('oracledb');

const idEvento = process.argv[2] ? Number(process.argv[2]) : null;

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };

  const resumen = await c.execute(
    `SELECT a.ID_EVENTO, e.TITULO, COUNT(*) AS FILAS,
            COUNT(DISTINCT a.DIA_ORDEN) AS DIAS,
            MAX(a.CREADO_POR) AS CREADO_POR,
            TO_CHAR(MAX(a.FECHA_REGISTRO),'YYYY-MM-DD HH24:MI:SS') AS ULTIMA
       FROM EVENTO_AGENDA a
       LEFT JOIN EVENTOS e ON e.ID_EVENTO = a.ID_EVENTO
      GROUP BY a.ID_EVENTO, e.TITULO
      ORDER BY a.ID_EVENTO`,
    {},
    opts,
  );

  if (resumen.rows.length === 0) {
    console.log('EVENTO_AGENDA está VACÍA: no hay ninguna agenda guardada.');
  } else {
    console.log('Agendas guardadas:');
    for (const r of resumen.rows) {
      console.log(
        `  evento ${r.ID_EVENTO}  ${r.FILAS} filas en ${r.DIAS} día(s)` +
          `  · por ${r.CREADO_POR ?? '-'} · ${r.ULTIMA}  — ${r.TITULO ?? ''}`,
      );
    }
  }

  if (idEvento) {
    const det = await c.execute(
      `SELECT DIA_ORDEN, ORDEN, HORA_INICIO, HORA_FIN, SALON, TIPO,
              SUBSTR(CONFERENCISTA,1,28) AS CONFERENCISTA,
              SUBSTR(TEMA,1,44) AS TEMA
         FROM EVENTO_AGENDA
        WHERE ID_EVENTO = :id
        ORDER BY DIA_ORDEN, ORDEN
        FETCH FIRST 30 ROWS ONLY`,
      { id: idEvento },
      opts,
    );
    console.log(`\nPrimeras filas del evento ${idEvento}:`);
    for (const r of det.rows) {
      console.log(
        `  d${r.DIA_ORDEN} #${String(r.ORDEN).padStart(2)} ` +
          `${(r.HORA_INICIO ?? '--:--')}-${(r.HORA_FIN ?? '--:--')} ` +
          `${String(r.SALON ?? '-').padEnd(14)} ${String(r.TIPO).padEnd(9)} ` +
          `${String(r.CONFERENCISTA ?? '').padEnd(28)} ${r.TEMA ?? ''}`,
      );
    }
    if (det.rows.length === 0) console.log('  (sin filas)');
  }

  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
