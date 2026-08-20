/**
 * Comparación (SOLO LECTURA) de dos eventos, columna por columna.
 * Sirve para ver por qué uno se comporta distinto que otro (p. ej. en pagos).
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_comparar-eventos.js "PRUEBAS PAGOS" "GOBERNADOR"
 */
const oracledb = require('oracledb');

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('Uso: node _comparar-eventos.js "<titulo A>" "<titulo B>"');
  process.exit(1);
}

const corto = (v) => {
  if (v === null || v === undefined) return '(null)';
  if (v instanceof Date) return v.toISOString().slice(0, 16);
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
};

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  async function buscar(titulo) {
    const { rows } = await c.execute(
      `SELECT * FROM EVENTOS
        WHERE UPPER(TITULO) LIKE '%' || UPPER(:t) || '%'
        ORDER BY ID_EVENTO DESC FETCH FIRST 1 ROWS ONLY`,
      { t: titulo }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return rows[0] ?? null;
  }

  const evA = await buscar(a);
  const evB = await buscar(b);
  if (!evA) console.log(`Sin evento que coincida con "${a}"`);
  if (!evB) console.log(`Sin evento que coincida con "${b}"`);
  if (!evA || !evB) return c.close();

  console.log(`\n  A = [${evA.ID_EVENTO}] ${evA.TITULO}`);
  console.log(`  B = [${evB.ID_EVENTO}] ${evB.TITULO}\n`);

  const cols = Object.keys(evA);
  const distintas = cols.filter((k) => corto(evA[k]) !== corto(evB[k]));
  const iguales = cols.filter((k) => corto(evA[k]) === corto(evB[k]));

  console.log(`  === DIFERENCIAS (${distintas.length} de ${cols.length} columnas) ===`);
  for (const k of distintas) {
    console.log(`    ${k.padEnd(24)} A: ${corto(evA[k])}`);
    console.log(`    ${''.padEnd(24)} B: ${corto(evB[k])}`);
  }
  console.log(`\n  === IGUALES (${iguales.length}) ===`);
  console.log('    ' + iguales.join(', '));

  // Los precios viven aparte: son lo que decide si hay cobro.
  for (const [et, ev] of [['A', evA], ['B', evB]]) {
    const { rows } = await c.execute(
      `SELECT * FROM ENTRADAS_EVENTO WHERE ID_EVENTO = :id ORDER BY 1`,
      { id: ev.ID_EVENTO }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    console.log(`\n  === ENTRADAS_EVENTO de ${et} [${ev.ID_EVENTO}] (${rows.length} fila(s)) ===`);
    for (const r of rows) {
      console.log('    ' + Object.entries(r).map(([k, v]) => `${k}=${corto(v)}`).join('  '));
    }
  }

  await c.close();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
