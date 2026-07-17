import type { Usuario } from '../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  // Content-Type solo cuando hay body: Fastify rechaza JSON vacío con 400
  if (options.body) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) return request<T>(path, options, false);
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (body as { message?: string | string[] } | null)?.message ??
      `Error ${res.status}`;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
  }
  return body as T;
}

/**
 * Política global: todo texto ingresado se guarda en MAYÚSCULAS.
 * Se excluyen campos sensibles o técnicos donde el case importa:
 * contraseñas, credenciales de pasarela, tokens/keys, URLs y el
 * código de conexión (lo genera el sistema en minúsculas).
 */
const SIN_MAYUSCULAS =
  /pass|clave|pasarela|appcode|appkey|key|token|secret|url|codigoconexion/i;

function aMayusculas(valor: unknown, clave = ''): unknown {
  if (typeof valor === 'string') {
    return SIN_MAYUSCULAS.test(clave) ? valor : valor.toUpperCase();
  }
  if (Array.isArray(valor)) return valor.map((v) => aMayusculas(v, clave));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [
        k,
        aMayusculas(v, k),
      ]),
    );
  }
  return valor;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(aMayusculas(data ?? {})),
    }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(aMayusculas(data ?? {})),
    }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(aMayusculas(data ?? {})),
    }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** multipart: el navegador arma el boundary, no fijar Content-Type */
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    const doFetch = () =>
      fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
        body: form,
        credentials: 'include',
      });
    let res = await doFetch();
    if (res.status === 401 && (await refreshSession())) res = await doFetch();
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        (body as { message?: string | string[] } | null)?.message ??
        `Error ${res.status}`;
      throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
    }
    return body as T;
  },

  /** descarga autenticada de binarios; devuelve el Blob crudo */
  blob: async (path: string): Promise<Blob> => {
    const doFetch = () =>
      fetch(`${API_URL}${path}`, {
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
        credentials: 'include',
      });
    let res = await doFetch();
    if (res.status === 401 && (await refreshSession())) res = await doFetch();
    if (!res.ok) throw new ApiError(res.status, `Error ${res.status}`);
    return res.blob();
  },

  /** descarga autenticada de binarios; devuelve un object URL para <img> */
  blobUrl: async (path: string): Promise<string> => {
    return URL.createObjectURL(await api.blob(path));
  },
};

export interface Session {
  accessToken: string;
  user: Usuario;
}

/** Renueva la sesión con la cookie httpOnly de refresh; null si no hay sesión */
export async function refreshSession(): Promise<Session | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const session = (await res.json()) as Session;
    accessToken = session.accessToken;
    return session;
  } catch {
    return null;
  }
}
