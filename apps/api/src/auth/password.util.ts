import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

// Formato compartido con el seed inicial de la BD:
//   CLAVE = base64(PBKDF2-SHA256(password, salt, 100000 iter, 32 bytes))  (44 chars)
//   SALT  = 'pbkdf2sha256$<iteraciones>$<salt hex>'
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

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
