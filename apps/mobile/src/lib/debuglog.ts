/**
 * Log de diagnóstico EN LA APP (buffer en memoria, máx 300 entradas).
 * Para depurar el flujo login → tokens → checkout en builds de tienda, donde
 * no hay consola: las capas de auth/pagos llaman dlog() y la pantalla oculta
 * /debug-log (mantener presionada la fila de versión en Perfil) lo muestra.
 *
 * Privacidad: nunca se registra la clave en texto plano ni el refresh token
 * completo (solo prefijo + largo). El access token sí (expira en ~1 h y sirve
 * para reproducir llamadas a mano).
 */

export interface DebugEntry {
  ts: string; // HH:MM:SS.mmm
  tag: string;
  data: unknown;
}

const MAX = 300;
const entries: DebugEntry[] = [];
const listeners = new Set<() => void>();

export function dlog(tag: string, data?: unknown) {
  const d = new Date();
  const ts =
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:` +
    `${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  entries.push({ ts, tag, data });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  listeners.forEach((fn) => fn());
}

export function getDebugEntries(): readonly DebugEntry[] {
  return entries;
}

export function clearDebugLog() {
  entries.length = 0;
  listeners.forEach((fn) => fn());
}

export function subscribeDebugLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Resumen seguro de un token: prefijo + largo (para no filtrarlo entero). */
export function tokenBrief(token: string | null | undefined): string {
  if (!token) return '(null)';
  return `${token.slice(0, 16)}… (len ${token.length})`;
}

/** Decodifica el payload de un JWT SIN verificar (solo para inspección). */
export function jwtInfo(token: string | null | undefined): Record<string, unknown> | string {
  if (!token) return '(null)';
  try {
    const part = token.split('.')[1];
    if (!part) return '(no es JWT)';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(b64) : '';
    const p = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, unknown> = { ...p };
    if (typeof p.exp === 'number') out.expISO = new Date(p.exp * 1000).toISOString();
    if (typeof p.iat === 'number') out.iatISO = new Date(p.iat * 1000).toISOString();
    return out;
  } catch {
    return '(payload ilegible)';
  }
}

/** Todo el log como texto (para compartir/copiar). */
export function debugLogAsText(): string {
  return entries
    .map((e) => `[${e.ts}] ${e.tag}\n${JSON.stringify(e.data, null, 2) ?? ''}`)
    .join('\n\n');
}
