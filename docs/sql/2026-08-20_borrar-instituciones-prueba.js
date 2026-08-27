/**
 * Borra instituciones de prueba con TODO lo suyo: eventos y sus dependencias,
 * espacios y vínculos de usuario.
 *
 * NO borra cuentas de USUARIOS: solo el vínculo con la institución. Una persona
 * puede pertenecer a varias, y aquí no se decide sobre su cuenta.
 *
 * Las instituciones a borrar se pasan por argumento, para no dejar ids fijos en
 * un script que borra:
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     -v /root/app/respaldos:/app/respaldos \
 *     --entrypoint node api /app/migraciones/2026-08-20_borrar-instituciones-prueba.js 122 141 161
 */
const oracledb = require('oracledb');
const fs = require('fs');

oracledb.fetchAsString = [oracledb.CLOB];

const saneador = (_k, v) => {
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return `(binario ${v.length} bytes)`;
  if (v && typeof v === 'object' && v.constructor?.name === 'Lob') return '(lob)';
  return v;
};

const IDS = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
if (!IDS.length) {
  console.error('Uso: node ...borrar-instituciones-prueba.js <id> [<id> …]');
  process.exit(1);
}

/**
 * Las tablas hijas NO van escritas a mano: se descubren preguntándole a la base
 * quién tiene una columna ID_EVENTO. Una lista fija se queda vieja en cuanto
 * alguien añade una tabla, y el primer intento de este script se estrelló justo
 * por eso (FEEDBACK no tiene ID_EVENTO, y en cambio faltaban COMUNIDAD_MENSAJES,
 * COMUNIDAD_MIEMBROS y EVENTO_SUBSALONES).
 */
async function tablasHijasDeEvento(q) {
  const filas = await q(
    `SELECT c.TABLE_NAME
       FROM USER_TAB_COLUMNS c
       JOIN USER_TABLES t ON t.TABLE_NAME = c.TABLE_NAME
      WHERE c.COLUMN_NAME = 'ID_EVENTO' AND c.TABLE_NAME <> 'EVENTOS'
      ORDER BY c.TABLE_NAME`,
  );
  return filas.map((f) => f.TABLE_NAME);
}

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const q = async (sql, bind = {}) =>
    (await c.execute(sql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

  // Comprobación dura: nunca tocar la 101 aunque venga por argumento.
  if (IDS.includes(101)) throw new Error('La institución 101 no se borra desde aquí.');

  const insts = await q(
    `SELECT ID_INSTITUCION, NOMBRE, CODIGO_CONEXION FROM INSTITUCIONES
      WHERE ID_INSTITUCION IN (${IDS.join(',')})`,
  );
  if (!insts.length) throw new Error('Ninguna de esas instituciones existe.');
  console.log('A BORRAR:');
  for (const i of insts) {
    console.log(`  [${i.ID_INSTITUCION}] ${i.NOMBRE}  (código ${i.CODIGO_CONEXION ?? '-'})`);
  }

  const HIJAS_EVENTO = await tablasHijasDeEvento(q);
  console.log(`
Tablas hijas detectadas: ${HIJAS_EVENTO.length}`);

  const respaldo = { instituciones: insts, eventos: [], locales: [], salones: [], vinculos: [] };
  let totalEventos = 0;

  for (const inst of insts) {
    const id = inst.ID_INSTITUCION;

    const eventos = await q(
      `SELECT e.* FROM EVENTOS e
         LEFT JOIN LOCALES l  ON l.ID_LOCAL  = e.ID_LOCAL
         LEFT JOIN SALONES s  ON s.ID_SALON  = e.ID_SALON
         LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
        WHERE COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) = :id`,
      { id },
    );
    respaldo.eventos.push(...eventos);
    respaldo.locales.push(...(await q(`SELECT * FROM LOCALES WHERE ID_INSTITUCION = :id`, { id })));
    respaldo.salones.push(
      ...(await q(
        `SELECT s.* FROM SALONES s JOIN LOCALES l ON l.ID_LOCAL = s.ID_LOCAL
          WHERE l.ID_INSTITUCION = :id`,
        { id },
      )),
    );
    respaldo.vinculos.push(
      ...(await q(`SELECT * FROM USUARIO_INSTITUCIONES WHERE ID_INSTITUCION = :id`, { id })),
    );

    console.log(`\n[${id}] ${inst.NOMBRE}: ${eventos.length} evento(s)`);

    for (const ev of eventos) {
      const idEv = ev.ID_EVENTO;
      for (const tabla of HIJAS_EVENTO) {
        try {
          const r = await c.execute(
            `DELETE FROM ${tabla} WHERE ID_EVENTO = :e`,
            { e: idEv },
            { autoCommit: false },
          );
          if (r.rowsAffected) console.log(`    ${tabla}: ${r.rowsAffected}`);
        } catch (e) {
          if (!String(e.message).includes('ORA-00942')) throw e; // tabla que no existe: se ignora
        }
      }
      // los talleres cuelgan del evento: se sueltan antes de borrar el padre
      await c.execute(
        `UPDATE EVENTOS SET ID_EVENTO_PADRE = NULL WHERE ID_EVENTO_PADRE = :e`,
        { e: idEv },
        { autoCommit: false },
      );
    }

    if (eventos.length) {
      const r = await c.execute(
        `DELETE FROM EVENTOS WHERE ID_EVENTO IN (${eventos.map((e) => e.ID_EVENTO).join(',')})`,
        {}, { autoCommit: false },
      );
      console.log(`    EVENTOS: ${r.rowsAffected}`);
      totalEventos += r.rowsAffected;
    }

    const rs = await c.execute(
      `DELETE FROM SALONES WHERE ID_LOCAL IN (SELECT ID_LOCAL FROM LOCALES WHERE ID_INSTITUCION = :id)`,
      { id }, { autoCommit: false },
    );
    const rl = await c.execute(`DELETE FROM LOCALES WHERE ID_INSTITUCION = :id`, { id }, { autoCommit: false });
    const rv = await c.execute(`DELETE FROM USUARIO_INSTITUCIONES WHERE ID_INSTITUCION = :id`, { id }, { autoCommit: false });
    const ri = await c.execute(`DELETE FROM INSTITUCIONES WHERE ID_INSTITUCION = :id`, { id }, { autoCommit: false });
    console.log(`    SALONES: ${rs.rowsAffected} · LOCALES: ${rl.rowsAffected} · vínculos: ${rv.rowsAffected} · INSTITUCIONES: ${ri.rowsAffected}`);
  }

  const marca = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const ruta = `/app/respaldos/instituciones-${marca}.json`;
  fs.writeFileSync(ruta, JSON.stringify(respaldo, saneador, 1), 'utf8');
  console.log(`\nRespaldo en ${ruta}`);

  await c.commit();

  console.log('\nINSTITUCIONES QUE QUEDAN:');
  for (const i of await q(`SELECT ID_INSTITUCION, NOMBRE, ESTADO FROM INSTITUCIONES ORDER BY 1`)) {
    console.log(`  [${i.ID_INSTITUCION}] ${String(i.ESTADO ?? '-').padEnd(11)} ${i.NOMBRE}`);
  }
  console.log(`\nEventos borrados: ${totalEventos}`);
  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
