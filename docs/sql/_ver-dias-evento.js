/**
 * Consulta de apoyo (SOLO LECTURA): días configurados por evento.
 *
 * Importa porque el guardado de la agenda valida que DIA_ORDEN no supere el
 * número de días del evento: si el Excel trae 3 días y el evento tiene 2, el
 * PUT se rechaza entero.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_ver-dias-evento.js [idInstitucion]
 */
const oracledb = require('oracledb');

const inst = process.argv[2] ? Number(process.argv[2]) : 101;

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const { rows } = await c.execute(
    `SELECT e.ID_EVENTO, SUBSTR(e.TITULO,1,52) AS TITULO,
            e.ID_EVENTO_PADRE,
            (SELECT COUNT(*) FROM EVENTO_HORAS h WHERE h.ID_EVENTO = e.ID_EVENTO) AS DIAS,
            (SELECT COUNT(*) FROM EVENTO_AGENDA a WHERE a.ID_EVENTO = e.ID_EVENTO) AS AGENDA
       FROM EVENTOS e
       LEFT JOIN LOCALES l  ON l.ID_LOCAL  = e.ID_LOCAL
       LEFT JOIN SALONES s  ON s.ID_SALON  = e.ID_SALON
       LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
      WHERE COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) = :inst
      ORDER BY e.ID_EVENTO`,
    { inst },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  console.log(`Eventos de la institución ${inst}:`);
  console.log('  ID    DÍAS  AGENDA  PADRE  TÍTULO');
  for (const r of rows) {
    console.log(
      '  ' +
        String(r.ID_EVENTO).padEnd(6) +
        String(r.DIAS).padStart(4) +
        String(r.AGENDA).padStart(8) +
        String(r.ID_EVENTO_PADRE ?? '-').padStart(7) +
        '  ' +
        r.TITULO,
    );
  }
  console.log(`\n${rows.length} evento(s). DÍAS = filas en EVENTO_HORAS (tope para DIA_ORDEN).`);
  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
