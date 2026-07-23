import { create } from 'zustand';
import type { AsistenteProfile, AuthResponse } from '@connecthub/shared-types';
import { setAccessToken, setRefreshHandler } from '@/api/client';
import { ApiError } from '@/api/client';
import {
  meReq,
  loginReq,
  refreshReq,
  registerReq,
  pagosExchangeReq,
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
    // restaura también la sesión del servicio de pagos (si existía)
    await loadPagosToken();
    const tokens = await loadTokens();
    if (!tokens) {
      set({ bootstrapped: true });
      return;
    }
    setAccessToken(tokens.accessToken);
    set({ refreshToken: tokens.refreshToken });
    try {
      const user = await meReq();
      set({ user, status: 'authed' });
      await syncInstitucion();
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
  // Login: primero el servicio externo (api-ligaprocorp) para dejar SESIÓN DE
  // PAGOS y que el checkout funcione. Si ese servicio no conoce la cuenta o no
  // responde, cae al login NATIVO de ConnectHub (mismo patrón que `apple`).
  //
  // El fallback NO es un caso raro: el registro por correo de esta app crea al
  // usuario SOLO en ConnectHub (`registerReq`) y el servicio de pagos no expone
  // un "register-user-password" que lo propague. Sin este fallback, cualquiera
  // que se registrara por correo quedaba fuera de su cuenta al volver a entrar
  // — y fue la causa del rechazo de Google, que no pudo iniciar sesión con las
  // credenciales de revisor. Entrar sin sesión de pagos (checkout no disponible
  // hasta reintentar) es preferible a no entrar.
  login: async (b) => {
    const ok = await loginPagos(b.email, b.password);
    const res = ok ? await pagosExchangeReq(getPagosToken()!) : await loginReq(b);
    await persist(set, res);
    await syncInstitucion();
    return res;
  },
  // Google = servicio externo (register-google) + canje.
  google: async (idToken, accessToken) => {
    const ok = await loginPagosGoogle(idToken, accessToken ?? '');
    if (!ok) throw new ApiError(401, 'google auth failed');
    const res = await pagosExchangeReq(getPagosToken()!);
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
    // Guarda el nombre que Apple entregó (solo el primer login) si el perfil no lo tiene.
    await completarNombreApple(set, b, res.user);
    await syncInstitucion();
    return res;
  },

  logout: async () => {
    await clearTokens();
    await clearPagosSession();
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
 */
async function syncInstitucion() {
  try {
    const list = await misInstituciones();
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
