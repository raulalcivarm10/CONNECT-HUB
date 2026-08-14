/**
 * Simplificación de roles (pedido por Raúl): VENUE_APPROVER y PUBLISHER
 * sobran — Gestión Operativa (OPERATIONS MANAGEMENT) aprueba/mueve salones y
 * ADMINISTRATION/SYSTEM publican. Se eliminan del catálogo (y cualquier
 * asignación colgante) para que no aparezcan al crear usuarios.
 */
const oracledb = require('oracledb');

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const asignaciones = await c.execute(
    `DELETE FROM USUARIO_ROL_INSTITUCION
      WHERE ID_ROL IN (SELECT ID_ROL FROM ROLES_INSTITUCIONES
                        WHERE NOMBRE IN ('VENUE_APPROVER','PUBLISHER'))`,
    [], { autoCommit: true },
  );
  console.log('Asignaciones eliminadas:', asignaciones.rowsAffected);
  const roles = await c.execute(
    `DELETE FROM ROLES_INSTITUCIONES WHERE NOMBRE IN ('VENUE_APPROVER','PUBLISHER')`,
    [], { autoCommit: true },
  );
  console.log('Roles eliminados del catálogo:', roles.rowsAffected);
  const chk = await c.execute(
    `SELECT ID_ROL, NOMBRE FROM ROLES_INSTITUCIONES ORDER BY ID_ROL`,
    [], { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log('CATÁLOGO FINAL:', JSON.stringify(chk.rows));
  await c.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
