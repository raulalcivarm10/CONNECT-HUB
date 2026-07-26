/**
 * AUTO-VERIFICACIÓN a nivel de BASE DE DATOS (pedida por Raúl 2026-07-26):
 * la verificación es POR CUENTA (USUARIOS.IS_VERIFIED, columna compartida por
 * ConnectHub, iOS/Android y el servidor del equipo). Una cuenta que inicia
 * sesión con Google o Apple ya tiene el correo verificado por el proveedor —
 * debe quedar verificada para TODOS los métodos de login, sin importar qué
 * backend la creó y sin desplegar cambios en ninguna plataforma.
 *
 * 1) TRIGGER: al INSERT/UPDATE de USUARIOS, si la fila tiene GOOGLE_ID o
 *    APPLE_ID y no está verificada → IS_VERIFIED = 1 (y limpia el token
 *    pendiente). El registro por correo/clave NO se toca: sigue exigiendo
 *    la verificación por email.
 * 2) BACKFILL: marca verificadas las cuentas sociales existentes.
 * 3) PRUEBA: inserta una fila QA con GOOGLE_ID e IS_VERIFIED=0 y comprueba
 *    que el trigger la deja en 1 (luego la elimina).
 */
const oracledb = require('oracledb');

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  // 1) Trigger (CREATE OR REPLACE = idempotente)
  await c.execute(`
    CREATE OR REPLACE TRIGGER TRG_USUARIOS_AUTOVERIFICA
    BEFORE INSERT OR UPDATE ON USUARIOS
    FOR EACH ROW
    BEGIN
      IF NVL(:NEW.IS_VERIFIED, 0) = 0
         AND (:NEW.GOOGLE_ID IS NOT NULL OR :NEW.APPLE_ID IS NOT NULL) THEN
        :NEW.IS_VERIFIED := 1;
        :NEW.VERIFICATION_TOKEN := NULL;
        :NEW.TOKEN_EXPIRA := NULL;
      END IF;
    END;`);
  console.log('1) Trigger TRG_USUARIOS_AUTOVERIFICA creado/actualizado ✅');

  // 2) Backfill de cuentas sociales existentes sin verificar
  const bf = await c.execute(
    `UPDATE USUARIOS
        SET IS_VERIFIED = 1, VERIFICATION_TOKEN = NULL, TOKEN_EXPIRA = NULL,
            FECHA_ACTUALIZACION = SYSTIMESTAMP
      WHERE NVL(IS_VERIFIED, 0) = 0
        AND (GOOGLE_ID IS NOT NULL OR APPLE_ID IS NOT NULL)`,
    [],
    { autoCommit: true },
  );
  console.log(`2) Backfill: ${bf.rowsAffected} cuentas sociales marcadas verificadas ✅`);

  // 3) Prueba del trigger con una fila QA desechable
  const { randomUUID } = require('crypto');
  const id = randomUUID();
  const email = `qa-trigger-${Date.now()}@connecthub-qa.local`;
  await c.execute(
    `INSERT INTO USUARIOS (ID_CLIENTE, EMAIL, NOMBRE, GOOGLE_ID, TIPO_USUARIO,
                           IS_VERIFIED, PERFIL_COMPLETO, ONBOARDING_COMPLETO, FECHA_CREACION, FECHA_ACTUALIZACION)
     VALUES (:id, :email, 'QA Trigger', 'g-qa-test', 'GOOGLE', 0, 'N', 'N', SYSTIMESTAMP, SYSTIMESTAMP)`,
    { id, email },
    { autoCommit: true },
  );
  const chk = await c.execute(
    `SELECT IS_VERIFIED FROM USUARIOS WHERE ID_CLIENTE = :id`,
    { id },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const ok = chk.rows[0]?.IS_VERIFIED === 1;
  console.log(`3) Prueba: fila insertada con IS_VERIFIED=0 + GOOGLE_ID → quedó en ${chk.rows[0]?.IS_VERIFIED} ${ok ? '✅ TRIGGER FUNCIONA' : '❌ FALLO'}`);
  await c.execute(`DELETE FROM USUARIOS WHERE ID_CLIENTE = :id`, { id }, { autoCommit: true });
  console.log('   (fila QA eliminada)');

  await c.close();
  if (!ok) process.exit(1);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
