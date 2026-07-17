/**
 * Cliente HTTP del API público ConnectHub. Base configurable por entorno
 * (EXPO_PUBLIC_API_URL). Endpoints bajo /public/*. Maneja auth de asistente:
 * adjunta el access token y, ante 401, intenta refresh una vez y reintenta.
 *
 * Patrón "holder": el cliente NO importa el store (evita ciclos). El store le
 * inyecta el token actual y el handler de refresh vía setAccessToken/setRefreshHandler.
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
}

async function doFetch(
  method: string,
  path: string,
  opts: RequestOpts,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth && token) headers.Authorization = `Bearer ${token}`;
  return fetch(buildUrl(path, opts.query), {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
  let res: Response;
  try {
    res = await doFetch(method, path, opts, _accessToken);
  } catch {
    throw new ApiError(0, 'network');
  }

  // 401 en ruta autenticada → intenta refresh una vez y reintenta
  if (res.status === 401 && opts.auth && _refreshHandler) {
    const newToken = await _refreshHandler();
    if (newToken) {
      try {
        res = await doFetch(method, path, opts, newToken);
      } catch {
        throw new ApiError(0, 'network');
      }
    }
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const b = (await res.json()) as { message?: string | string[] };
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : b.message;
    } catch {
      /* sin json */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, query?: Record<string, unknown>, auth = false): Promise<T> {
  return request<T>('GET', path, { query, auth });
}
export function apiPost<T>(path: string, body?: unknown, auth = false): Promise<T> {
  return request<T>('POST', path, { body, auth });
}
export function apiPatch<T>(path: string, body?: unknown, auth = true): Promise<T> {
  return request<T>('PATCH', path, { body, auth });
}
export function apiDelete<T>(path: string, auth = true): Promise<T> {
  return request<T>('DELETE', path, { auth });
}

/** POST multipart/form-data autenticado (subida de archivos). */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const send = (token: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    // sin Content-Type: fetch pone el boundary del multipart
    return fetch(buildUrl(path), { method: 'POST', headers, body: form });
  };
  let res: Response;
  try {
    res = await send(_accessToken);
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 401 && _refreshHandler) {
    const newToken = await _refreshHandler();
    if (newToken) {
      try {
        res = await send(newToken);
      } catch {
        throw new ApiError(0, 'network');
      }
    }
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const b = (await res.json()) as { message?: string | string[] };
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : b.message;
    } catch {
      /* sin json */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}
