/**
 * Consulta de apoyo (SOLO LECTURA): cuántos eventos ya pasaron y siguen visibles.
 *
 * Mide el trabajo pendiente antes de automatizar nada, y sobre todo comprueba
 * de qué fecha fiarse para decidir "ya pasó":
 *
 *   - FECHA_EVENTO es el PRIMER día. Usarla sola mataría un congreso de tres
 *     días al terminar el primero.
 *   - FECHA_FIN es el último, pero puede venir NULL en filas viejas.
 *   - EVENTO_HORAS.FECHA tiene los días reales, uno por fila.
 *
 * Por eso se compara MAX(EVENTO_HORAS.FECHA) contra NVL(FECHA_FIN, FECHA_EVENTO)
 * y se cuentan las discrepancias: si no hay ninguna, la columna basta y el job
 * puede quedarse con la consulta simple.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_medir-eventos-vencidos.js
 */
const oracledb = require('oracledb');

const nn = (v, alt = '-') => (v === null || v === undefined || v === '' ? alt : v);
const corta = (v, n) => (v == null ? '' : String(v).replace(/\s+/g, ' ').slice(0, n));

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const q = async (sql, bind = {}) =>
    (await c.execute(sql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

  const [f] = await q(
    `SELECT TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI') AS UTC_AHORA,
            TO_CHAR(SYSDATE - 5/24, 'YYYY-MM-DD HH24:MI') AS ECUADOR_AHORA,
            SESSIONTIMEZONE AS TZ FROM DUAL`,
  );
  console.log('Servidor UTC: ' + f.UTC_AHORA + '   Ecuador: ' + f.ECUADOR_AHORA + '   tz sesión: ' + f.TZ);

  // ¿Se puede confiar en FECHA_FIN, o hay que mirar EVENTO_HORAS?
  console.log('\n=== FIABILIDAD DE LA FECHA DE CIERRE ===');
  const [d] = await q(
    `SELECT COUNT(*) AS TOTAL,
            COUNT(CASE WHEN FECHA_FIN IS NULL THEN 1 END) AS SIN_FECHA_FIN,
            COUNT(CASE WHEN FECHA_FIN < FECHA_EVENTO THEN 1 END) AS FIN_ANTES_DE_INICIO
       FROM EVENTOS`,
  );
  console.log('  ' + d.TOTAL + ' eventos · ' + d.SIN_FECHA_FIN + ' sin FECHA_FIN · ' +
    d.FIN_ANTES_DE_INICIO + ' con FECHA_FIN anterior al inicio');

  const desfase = await q(
    `SELECT e.ID_EVENTO, e.TITULO,
            TO_CHAR(e.FECHA_EVENTO,'YYYY-MM-DD') AS INICIO,
            TO_CHAR(NVL(e.FECHA_FIN, e.FECHA_EVENTO),'YYYY-MM-DD') AS FIN_COLUMNA,
            TO_CHAR(h.ULTIMO,'YYYY-MM-DD') AS FIN_REAL, h.N AS DIAS
       FROM EVENTOS e
       JOIN (SELECT ID_EVENTO, MAX(FECHA) AS ULTIMO, COUNT(*) AS N
               FROM EVENTO_HORAS GROUP BY ID_EVENTO) h ON h.ID_EVENTO = e.ID_EVENTO
      WHERE TRUNC(h.ULTIMO) <> TRUNC(NVL(e.FECHA_FIN, e.FECHA_EVENTO))
      ORDER BY e.ID_EVENTO`,
  );
  if (desfase.length) {
    console.log('  [!] ' + desfase.length + ' eventos donde la columna NO coincide con los días reales:');
    for (const r of desfase) {
      console.log('      [' + r.ID_EVENTO + '] columna dice ' + r.FIN_COLUMNA + ' pero el último día es ' +
        r.FIN_REAL + ' (' + r.DIAS + ' días)  ' + corta(r.TITULO, 40));
    }
    console.log('      -> el job DEBE mirar EVENTO_HORAS, no solo la columna');
  } else {
    console.log('  OK: NVL(FECHA_FIN, FECHA_EVENTO) coincide siempre con el último día real');
  }

  // Lo que el job marcaría hoy.
  console.log('\n=== EVENTOS YA PASADOS QUE SIGUEN PUBLICADOS ===');
  const vencidos = await q(
    `SELECT e.ID_EVENTO, e.TITULO, e.PRECIO, e.ID_EVENTO_PADRE,
            TO_CHAR(GREATEST(NVL(e.FECHA_FIN, e.FECHA_EVENTO),
                             NVL((SELECT MAX(FECHA) FROM EVENTO_HORAS h
                                   WHERE h.ID_EVENTO = e.ID_EVENTO),
                                 NVL(e.FECHA_FIN, e.FECHA_EVENTO))),'YYYY-MM-DD') AS ULTIMO_DIA,
            i.NOMBRE AS INSTITUCION,
            (SELECT COUNT(*) FROM EVENTOS_USUARIOS eu WHERE eu.ID_EVENTO = e.ID_EVENTO) AS INSCRITOS
       FROM EVENTOS e
       LEFT JOIN LOCALES l  ON l.ID_LOCAL  = e.ID_LOCAL
       LEFT JOIN SALONES s  ON s.ID_SALON  = e.ID_SALON
       LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
       LEFT JOIN INSTITUCIONES i ON i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)
      WHERE NVL(e.NO_PUBLICAR,'N') = 'N'
        AND GREATEST(NVL(e.FECHA_FIN, e.FECHA_EVENTO),
                     NVL((SELECT MAX(FECHA) FROM EVENTO_HORAS h WHERE h.ID_EVENTO = e.ID_EVENTO),
                         NVL(e.FECHA_FIN, e.FECHA_EVENTO))) < TRUNC(SYSDATE - 5/24)
      ORDER BY 5 DESC`,
  );
  for (const r of vencidos) {
    console.log('  [' + String(r.ID_EVENTO).padStart(4) + '] hasta ' + r.ULTIMO_DIA +
      '  $' + String(nn(r.PRECIO, 0)).padStart(6) + '  ' + String(r.INSCRITOS).padStart(3) + ' inscritos  ' +
      (r.ID_EVENTO_PADRE ? '(taller) ' : '') + corta(r.TITULO, 46));
  }
  console.log('  TOTAL: ' + vencidos.length + ' eventos que el job marcaría en su primera corrida');

  // Ya suspendidos a mano: lo que se venía haciendo.
  const [m] = await q(
    `SELECT COUNT(*) AS N FROM EVENTOS e
      WHERE NVL(e.NO_PUBLICAR,'N') = 'S'
        AND NVL(e.FECHA_FIN, e.FECHA_EVENTO) < TRUNC(SYSDATE - 5/24)`,
  );
  console.log('\n  (' + m.N + ' eventos pasados ya estaban ocultos a mano)');

  // Riesgo del "suspender": a quién le desaparecería el evento.
  console.log('\n=== SI SE OCULTARAN CON NO_PUBLICAR, PERDERÍAN LA FICHA Y EL MURO ===');
  const [afect] = await q(
    `SELECT COUNT(DISTINCT eu.ID_CLIENTE) AS PERSONAS, COUNT(*) AS ENTRADAS
       FROM EVENTOS_USUARIOS eu JOIN EVENTOS e ON e.ID_EVENTO = eu.ID_EVENTO
      WHERE NVL(e.NO_PUBLICAR,'N') = 'N'
        AND NVL(e.FECHA_FIN, e.FECHA_EVENTO) < TRUNC(SYSDATE - 5/24)`,
  );
  console.log('  ' + afect.PERSONAS + ' personas con ' + afect.ENTRADAS + ' entradas de eventos ya pasados');

  await c.close();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
