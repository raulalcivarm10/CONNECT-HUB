/**
 * Mueve la FECHA DE FIN de una suscripción (renovación cobrada).
 *
 * Hace lo MISMO que el panel (suscripciones.service.ts::editar), que no es solo
 * cambiar la fecha:
 *   - recalcula DIAS (inclusivo, igual que al crear)
 *   - limpia AVISO_ENVIADO para que el aviso vuelva a salir antes del nuevo fin
 *   - limpia FECHA_CORTE si queda ACTIVA
 *   - si estaba VENCIDA y el nuevo fin es futuro, la revive
 *   - deja rastro en MODIFICADO_POR / FECHA_MODIFICACION
 *
 * Olvidar lo del aviso es el error silencioso de hacerlo "a mano": la fecha
 * queda bien pero nadie avisa del siguiente vencimiento.
 *
 *   docker compose run --rm -v /root/app/docs/sql:/app/migraciones \
 *     --entrypoint node api /app/migraciones/_mover-fin-suscripcion.js <id> <YYYY-MM-DD> <quien>
 */
const oracledb = require('oracledb');

const [ID_TXT, NUEVO_FIN, QUIEN] = process.argv.slice(2);
const ID = Number(ID_TXT);
if (!Number.isInteger(ID) || !/^\d{4}-\d{2}-\d{2}$/.test(NUEVO_FIN ?? '')) {
  console.error('Uso: node _mover-fin-suscripcion.js <id> <YYYY-MM-DD> [quien]');
  process.exit(1);
}
const ACTOR = (QUIEN || 'panel').slice(0, 60);

const dia = 24 * 60 * 60 * 1000;
const diasEntre = (a, b) =>
  Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / dia);

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const q = async (s, b = {}) =>
    (await c.execute(s, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

  const [s] = await q(
    `SELECT s.ID_SUSCRIPCION, i.NOMBRE AS INSTITUCION, i.ESTADO AS EST_INST,
            s.ESTADO, s.AVISO_ENVIADO, s.DIAS,
            TO_CHAR(s.FECHA_INICIO, 'YYYY-MM-DD') AS INICIO,
            TO_CHAR(s.FECHA_FIN,    'YYYY-MM-DD') AS FIN
       FROM SUSCRIPCIONES s
       JOIN INSTITUCIONES i ON i.ID_INSTITUCION = s.ID_INSTITUCION
      WHERE s.ID_SUSCRIPCION = :id`,
    { id: ID },
  );
  if (!s) throw new Error(`No existe la suscripción ${ID}`);

  if (diasEntre(s.INICIO, NUEVO_FIN) < 0) {
    throw new Error('La fecha de fin no puede ser anterior al inicio.');
  }
  const dias = diasEntre(s.INICIO, NUEVO_FIN) + 1;

  console.log('ANTES:');
  console.log(`  ${s.INSTITUCION}`);
  console.log(`  periodo  ${s.INICIO} → ${s.FIN}   (${s.DIAS} días)`);
  console.log(`  estado   ${s.ESTADO} · institución ${s.EST_INST} · aviso enviado: ${s.AVISO_ENVIADO ?? 'no'}`);

  await c.execute(
    `UPDATE SUSCRIPCIONES
        SET FECHA_FIN          = TO_DATE(:fin, 'YYYY-MM-DD'),
            DIAS               = :dias,
            ESTADO             = 'ACTIVA',
            AVISO_ENVIADO      = NULL,
            FECHA_CORTE        = NULL,
            MODIFICADO_POR     = :actor,
            FECHA_MODIFICACION = SYSDATE
      WHERE ID_SUSCRIPCION = :id`,
    { fin: NUEVO_FIN, dias, actor: ACTOR, id: ID },
    { autoCommit: false },
  );

  // Si el corte nocturno ya la había suspendido, se reactiva la institución.
  const r = await c.execute(
    `UPDATE INSTITUCIONES SET ESTADO = 'APROBADA'
      WHERE ID_INSTITUCION = (SELECT ID_INSTITUCION FROM SUSCRIPCIONES WHERE ID_SUSCRIPCION = :id)
        AND ESTADO = 'SUSPENDIDA'`,
    { id: ID },
    { autoCommit: false },
  );
  if (r.rowsAffected) console.log('\n  La institución estaba suspendida: reactivada.');

  await c.commit();

  const [d] = await q(
    `SELECT s.ESTADO, s.DIAS, s.AVISO_ENVIADO, i.ESTADO AS EST_INST,
            TO_CHAR(s.FECHA_FIN, 'YYYY-MM-DD') AS FIN,
            TRUNC(s.FECHA_FIN) - TRUNC(SYSDATE) AS RESTAN
       FROM SUSCRIPCIONES s JOIN INSTITUCIONES i ON i.ID_INSTITUCION = s.ID_INSTITUCION
      WHERE s.ID_SUSCRIPCION = :id`,
    { id: ID },
  );
  console.log('\nDESPUÉS:');
  console.log(`  periodo  ${s.INICIO} → ${d.FIN}   (${d.DIAS} días)`);
  console.log(`  estado   ${d.ESTADO} · institución ${d.EST_INST}`);
  console.log(`  quedan   ${d.RESTAN} día(s)`);
  console.log(`  aviso    ${d.AVISO_ENVIADO ?? 'limpiado (volverá a avisar antes del nuevo fin)'}`);

  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
