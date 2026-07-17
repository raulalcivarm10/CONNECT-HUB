/** Registro del Expo push token del dispositivo (auth). */
import { apiPost } from './client';

export function registrarPushToken(expoToken: string, platform?: string) {
  return apiPost<{ ok: boolean }>('/public/push/registrar', { expoToken, platform }, true);
}
