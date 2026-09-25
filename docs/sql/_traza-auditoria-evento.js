/**
 * Consulta de apoyo (SOLO LECTURA): qué peticiones HTTP tocaron un evento.
 *
 * AUDITORIA_LOG no guarda "entidad + id", guarda la petición (METODO, RUTA,
 * STATUS, USUARIO, IP, DETALLE). Así que el evento se busca por el número
 * dentro de la RUTA o del DETALLE, no por una columna de id.
 *
 * Sirve para datar el cambio de precio de un evento y para ver con qué llamada
 * se creó una inscripción: si la inscripción existe y NO hay ninguna petición
 * que la explique, entró por un camino que no pasa por este log.
 *
 * Comprueba además los PAGOS enlazados por ID_EVENTO_USUARIO, no solo por
 * ID_CLIENTE/ID_EVENTO: la tabla tiene las tres columnas y un pago con las dos
 * últimas vacías se vería como "no existe" en una consulta ingenua.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_traza-auditoria-evento.js 422
 */
const oracledb = require('oracledb');

oracledb.fetchAsString = [oracledb.CLOB];

const ID_EVENTO = Number(process.argv[2]);
if (!Number.isInteger(ID_EVENTO)) {
  console.error('Uso: node _traza-auditoria-evento.js <idEvento>');
  process.exit(1);
}

const nn = (v, alt = '-') => (v === null || v === undefined || v === '' ? alt : v);
const corta = (v, n) => (v == null ? '' : String(v).replace(/\s+/g, ' ').slice(0, n));
const fecha = (d) =>
  d instanceof Date ? d.toISOString().slice(0, 16).replace('T', ' ') : nn(d);

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const q = async (sql, bind = {}) =>
    (await c.execute(sql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

  // -- Inscripciones del evento, con sus pagos enlazados por las TRES vias ---
  console.log('=== INSCRIPCIONES Y SUS PAGOS (evento ' + ID_EVENTO + ') ===');
  const insc = await q(
    `SELECT eu.ID_EVENTO_USUARIO, eu.ID_CLIENTE, eu.ESTADO, eu.OBSERVACION,
            TO_CHAR(eu.FECHA_REGISTRO, 'YYYY-MM-DD HH24:MI:SS') AS CUANDO,
            u.NOMBRE, u.APELLIDO, u.EMAIL
       FROM EVENTOS_USUARIOS eu LEFT JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
      WHERE eu.ID_EVENTO = :id ORDER BY eu.ID_EVENTO_USUARIO`,
    { id: ID_EVENTO },
  );
  for (const i of insc) {
    console.log(
      '\n  * [' + i.ID_EVENTO_USUARIO + '] ' + [i.NOMBRE, i.APELLIDO].filter(Boolean).join(' ') +
        '  <' + nn(i.EMAIL) + '>  ' + i.CUANDO,
    );
    if (i.OBSERVACION) console.log('      observacion: ' + corta(i.OBSERVACION, 200));
    const pg = await q(
      `SELECT ID_PAGO, ID_EVENTO_USUARIO, ID_EVENTO, ID_CLIENTE, MONTO, ESTADO,
              DETALLE_ESTADO, ES_GRATIS, ORIGEN_PAGO, TIPO_PAGO, PASARELA,
              TRANSACCION_ID, ID_CUPON, DESCUENTO_APLICADO,
              TO_CHAR(FECHA_PAGO, 'YYYY-MM-DD HH24:MI:SS') AS PAGADO,
              TO_CHAR(FECHA_REGISTRO, 'YYYY-MM-DD HH24:MI:SS') AS CREADO
         FROM PAGOS
        WHERE ID_EVENTO_USUARIO = :eu OR ID_CLIENTE = :c OR ID_EVENTO = :e
        ORDER BY ID_PAGO`,
      { eu: i.ID_EVENTO_USUARIO, c: i.ID_CLIENTE, e: ID_EVENTO },
    );
    if (!pg.length) console.log('      PAGOS: ninguno por ID_EVENTO_USUARIO, ID_CLIENTE ni ID_EVENTO');
    for (const p of pg) console.log('      PAGO ' + JSON.stringify(p));
  }
  if (!insc.length) console.log('  (nadie inscrito)');

  // -- Auditoria: todo lo que menciona al evento ----------------------------
  console.log('\n=== AUDITORIA_LOG QUE MENCIONA AL EVENTO ' + ID_EVENTO + ' ===');
  const aud = await q(
    `SELECT * FROM (
       SELECT ID_LOG, FECHA, USUARIO, ID_INSTITUCION, ACCION, METODO, RUTA, STATUS, IP, DETALLE
         FROM AUDITORIA_LOG
        WHERE RUTA LIKE '%/' || :id || '%' OR RUTA LIKE '%=' || :id
           OR DETALLE LIKE '%"idEvento":' || :id || '%'
           OR DETALLE LIKE '%"ID_EVENTO":' || :id || '%'
        ORDER BY ID_LOG DESC
     ) WHERE ROWNUM <= 60`,
    { id: ID_EVENTO },
  );
  for (const a of aud.reverse()) {
    console.log(
      '  ' + fecha(a.FECHA) + '  ' + String(nn(a.METODO)).padEnd(6) + ' ' + String(nn(a.STATUS)).padEnd(4) +
        '  ' + corta(a.RUTA, 60).padEnd(60) + '  ' + nn(a.USUARIO) + '  ' + nn(a.IP),
    );
    if (a.DETALLE) console.log('        ' + corta(a.DETALLE, 500));
  }
  if (!aud.length) console.log('  (nada)');

  // -- Auditoria: la ventana de tiempo de cada inscripcion ------------------
  for (const i of insc) {
    console.log('\n=== AUDITORIA +/- 10 min DE LA INSCRIPCION [' + i.ID_EVENTO_USUARIO + '] ' +
      [i.NOMBRE, i.APELLIDO].filter(Boolean).join(' ') + ' (' + i.CUANDO + ') ===');
    const v = await q(
      `SELECT ID_LOG, FECHA, USUARIO, ACCION, METODO, RUTA, STATUS, IP, DETALLE
         FROM AUDITORIA_LOG
        WHERE FECHA BETWEEN TO_DATE(:t, 'YYYY-MM-DD HH24:MI:SS') - 10/1440
                        AND TO_DATE(:t, 'YYYY-MM-DD HH24:MI:SS') + 10/1440
        ORDER BY ID_LOG`,
      { t: i.CUANDO },
    );
    for (const a of v) {
      console.log(
        '  ' + fecha(a.FECHA) + '  ' + String(nn(a.METODO)).padEnd(6) + ' ' + String(nn(a.STATUS)).padEnd(4) +
          '  ' + corta(a.RUTA, 58).padEnd(58) + '  ' + nn(a.USUARIO),
      );
      if (a.DETALLE) console.log('        ' + corta(a.DETALLE, 300));
    }
    if (!v.length) console.log('  (nada en esa ventana: el log no cubre esta ruta)');
  }

  // -- Que rutas cubre el log, para saber que NO se puede concluir ----------
  console.log('\n=== QUE RUTAS REGISTRA EL LOG (ultimos 7 dias, top 30) ===');
  for (const r of await q(
    `SELECT * FROM (
       SELECT METODO, REGEXP_REPLACE(RUTA, '[0-9a-f-]{8,}|[0-9]+', ':x') AS PATRON, COUNT(*) AS N,
              MAX(FECHA) AS ULTIMA
         FROM AUDITORIA_LOG WHERE FECHA > SYSDATE - 7
        GROUP BY METODO, REGEXP_REPLACE(RUTA, '[0-9a-f-]{8,}|[0-9]+', ':x')
        ORDER BY COUNT(*) DESC
     ) WHERE ROWNUM <= 30`,
  )) {
    console.log('  ' + String(nn(r.METODO)).padEnd(6) + ' ' + String(r.N).padStart(5) + '  ' +
      fecha(r.ULTIMA) + '  ' + nn(r.PATRON));
  }

  await c.close();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
