/**
 * Consulta de apoyo (SOLO LECTURA): inscritos que entraron ANTES de que el
 * evento tuviera precio.
 *
 * Un evento creado gratis y puesto de pago después deja a los ya inscritos con
 * su QR válido y sin cobro, sin que nada haya fallado: cada paso hizo lo suyo.
 * Por eso no aparece como error en ningún lado y solo se ve al cruzar la hora
 * de la inscripción con la hora en que se cambió el precio.
 *
 * El precio anterior no está guardado en ninguna columna de histórico, así que
 * se reconstruye desde AUDITORIA_LOG, que sí guarda el cuerpo de cada petición
 * (POST /eventos al crear, PATCH /eventos/:id al editar).
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_traza-precio-cambiado.js
 */
const oracledb = require('oracledb');

oracledb.fetchAsString = [oracledb.CLOB];

const nn = (v, alt = '-') => (v === null || v === undefined || v === '' ? alt : v);
const fecha = (d) => (d instanceof Date ? d.toISOString().slice(0, 16).replace('T', ' ') : nn(d));

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const q = async (sql, bind = {}) =>
    (await c.execute(sql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

  // Eventos de pago con gente inscrita y sin ningún PAGO que la respalde.
  const sospechosos = await q(
    `SELECT ev.ID_EVENTO, ev.TITULO, ev.PRECIO
       FROM EVENTOS ev
      WHERE NVL(ev.PRECIO, 0) > 0
        AND EXISTS (
          SELECT 1 FROM EVENTOS_USUARIOS eu
           WHERE eu.ID_EVENTO = ev.ID_EVENTO
             AND NOT EXISTS (
               SELECT 1 FROM PAGOS p
                WHERE p.ID_EVENTO_USUARIO = eu.ID_EVENTO_USUARIO
                   OR (p.ID_EVENTO = eu.ID_EVENTO AND p.ID_CLIENTE = eu.ID_CLIENTE)))
      ORDER BY ev.ID_EVENTO`,
  );

  for (const ev of sospechosos) {
    console.log('\n' + '='.repeat(76));
    console.log('[' + ev.ID_EVENTO + '] ' + ev.TITULO + '   hoy: $' + Number(ev.PRECIO).toFixed(2));
    console.log('='.repeat(76));

    // Historia del precio segun el cuerpo de cada peticion registrada.
    const peticiones = await q(
      `SELECT FECHA, USUARIO, METODO, RUTA, DETALLE
         FROM AUDITORIA_LOG
        WHERE (METODO = 'POST'  AND RUTA = '/eventos')
           OR (METODO = 'PATCH' AND RUTA = '/eventos/' || :id)
        ORDER BY ID_LOG`,
      { id: ev.ID_EVENTO },
    );

    const historia = [];
    for (const p of peticiones) {
      let cuerpo;
      try {
        cuerpo = JSON.parse(p.DETALLE);
      } catch {
        continue;
      }
      // Al CREAR, la ruta es /eventos y no lleva el id: solo cuenta si el titulo
      // coincide, que es lo unico que enlaza esa peticion con este evento.
      if (p.METODO === 'POST') {
        const t = String(cuerpo.titulo ?? '').toUpperCase();
        const real = String(ev.TITULO ?? '').toUpperCase();
        if (!t || (!real.startsWith(t) && !t.startsWith(real.slice(0, 25)))) continue;
      }
      if (cuerpo.precio === undefined) continue;
      historia.push({
        cuando: p.FECHA,
        quien: p.USUARIO,
        precio: Number(cuerpo.precio),
        que: p.METODO === 'POST' ? 'creado' : 'editado',
      });
    }

    console.log('\n  HISTORIA DEL PRECIO:');
    if (!historia.length) console.log('    (el log no alcanza: no se puede datar el cambio)');
    for (const h of historia) {
      console.log('    ' + fecha(h.cuando) + '  ' + h.que.padEnd(8) + ' $' +
        h.precio.toFixed(2).padStart(8) + '   ' + nn(h.quien));
    }
    const puso = historia.find((h) => h.precio > 0);

    // Inscritos sin pago, comparados contra el momento en que se puso precio.
    const sinPago = await q(
      `SELECT eu.ID_EVENTO_USUARIO, eu.FECHA_REGISTRO, u.NOMBRE, u.APELLIDO, u.EMAIL
         FROM EVENTOS_USUARIOS eu LEFT JOIN USUARIOS u ON u.ID_CLIENTE = eu.ID_CLIENTE
        WHERE eu.ID_EVENTO = :id
          AND NOT EXISTS (
            SELECT 1 FROM PAGOS p
             WHERE p.ID_EVENTO_USUARIO = eu.ID_EVENTO_USUARIO
                OR (p.ID_EVENTO = eu.ID_EVENTO AND p.ID_CLIENTE = eu.ID_CLIENTE))
        ORDER BY eu.FECHA_REGISTRO`,
      { id: ev.ID_EVENTO },
    );

    console.log('\n  INSCRITOS SIN COBRO (' + sinPago.length + '):');
    for (const s of sinPago) {
      const antes = puso && s.FECHA_REGISTRO < puso.cuando;
      console.log(
        '    ' + fecha(s.FECHA_REGISTRO) + '  ' +
          ([s.NOMBRE, s.APELLIDO].filter(Boolean).join(' ') || '(sin nombre)').padEnd(28) +
          ' <' + nn(s.EMAIL) + '>',
      );
      console.log(
        '        ' +
          (puso
            ? antes
              ? 'se inscribio ANTES de que el evento tuviera precio -> entrada legitima, sin cobro'
              : 'se inscribio DESPUES de tener precio -> hay que revisarlo a mano'
            : 'sin fecha de cambio de precio: no se puede clasificar'),
      );
    }
  }

  if (!sospechosos.length) console.log('No hay eventos de pago con inscritos sin cobro.');
  await c.close();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
