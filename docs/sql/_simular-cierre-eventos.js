/**
 * Consulta de apoyo (SOLO LECTURA): qué haría EventosCron en su próxima corrida.
 *
 * Repite LITERALMENTE los dos SELECT del cron (eventos.cron.ts) para poder ver
 * el resultado antes de que el trabajo escriba nada. Si esta consulta y la del
 * cron dejan de coincidir, esto miente: al tocar el cron hay que tocar esto.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_simular-cierre-eventos.js
 */
const oracledb = require('oracledb');

/** Mismo desfase fijo que hoyEcuador(): America/Guayaquil = UTC-5 todo el año. */
const hoyEcuador = () =>
  new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Copia exacta de EventosCron.ULTIMO_DIA. */
const ULTIMO_DIA = `
  GREATEST(
    TRUNC(NVL(e.FECHA_FIN, e.FECHA_EVENTO)),
    TRUNC(NVL((SELECT MAX(h.FECHA) FROM EVENTO_HORAS h WHERE h.ID_EVENTO = e.ID_EVENTO),
              NVL(e.FECHA_FIN, e.FECHA_EVENTO)))
  )`;

const corta = (v, n) => (v == null ? '' : String(v).replace(/\s+/g, ' ').slice(0, n));

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const q = async (sql, bind = {}) =>
    (await c.execute(sql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

  const hoy = hoyEcuador();
  console.log('Hoy en Ecuador: ' + hoy + '\n');

  const cerrar = await q(
    `SELECT e.ID_EVENTO, e.TITULO, e.PRECIO,
            TO_CHAR(${ULTIMO_DIA}, 'YYYY-MM-DD') AS ULTIMO_DIA,
            (SELECT COUNT(*) FROM EVENTOS_USUARIOS eu
              WHERE eu.ID_EVENTO = e.ID_EVENTO) AS INSCRITOS
       FROM EVENTOS e
      WHERE NVL(e.ESTADO_APROBACION, 'PUBLICADO') = 'PUBLICADO'
        AND NVL(e.NO_PUBLICAR, 'N') = 'N'
        AND ${ULTIMO_DIA} < TO_DATE(:hoy, 'YYYY-MM-DD')
      ORDER BY 4 DESC`,
    { hoy },
  );

  console.log('CERRARÍA (' + cerrar.length + '):');
  for (const r of cerrar) {
    console.log(
      '  [' + String(r.ID_EVENTO).padStart(4) + '] hasta ' + r.ULTIMO_DIA +
        '  $' + String(r.PRECIO ?? 0).padStart(5) +
        '  ' + String(r.INSCRITOS).padStart(3) + ' inscritos  ' + corta(r.TITULO, 44),
    );
  }
  if (!cerrar.length) console.log('  (ninguno)');

  const reabrir = await q(
    `SELECT e.ID_EVENTO, e.TITULO,
            TO_CHAR(${ULTIMO_DIA}, 'YYYY-MM-DD') AS ULTIMO_DIA
       FROM EVENTOS e
      WHERE e.ESTADO_APROBACION = 'FINALIZADO'
        AND ${ULTIMO_DIA} >= TO_DATE(:hoy, 'YYYY-MM-DD')`,
    { hoy },
  );
  console.log('\nREABRIRÍA (' + reabrir.length + '):');
  for (const r of reabrir) {
    console.log('  [' + r.ID_EVENTO + '] hasta ' + r.ULTIMO_DIA + '  ' + corta(r.TITULO, 50));
  }
  if (!reabrir.length) console.log('  (ninguno)');

  // Control: lo que NO se toca aunque ya haya pasado, y por qué.
  const intactos = await q(
    `SELECT e.ID_EVENTO, NVL(e.ESTADO_APROBACION,'(nulo)') AS ESTADO,
            NVL(e.NO_PUBLICAR,'N') AS OCULTO, e.TITULO,
            TO_CHAR(${ULTIMO_DIA}, 'YYYY-MM-DD') AS ULTIMO_DIA
       FROM EVENTOS e
      WHERE ${ULTIMO_DIA} < TO_DATE(:hoy, 'YYYY-MM-DD')
        AND NOT (NVL(e.ESTADO_APROBACION,'PUBLICADO') = 'PUBLICADO'
                 AND NVL(e.NO_PUBLICAR,'N') = 'N')
      ORDER BY 1`,
    { hoy },
  );
  console.log('\nYA PASARON PERO NO SE TOCAN (' + intactos.length + '):');
  for (const r of intactos) {
    console.log('  [' + r.ID_EVENTO + '] ' + r.ESTADO.padEnd(12) + ' oculto=' + r.OCULTO +
      '  ' + corta(r.TITULO, 44));
  }
  if (!intactos.length) console.log('  (ninguno)');

  await c.close();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
