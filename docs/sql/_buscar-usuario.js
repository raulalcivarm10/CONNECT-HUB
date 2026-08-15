/**
 * Consulta de apoyo (SOLO LECTURA): busca un usuario del panel por correo o por
 * código, y muestra a qué institución pertenece. Sirve para saber a qué
 * institución corresponde una suscripción antes de registrarla.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_buscar-usuario.js mquintana@uees.edu.ec
 */
const oracledb = require('oracledb');

const termino = process.argv[2];
if (!termino) {
  console.error('Uso: node _buscar-usuario.js <correo o codigo>');
  process.exit(1);
}

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const { rows } = await c.execute(
    `SELECT u.COD_USUARIO, u.EMAIL, u.NOMBRES, u.APELLIDOS, u.ESTADOS,
            u.ES_SUPER, u.ID_INSTITUCION,
            i.NOMBRE AS INSTITUCION, i.ESTADO AS ESTADO_INST,
            TO_CHAR(u.FECHA_REGISTRO,'YYYY-MM-DD') AS ALTA
       FROM USUARIOS_INSTITUCIONES u
       LEFT JOIN INSTITUCIONES i ON i.ID_INSTITUCION = u.ID_INSTITUCION
      WHERE UPPER(u.EMAIL) LIKE '%' || UPPER(:t) || '%'
         OR UPPER(u.COD_USUARIO) LIKE '%' || UPPER(:t) || '%'
      ORDER BY u.ID_INSTITUCION`,
    { t: termino },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  if (rows.length === 0) {
    console.log(`Sin coincidencias para "${termino}".`);
  }
  for (const r of rows) {
    console.log(
      `\n  usuario     : ${r.COD_USUARIO}` +
        `\n  correo      : ${r.EMAIL ?? '-'}` +
        `\n  nombre      : ${[r.NOMBRES, r.APELLIDOS].filter(Boolean).join(' ') || '-'}` +
        `\n  estado      : ${r.ESTADOS}${r.ES_SUPER === 'S' ? '  (SUPERADMIN)' : ''}` +
        `\n  institucion : ${r.ID_INSTITUCION ?? '-'}  ${r.INSTITUCION ?? '-'} [${r.ESTADO_INST ?? '-'}]` +
        `\n  alta        : ${r.ALTA ?? '-'}`,
    );
  }
  console.log(`\n${rows.length} coincidencia(s).`);
  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
