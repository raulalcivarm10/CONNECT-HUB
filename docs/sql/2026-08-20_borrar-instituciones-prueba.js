/**
 * Borra instituciones de prueba con TODO lo suyo: eventos, espacios y vínculos.
 *
 * NO borra cuentas de USUARIOS: solo el vínculo con la institución. Una persona
 * puede pertenecer a varias, y aquí no se decide sobre su cuenta.
 *
 * POR QUÉ LEE EL GRAFO DE CLAVES FORÁNEAS: la primera versión llevaba una lista
 * de tablas escrita a mano y falló tres veces seguidas, cada una destapando una
 * dependencia distinta (FEEDBACK sin ID_EVENTO, ARCHIVOS colgando del salón,
 * los subsalones con su configuración). Mantener esa lista es perder siempre:
 * la base ya sabe quién depende de quién, así que se le pregunta y se borra de
 * abajo hacia arriba.
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
if (IDS.includes(101)) {
  console.error('La institución 101 (UEES real) no se borra desde aquí.');
  process.exit(1);
}

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const q = async (sql, bind = {}) =>
    (await c.execute(sql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;
  const exec = (sql, bind = {}) => c.execute(sql, bind, { autoCommit: false });

  /** Quién apunta a esta tabla, según las claves foráneas declaradas. */
  const hijosDe = (tabla) =>
    q(
      `SELECT cc.TABLE_NAME AS TABLA, cc.COLUMN_NAME AS COLUMNA, pc.COLUMN_NAME AS COLUMNA_PADRE
         FROM USER_CONSTRAINTS h
         JOIN USER_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = h.CONSTRAINT_NAME
         JOIN USER_CONSTRAINTS p   ON p.CONSTRAINT_NAME  = h.R_CONSTRAINT_NAME
         JOIN USER_CONS_COLUMNS pc ON pc.CONSTRAINT_NAME = p.CONSTRAINT_NAME
        WHERE h.CONSTRAINT_TYPE = 'R' AND p.TABLE_NAME = :t`,
      { t: tabla },
    );

  /**
   * Borra `tabla` donde se cumpla `donde`, vaciando antes a todos sus
   * descendientes. `visitadas` corta los ciclos (EVENTOS.ID_EVENTO_PADRE apunta
   * a la propia EVENTOS).
   */
  async function borrarEnCascada(tabla, donde, bind, sangria = '    ', visitadas = new Set()) {
    const marca = `${tabla}|${donde}`;
    if (visitadas.has(marca)) return;
    visitadas.add(marca);

    for (const hijo of await hijosDe(tabla)) {
      if (hijo.TABLA === tabla) {
        // auto-referencia: se suelta el vínculo en vez de borrar en cadena
        await exec(
          `UPDATE ${tabla} SET ${hijo.COLUMNA} = NULL
            WHERE ${hijo.COLUMNA} IN (SELECT ${hijo.COLUMNA_PADRE} FROM ${tabla} WHERE ${donde})`,
          bind,
        );
        continue;
      }
      const sub = `${hijo.COLUMNA} IN (SELECT ${hijo.COLUMNA_PADRE} FROM ${tabla} WHERE ${donde})`;
      await borrarEnCascada(hijo.TABLA, sub, bind, sangria, visitadas);
    }

    const r = await exec(`DELETE FROM ${tabla} WHERE ${donde}`, bind);
    if (r.rowsAffected) console.log(`${sangria}${tabla}: ${r.rowsAffected}`);
  }

  const insts = await q(
    `SELECT ID_INSTITUCION, NOMBRE, CODIGO_CONEXION FROM INSTITUCIONES
      WHERE ID_INSTITUCION IN (${IDS.join(',')})`,
  );
  if (!insts.length) throw new Error('Ninguna de esas instituciones existe.');

  console.log('A BORRAR:');
  for (const i of insts) {
    console.log(`  [${i.ID_INSTITUCION}] ${i.NOMBRE}  (código ${i.CODIGO_CONEXION ?? '-'})`);
  }

  // ── Respaldo antes de tocar nada ──────────────────────────────────────────
  const respaldo = { instituciones: insts, eventos: [], locales: [], salones: [], vinculos: [] };
  for (const inst of insts) {
    const id = inst.ID_INSTITUCION;
    respaldo.eventos.push(
      ...(await q(
        `SELECT e.* FROM EVENTOS e
           LEFT JOIN LOCALES l  ON l.ID_LOCAL  = e.ID_LOCAL
           LEFT JOIN SALONES s  ON s.ID_SALON  = e.ID_SALON
           LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
          WHERE COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) = :id`,
        { id },
      )),
    );
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
  }
  const marca = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const ruta = `/app/respaldos/instituciones-${marca}.json`;
  fs.writeFileSync(ruta, JSON.stringify(respaldo, saneador, 1), 'utf8');
  console.log(`\nRespaldo en ${ruta}`);

  // ── Borrado ───────────────────────────────────────────────────────────────
  for (const inst of insts) {
    const id = inst.ID_INSTITUCION;
    console.log(`\n[${id}] ${inst.NOMBRE}`);

    // Los eventos se localizan por su espacio (local directo o vía salón).
    const delEsta = (
      await q(
        `SELECT e.ID_EVENTO FROM EVENTOS e
           LEFT JOIN LOCALES l  ON l.ID_LOCAL  = e.ID_LOCAL
           LEFT JOIN SALONES s  ON s.ID_SALON  = e.ID_SALON
           LEFT JOIN LOCALES l2 ON l2.ID_LOCAL = s.ID_LOCAL
          WHERE COALESCE(l.ID_INSTITUCION, l2.ID_INSTITUCION) = :id`,
        { id },
      )
    ).map((r) => r.ID_EVENTO);

    if (delEsta.length) {
      await borrarEnCascada('EVENTOS', `ID_EVENTO IN (${delEsta.join(',')})`, {});
    }
    await borrarEnCascada(
      'SALONES',
      `ID_LOCAL IN (SELECT ID_LOCAL FROM LOCALES WHERE ID_INSTITUCION = :id)`,
      { id },
    );
    await borrarEnCascada('LOCALES', `ID_INSTITUCION = :id`, { id });
    await borrarEnCascada('INSTITUCIONES', `ID_INSTITUCION = :id`, { id });
  }

  await c.commit();

  console.log('\nINSTITUCIONES QUE QUEDAN:');
  for (const i of await q(`SELECT ID_INSTITUCION, NOMBRE, ESTADO FROM INSTITUCIONES ORDER BY 1`)) {
    console.log(`  [${i.ID_INSTITUCION}] ${String(i.ESTADO ?? '-').padEnd(11)} ${i.NOMBRE}`);
  }
  const u = await q(`SELECT COUNT(*) AS N FROM USUARIOS`);
  console.log(`\nCuentas de usuario intactas: ${u[0].N}`);

  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
