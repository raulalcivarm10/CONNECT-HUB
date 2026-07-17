/**
 * Almacenamiento de tokens platform-aware: SecureStore (keychain/keystore) en
 * nativo, localStorage en web (SecureStore no soporta web). Los tokens NUNCA
 * van en el store persistido de Zustand; viven aquí.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS = 'ch.asist.access';
const REFRESH = 'ch.asist.refresh';

const isWeb = Platform.OS === 'web';

async function setItem(key: string, value: string) {
  if (isWeb) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function delItem(key: string) {
  if (isWeb) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveTokens(accessToken: string, refreshToken: string) {
  await Promise.all([setItem(ACCESS, accessToken), setItem(REFRESH, refreshToken)]);
}

export async function loadTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const [accessToken, refreshToken] = await Promise.all([getItem(ACCESS), getItem(REFRESH)]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function clearTokens() {
  await Promise.all([delItem(ACCESS), delItem(REFRESH)]);
}

/* Helpers genéricos para otros tokens de sesión (p.ej. servicio de pagos). */
export function setStoredItem(key: string, value: string) {
  return setItem(key, value);
}
export function getStoredItem(key: string) {
  return getItem(key);
}
export function removeStoredItem(key: string) {
  return delItem(key);
}
