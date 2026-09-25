/**
 * Consulta de apoyo (SOLO LECTURA): por dónde entró alguien a un evento de pago
 * sin que exista el cobro.
 *
 * Las tres explicaciones posibles son mutuamente excluyentes y cada una deja un
 * rastro distinto, así que se piden los tres rastros a la vez:
 *   1. el evento era gratis cuando se inscribió y le pusieron precio después
 *      -> AUDITORIA_LOG del evento, comparando con FECHA_REGISTRO
 *   2. entró con un cupón que dejó el total en 0
 *      -> EVENTO_CUPONES del evento + CUPON_CODIGO de la inscripción
 *   3. lo inscribió alguien desde el panel o por la API de check-in
 *      -> LOG_PARTICIPANTES_EVENTO
 *
 * Se imprime además TODO el historial de esa persona (inscripciones y pagos en
 * cualquier evento) porque si el patrón se repite no es un caso aislado.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_traza-inscrito-sin-pago.js 422
 */
const oracledb = require('oracledb');

oracledb.fetchAsString = [oracledb.CLOB];

const ID_EVENTO = Number(process.argv[2]);
if (!Number.isInteger(ID_EVENTO)) {
  console.error('Uso: node _traza-inscrito-sin-pago.js <idEvento>');
  process.exit(1);
}

const nn = (v, alt = '-') => (v === null || v === undefined || v === '' ? alt : v);
const corta = (v, n) => (v == null ? '-' : String(v).replace(/\s+/g, ' ').slice(0, n));

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const q = async (sql, bind = {}) =>
    (await c.execute(sql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;
  const tabla = async (t) =>
    (await q('SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = :t ORDER BY COLUMN_ID', {
      t,
    })).map((r) => r.COLUMN_NAME);

  console.log('COLUMNAS DE AUDITORIA_LOG:', (await tabla('AUDITORIA_LOG')).join(', '));
  console.log('COLUMNAS DE LOG_PARTICIPANTES_EVENTO:', (await tabla('LOG_PARTICIPANTES_EVENTO')).join(', '));
  console.log('COLUMNAS DE EVENTO_CUPONES:', (await tabla('EVENTO_CUPONES')).join(', '));
  console.log('COLUMNAS DE EVENTOS_USUARIOS:', (await tabla('EVENTOS_USUARIOS')).join(', '));
  console.log('COLUMNAS DE PAGOS:', (await tabla('PAGOS')).join(', '));

  // -- 1. Auditoría del evento --------------------------------------------
  console.log('\n=== AUDITORIA DEL EVENTO ' + ID_EVENTO + ' ===');
  const aud = await q(
    `SELECT * FROM (
       SELECT a.* FROM AUDITORIA_LOG a
        WHERE (a.ENTIDAD = 'EVENTOS' OR a.ENTIDAD LIKE '%EVENT%')
          AND TO_CHAR(a.ID_ENTIDAD) = TO_CHAR(:id)
        ORDER BY a.ID_AUDITORIA DESC
     ) WHERE ROWNUM <= 40`,
    { id: ID_EVENTO },
  ).catch((err) => {
    console.log('  (no se pudo leer: ' + err.message.split('\n')[0] + ')');
    return [];
  });
  for (const a of aud) {
    const cuando = a.FECHA instanceof Date ? a.FECHA.toISOString().slice(0, 16).replace('T', ' ') : nn(a.FECHA);
    console.log(
      '  ' + cuando + '  ' + nn(a.ACCION) + '  por ' + nn(a.USUARIO ?? a.ID_USUARIO ?? a.ACTOR),
    );
    for (const k of ['DATOS_ANTES', 'DATOS_DESPUES', 'DETALLE', 'VALOR_ANTERIOR', 'VALOR_NUEVO']) {
      if (a[k]) console.log('      ' + k + ': ' + corta(a[k], 400));
    }
  }
  if (!aud.length) console.log('  (sin registros)');

  // -- 2. Cupones del evento ----------------------------------------------
  console.log('\n=== CUPONES DEL EVENTO ===');
  for (const k of await q('SELECT * FROM EVENTO_CUPONES WHERE ID_EVENTO = :id', { id: ID_EVENTO })) {
    console.log('  ' + JSON.stringify(k));
  }

  // -- 3. Log de participantes --------------------------------------------
  console.log('\n=== LOG_PARTICIPANTES_EVENTO ===');
  const lp = await q(
    'SELECT * FROM LOG_PARTICIPANTES_EVENTO WHERE ID_EVENTO = :id ORDER BY 1',
    { id: ID_EVENTO },
  ).catch((err) => {
    console.log('  (no se pudo leer: ' + err.message.split('\n')[0] + ')');
    return [];
  });
  for (const r of lp) console.log('  ' + JSON.stringify(r));
  if (!lp.length) console.log('  (sin registros)');

  // -- 4. Historial completo de los inscritos ------------------------------
  const gente = await q(
    `SELECT eu.ID_CLIENTE, u.NOMBRE, u.APELLIDO, u.EMAIL
       FROM EVENTOS_USUARIOS eu LEFT JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
      WHERE eu.ID_EVENTO = :id`,
    { id: ID_EVENTO },
  );

  for (const g of gente) {
    console.log('\n=== HISTORIAL DE ' + [g.NOMBRE, g.APELLIDO].filter(Boolean).join(' ') + ' <' + nn(g.EMAIL) + '> ===');
    console.log('  id_cliente ' + g.ID_CLIENTE);

    const [u] = await q(
      `SELECT TO_CHAR(FECHA_REGISTRO, 'YYYY-MM-DD HH24:MI') AS ALTA, ESTADO, TIPO_CLIENTE,
              VERIFICADO, EMAIL_FACTURA
         FROM USUARIOS WHERE ID_CLIENTE = :c`,
      { c: g.ID_CLIENTE },
    ).catch(() => [null]);
    if (u) console.log('  cuenta: ' + JSON.stringify(u));

    console.log('  -- inscripciones --');
    for (const r of await q(
      `SELECT eu.ID_EVENTO, ev.TITULO, ev.PRECIO, eu.ESTADO, eu.ASISTIO,
              TO_CHAR(eu.FECHA_REGISTRO, 'YYYY-MM-DD HH24:MI') AS CUANDO
         FROM EVENTOS_USUARIOS eu LEFT JOIN EVENTOS ev ON ev.ID_EVENTO = eu.ID_EVENTO
        WHERE eu.ID_CLIENTE = :c ORDER BY eu.ID_EVENTO_USUARIO`,
      { c: g.ID_CLIENTE },
    )) {
      console.log(
        '    [' + r.ID_EVENTO + '] ' + corta(r.TITULO, 52).padEnd(52) +
          ' $' + nn(r.PRECIO, 0) + '  ' + nn(r.CUANDO) + '  estado=' + nn(r.ESTADO),
      );
    }

    console.log('  -- pagos --');
    const pg = await q('SELECT * FROM PAGOS WHERE ID_CLIENTE = :c ORDER BY ID_PAGO', { c: g.ID_CLIENTE });
    for (const r of pg) console.log('    ' + JSON.stringify(r));
    if (!pg.length) console.log('    (ninguno en toda la base)');

    console.log('  -- instituciones a las que pertenece --');
    for (const r of await q(
      `SELECT ui.ID_INSTITUCION, i.NOMBRE, i.CODIGO_CONEXION
         FROM USUARIO_INSTITUCIONES ui LEFT JOIN INSTITUCIONES i ON i.ID_INSTITUCION = ui.ID_INSTITUCION
        WHERE ui.ID_CLIENTE = :c`,
      { c: g.ID_CLIENTE },
    ).catch(() => [])) {
      console.log('    [' + r.ID_INSTITUCION + '] ' + nn(r.NOMBRE) + '  codigo=' + nn(r.CODIGO_CONEXION));
    }

    console.log('  -- roles en el panel --');
    for (const r of await q(
      `SELECT * FROM USUARIO_ROL_INSTITUCION WHERE ID_CLIENTE = :c`,
      { c: g.ID_CLIENTE },
    ).catch(() => [])) {
      console.log('    ' + JSON.stringify(r));
    }
  }

  // -- 5. El mismo patrón en el resto de la base ---------------------------
  console.log('\n=== OTROS INSCRITOS SIN PAGO EN EVENTOS DE PRECIO > 0 ===');
  const global = await q(
    `SELECT ev.ID_EVENTO, ev.TITULO, ev.PRECIO, COUNT(*) AS SIN_PAGO
       FROM EVENTOS_USUARIOS eu
       JOIN EVENTOS ev ON ev.ID_EVENTO = eu.ID_EVENTO
      WHERE NVL(ev.PRECIO, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM PAGOS p
           WHERE p.ID_EVENTO = eu.ID_EVENTO AND p.ID_CLIENTE = eu.ID_CLIENTE)
      GROUP BY ev.ID_EVENTO, ev.TITULO, ev.PRECIO
      ORDER BY 1`,
  );
  for (const r of global) {
    console.log('  [' + r.ID_EVENTO + '] $' + nn(r.PRECIO, 0) + '  ' + r.SIN_PAGO + ' sin pago  ' + corta(r.TITULO, 56));
  }
  if (!global.length) console.log('  (ninguno)');

  await c.close();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
