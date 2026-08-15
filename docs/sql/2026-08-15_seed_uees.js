/**
 * SEMILLA DEL CASO REAL — suscripción MENSUAL de la UEES.
 *
 * Registra la compra que ya se hizo fuera del sistema:
 *   institución  101  UNIVERSIDAD DE ESPECIALIDADES ESPIRITU SANTO
 *   comprador    mquintana@uees.edu.ec (Mauricio Quintana)
 *   plan         MENSUAL (30 días)
 *   compra       2026-08-14   ·   inicio 2026-08-14
 *
 * FECHA_FIN = FECHA_INICIO + DIAS - 1 (mismo criterio que suscripciones.service.ts:
 * los días se cuentan INCLUSIVE, el primer día ya es día de servicio). Con inicio
 * 2026-08-14 y 30 días la fecha de fin debe quedar en 2026-09-12 (18 días de
 * agosto contando el 14 + 12 de septiembre = 30). El script la CALCULA y aborta
 * si no coincide con ese valor, para que un cambio de criterio no pase inadvertido.
 *
 * El correo se guarda en MINÚSCULAS a propósito: el panel manda en MAYÚSCULAS
 * casi todo lo que escribe el usuario y esa diferencia ya ha causado un bug antes.
 *
 * Es idempotente: si ya existe una suscripción ACTIVA de la 101 con ese comprador
 * y esa fecha de compra, no inserta nada.
 *
 * Ejecutar:  node docs/sql/2026-08-15_seed_uees.js
 */
const oracledb = require('oracledb');

// filas como objetos { COLUMNA: valor } en todas las consultas del script
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// Datos verificados contra producción antes de escribir el script.
// OJO: existe otra institución llamada solo "UEES" (ID 141, código uees2026,
// SUSPENDIDA, sin usuarios) que es un duplicado de prueba. NO es esa: por eso el
// ID va fijo y además se comprueba el nombre antes de insertar.
const ID_INSTITUCION = 101;
const NOMBRE_ESPERADO = 'UNIVERSIDAD DE ESPECIALIDADES ESPIRITU SANTO';
const COMPRADOR_EMAIL = 'mquintana@uees.edu.ec'; // SIEMPRE en minúsculas
const COMPRADOR_NOMBRE = 'Mauricio Quintana';
const CODIGO_PLAN = 'MENSUAL';
const FECHA_COMPRA = '2026-08-14';
const FECHA_INICIO = '2026-08-14';
const FECHA_FIN_ESPERADA = '2026-09-12';
const CREADO_POR = 'SEED';

/**
 * Compara nombres sin depender de tildes ni de espacios de más: si en la base
 * está "ESPÍRITU" con tilde, la comprobación no debe abortar por eso — pero
 * sigue distinguiendo la 101 del duplicado "UEES" (141), que es de lo que se
 * trata.
 */
function normalizar(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quita las marcas de tilde
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** suma días a 'YYYY-MM-DD' en UTC puro (fechas sin hora: no hay zona que valga) */
function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

(async () => {
  const c = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });

  const abortar = async (mensaje) => {
    console.error(`\nNO SE INSERTÓ NADA: ${mensaje}`);
    await c.close();
    process.exit(1);
  };

  // ---------------------------------------------------- 1. la institución
  const inst = await c.execute(
    `SELECT ID_INSTITUCION, NOMBRE, ESTADO FROM INSTITUCIONES
      WHERE ID_INSTITUCION = :id`,
    { id: ID_INSTITUCION },
  );
  const institucion = inst.rows[0];
  if (!institucion || normalizar(institucion.NOMBRE) !== NOMBRE_ESPERADO) {
    const candidatas = await c.execute(
      `SELECT ID_INSTITUCION, NOMBRE, CODIGO_CONEXION, ESTADO
         FROM INSTITUCIONES
        WHERE UPPER(NOMBRE) LIKE '%UEES%'
           OR UPPER(NOMBRE) LIKE '%ESPIRITU SANTO%'
        ORDER BY ID_INSTITUCION`,
    );
    console.error(
      `La institución ${ID_INSTITUCION} no existe o su nombre no es el esperado.`,
    );
    console.error(`  esperado: ${NOMBRE_ESPERADO}`);
    console.error(`  encontrado: ${institucion ? institucion.NOMBRE : '(no existe)'}`);
    console.error('\nCandidatas en la base:');
    for (const r of candidatas.rows) {
      console.error(
        `  ${String(r.ID_INSTITUCION).padStart(4)}  ${r.NOMBRE}  ` +
          `[${r.CODIGO_CONEXION || 's/código'}] ${r.ESTADO}`,
      );
    }
    return abortar('revisa el ID y el nombre antes de volver a ejecutar');
  }
  console.log(
    `institución ${institucion.ID_INSTITUCION} — ${institucion.NOMBRE} (${institucion.ESTADO})`,
  );

  // ------------------------------------------------------------ 2. el plan
  const planes = await c.execute(
    `SELECT ID_PLAN, CODIGO, DIAS, PRECIO, MONEDA FROM PLANES WHERE CODIGO = :codigo`,
    { codigo: CODIGO_PLAN },
  );
  const plan = planes.rows[0];
  if (!plan) {
    return abortar(
      `no existe el plan ${CODIGO_PLAN}: ejecuta antes docs/sql/2026-08-15_suscripciones.js`,
    );
  }
  const dias = plan.DIAS;
  const fechaFin = sumarDias(FECHA_INICIO, dias - 1);
  console.log(`plan ${plan.CODIGO} (id ${plan.ID_PLAN}, ${dias} días)`);
  console.log(`vigencia ${FECHA_INICIO} → ${fechaFin} (inicio + días - 1)`);
  if (fechaFin !== FECHA_FIN_ESPERADA) {
    return abortar(
      `la fecha de fin calculada (${fechaFin}) no coincide con la esperada ` +
        `(${FECHA_FIN_ESPERADA}); revisa DIAS del plan o la regla inclusive`,
    );
  }

  // ------------------------------------------------- 3. ¿ya está sembrada?
  const yaExiste = await c.execute(
    `SELECT ID_SUSCRIPCION, TO_CHAR(FECHA_FIN, 'YYYY-MM-DD') AS FECHA_FIN, ESTADO
       FROM SUSCRIPCIONES
      WHERE ID_INSTITUCION = :inst
        AND LOWER(COMPRADOR_EMAIL) = :email
        AND FECHA_COMPRA = TO_DATE(:compra, 'YYYY-MM-DD')
        AND ESTADO = 'ACTIVA'`,
    { inst: ID_INSTITUCION, email: COMPRADOR_EMAIL, compra: FECHA_COMPRA },
  );
  if (yaExiste.rows.length) {
    const s = yaExiste.rows[0];
    console.log(
      `\nYA ESTABA: suscripción ${s.ID_SUSCRIPCION} (${s.ESTADO}, vence ${s.FECHA_FIN}). No se inserta nada.`,
    );
    await c.close();
    return;
  }

  // ------------------------------------------------------------ 4. insertar
  // Cualquier otra suscripción ACTIVA de la misma institución pasa a
  // REEMPLAZADA: solo una vigente a la vez, igual que hace el API al registrar
  // una compra desde el panel.
  const reemplazadas = await c.execute(
    `UPDATE SUSCRIPCIONES
        SET ESTADO = 'REEMPLAZADA', MODIFICADO_POR = :actor, FECHA_MODIFICACION = SYSDATE
      WHERE ID_INSTITUCION = :inst AND ESTADO = 'ACTIVA'`,
    { actor: CREADO_POR, inst: ID_INSTITUCION },
  );
  if (reemplazadas.rowsAffected) {
    console.log(`${reemplazadas.rowsAffected} suscripción(es) anterior(es) → REEMPLAZADA`);
  }

  const ins = await c.execute(
    `INSERT INTO SUSCRIPCIONES
       (ID_INSTITUCION, ID_PLAN, COMPRADOR_EMAIL, COMPRADOR_NOMBRE, FECHA_COMPRA,
        FECHA_INICIO, FECHA_FIN, DIAS, MONTO, MONEDA, ESTADO, NOTAS, CREADO_POR)
     VALUES
       (:inst, :plan, LOWER(:email), :nombre, TO_DATE(:compra, 'YYYY-MM-DD'),
        TO_DATE(:inicio, 'YYYY-MM-DD'), TO_DATE(:fin, 'YYYY-MM-DD'), :dias,
        :monto, :moneda, 'ACTIVA', :notas, :creadoPor)
     RETURNING ID_SUSCRIPCION INTO :out`,
    {
      inst: ID_INSTITUCION,
      plan: plan.ID_PLAN,
      email: COMPRADOR_EMAIL,
      nombre: COMPRADOR_NOMBRE,
      compra: FECHA_COMPRA,
      inicio: FECHA_INICIO,
      fin: fechaFin,
      dias,
      monto: { val: plan.PRECIO ?? null, type: oracledb.NUMBER },
      moneda: plan.MONEDA || 'USD',
      notas: 'Compra registrada manualmente (primera suscripción del cliente)',
      creadoPor: CREADO_POR,
      out: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
  );
  await c.commit();

  console.log(
    `\nOK: suscripción ${ins.outBinds.out[0]} creada — ${COMPRADOR_EMAIL}, ` +
      `${FECHA_INICIO} → ${fechaFin}, ${dias} días.`,
  );
  console.log(
    'La institución 101 está APROBADA: no hace falta reactivar nada. El corte ' +
      'automático la suspendería a partir de la noche del 13/09 si no se renueva.',
  );
  await c.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
