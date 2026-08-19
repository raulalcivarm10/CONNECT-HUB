import { create } from 'zustand';
import type { AsistenteProfile, AuthResponse, InstitucionResumen } from '@connecthub/shared-types';
import { setAccessToken, setRefreshHandler } from '@/api/client';
import {
  meReq,
  loginReq,
  refreshReq,
  registerReq,
  pagosExchangeReq,
  googleReq,
  appleReq,
  deleteAccountReq,
  RegisterBody,
  LoginBody,
  AppleBody,
} from '@/api/auth';
import { misInstituciones } from '@/api/catalogo';
import { actualizarPerfil } from '@/api/perfil';
import {
  clearPagosSession,
  getPagosToken,
  loadPagosToken,
  loginPagos,
  loginPagosGoogle,
  loginPagosApple,
} from '@/api/pagos-session';
import { clearTokens, loadTokens, saveTokens } from '@/lib/tokenStorage';
import { dlog, jwtInfo, tokenBrief } from '@/lib/debuglog';
import { cerrarSesionGoogle } from '@/features/auth/useGoogleAuth';
import { useInstitucion } from './institucion';

interface AuthState {
  user: AsistenteProfile | null;
  refreshToken: string | null;
  status: 'idle' | 'authed';
  bootstrapped: boolean;

  bootstrap: () => Promise<void>;
  register: (b: RegisterBody) => Promise<AuthResponse>;
  login: (b: LoginBody) => Promise<AuthResponse>;
  google: (idToken: string, accessToken?: string) => Promise<AuthResponse>;
  apple: (b: AppleBody) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<string | null>;
  setUser: (u: AsistenteProfile) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  refreshToken: null,
  status: 'idle',
  bootstrapped: false,

  bootstrap: async () => {
    // restaura también la sesión del servicio de pagos (si existía). Las dos
    // lecturas van al almacén seguro (keychain/keystore, lento en Android) y
    // NO dependen una de otra → en paralelo, no encadenadas.
    const [, tokens] = await Promise.all([loadPagosToken(), loadTokens()]);
    if (!tokens) {
      set({ bootstrapped: true });
      return;
    }
    setAccessToken(tokens.accessToken);
    set({ refreshToken: tokens.refreshToken });
    try {
      // `me` y `mis instituciones` solo dependen del token, no una de la otra:
      // en serie el arranque costaba DOS viajes completos al servidor antes de
      // soltar el splash. En paralelo cuesta uno. Si la lista falla (red), se
      // pasa null y syncInstitucion la vuelve a pedir como antes.
      const [user, lista] = await Promise.all([
        meReq(),
        misInstituciones().catch(() => null),
      ]);
      set({ user, status: 'authed' });
      await syncInstitucion(lista);
    } catch {
      // access vencido → intenta refresh; si falla, sesión limpia
      const newAccess = await get().refresh();
      if (newAccess) {
        try {
          const user = await meReq();
          set({ user, status: 'authed' });
          await syncInstitucion();
        } catch {
          /* deja idle */
        }
      }
    }
    // bootstrapped al FINAL: el gate espera a que la institución esté sincronizada
    set({ bootstrapped: true });
  },

  register: async (b) => {
    const res = await registerReq(b);
    await persist(set, res);
    // sesión del servicio de pagos (login externo, para el checkout)
    void loginPagos(b.email, b.password);
    await syncInstitucion();
    return res;
  },
  // Login por correo/clave — MISMO flujo que iOS y que la doc del equipo:
  // PRIMARIO = login-user-password del SERVICIO DE PAGOS (deja token + refresh
  // de pagos, los que exige el checkout) y se CANJEA por nuestra sesión
  // (pagosExchangeReq). Si el servicio externo no valida la cuenta (clave
  // reseteada aún sin migrar, red, etc.), FALLBACK a nuestra API para no
  // bloquear el ingreso — patrón idéntico al de Apple. El checkout reintentará
  // la sesión de pagos solo (ensurePagosSession) cuando haga falta.
  login: async (b) => {
    dlog('login:inicio', { email: b.email, flujo: 'API del equipo primero (como iOS)' });
    const ok = await loginPagos(b.email, b.password);
    dlog(ok ? 'login:equipo OK → canje de sesión' : 'login:equipo FALLÓ → fallback API ConnectHub', {});
    const res = ok ? await pagosExchangeReq(getPagosToken()!) : await loginReq(b);
    dlog('login:sesión ConnectHub OK', {
      via: ok ? 'canje (pagosExchange)' : 'loginReq (fallback)',
      accessToken: tokenBrief(res.accessToken),
      accessPayload: jwtInfo(res.accessToken),
      refreshToken: tokenBrief(res.refreshToken),
      user: { id: res.user.id, email: res.user.email },
    });
    await persist(set, res);
    await syncInstitucion();
    return res;
  },
  // Google: primero el servicio externo (register-google) + canje, para dejar
  // SESIÓN DE PAGOS (el checkout la usa). Si el externo falla (red/scopes/etc.),
  // cae al Google NATIVO de ConnectHub (/public/auth/google) — mismo patrón que
  // Apple: el login funciona aunque sin sesión de pagos hasta reintentar.
  google: async (idToken, accessToken) => {
    const ok = await loginPagosGoogle(idToken, accessToken ?? '');
    const res = ok ? await pagosExchangeReq(getPagosToken()!) : await googleReq(idToken);
    await persist(set, res);
    await syncInstitucion();
    return res;
  },
  // Apple: igual que Google, primero por el servicio de pagos externo
  // (register-apple) para dejar SESIÓN DE PAGOS y que el checkout funcione. Si el
  // externo aún no tiene el endpoint (404/red), cae al Apple NATIVO de ConnectHub
  // (login funciona para la revisión de Apple, pero sin sesión de pagos).
  apple: async (b) => {
    const ok = await loginPagosApple(b.identityToken, b.email, b.nombre, b.apellido);
    const res = ok ? await pagosExchangeReq(getPagosToken()!) : await appleReq(b);
    await persist(set, res);
    // Guarda el nombre que Apple entregó (solo el primer login) si el perfil no
    // lo tiene. No depende de la sincronización de institución → en paralelo.
    await Promise.all([completarNombreApple(set, b, res.user), syncInstitucion()]);
    return res;
  },

  logout: async () => {
    // La sesión de Google vive en el dispositivo, aparte de la nuestra: si no
    // se cierra, al volver a entrar el SDK reutiliza la última cuenta sin
    // mostrar el selector. No bloquea el cierre de sesión si falla.
    // Las tres son independientes (SDK de Google + dos borrados del almacén
    // seguro): en serie el botón de salir se quedaba pensando varios segundos.
    await Promise.all([cerrarSesionGoogle(), clearTokens(), clearPagosSession()]);
    setAccessToken(null);
    useInstitucion.getState().clear();
    set({ user: null, refreshToken: null, status: 'idle' });
  },

  // Elimina la cuenta en el backend (anonimiza + retiene finanzas) y cierra sesión.
  deleteAccount: async () => {
    await deleteAccountReq();
    await get().logout();
  },

  refresh: async () => {
    const rt = get().refreshToken;
    if (!rt) return null;
    try {
      const res = await refreshReq(rt);
      await persist(set, res);
      return res.accessToken;
    } catch {
      await clearTokens();
      setAccessToken(null);
      set({ user: null, refreshToken: null, status: 'idle' });
      return null;
    }
  },

  setUser: (u) => set({ user: u }),
}));

async function persist(set: (p: Partial<AuthState>) => void, res: AuthResponse) {
  await saveTokens(res.accessToken, res.refreshToken);
  setAccessToken(res.accessToken);
  set({ user: res.user, refreshToken: res.refreshToken, status: 'authed' });
}

/**
 * Apple entrega nombre/apellido SOLO en el primer inicio de sesión. Si el perfil
 * aún no los tiene, los guardamos automáticamente para que salgan en el
 * certificado sin que el usuario tenga que escribirlos.
 */
async function completarNombreApple(
  set: (p: Partial<AuthState>) => void,
  b: AppleBody,
  user: AsistenteProfile,
) {
  if (!b.nombre && !b.apellido) return; // Apple no dio nombre (login posterior)
  if (user.nombre && user.apellido) return; // el perfil ya tiene nombre
  try {
    const upd = await actualizarPerfil({
      nombre: b.nombre ?? user.nombre ?? undefined,
      apellido: b.apellido ?? user.apellido ?? undefined,
    });
    set({ user: { ...user, nombre: upd.nombre, apellido: upd.apellido } });
  } catch {
    /* si falla (p.ej. nombre bloqueado), no interrumpe el login */
  }
}

/**
 * Reconcilia la institución activa local con las del servidor:
 *  - sin instituciones → limpia (evita heredar la de otro usuario);
 *  - activa inválida (no pertenece al usuario) → usa la primera válida;
 *  - activa válida → se mantiene.
 *
 * `precargada` evita repetir la petición cuando el llamador ya la pidió en
 * paralelo (arranque); si viene null/undefined se pide aquí, como siempre.
 */
async function syncInstitucion(precargada?: InstitucionResumen[] | null) {
  try {
    const list = precargada ?? (await misInstituciones());
    const store = useInstitucion.getState();
    const current = store.institucion;
    if (list.length === 0) {
      store.clear();
    } else if (!current || !list.some((i) => i.idInstitucion === current.idInstitucion)) {
      store.setInstitucion(list[0]);
    }
    // filtro colgante (institución que ya no es mía) → "Todas"
    if (store.filtro !== null && !list.some((i) => i.idInstitucion === store.filtro)) {
      store.setFiltro(null);
    }
  } catch {
    /* sin conexión → se queda como está */
  }
}

// El cliente pide refresh ante 401 en rutas autenticadas.
setRefreshHandler(() => useAuth.getState().refresh());
