/**
 * Hook de Google Sign-In (expo-auth-session). Lee los Client IDs de env
 * (EXPO_PUBLIC_GOOGLE_*). Si no hay ninguno configurado, `available` es false
 * y el botón se muestra deshabilitado. Al obtener el id_token, llama onIdToken.
 *
 * Flujo HÍBRIDO implícito ('id_token token'): el servicio de pagos exige
 * idToken Y accessToken en register-google. OJO: expo-auth-session solo
 * desactiva PKCE con los ResponseType estándar; con el response type híbrido
 * hay que apagar PKCE a mano (Google rechaza code_challenge_method en flujos
 * implícitos: "Parameter not allowed for this message type") y aportar el
 * nonce manualmente (obligatorio cuando se pide id_token).
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { ResponseType, makeRedirectUri } from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const WEB = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const ANDROID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

export const googleConfigured = !!(WEB || IOS || ANDROID);

function genNonce(): string {
  let s = '';
  while (s.length < 32) s += Math.random().toString(36).slice(2);
  return s.slice(0, 32);
}

export function useGoogleAuth(onIdToken: (idToken: string, accessToken: string) => void) {
  // nonce estable durante la vida del request (obligatorio para id_token)
  const [nonce] = useState(genNonce);
  // ANDROID va aparte: Google NO admite el flujo implícito en clientes de tipo
  // Android ("Set the parameter value to `code` for installed applications" —
  // developers.google.com/identity/protocols/oauth2/native-app). Mandarle
  // 'id_token token' devuelve 400 invalid_request. Se usa authorization-code
  // con PKCE (el default del provider), que igual entrega idToken Y accessToken
  // en response.authentication, que es lo que register-google necesita.
  // iOS y WEB conservan EXACTAMENTE el flujo anterior (no se tocan).
  const esAndroid = Platform.OS === 'android';
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

  return {
    promptAsync,
    available: googleConfigured && !!request,
  };
}
