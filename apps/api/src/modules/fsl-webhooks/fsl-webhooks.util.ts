import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SEC = 300;

/**
 * Verifica la firma HMAC-SHA256 de un webhook de FourStackLabs.
 * Header `X-FSL-Signature`: "t=<timestamp>,v1=<hex>[,v1=<hex>...]".
 * signedPayload = `${t}.${rawBody}`.
 */
export function verifyFslSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): { ok: boolean; reason?: string } {
  if (!signatureHeader) return { ok: false, reason: 'missing_signature' };

  let t: string | undefined;
  const v1: string[] = [];
  for (const kv of signatureHeader.split(',')) {
    const [k, v] = kv.split('=');
    if (k === 't') t = v;
    else if (k === 'v1') v1.push(v);
  }
  if (!t || v1.length === 0) return { ok: false, reason: 'malformed' };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > TOLERANCE_SEC) {
    return { ok: false, reason: 'timestamp' };
  }

  const expected = createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex');
  const expBuf = Buffer.from(expected, 'hex');

  // acepta cualquiera de las firmas (soporta rotacion de secreto)
  const match = v1.some((sig) => {
    let sigBuf: Buffer;
    try {
      sigBuf = Buffer.from(sig, 'hex');
    } catch {
      return false;
    }
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  });
  return match ? { ok: true } : { ok: false, reason: 'signature' };
}

const STOP = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'of', 'the', 'and', 'a',
]);

/** Quita marcas diacriticas combinantes (U+0300..U+036F) sin usar regex. */
function sinAcentos(texto: string): string {
  return texto
    .normalize('NFD')
    .split('')
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c < 0x0300 || c > 0x036f;
    })
    .join('');
}

/**
 * Genera un codigo de conexion corto y legible a partir del nombre de la
 * institucion + el anio. Ej: "Universidad de Especialidades Espiritu Santo"
 * -> "uees2026". Max 20 chars. La unicidad se resuelve en el servicio.
 */
export function generarCodigoConexion(nombre: string, sufijo = ''): string {
  const limpio = sinAcentos(nombre).toLowerCase();
  const palabras = limpio.split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
  let base = palabras.map((w) => w[0]).join('');
  if (base.length < 3) {
    base = (palabras[0] ?? limpio.replace(/[^a-z0-9]/g, '')).slice(0, 5);
  }
  base = base.slice(0, 8);
  const anio = new Date().getFullYear();
  const codigo = `${base}${anio}${sufijo}`;
  return codigo.slice(0, 20);
}
