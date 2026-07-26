/**
 * QA: reproduce el gate de verificación del login del SERVICIO DE PAGOS.
 * Crea 2 cuentas de prueba desechables (@connecthub-qa.local) con hash en el
 * formato del equipo y luego prueba su /auth/login-user-password con ambas:
 *   - TIPO_USUARIO='NORMAL'  + IS_VERIFIED=1  (como la cuenta de Raúl)
 *   - TIPO_USUARIO='CLIENTE' + IS_VERIFIED=1  (como las de ConnectHub)
 * Objetivo: confirmar si el servidor DESPLEGADO del equipo rechaza a las
 * cuentas NORMAL aunque estén verificadas (el log de la app mostró 403
 * "Debes verificar tu cuenta" con IS_VERIFIED=1 en BD).
 */
const oracledb = require('oracledb');
const { createHash, pbkdf2Sync, randomBytes, randomUUID } = require('crypto');

const PAGOS = 'https://api-ligaprocorp.ec:3443/api';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // igual que curl -k (solo QA)

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
  const pass = 'PruebaHash2026x';
  const sha = createHash('sha256').update(pass).digest('hex');
  const mkHash = () => {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${pbkdf2Sync(sha, salt, 10000, 64, 'sha512').toString('hex')}`;
  };
  const ts = Date.now();
  const cuentas = [
    { email: `qa-normal-${ts}@connecthub-qa.local`, tipo: 'NORMAL', verif: 1 },
    { email: `qa-cliente-${ts}@connecthub-qa.local`, tipo: 'CLIENTE', verif: 1 },
  ];
  for (const a of cuentas) {
    await c.execute(
      `INSERT INTO USUARIOS (ID_CLIENTE, EMAIL, NOMBRE, APELLIDO, CLAVE_HASH, TIPO_USUARIO,
                             IS_VERIFIED, PERFIL_COMPLETO, ONBOARDING_COMPLETO, FECHA_CREACION, FECHA_ACTUALIZACION)
       VALUES (:id, :email, 'QA', :ap, :h, :t, :v, 'N', 'N', SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id: randomUUID(), email: a.email, ap: a.tipo, h: mkHash(), t: a.tipo, v: a.verif },
      { autoCommit: true },
    );
  }
  await c.close();

  for (const a of cuentas) {
    const res = await fetch(`${PAGOS}/auth/login-user-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: a.email, password: sha }),
    });
    const j = await res.json().catch(() => null);
    console.log(`[${a.tipo} verif=${a.verif}] HTTP ${res.status} →`, j?.message ?? j);
  }
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
