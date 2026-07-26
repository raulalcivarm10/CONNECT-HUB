import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

// Formato compartido con el seed inicial de la BD:
//   CLAVE = base64(PBKDF2-SHA256(password, salt, 100000 iter, 32 bytes))  (44 chars)
//   SALT  = 'pbkdf2sha256$<iteraciones>$<salt hex>'
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

// ---------------------------------------------------------------------------
// Formato del SERVICIO DE PAGOS externo (Evento-back). La columna USUARIOS.CLAVE_HASH
// es COMPARTIDA con ese servicio, que valida el login del checkout. Para que una
// clave creada/reseteada en ConnectHub también sirva en SU login, la escribimos en
// SU formato exacto (crypto.util.ts del equipo):
//   stored = `${salt}:${hash}`
//   salt   = randomBytes(16).hex            (32 chars hex, se usa como STRING en pbkdf2)
//   hash   = PBKDF2-SHA512( SHA256(clave)hex , salt , 10000 iter, 64 bytes ).hex
// El cliente móvil envía SHA256(clave) como `password`; el servidor le aplica pbkdf2
// encima. Aquí reproducimos ambos pasos a partir del texto plano.
const PAGOS_ITERATIONS = 10_000;
const PAGOS_KEY_LENGTH = 64;

/** true si el hash almacenado está en el formato del servicio de pagos (`salt:hash`). */
export function isPagosFormat(stored: string | null | undefined): boolean {
  return !!stored && stored.includes(':') && !stored.startsWith('pbkdf2sha256$');
}

/** Hashea una clave (texto plano) en el formato del servicio de pagos. */
export function hashPasswordPagos(password: string): string {
  const inner = createHash('sha256').update(password).digest('hex');
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(inner, salt, PAGOS_ITERATIONS, PAGOS_KEY_LENGTH, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/** Verifica una clave (texto plano) contra un hash en formato del servicio de pagos. */
export function verifyPasswordPagos(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const idx = stored.indexOf(':');
  if (idx <= 0) return false;
  const salt = stored.slice(0, idx);
  const orig = stored.slice(idx + 1);
  if (!salt || !orig || salt.includes('$')) return false; // no es formato pagos
  const inner = createHash('sha256').update(password).digest('hex');
  const dk = pbkdf2Sync(inner, salt, PAGOS_ITERATIONS, PAGOS_KEY_LENGTH, 'sha512');
  let expected: Buffer;
  try {
    expected = Buffer.from(orig, 'hex');
  } catch {
    return false;
  }
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

export function hashPassword(password: string): { clave: string; salt: string } {
  const saltHex = randomBytes(16).toString('hex');
  const dk = pbkdf2Sync(
    password,
    Buffer.from(saltHex, 'hex'),
    ITERATIONS,
    KEY_LENGTH,
    'sha256',
  );
  return {
    clave: dk.toString('base64'),
    salt: `pbkdf2sha256$${ITERATIONS}$${saltHex}`,
  };
}

export function verifyPassword(
  password: string,
  clave: string | null,
  saltMeta: string | null,
): boolean {
  if (!clave || !saltMeta) return false;
  const parts = saltMeta.split('$');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const dk = pbkdf2Sync(
    password,
    Buffer.from(parts[2], 'hex'),
    iterations,
    KEY_LENGTH,
    'sha256',
  );
  const expected = Buffer.from(clave, 'base64');
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

export function generateTempPassword(): string {
  return randomBytes(9).toString('base64url');
}
