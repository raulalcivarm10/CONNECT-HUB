/**
 * Consulta de apoyo (SOLO LECTURA): traza de punta a punta de un evento.
 *
 * Responde "qué pasó con esta persona": cruza la INSCRIPCIÓN (EVENTOS_USUARIOS,
 * que es lo que cuenta el panel en la columna de inscritos) contra los PAGOS.
 * Los dos lados se listan por separado a propósito, porque el problema que se
 * busca casi siempre es una asimetría:
 *
 *   - inscrito SIN pago aprobado en un evento de precio > 0  -> entró sin cobrar
 *   - pago aprobado SIN inscripción                          -> cobrado sin entrada
 *
 * Imprime además cómo se resuelve la institución del evento (local directo o
 * vía salón), que es de donde salen las credenciales de la pasarela: si sale
 * vacía, el cobro nunca pudo dispararse.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_traza-inscritos-evento.js CARILLAS
 */
const oracledb = require('oracledb');

oracledb.fetchAsString = [oracledb.CLOB];

const FILTRO = process.argv.slice(2).join(' ').trim();
if (!FILTRO) {
  console.error('Uso: node _traza-inscritos-evento.js <parte del titulo | idEvento>');
  process.exit(1);
}

const nn = (v, alt = '-') => (v === null || v === undefined || v === '' ? alt : v);
const money = (v) => (v === null || v === undefined ? '-' : '$' + Number(v).toFixed(2));
const raya = (n) => '-'.repeat(n);

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const q = async (sql, bind = {}) =>
    (await c.execute(sql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

  /** Columnas reales, para no adivinar nombres del esquema compartido. */
  const columnas = async (tabla) =>
    new Set(
      (await q('SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = :t', { t: tabla })).map(
        (r) => r.COLUMN_NAME,
      ),
    );
  const colsPago = await columnas('PAGOS');
  const colsInsc = await columnas('EVENTOS_USUARIOS');
  const hay = (set, ...cs) => cs.find((x) => set.has(x));

  const esId = /^\d+$/.test(FILTRO);
  const eventos = await q(
    esId
      ? 'SELECT ID_EVENTO FROM EVENTOS WHERE ID_EVENTO = :f'
      : "SELECT ID_EVENTO FROM EVENTOS WHERE UPPER(TITULO) LIKE '%' || UPPER(:f) || '%' ORDER BY ID_EVENTO",
    { f: esId ? Number(FILTRO) : FILTRO },
  );
  if (!eventos.length) throw new Error('Ningún evento coincide con "' + FILTRO + '"');

  for (const ev of eventos) {
    const id = ev.ID_EVENTO;
    const [e] = await q(
      `SELECT e.ID_EVENTO, e.TITULO, e.PRECIO, e.MONTO_IVA, e.INCLUYE_IVA,
              e.ID_EVENTO_PADRE, e.NO_PUBLICAR, e.ESTADO_APROBACION,
              e.ID_LOCAL, e.ID_SALON,
              TO_CHAR(e.FECHA_EVENTO, 'YYYY-MM-DD') AS FECHA,
              l.ID_INSTITUCION  AS INST_LOCAL,
              l2.ID_INSTITUCION AS INST_SALON,
              i.NOMBRE AS INSTITUCION,
              pa.TITULO AS PADRE
         FROM EVENTOS e
         LEFT JOIN LOCALES  l  ON l.ID_LOCAL  = e.ID_LOCAL
         LEFT JOIN SALONES  s  ON s.ID_SALON  = e.ID_SALON
         LEFT JOIN LOCALES  l2 ON l2.ID_LOCAL = s.ID_LOCAL
         LEFT JOIN INSTITUCIONES i ON i.ID_INSTITUCION = COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION)
         LEFT JOIN EVENTOS pa ON pa.ID_EVENTO = e.ID_EVENTO_PADRE
        WHERE e.ID_EVENTO = :id`,
      { id },
    );

    console.log('\n' + '='.repeat(78));
    console.log('[' + e.ID_EVENTO + '] ' + e.TITULO);
    console.log('='.repeat(78));
    console.log('  fecha        ' + nn(e.FECHA));
    console.log(
      '  precio       ' + money(e.PRECIO) + '   IVA ' + nn(e.MONTO_IVA, 0) + '%  ' +
        (e.INCLUYE_IVA === 'S' ? '(incluido)' : '(se suma)'),
    );
    console.log(
      '  publicado    ' + (e.NO_PUBLICAR === 'S' ? 'NO (oculto)' : 'si') +
        '   aprobacion ' + nn(e.ESTADO_APROBACION),
    );
    console.log('  padre        ' + nn(e.PADRE));
    console.log('  espacio      local=' + nn(e.ID_LOCAL) + '  salon=' + nn(e.ID_SALON));
    console.log(
      '  institucion  ' + nn(e.INSTITUCION, '*** NO RESUELVE ***') +
        '  (por local=' + nn(e.INST_LOCAL) + ', por salon=' + nn(e.INST_SALON) + ')',
    );

    // -- Inscritos -----------------------------------------------------------
    const cCupon = hay(colsInsc, 'CUPON_CODIGO');
    const cFecha = hay(colsInsc, 'FECHA_REGISTRO', 'FECHA_INSCRIPCION');
    const insc = await q(
      `SELECT eu.ID_EVENTO_USUARIO, eu.ID_CLIENTE, eu.ESTADO, eu.ASISTIO, eu.QR_TOKEN,
              ${cFecha ? "TO_CHAR(eu." + cFecha + ", 'YYYY-MM-DD HH24:MI')" : 'NULL'} AS CUANDO,
              ${cCupon ? 'eu.' + cCupon : 'NULL'} AS CUPON,
              u.NOMBRE, u.APELLIDO, u.EMAIL, u.EMAIL_FACTURA
         FROM EVENTOS_USUARIOS eu
         LEFT JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
        WHERE eu.ID_EVENTO = :id
        ORDER BY eu.ID_EVENTO_USUARIO`,
      { id },
    );

    console.log('\n  -- INSCRITOS (' + insc.length + ') ' + raya(50));
    for (const i of insc) {
      const quien = [i.NOMBRE, i.APELLIDO].filter(Boolean).join(' ') || '(sin nombre)';
      console.log('  * ' + quien + '  <' + nn(i.EMAIL) + '>');
      console.log('      cliente ' + i.ID_CLIENTE + '   inscrito ' + nn(i.CUANDO));
      console.log(
        '      estado=' + nn(i.ESTADO) + '  asistio=' + nn(i.ASISTIO) +
          '  QR=' + (i.QR_TOKEN ? 'si' : 'NO') + '  cupon=' + nn(i.CUPON),
      );
      if (i.EMAIL_FACTURA && i.EMAIL_FACTURA !== i.EMAIL) {
        console.log('      correo de factura: ' + i.EMAIL_FACTURA);
      }
    }
    if (!insc.length) console.log('  (nadie inscrito)');

    // -- Pagos ---------------------------------------------------------------
    const cRef = hay(colsPago, 'REFERENCIA', 'TRANSACTION_ID', 'ID_TRANSACCION');
    const cDet = hay(colsPago, 'DETALLE_ESTADO', 'MENSAJE');
    const cOri = hay(colsPago, 'ORIGEN_PAGO', 'ORIGEN');
    const cFec = hay(colsPago, 'FECHA_PAGO', 'FECHA');
    const pagos = await q(
      `SELECT p.ID_PAGO, p.ID_CLIENTE, p.MONTO, p.ESTADO,
              ${cDet ? 'p.' + cDet : 'NULL'} AS DETALLE,
              ${cOri ? 'p.' + cOri : 'NULL'} AS ORIGEN,
              ${cRef ? 'SUBSTR(p.' + cRef + ', 1, 48)' : 'NULL'} AS REF,
              ${cFec ? "TO_CHAR(p." + cFec + ", 'YYYY-MM-DD HH24:MI')" : 'NULL'} AS CUANDO,
              u.NOMBRE, u.APELLIDO, u.EMAIL
         FROM PAGOS p
         LEFT JOIN USUARIOS u ON u.ID_CLIENTE = p.ID_CLIENTE
        WHERE p.ID_EVENTO = :id
        ORDER BY p.ID_PAGO`,
      { id },
    );

    console.log('\n  -- PAGOS (' + pagos.length + ') ' + raya(53));
    for (const p of pagos) {
      const quien = [p.NOMBRE, p.APELLIDO].filter(Boolean).join(' ') || '(sin nombre)';
      console.log(
        '  * #' + p.ID_PAGO + '  ' + money(p.MONTO) + '  ' + nn(p.ESTADO) +
          (p.DETALLE ? ' / ' + p.DETALLE : ''),
      );
      console.log('      ' + quien + ' <' + nn(p.EMAIL) + '>   ' + nn(p.CUANDO) + '   origen=' + nn(p.ORIGEN));
      console.log('      ref=' + nn(p.REF));
    }
    if (!pagos.length) console.log('  (sin pagos registrados)');

    // -- Cruce ---------------------------------------------------------------
    if ((e.PRECIO ?? 0) > 0) {
      const aprobados = new Set(
        pagos.filter((p) => /APROB|APPROV|PAID|PAGADO/i.test(p.ESTADO ?? '')).map((p) => p.ID_CLIENTE),
      );
      const inscritos = new Set(insc.map((i) => i.ID_CLIENTE));
      const sinPago = insc.filter((i) => !aprobados.has(i.ID_CLIENTE));
      const sinEntrada = pagos.filter((p) => aprobados.has(p.ID_CLIENTE) && !inscritos.has(p.ID_CLIENTE));

      console.log('\n  -- CRUCE ' + raya(62));
      if (sinPago.length) {
        console.log(
          '  [!] ' + sinPago.length + ' inscrito(s) SIN pago aprobado en un evento de ' + money(e.PRECIO) + ':',
        );
        for (const i of sinPago) {
          const otros = pagos.filter((p) => p.ID_CLIENTE === i.ID_CLIENTE);
          console.log(
            '      ' + [i.NOMBRE, i.APELLIDO].filter(Boolean).join(' ') + ' - ' +
              (otros.length
                ? 'tiene ' + otros.length + ' intento(s): ' + otros.map((o) => o.ESTADO).join(', ')
                : 'sin ninguna fila en PAGOS'),
          );
        }
      }
      if (sinEntrada.length) {
        console.log('  [!] ' + sinEntrada.length + ' pago(s) aprobado(s) SIN inscripcion.');
      }
      if (!sinPago.length && !sinEntrada.length) console.log('  OK: todo cuadra');
    }

    // -- Otros pagos de esas personas (por si el cobro cayó en otro evento) ---
    if (insc.length) {
      const ids = insc.map((i) => "'" + i.ID_CLIENTE + "'").join(',');
      const otros = await q(
        `SELECT p.ID_PAGO, p.ID_EVENTO, p.MONTO, p.ESTADO,
                ${cFec ? "TO_CHAR(p." + cFec + ", 'YYYY-MM-DD HH24:MI')" : 'NULL'} AS CUANDO,
                ev.TITULO, u.NOMBRE, u.APELLIDO
           FROM PAGOS p
           LEFT JOIN EVENTOS ev ON ev.ID_EVENTO = p.ID_EVENTO
           LEFT JOIN USUARIOS u ON u.ID_CLIENTE = p.ID_CLIENTE
          WHERE p.ID_CLIENTE IN (${ids}) AND (p.ID_EVENTO IS NULL OR p.ID_EVENTO <> :id)
          ORDER BY p.ID_PAGO`,
        { id },
      );
      if (otros.length) {
        console.log('\n  -- OTROS PAGOS DE ESAS MISMAS PERSONAS (' + otros.length + ') ' + raya(22));
        for (const o of otros) {
          console.log(
            '  * #' + o.ID_PAGO + ' ' + money(o.MONTO) + ' ' + nn(o.ESTADO) + '  ' + nn(o.CUANDO) +
              '  [' + nn(o.ID_EVENTO) + '] ' + nn(o.TITULO) +
              ' - ' + [o.NOMBRE, o.APELLIDO].filter(Boolean).join(' '),
          );
        }
      }
    }
  }

  await c.close();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
