/**
 * Estado SUSPENDIDO en el flujo de aprobación: el evento se retira de la app
 * temporalmente (sin eliminarlo — conserva inscritos, pagos y entradas) y se
 * puede volver a publicar en un clic. Solo recrea NUESTRO check.
 */
const oracledb = require('oracledb');

const PASOS = [
  `ALTER TABLE EVENTOS DROP CONSTRAINT CK_EVENTOS_ESTADO_APROB`,
  `ALTER TABLE EVENTOS ADD CONSTRAINT CK_EVENTOS_ESTADO_APROB
     CHECK (ESTADO_APROBACION IS NULL OR
            ESTADO_APROBACION IN ('BORRADOR','SALON_APROBADO','REUBICADO',
                                  'PUBLICADO','RECHAZADO','SUSPENDIDO'))`,
  // el historial ya audita el espacio: se suman los tipos del ciclo de publicación
  `ALTER TABLE EVENTO_ESPACIO_HISTORIAL DROP CONSTRAINT CK_EVENTO_ESP_HIST_TIPO`,
  `ALTER TABLE EVENTO_ESPACIO_HISTORIAL ADD CONSTRAINT CK_EVENTO_ESP_HIST_TIPO
     CHECK (TIPO IN ('SOLICITADO','MOVIDO','APROBADO','PUBLICADO','RECHAZADO',
                     'SUSPENDIDO','REPUBLICADO'))`,
];

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  for (const sql of PASOS) {
    try {
      await c.execute(sql, [], { autoCommit: true });
      console.log('OK  →', sql.replace(/\s+/g, ' ').slice(0, 80));
    } catch (e) {
      const m = String(e.message);
      if (m.includes('ORA-02443') || m.includes('ORA-02264')) {
        console.log('N.A. →', sql.replace(/\s+/g, ' ').slice(0, 60), '(', m.slice(0, 40), ')');
      } else throw e;
    }
  }
  const chk = await c.execute(
    `SELECT CONSTRAINT_NAME, SEARCH_CONDITION_VC FROM USER_CONSTRAINTS
      WHERE CONSTRAINT_NAME IN ('CK_EVENTOS_ESTADO_APROB','CK_EVENTO_ESP_HIST_TIPO')`,
    [], { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  for (const r of chk.rows) console.log(r.CONSTRAINT_NAME, '→', r.SEARCH_CONDITION_VC?.replace(/\s+/g, ' ').slice(0, 160));
  await c.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
