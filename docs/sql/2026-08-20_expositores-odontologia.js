/**
 * Carga los conferencistas del evento 281 (IV CONGRESO INTERNACIONAL DE
 * ESPECIALIDADES ODONTOLÓGICAS UEES) para poder completarles foto y detalles
 * desde el panel.
 *
 * La lista de origen es la de la AGENDA, así que trae a la misma persona varias
 * veces (una por charla). Aquí va DEDUPLICADA por nombre.
 *
 * Solo se cargan nombre y país. Cargo, organización, biografía y foto se dejan
 * VACÍOS a propósito: son datos que hay que verificar uno a uno y es peor
 * inventarlos. El prefijo "IADR Ecuadorian Section" del listado es la sesión,
 * no la afiliación de la persona, así que tampoco se copia a ORGANIZACION.
 *
 * Es idempotente: si el expositor ya existe (mismo nombre en el mismo evento)
 * no se duplica.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/2026-08-20_expositores-odontologia.js
 */
const oracledb = require('oracledb');

const ID_EVENTO = 281;

// [nombre, país]
const EXPOSITORES = [
  ['Dr. Usama Hamdan', 'Estados Unidos'],
  ['Abg. Denise Franco', 'Ecuador'],
  ['Profa. Dra. Daniela Garib', 'Brasil'],
  ['Dr. Jean-Marc Retrouvey', 'Canadá'],
  ['Dra. Becky Weisleder', 'México'],
  ['Dr. Amjad Abu Hasna', 'Brasil'],
  ['Dr. Santiago Reinoso', 'Ecuador'],
  ['Dr. Jorge Barona', 'Ecuador'],
  ['Dra. Marcia Pérez', 'México'],
  ['Dr. Felipe Illanes', 'Chile'],
  ['Dr. Jordi Manauta', 'España'],
  ['Dr. Matthew Pontell', 'Estados Unidos'],
  ['Dr. Jaime Hidalgo', 'Perú'],
  ['Dr. Maiky Ayora', 'Ecuador'],
  ['Dra. Mabelle Monteiro', 'Brasil'],
  ['Dra. Felicia Miranda', 'Brasil'],
  ['Dr. Liran Levin', 'Canadá'],
  ['Dr. Marcelo Armijos', 'Brasil'],
  ['Dr. Marcio de Moraes', 'Brasil'],
  ['Dr. Carlos Torres', 'Colombia'],
  ['Dr. Gwen Swennen', 'Bélgica'],
  ['Martín Casale', 'Colombia'],
  ['Dr. Thiago Gamba', 'Brasil'],
  ['Prof. Dr. Naoki Mezarina', 'Perú'],
  ['Dr. Rolando Carrasco', 'Colombia'],
  ['Dr. Milko Villarroel', 'Brasil'],
  ['Dr. Gonzalo Gutierrez', 'Chile'],
  ['Dr. Eraldo Pesaressi', 'Perú'],
  ['Dr. Sergio Uribe', 'Chile'],
  ['Dra. Fernanda Torres', 'Ecuador'],
  ['Dra. Gabriela Scagnet', 'Argentina'],
  ['Dra. Maria Gabriela Patiño', 'Ecuador'],
  ['Dr. Carlos Velazco', 'Perú'],
  ['Dr. Roberto Ledergerber', 'Ecuador'],
];

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const ev = await c.execute(
    `SELECT TITULO FROM EVENTOS WHERE ID_EVENTO = :id`,
    { id: ID_EVENTO },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (!ev.rows.length) throw new Error(`No existe el evento ${ID_EVENTO}`);
  console.log(`Evento ${ID_EVENTO}: ${ev.rows[0].TITULO}\n`);

  // Orden a continuación de lo que ya hubiera, para no pisar nada.
  const maxOrden = await c.execute(
    `SELECT NVL(MAX(ORDEN), 0) AS M FROM EVENTO_EXPOSITORES WHERE ID_EVENTO = :id`,
    { id: ID_EVENTO },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  let orden = Number(maxOrden.rows[0].M);

  let nuevos = 0;
  let saltados = 0;

  for (const [nombre, pais] of EXPOSITORES) {
    const ya = await c.execute(
      `SELECT ID_EXPOSITOR FROM EVENTO_EXPOSITORES
        WHERE ID_EVENTO = :id AND UPPER(TRIM(NOMBRE_COMPLETO)) = UPPER(TRIM(:n))`,
      { id: ID_EVENTO, n: nombre },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (ya.rows.length) {
      console.log(`  = ${nombre} — ya existe, no se toca`);
      saltados++;
      continue;
    }

    orden += 1;
    await c.execute(
      `INSERT INTO EVENTO_EXPOSITORES
         (ID_EVENTO, NOMBRE_COMPLETO, UBICACION, ROL, ES_DESTACADO, ORDEN,
          IS_ACTIVE, FECHA_REGISTRO)
       VALUES (:id, :nombre, :pais, 'EXPOSITOR', 0, :orden, 1, SYSDATE)`,
      { id: ID_EVENTO, nombre, pais, orden },
      { autoCommit: false },
    );
    console.log(`  + ${nombre.padEnd(32)} ${pais}`);
    nuevos++;
  }

  await c.commit();
  console.log(`\nListo: ${nuevos} nuevos, ${saltados} ya existían.`);
  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
