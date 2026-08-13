/**
 * Flujo de aprobación de eventos por roles + visibilidad por creador/grupo.
 * TODO ADITIVO (tablas compartidas: solo columnas NULLABLE; cero impacto en
 * eventos existentes = NULL ≡ legado publicado, apps móviles intactas).
 *
 * 1) Catálogo de roles: agrega VENUE_APPROVER y PUBLISHER (idempotente).
 *    Nota: EVENT ya existe (ID_ROL 5) — no se inserta de nuevo.
 * 2) EVENTOS: creador, grupo (facultad), estado de aprobación + auditoría.
 * 3) USUARIOS_INSTITUCIONES: GRUPO del usuario (se hereda a sus eventos).
 */
const oracledb = require('oracledb');

const PASOS = [
  // --- roles nuevos (INSERT solo si no existen: NOMBRE no tiene UNIQUE) ---
  `MERGE INTO ROLES_INSTITUCIONES r
     USING (SELECT 'VENUE_APPROVER' AS NOMBRE FROM DUAL) s
        ON (r.NOMBRE = s.NOMBRE)
      WHEN NOT MATCHED THEN INSERT (NOMBRE, DESCRIPCION)
        VALUES ('VENUE_APPROVER', 'Approves the venue/hall requested by an event before publication')`,
  `MERGE INTO ROLES_INSTITUCIONES r
     USING (SELECT 'PUBLISHER' AS NOMBRE FROM DUAL) s
        ON (r.NOMBRE = s.NOMBRE)
      WHEN NOT MATCHED THEN INSERT (NOMBRE, DESCRIPCION)
        VALUES ('PUBLISHER', 'Gives the final approval that publishes an event in the mobile app')`,
  // --- EVENTOS: aprobación + visibilidad ---
  `ALTER TABLE EVENTOS ADD (CREADO_POR VARCHAR2(150))`,
  `ALTER TABLE EVENTOS ADD (GRUPO VARCHAR2(100))`,
  `ALTER TABLE EVENTOS ADD (ESTADO_APROBACION VARCHAR2(20))`,
  `ALTER TABLE EVENTOS ADD CONSTRAINT CK_EVENTOS_ESTADO_APROB
     CHECK (ESTADO_APROBACION IS NULL OR
            ESTADO_APROBACION IN ('BORRADOR','SALON_APROBADO','PUBLICADO','RECHAZADO'))`,
  `ALTER TABLE EVENTOS ADD (SALON_APROBADO_POR VARCHAR2(150))`,
  `ALTER TABLE EVENTOS ADD (FECHA_SALON_APROBADO DATE)`,
  `ALTER TABLE EVENTOS ADD (PUBLICADO_POR VARCHAR2(150))`,
  `ALTER TABLE EVENTOS ADD (FECHA_PUBLICADO DATE)`,
  `ALTER TABLE EVENTOS ADD (RECHAZADO_POR VARCHAR2(150))`,
  `ALTER TABLE EVENTOS ADD (FECHA_RECHAZO DATE)`,
  `ALTER TABLE EVENTOS ADD (MOTIVO_RECHAZO VARCHAR2(2000))`,
  // --- usuarios del panel: grupo (facultad) ---
  `ALTER TABLE USUARIOS_INSTITUCIONES ADD (GRUPO VARCHAR2(100))`,
];

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  for (const sql of PASOS) {
    try {
      const r = await c.execute(sql, [], { autoCommit: true });
      console.log('OK  →', sql.replace(/\s+/g, ' ').slice(0, 90), r.rowsAffected != null ? `(filas: ${r.rowsAffected})` : '');
    } catch (e) {
      const msg = String(e.message);
      if (msg.includes('ORA-01430') || msg.includes('ORA-02275') || msg.includes('ORA-02264')) {
        console.log('YA EXISTÍA →', sql.replace(/\s+/g, ' ').slice(0, 70));
      } else throw e;
    }
  }
  const roles = await c.execute(
    `SELECT ID_ROL, NOMBRE FROM ROLES_INSTITUCIONES ORDER BY ID_ROL`,
    [], { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log('CATÁLOGO ROLES:', JSON.stringify(roles.rows));
  const cols = await c.execute(
    `SELECT COLUMN_NAME FROM USER_TAB_COLUMNS
      WHERE TABLE_NAME = 'EVENTOS'
        AND COLUMN_NAME IN ('CREADO_POR','GRUPO','ESTADO_APROBACION','SALON_APROBADO_POR','PUBLICADO_POR','MOTIVO_RECHAZO')`,
    [], { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  console.log('COLUMNAS EVENTOS OK:', cols.rows.map((r) => r.COLUMN_NAME).join(', '));
  await c.close();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
