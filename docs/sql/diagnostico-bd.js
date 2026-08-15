/**
 * DIAGNÓSTICO DE LA BASE DE DATOS — solo lectura, no modifica nada.
 *
 * Sirve para dos cosas:
 *   1. Verificar qué permisos de diagnóstico tiene hoy el usuario de la app.
 *   2. Monitorear conflictos reales: sesiones al límite, bloqueos entre
 *      sesiones, consultas lentas y espacio consumido (Oracle XE tiene tope).
 *
 * Cada consulta se ejecuta de forma independiente: si falta un permiso se
 * reporta "SIN PERMISO" y el resto sigue corriendo. Por eso funciona igual
 * antes y después de aplicar docs/sql/2026-08-15_grants_diagnostico.sql.
 *
 * Uso (desde el contenedor del API, que ya tiene las credenciales en el entorno):
 *   docker compose exec -T api node /app/docs/sql/diagnostico-bd.js
 * O en local, exportando ORACLE_USER / ORACLE_PASSWORD / ORACLE_CONNECT_STRING.
 */
const oracledb = require('oracledb');

/** Ejecuta una consulta y nunca lanza: devuelve filas o el motivo del fallo. */
async function intentar(conn, sql, binds = {}) {
  try {
    const r = await conn.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    return { ok: true, filas: r.rows ?? [] };
  } catch (e) {
    const msg = e.message.split('\n')[0];
    // ORA-00942 = la vista existe pero no tenemos permiso (o no existe)
    const sinPermiso = /ORA-00942|ORA-01031/.test(msg);
    return { ok: false, sinPermiso, motivo: msg };
  }
}

function titulo(t) {
  console.log(`\n${'='.repeat(62)}\n${t}\n${'='.repeat(62)}`);
}

function pintar(res, vacio = '(sin filas)') {
  if (!res.ok) {
    console.log(res.sinPermiso ? '  SIN PERMISO — pídelo al DBA' : `  ERROR — ${res.motivo}`);
    return false;
  }
  if (res.filas.length === 0) {
    console.log(`  ${vacio}`);
    return true;
  }
  for (const f of res.filas) {
    console.log(
      '  ' +
        Object.entries(f)
          .map(([k, v]) => `${k}=${v ?? '-'}`)
          .join('  '),
    );
  }
  return true;
}

(async () => {
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  titulo('IDENTIDAD Y VERSIÓN');
  pintar(
    await intentar(
      conn,
      `SELECT USER AS USUARIO,
              SYS_CONTEXT('USERENV','CON_NAME') AS CONTENEDOR,
              SYS_CONTEXT('USERENV','SERVER_HOST') AS HOST
         FROM DUAL`,
    ),
  );
  pintar(await intentar(conn, `SELECT BANNER_FULL AS VERSION FROM V$VERSION WHERE ROWNUM = 1`));

  titulo('MARGEN DE SESIONES Y PROCESOS  (¿estamos cerca del techo?)');
  pintar(
    await intentar(
      conn,
      `SELECT RESOURCE_NAME AS RECURSO,
              CURRENT_UTILIZATION AS EN_USO,
              MAX_UTILIZATION AS PICO,
              LIMIT_VALUE AS LIMITE
         FROM V$RESOURCE_LIMIT
        WHERE RESOURCE_NAME IN ('processes','sessions','transactions')`,
    ),
  );

  titulo('SESIONES POR SERVICIO  (cuánto consume la app vs el otro equipo)');
  pintar(
    await intentar(
      conn,
      `SELECT NVL(USERNAME,'(interno)') AS USUARIO,
              NVL(PROGRAM,'?')          AS PROGRAMA,
              STATUS                    AS ESTADO,
              COUNT(*)                  AS N
         FROM V$SESSION
        WHERE TYPE = 'USER'
        GROUP BY USERNAME, PROGRAM, STATUS
        ORDER BY COUNT(*) DESC
        FETCH FIRST 12 ROWS ONLY`,
    ),
  );

  titulo('BLOQUEOS ENTRE SESIONES  (lo que traba a la app)');
  const bloqueos = await intentar(
    conn,
    `SELECT s.SID,
            s.USERNAME                    AS BLOQUEADA,
            s.BLOCKING_SESSION            AS LA_BLOQUEA,
            s.SECONDS_IN_WAIT             AS SEGUNDOS,
            s.EVENT                       AS ESPERANDO,
            SUBSTR(q.SQL_TEXT, 1, 70)     AS SQL
       FROM V$SESSION s
       LEFT JOIN V$SQL q ON q.SQL_ID = s.SQL_ID
      WHERE s.BLOCKING_SESSION IS NOT NULL`,
  );
  pintar(bloqueos, 'SIN BLOQUEOS — todo limpio');

  titulo('CONSULTAS MÁS COSTOSAS DEL ESQUEMA DE LA APP');
  pintar(
    await intentar(
      conn,
      `SELECT ROUND(ELAPSED_TIME/1000/GREATEST(EXECUTIONS,1)) AS MS_POR_EJEC,
              EXECUTIONS                                      AS EJECUCIONES,
              ROUND(BUFFER_GETS/GREATEST(EXECUTIONS,1))       AS BLOQUES_LEIDOS,
              SUBSTR(SQL_TEXT, 1, 90)                         AS SQL
         FROM V$SQLAREA
        WHERE PARSING_SCHEMA_NAME = USER
          AND EXECUTIONS > 0
        ORDER BY ELAPSED_TIME / GREATEST(EXECUTIONS,1) DESC
        FETCH FIRST 10 ROWS ONLY`,
    ),
  );

  titulo('ESPACIO CONSUMIDO  (Oracle XE tiene tope de datos de usuario)');
  pintar(
    await intentar(
      conn,
      `SELECT ROUND(SUM(BYTES)/1024/1024) AS MB_TOTALES,
              COUNT(*)                    AS SEGMENTOS
         FROM USER_SEGMENTS`,
    ),
  );
  pintar(
    await intentar(
      conn,
      `SELECT SEGMENT_NAME AS OBJETO,
              SEGMENT_TYPE AS TIPO,
              ROUND(BYTES/1024/1024) AS MB
         FROM USER_SEGMENTS
        ORDER BY BYTES DESC
        FETCH FIRST 8 ROWS ONLY`,
    ),
  );

  titulo('ÍNDICES EXISTENTES EN LAS TABLAS MÁS CONSULTADAS');
  pintar(
    await intentar(
      conn,
      `SELECT i.TABLE_NAME AS TABLA,
              i.INDEX_NAME AS INDICE,
              LISTAGG(c.COLUMN_NAME, ',') WITHIN GROUP (ORDER BY c.COLUMN_POSITION) AS COLUMNAS
         FROM USER_INDEXES i
         JOIN USER_IND_COLUMNS c ON c.INDEX_NAME = i.INDEX_NAME
        WHERE i.TABLE_NAME IN ('EVENTOS','EVENTOS_USUARIOS','EVENTO_HORAS',
                               'EVENTO_SUBSALONES','AUDITORIA_LOG','PAGOS','ARCHIVOS')
        GROUP BY i.TABLE_NAME, i.INDEX_NAME
        ORDER BY i.TABLE_NAME, i.INDEX_NAME`,
    ),
    'sin índices propios en esas tablas',
  );

  console.log('\nFin del diagnóstico. No se modificó nada.\n');
  await conn.close();
})().catch((e) => {
  console.error('ERROR DE CONEXIÓN:', e.message);
  process.exit(1);
});
