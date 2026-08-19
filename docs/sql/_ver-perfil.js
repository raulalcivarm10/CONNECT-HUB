/**
 * Consulta de apoyo (SOLO LECTURA): perfil de asistente por nombre o correo.
 * Sirve para distinguir "la app no muestra los datos" de "esa persona no los
 * ha llenado" o "su perfil es privado".
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_ver-perfil.js Patricia
 */
const oracledb = require('oracledb');

const termino = process.argv[2];
if (!termino) {
  console.error('Uso: node _ver-perfil.js <nombre o correo>');
  process.exit(1);
}

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const { rows } = await c.execute(
    `SELECT u.ID_CLIENTE, u.NOMBRE, u.APELLIDO, u.EMAIL,
            p.VISIBILIDAD, p.PROFESION, p.EMPRESA,
            CASE WHEN p.BIO IS NULL THEN 'sin bio'
                 ELSE 'bio de ' || LENGTH(p.BIO) || ' caracteres' END AS BIO,
            p.LINKEDIN_URL, u.FOTO_URL
       FROM USUARIOS u
       LEFT JOIN PERFIL_ASISTENTE p ON p.ID_CLIENTE = u.ID_CLIENTE
      WHERE UPPER(u.NOMBRE || ' ' || u.APELLIDO) LIKE '%' || UPPER(:t) || '%'
         OR UPPER(u.EMAIL) LIKE '%' || UPPER(:t) || '%'
      FETCH FIRST 5 ROWS ONLY`,
    { t: termino },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );

  if (!rows.length) console.log(`Sin coincidencias para "${termino}".`);
  for (const r of rows) {
    console.log(
      `\n  ${[r.NOMBRE, r.APELLIDO].filter(Boolean).join(' ') || '(sin nombre)'}  <${r.EMAIL ?? '-'}>` +
        `\n    visibilidad : ${r.VISIBILIDAD ?? '(sin fila de perfil → PUBLICO por defecto)'}` +
        `\n    profesion   : ${r.PROFESION ?? '(vacío)'}` +
        `\n    empresa     : ${r.EMPRESA ?? '(vacío)'}` +
        `\n    bio         : ${r.BIO ?? '(vacío)'}` +
        `\n    linkedin    : ${r.LINKEDIN_URL ?? '(vacío)'}` +
        `\n    foto        : ${r.FOTO_URL ? 'sí' : 'no'}`,
    );
  }
  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
