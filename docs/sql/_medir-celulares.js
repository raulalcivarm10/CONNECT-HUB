/**
 * Consulta de apoyo (SOLO LECTURA): cuánta gente tiene número de celular.
 *
 * La columna USUARIOS.NUMERO_CELULAR existe y el reporte ya la muestra, así que
 * la pregunta no es si se puede reportar sino si hay algo que reportar. Se mide
 * por origen de la cuenta (correo, Google, Apple) porque si el dato solo viene
 * de cuentas viejas significa que hoy ya nadie lo llena.
 *
 * Mira también TIPO_ID/NUMERO_ID (la cédula) como contraste: ese dato SÍ se pide
 * hoy, en el checkout, así que su cobertura marca el techo realista de lo que se
 * consigue pidiendo algo dentro del flujo de compra.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_medir-celulares.js
 */
const oracledb = require('oracledb');

const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) + '%' : '-');

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const q = async (sql, bind = {}) =>
    (await c.execute(sql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

  const cols = (await q(
    "SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'USUARIOS' ORDER BY COLUMN_ID",
  )).map((r) => r.COLUMN_NAME);
  console.log('COLUMNAS DE USUARIOS:\n  ' + cols.join(', ') + '\n');

  const [t] = await q(
    `SELECT COUNT(*) AS TOTAL,
            COUNT(NUMERO_CELULAR) AS CON_CEL,
            COUNT(NUMERO_ID)      AS CON_CEDULA,
            COUNT(EMAIL_FACTURA)  AS CON_EMAIL_FACT,
            COUNT(FOTO_URL)       AS CON_FOTO
       FROM USUARIOS`,
  );
  console.log('COBERTURA GLOBAL (' + t.TOTAL + ' cuentas):');
  console.log('  celular       ' + String(t.CON_CEL).padStart(5) + '   ' + pct(t.CON_CEL, t.TOTAL));
  console.log('  cédula        ' + String(t.CON_CEDULA).padStart(5) + '   ' + pct(t.CON_CEDULA, t.TOTAL) + '   <- esto SÍ se pide hoy (checkout)');
  console.log('  email factura ' + String(t.CON_EMAIL_FACT).padStart(5) + '   ' + pct(t.CON_EMAIL_FACT, t.TOTAL));
  console.log('  foto          ' + String(t.CON_FOTO).padStart(5) + '   ' + pct(t.CON_FOTO, t.TOTAL));

  // ¿De qué tipo de cuenta salen los que sí lo tienen?
  console.log('\nPOR ORIGEN DE LA CUENTA:');
  for (const r of await q(
    `SELECT CASE WHEN GOOGLE_ID IS NOT NULL THEN 'Google'
                 WHEN APPLE_ID  IS NOT NULL THEN 'Apple'
                 ELSE 'correo' END AS ORIGEN,
            COUNT(*) AS N, COUNT(NUMERO_CELULAR) AS CON_CEL
       FROM USUARIOS GROUP BY CASE WHEN GOOGLE_ID IS NOT NULL THEN 'Google'
                                   WHEN APPLE_ID IS NOT NULL THEN 'Apple'
                                   ELSE 'correo' END
      ORDER BY 2 DESC`,
  )) {
    console.log('  ' + String(r.ORIGEN).padEnd(8) + String(r.N).padStart(5) + ' cuentas, ' +
      String(r.CON_CEL).padStart(4) + ' con celular  (' + pct(r.CON_CEL, r.N) + ')');
  }

  // ¿Son cuentas viejas? Compara contra la fecha de alta si la columna existe.
  const colFecha = ['FECHA_REGISTRO', 'FECHA_CREACION', 'FECHA_ALTA'].find((x) => cols.includes(x));
  if (colFecha) {
    console.log('\nPOR ANTIGÜEDAD (' + colFecha + '):');
    for (const r of await q(
      `SELECT TO_CHAR(${colFecha}, 'YYYY-MM') AS MES, COUNT(*) AS N, COUNT(NUMERO_CELULAR) AS CON_CEL
         FROM USUARIOS GROUP BY TO_CHAR(${colFecha}, 'YYYY-MM') ORDER BY 1`,
    )) {
      console.log('  ' + r.MES + '  ' + String(r.N).padStart(5) + ' altas, ' +
        String(r.CON_CEL).padStart(4) + ' con celular  (' + pct(r.CON_CEL, r.N) + ')');
    }
  }

  // Muestra de los que sí lo tienen, para ver el formato real del dato.
  console.log('\nMUESTRA DE LOS QUE SÍ TIENEN (máx 15):');
  const m = await q(
    `SELECT * FROM (
       SELECT NOMBRE, APELLIDO, EMAIL, NUMERO_CELULAR
         FROM USUARIOS WHERE NUMERO_CELULAR IS NOT NULL ORDER BY ID_CLIENTE
     ) WHERE ROWNUM <= 15`,
  );
  for (const r of m) {
    console.log('  ' + String(r.NUMERO_CELULAR).padEnd(18) + ' ' +
      [r.NOMBRE, r.APELLIDO].filter(Boolean).join(' '));
  }
  if (!m.length) console.log('  (ninguno en toda la base)');

  // Los inscritos a eventos: es la población que de verdad sale en los reportes.
  console.log('\nSOLO GENTE INSCRITA A ALGÚN EVENTO:');
  const [i] = await q(
    `SELECT COUNT(DISTINCT u.ID_CLIENTE) AS TOTAL,
            COUNT(DISTINCT CASE WHEN u.NUMERO_CELULAR IS NOT NULL THEN u.ID_CLIENTE END) AS CON_CEL,
            COUNT(DISTINCT CASE WHEN u.NUMERO_ID      IS NOT NULL THEN u.ID_CLIENTE END) AS CON_CEDULA
       FROM USUARIOS u JOIN EVENTOS_USUARIOS eu ON eu.ID_CLIENTE = u.ID_CLIENTE`,
  );
  console.log('  ' + i.TOTAL + ' inscritos · ' + i.CON_CEL + ' con celular (' + pct(i.CON_CEL, i.TOTAL) +
    ') · ' + i.CON_CEDULA + ' con cédula (' + pct(i.CON_CEDULA, i.TOTAL) + ')');

  await c.close();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
