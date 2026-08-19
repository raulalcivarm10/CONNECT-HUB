/**
 * Cliente HTTP del API público ConnectHub. Base configurable por entorno
 * (EXPO_PUBLIC_API_URL). Endpoints bajo /public/*. Maneja auth de asistente:
 * adjunta el access token y, ante 401, intenta refresh una vez y reintenta.
 *
 * Patrón "holder": el cliente NO importa el store (evita ciclos). El store le
 * inyecta el token actual y el handler de refresh vía setAccessToken/setRefreshHandler.
 *
 * TIMEOUTS: ninguna petición puede quedarse colgada para siempre. Con mala
 * cobertura `fetch` no falla por sí solo (el socket queda abierto y la promesa
 * nunca se resuelve) y la pantalla se queda girando: por eso TODA salida a red
 * pasa por `fetchConTimeout`, que aborta con AbortController. Los valores están
 * en TIMEOUT y se eligen por tipo de operación (ver comentarios allí).
 */
import * as FileSystem from 'expo-file-system/legacy';

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

/**
 * Techos de espera por tipo de operación. No son "lo que debería tardar" sino
 * "a partir de aquí seguro que algo se rompió": mejor pasarse de generoso que
 * cortar una petición que iba a responder.
 *
 *  - LECTURA (15 s): GET de catálogo/listas. Reintentable sin efectos: si se
 *    corta no se pierde nada y React Query lo reintenta.
 *  - ESCRITURA (20 s): POST/PATCH/DELETE normales (mensajes, conexiones…).
 *  - AUTH (25 s): login/registro/refresh/canje. El login encadena el servicio
 *    externo + nuestro canje, así que necesita más margen que una lectura.
 *  - SUBIDA (60 s): multipart de foto de perfil. Una foto de varios MB por red
 *    móvil lenta tarda de verdad; cortarla a los 20 s sería un falso negativo.
 *  - PAGO_INICIO (45 s): generar la referencia del checkout. AÚN NO hay cargo
 *    en la tarjeta, así que abortar es seguro (el usuario reintenta).
 *  - PAGO_CONFIRMACION (120 s): confirmar el pago ya cobrado. Ver nota abajo.
 *
 * NOTA SOBRE PAGOS — por qué 120 s y no 20 s:
 * `confirmarCheckout` se llama DESPUÉS de que la pasarela aprobó el cargo. Si
 * abortamos por impaciencia, el dinero ya salió pero la app muestra error y el
 * usuario puede reintentar/duplicar. Abortar además NO cancela nada en el
 * servidor: la petición sigue su curso allá. Por eso el techo es un seguro
 * anti-cuelgue (evitar la espera infinita), no un timeout "de UX": 120 s es más
 * de lo que cualquier confirmación sana tarda, y aun así la app nunca se queda
 * muerta. Esa llamada tampoco se reintenta automáticamente (ver mutations en
 * query-client.ts): un reintento ciego sobre un cobro es peor que un error.
 */
export const TIMEOUT = {
  LECTURA: 15_000,
  ESCRITURA: 20_000,
  AUTH: 25_000,
  SUBIDA: 60_000,
  PAGO_INICIO: 45_000,
  PAGO_CONFIRMACION: 120_000,
} as const;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Cuerpo de la respuesta de error (p.ej. { code: 'PROFILE_INCOMPLETE', ... }). */
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Marca interna de los errores por timeout (no la manda el servidor). */
const TIMEOUT_MARK = { reason: 'timeout' } as const;

/**
 * Error de red por corte de tiempo. Se mantiene `status: 0` y el mensaje
 * 'network' a propósito: las pantallas ya tratan ese caso y no queremos que de
 * pronto muestren un texto nuevo sin traducir. Se distingue con `esTimeout`.
 */
function timeoutError(): ApiError {
  return new ApiError(0, 'network', TIMEOUT_MARK);
}

/** ¿El error viene de que agotamos el tiempo de espera (y no de un 4xx/5xx)? */
export function esTimeout(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 0) return false;
  return (err.data as { reason?: string } | undefined)?.reason === 'timeout';
}

/** Error de conectividad (sin respuesta del servidor): red caída o timeout. */
export function esErrorDeRed(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

/**
 * `fetch` con techo de espera. Si vence, aborta la petición y lanza el error de
 * red marcado como timeout. En React Native la promesa de `fetch` se resuelve
 * cuando el cuerpo ya está en memoria (va sobre XHR), así que limpiar el timer
 * al resolver no deja el `res.json()` desprotegido.
 */
async function fetchConTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    throw ctrl.signal.aborted ? timeoutError() : new ApiError(0, 'network');
  } finally {
    clearTimeout(timer);
  }
}

/** `fetch` con timeout para servicios externos (pagos). Reutiliza el mismo error. */
export function fetchExterno(url: string, init: RequestInit, ms: number): Promise<Response> {
  return fetchConTimeout(url, init, ms);
}

/** Extrae el `code` de un ApiError (para distinguir 409s: PARENT_REQUIRED, PROFILE_INCOMPLETE…). */
export function errorCode(err: unknown): string | null {
  if (err instanceof ApiError && err.data && typeof err.data === 'object') {
    const c = (err.data as { code?: unknown }).code;
    return typeof c === 'string' ? c : null;
  }
  return null;
}

let _accessToken: string | null = null;
/** Devuelve un nuevo access token o null si el refresh falló (→ logout). */
let _refreshHandler: (() => Promise<string | null>) | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}
/** Token actual (para llamadas a servicios externos, p.ej. API de pagos). */
export function getAccessToken(): string | null {
  return _accessToken;
}
export function setRefreshHandler(fn: (() => Promise<string | null>) | null) {
  _refreshHandler = fn;
}

/* ---- refresh single-flight ---- */

let _refreshing: Promise<string | null> | null = null;

/**
 * Renueva el access token UNA sola vez aunque varias peticiones reciban 401 a
 * la vez (al arrancar salen 5-6 en paralelo). Sin esto se disparaban N refresh
 * simultáneos y, como el backend ROTA el refresh token, los que llegaban
 * después usaban uno ya consumido → refresh fallido → cierre de sesión
 * espontáneo y N round-trips de más.
 */
function refrescarToken(): Promise<string | null> {
  if (!_refreshHandler) return Promise.resolve(null);
  if (_refreshing) return _refreshing; // las demás peticiones esperan esta
  const p: Promise<string | null> = Promise.resolve()
    .then(() => _refreshHandler!())
    .catch(() => null)
    .finally(() => {
      if (_refreshing === p) _refreshing = null;
    });
  _refreshing = p;
  return p;
}

/**
 * Token a usar para el reintento tras un 401. Si mientras esperábamos otra
 * petición ya renovó la sesión, se usa el token nuevo directamente en vez de
 * pedir OTRO refresh (ese 401 era de la generación anterior del token).
 */
function tokenParaReintento(tokenUsado: string | null): Promise<string | null> {
  if (_accessToken && _accessToken !== tokenUsado) return Promise.resolve(_accessToken);
  return refrescarToken();
}

/** Convierte una ruta relativa del API (p.ej. logoUrl) en URL absoluta. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

interface RequestOpts {
  query?: Record<string, unknown>;
  body?: unknown;
  auth?: boolean; // adjunta Authorization si hay token
  /** Techo de espera; por defecto LECTURA para GET y ESCRITURA para el resto. */
  timeoutMs?: number;
}

function doFetch(
  method: string,
  path: string,
  opts: RequestOpts,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth && token) headers.Authorization = `Bearer ${token}`;
  const ms = opts.timeoutMs ?? (method === 'GET' ? TIMEOUT.LECTURA : TIMEOUT.ESCRITURA);
  return fetchConTimeout(
    buildUrl(path, opts.query),
    {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    },
    ms,
  );
}

async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
  const tokenUsado = _accessToken;
  // doFetch ya normaliza los fallos de red/timeout a ApiError(0, 'network')
  let res = await doFetch(method, path, opts, tokenUsado);

  // 401 en ruta autenticada → refresh (single-flight) y reintento único
  if (res.status === 401 && opts.auth && _refreshHandler) {
    const newToken = await tokenParaReintento(tokenUsado);
    if (newToken) res = await doFetch(method, path, opts, newToken);
  }

  if (!res.ok) {
    let msg = res.statusText;
    let body: unknown;
    try {
      body = await res.json();
      const b = body as { message?: string | string[] };
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : b.message;
    } catch {
      /* sin json */
    }
    throw new ApiError(res.status, msg, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(
  path: string,
  query?: Record<string, unknown>,
  auth = false,
  timeoutMs?: number,
): Promise<T> {
  return request<T>('GET', path, { query, auth, timeoutMs });
}
export function apiPost<T>(
  path: string,
  body?: unknown,
  auth = false,
  timeoutMs?: number,
): Promise<T> {
  return request<T>('POST', path, { body, auth, timeoutMs });
}
export function apiPatch<T>(
  path: string,
  body?: unknown,
  auth = true,
  timeoutMs?: number,
): Promise<T> {
  return request<T>('PATCH', path, { body, auth, timeoutMs });
}
export function apiDelete<T>(path: string, auth = true, timeoutMs?: number): Promise<T> {
  return request<T>('DELETE', path, { auth, timeoutMs });
}

/** POST multipart/form-data autenticado (subida de archivos). */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const send = (token: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    // sin Content-Type: fetch pone el boundary del multipart
    return fetchConTimeout(buildUrl(path), { method: 'POST', headers, body: form }, TIMEOUT.SUBIDA);
  };
  const tokenUsado = _accessToken;
  let res = await send(tokenUsado);
  if (res.status === 401 && _refreshHandler) {
    const newToken = await tokenParaReintento(tokenUsado);
    if (newToken) res = await send(newToken);
  }
  if (!res.ok) {
    let msg = res.statusText;
    let body: unknown;
    try {
      body = await res.json();
      const b = body as { message?: string | string[] };
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : b.message;
    } catch {
      /* sin json */
    }
    throw new ApiError(res.status, msg, body);
  }
  return (await res.json()) as T;
}

/**
 * Sube un archivo local (uri `file://`) por multipart usando expo-file-system.
 * En iOS/Android nativo es mucho más fiable que `fetch`+`FormData`, que suele
 * lanzar "Network request failed" en la nueva arquitectura de React Native.
 * Solo para NATIVO; en web usar `apiUpload` con un Blob real.
 *
 * `uploadAsync()` no admite timeout ni AbortSignal (SDK 57, API legacy), así que
 * se usa `createUploadTask`, que sí expone `cancelAsync()`: al vencer
 * TIMEOUT.SUBIDA se cancela la tarea NATIVA (no solo la espera en JS) y se lanza
 * el error de red. Sin esto una subida en un ascensor dejaba la pantalla
 * girando para siempre. Las opciones son exactamente las mismas que antes.
 */
export async function apiUploadFile<T>(
  path: string,
  fileUri: string,
  fieldName: string,
  mimeType: string,
): Promise<T> {
  const send = async (token: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const task = FileSystem.createUploadTask(buildUrl(path), fileUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      // FOREGROUND: esperamos el resultado de inmediato; BACKGROUND (default iOS)
      // puede diferir la subida y complicar el await.
      sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
      fieldName,
      mimeType,
      headers,
    });
    let vencido = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // El corte NO depende de que `cancelAsync` funcione (en Expo Go, por
    // ejemplo, lanza UnavailabilityError): la carrera garantiza que la promesa
    // se resuelve sí o sí, y el cancelAsync es limpieza en el mejor de los casos.
    const limite = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        vencido = true;
        task.cancelAsync().catch(() => {});
        reject(timeoutError());
      }, TIMEOUT.SUBIDA);
    });
    const subida = task.uploadAsync();
    subida.catch(() => {}); // si gana el timeout, evita el "unhandled rejection"
    let out: FileSystem.FileSystemUploadResult | null | undefined;
    try {
      out = await Promise.race([subida, limite]);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw vencido ? timeoutError() : new ApiError(0, 'network');
    } finally {
      if (timer) clearTimeout(timer);
    }
    // al cancelar, uploadAsync resuelve null/undefined en vez de rechazar
    if (!out) throw vencido ? timeoutError() : new ApiError(0, 'network');
    return out;
  };
  const tokenUsado = _accessToken;
  let res = await send(tokenUsado);
  if (res.status === 401 && _refreshHandler) {
    const newToken = await tokenParaReintento(tokenUsado);
    if (newToken) res = await send(newToken);
  }
  if (res.status < 200 || res.status >= 300) {
    let msg = `HTTP ${res.status}`;
    let body: unknown;
    try {
      body = JSON.parse(res.body);
      const b = body as { message?: string | string[] };
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : b.message;
    } catch {
      /* body no-json */
    }
    throw new ApiError(res.status, msg, body);
  }
  return JSON.parse(res.body) as T;
}
