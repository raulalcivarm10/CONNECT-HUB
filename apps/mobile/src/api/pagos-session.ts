/**
 * Sesión contra el SERVICIO DE PAGOS externo (api-ligaprocorp).
 *
 * Contrato VERIFICADO contra el servicio real (2026-07-15):
 *  - Login email/clave: POST /auth/login-user-password
 *      body { email, password }  ← password = SHA-256(clave) en hex (NO texto plano)
 *  - Login Google:      POST /auth/register-google
 *      body { idToken, accessToken, tipoUsuario: 'GOOGLE' }
 *  - Respuesta de ambos: { message, usuario:{...}, token, refreshToken }
 *  - `token` (access ~1h) viaja SIEMPRE como Authorization: Bearer en pagos.
 *  - `refreshToken` (~30d) SOLO ante 401: POST /auth/refresh { refreshToken }
 *      → { token, refreshToken } (rota ambos). Tras el refresh se actualizan
 *      ÚNICAMENTE los 2 tokens (el resto de la sesión se conserva) y se reintenta
 *      la petición original una vez. Refresh fallido = sesión expirada, sin retry.
 *  - Single-flight: N peticiones con 401 comparten UNA sola llamada a /refresh.
 */
import * as Crypto from 'expo-crypto';
import { TIMEOUT, fetchExterno } from './client';
import { getStoredItem, removeStoredItem, setStoredItem } from '@/lib/tokenStorage';
import { dlog, jwtInfo, tokenBrief } from '@/lib/debuglog';

/** Base del servicio de pagos (único host permitido para el checkout). */
export const PAGOS_API =
  process.env.EXPO_PUBLIC_PAGOS_API_URL?.replace(/\/$/, '') ??
  'https://api-ligaprocorp.ec:3443/api';

/** Rutas reales del servicio (configurables por si cambian, sin tocar código). */
const LOGIN_PATH = process.env.EXPO_PUBLIC_PAGOS_LOGIN_PATH ?? '/auth/login-user-password';
const GOOGLE_PATH = process.env.EXPO_PUBLIC_PAGOS_GOOGLE_PATH ?? '/auth/register-google';
const APPLE_PATH = process.env.EXPO_PUBLIC_PAGOS_APPLE_PATH ?? '/auth/register-apple';
const REFRESH_PATH = process.env.EXPO_PUBLIC_PAGOS_REFRESH_PATH ?? '/auth/refresh';

/**
 * Une base + path evitando SIEMPRE el `/api/api` duplicado: si la base ya
 * termina en `/api` y el path empieza con `/api/`, se quita uno. Así no importa
 * si alguna env quedó con el prefijo repetido.
 */
export function pagosUrl(path: string): string {
  let p = path.startsWith('/') ? path : `/${path}`;
  if (PAGOS_API.endsWith('/api') && p.startsWith('/api/')) p = p.slice(4);
  return `${PAGOS_API}${p}`;
}

const KEY_TOKEN = 'ch.pagos.token';
const KEY_REFRESH = 'ch.pagos.refresh';
// Credencial de re-login del servicio de pagos: { email, sha } donde sha =
// SHA-256(clave) — lo MISMO que viaja por la red en login-user-password (nunca
// el texto plano). Guardarla (SecureStore, cifrado) permite que el checkout
// recupere la sesión de pagos por sí solo si el login inicial falló (red,
// carrera con la migración de clave, etc.).
const KEY_CREDS = 'ch.pagos.creds';

let _token: string | null = null;
let _refresh: string | null = null;
let _creds: { email: string; sha: string } | null = null;

export function getPagosToken(): string | null {
  return _token;
}

/** SHA-256 hex de la clave (lo que el servicio espera como `password`). */
export function hashClave(clave: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, clave);
}

/** Actualiza ÚNICAMENTE los tokens (el resto de la sesión no se toca). */
export async function setPagosTokens(token: string | null, refreshToken: string | null) {
  _token = token;
  _refresh = refreshToken;
  if (token) await setStoredItem(KEY_TOKEN, token);
  else await removeStoredItem(KEY_TOKEN);
  if (refreshToken) await setStoredItem(KEY_REFRESH, refreshToken);
  else await removeStoredItem(KEY_REFRESH);
}

/** Restaura la sesión de pagos persistida al arrancar (bootstrap). */
export async function loadPagosToken() {
  let credsRaw: string | null;
  [_token, _refresh, credsRaw] = await Promise.all([
    getStoredItem(KEY_TOKEN),
    getStoredItem(KEY_REFRESH),
    getStoredItem(KEY_CREDS),
  ]);
  try {
    _creds = credsRaw ? (JSON.parse(credsRaw) as { email: string; sha: string }) : null;
  } catch {
    _creds = null;
  }
}

/** Elimina la sesión de pagos (logout o refresh fallido = sesión expirada). */
export async function clearPagosSession() {
  await setPagosTokens(null, null);
  _creds = null;
  await removeStoredItem(KEY_CREDS);
}

interface SessionResponse {
  token?: string;
  refreshToken?: string;
  usuario?: unknown;
  message?: string;
}

async function guardarSesion(res: Response): Promise<boolean> {
  const j = (await res.json().catch(() => null)) as SessionResponse | null;
  if (!res.ok) {
    dlog('pagos:sesion RECHAZADA', { httpStatus: res.status, message: j?.message ?? '(sin cuerpo)' });
    return false;
  }
  if (!j?.token) {
    dlog('pagos:sesion SIN TOKEN', { httpStatus: res.status, message: j?.message });
    return false;
  }
  await setPagosTokens(j.token, j.refreshToken ?? null);
  dlog('pagos:sesion OK', {
    token: j.token, // access (~1 h) — completo para poder reproducir llamadas
    tokenPayload: jwtInfo(j.token),
    refreshToken: tokenBrief(j.refreshToken), // solo prefijo (30 d, no filtrarlo)
    refreshPayload: jwtInfo(j.refreshToken),
    message: j.message,
  });
  return true;
}

/** POST login-user-password con la credencial ya hasheada. */
async function loginPagosConSha(email: string, sha: string): Promise<boolean> {
  try {
    dlog('pagos:login →', { url: pagosUrl(LOGIN_PATH), body: { email, password: `${sha.slice(0, 12)}… (sha256, len ${sha.length})` } });
    // con techo de espera: un login colgado bloqueaba la pantalla de acceso
    const res = await fetchExterno(
      pagosUrl(LOGIN_PATH),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password: sha }),
      },
      TIMEOUT.AUTH,
    );
    return await guardarSesion(res);
  } catch (e) {
    dlog('pagos:login ERROR RED', { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/**
 * Login email/clave (hashea la clave con SHA-256 antes de enviar). Guarda la
 * credencial hasheada AUNQUE el login falle: si falló por una carrera (p.ej. la
 * clave se migró de formato en ese instante) o por red, ensurePagosSession()
 * podrá reintentarlo después — el checkout se auto-repara.
 */
export async function loginPagos(email: string, clave: string): Promise<boolean> {
  const sha = await hashClave(clave);
  _creds = { email, sha };
  await setStoredItem(KEY_CREDS, JSON.stringify(_creds));
  return loginPagosConSha(email, sha);
}

/* ---- recuperación perezosa de la sesión de pagos (para el checkout) ---- */

let _ensuring: Promise<string | null> | null = null;

/**
 * Garantiza (mejor esfuerzo) un token de pagos ANTES de una llamada al servicio:
 *  1) si hay token en memoria, se usa;
 *  2) si no, intenta refresh con el refreshToken persistido;
 *  3) si tampoco, re-login con la credencial guardada (email + SHA-256).
 * Single-flight: llamadas concurrentes comparten un solo intento.
 */
export function ensurePagosSession(): Promise<string | null> {
  if (_token) return Promise.resolve(_token);
  if (_ensuring) return _ensuring;
  _ensuring = (async () => {
    try {
      dlog('pagos:ensure', { tieneRefresh: !!_refresh, tieneCreds: !!_creds });
      const renovado = await refreshPagos();
      if (renovado) {
        dlog('pagos:ensure OK vía refresh', { token: tokenBrief(renovado) });
        return renovado;
      }
      if (_creds && (await loginPagosConSha(_creds.email, _creds.sha))) {
        dlog('pagos:ensure OK vía re-login', { token: tokenBrief(_token) });
        return _token;
      }
      dlog('pagos:ensure FALLÓ', { motivo: _creds ? 're-login rechazado' : 'sin credencial guardada' });
      return null;
    } finally {
      _ensuring = null;
    }
  })();
  return _ensuring;
}

/** Login Google en el servicio de pagos (con los tokens de Google OAuth). */
export async function loginPagosGoogle(idToken: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetchExterno(
      pagosUrl(GOOGLE_PATH),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ idToken, accessToken, tipoUsuario: 'GOOGLE' }),
      },
      TIMEOUT.AUTH,
    );
    return await guardarSesion(res);
  } catch {
    return false;
  }
}

/**
 * Login Apple en el servicio de pagos (identity token de Sign in with Apple).
 * Espejo de Google → deja sesión de pagos para el checkout. email/nombre solo
 * llegan la primera vez que el usuario autoriza; se reenvían para enriquecer.
 */
export async function loginPagosApple(
  identityToken: string,
  email?: string,
  nombre?: string,
  apellido?: string,
): Promise<boolean> {
  try {
    const res = await fetchExterno(
      pagosUrl(APPLE_PATH),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ identityToken, email, nombre, apellido, tipoUsuario: 'APPLE' }),
      },
      TIMEOUT.AUTH,
    );
    return await guardarSesion(res);
  } catch {
    return false;
  }
}

/* ---- refresh single-flight ---- */

let _refreshing: Promise<string | null> | null = null;

/**
 * Renueva el access token con el refreshToken (una sola llamada aunque varias
 * peticiones reciban 401 a la vez). Devuelve el token nuevo o null si la sesión
 * ya no puede renovarse (en ese caso la sesión de pagos queda eliminada).
 */
export function refreshPagos(): Promise<string | null> {
  if (_refreshing) return _refreshing; // las demás peticiones esperan esta
  _refreshing = (async () => {
    try {
      if (!_refresh) return null;
      // el refresh va DENTRO del camino crítico del checkout: si se cuelga, el
      // pago se queda esperando. Techo AUTH y, si vence, se trata como error de
      // red (no borra la sesión: se podrá reintentar).
      const res = await fetchExterno(
        pagosUrl(REFRESH_PATH),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken: _refresh }),
        },
        TIMEOUT.AUTH,
      );
      if (!res.ok) {
        // Solo un refresh DEFINITIVAMENTE inválido (401/403) cierra la sesión.
        // Errores transitorios (5xx, etc.) conservan el refresh para reintentar luego.
        if (res.status === 401 || res.status === 403) await clearPagosSession();
        return null;
      }
      const j = (await res.json().catch(() => null)) as SessionResponse | null;
      if (!j?.token) {
        await clearPagosSession();
        return null;
      }
      // ÚNICAMENTE token y refreshToken; si no rota el refresh, se conserva
      await setPagosTokens(j.token, j.refreshToken ?? _refresh);
      return j.token;
    } catch {
      return null; // error de red: no borra la sesión (podrá reintentar luego)
    } finally {
      _refreshing = null;
    }
  })();
  return _refreshing;
}
