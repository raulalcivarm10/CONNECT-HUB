/**
 * Hook de Google Sign-In. Lee los Client IDs de env (EXPO_PUBLIC_GOOGLE_*).
 * Si no hay ninguno configurado, `available` es false y el botón se deshabilita.
 * Al obtener el id_token, llama onIdToken(idToken, accessToken).
 *
 * ANDROID → librería NATIVA (@react-native-google-signin). El flujo de navegador
 * (expo-auth-session) fallaba en release: el redirect connecthub://oauthredirect
 * volvía a la app como "Unmatched Route" y el id_token se perdía. El SDK nativo
 * no usa redirects (Credential Manager / Play Services) y emite el idToken con
 * audiencia = WEB client ID, que es la que aceptan los backends (register-google
 * del servicio de pagos y /public/auth/google nuestro). accessToken sale de
 * getTokens() — el servicio de pagos lo necesita para la People API.
 *
 * iOS y WEB → conservan EXACTAMENTE el flujo anterior (expo-auth-session,
 * híbrido implícito 'id_token token'); no se tocan (iOS ya enviado a revisión).
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { ResponseType, makeRedirectUri } from 'expo-auth-session';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { dlog } from '@/lib/debuglog';

WebBrowser.maybeCompleteAuthSession();

const WEB = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const ANDROID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

export const googleConfigured = !!(WEB || IOS || ANDROID);

const esAndroid = Platform.OS === 'android';

// configure() es sincrónico e idempotente: una sola vez al cargar el módulo.
// webClientId (no el Android client) es lo que hace que el idToken salga con
// audiencia web — la única en la lista de audiencias validada por los backends.
// Los scopes por defecto (openid profile email) son los mismos del flujo web
// que ya funcionaba contra register-google, no se piden scopes sensibles.
if (esAndroid && WEB) {
  try {
    GoogleSignin.configure({ webClientId: WEB });
  } catch {
    // Expo Go / entorno sin el módulo nativo: el botón queda sin efecto en dev;
    // en builds EAS (donde sí existe el módulo) configure nunca falla.
  }
}

/**
 * Cierra la sesión de Google en el dispositivo. Se llama al cerrar sesión (y al
 * eliminar la cuenta) de ConnectHub.
 *
 * BUG QUE ESTO ARREGLA: al salir de la app, la sesión de Google seguía viva en
 * el teléfono, así que al volver a entrar el SDK reutilizaba la última cuenta y
 * NO mostraba el selector — imposible entrar con otra. En iOS no pasaba porque
 * ahí el acceso con Google no usa este SDK nativo.
 *
 * Solo cierra la sesión LOCAL de la app con Google: no toca la cuenta de Google
 * del teléfono ni revoca permisos. Nunca lanza: cerrar sesión de ConnectHub no
 * puede fallar porque Google se queje.
 */
export async function cerrarSesionGoogle(): Promise<void> {
  if (!esAndroid || !WEB) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // sin módulo nativo (Expo Go) o sin sesión previa: nada que cerrar
  }
}

function genNonce(): string {
  let s = '';
  while (s.length < 32) s += Math.random().toString(36).slice(2);
  return s.slice(0, 32);
}

export function useGoogleAuth(onIdToken: (idToken: string, accessToken: string) => void) {
  // nonce estable durante la vida del request (obligatorio para id_token)
  const [nonce] = useState(genNonce);
  // El hook de expo-auth-session se crea SIEMPRE (regla de hooks) pero en
  // Android no se usa: promptAsync se reemplaza por el flujo nativo.
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: WEB,
    iosClientId: IOS,
    androidClientId: ANDROID,
    ...(esAndroid
      ? {}
      : {
          // híbrido: id_token (verificación server-side) + access_token (register-google)
          responseType: 'id_token token' as ResponseType,
          // PKCE solo aplica a authorization-code; en implícito Google lo rechaza
          usePKCE: false,
          extraParams: { nonce },
        }),
    // En WEB el redirect autorizado en el proyecto Google incluye la ruta
    // (p.ej. http://localhost:8100/auth), no solo el origen. En nativo se deja
    // el default (esquema reverso del client de Google).
    ...(Platform.OS === 'web' ? { redirectUri: makeRedirectUri({ path: 'auth' }) } : {}),
  });

  useEffect(() => {
    if (esAndroid) return; // Android va por el flujo nativo (sin redirects)
    if (response?.type === 'success') {
      const idToken =
        response.authentication?.idToken ??
        (response.params?.id_token as string | undefined);
      const accessToken =
        response.authentication?.accessToken ??
        (response.params?.access_token as string | undefined) ??
        '';
      if (idToken) onIdToken(idToken, accessToken);
    }
  }, [response, onIdToken]);

  /** Flujo nativo Android: sin navegador ni redirect; entrega idToken+accessToken. */
  async function nativeSignIn() {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // BUG QUE ESTO ARREGLA: el usuario entraba con Google, actualizaba la app
      // y ya no podía volver a entrar (el botón no hacía nada). Causa: el SDK
      // guarda la sesión de Google en el dispositivo y `signIn()` la reutiliza
      // sin pedir cuenta; tras reinstalar/actualizar esa sesión queda huérfana
      // y `getTokens()` devuelve un token vencido o falla. El comentario
      // anterior decía que se limpiaba la sesión previa, pero NO se limpiaba.
      // `signOut()` solo cierra la sesión local de Google (no toca la sesión de
      // ConnectHub ni la cuenta del teléfono) y fuerza el selector de cuenta.
      await GoogleSignin.signOut().catch(() => undefined);

      const res = await GoogleSignin.signIn();
      if (res.type !== 'success') return; // 'cancelled' → sin error, igual que antes

      let { idToken, accessToken } = await GoogleSignin.getTokens();
      // Segundo cinturón: si el token viene vencido del caché del SDK, se
      // invalida y se pide de nuevo. Sin esto el backend responde 401 y el
      // usuario vuelve a ver el login vacío sin saber por qué.
      if (!idToken && accessToken) {
        await GoogleSignin.clearCachedAccessToken(accessToken).catch(() => undefined);
        ({ idToken, accessToken } = await GoogleSignin.getTokens());
      }
      if (idToken) {
        onIdToken(idToken, accessToken ?? '');
        return;
      }
      throw new Error('Google no devolvió idToken');
    } catch (e) {
      // Antes este catch estaba VACÍO: cualquier fallo dejaba el botón mudo y
      // el usuario veía el login vacío sin explicación (así se reportó el bug).
      // Ahora al menos queda registrado en el log de diagnóstico de la app.
      dlog('google:signIn ERROR', {
        mensaje: e instanceof Error ? e.message : String(e),
        codigo: (e as { code?: string })?.code ?? null,
      });
    }
  }

  return {
    promptAsync: esAndroid ? nativeSignIn : promptAsync,
    available: esAndroid ? googleConfigured && !!WEB : googleConfigured && !!request,
  };
}
