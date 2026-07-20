const oracledb = require('oracledb');
(async () => {
  let c;
  try {
    c = await oracledb.getConnection({
      user: process.env.ORACLE_USER, password: process.env.ORACLE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING,
    });
    // Ocultar de la app (NO borra): ODONTOLOGIA (161) y EVENTO DE PRUEBA PUSH (201)
    const r = await c.execute(
      `UPDATE EVENTOS SET NO_PUBLICAR = 'S' WHERE ID_EVENTO IN (161, 201)`,
      {}, { autoCommit: true });
    console.log('ocultados:', r.rowsAffected);
  } catch (e) { console.log('ERROR:', e.message); process.exitCode = 1; }
  finally { if (c) await c.close(); }
})();
