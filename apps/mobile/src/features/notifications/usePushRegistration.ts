/**
 * Registra el Expo push token del dispositivo cuando hay sesión. Solo corre en
 * NATIVO en un dispositivo real (no en web ni simulador). Falla en silencio si
 * faltan permisos o el projectId de EAS (dev sin build).
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useAuth } from '@/store/auth';
import { registrarPushToken } from '@/api/push';

// Muestra la notificación aunque la app esté en primer plano.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushRegistration() {
  const status = useAuth((s) => s.status);
  useEffect(() => {
    if (status !== 'authed' || Platform.OS === 'web' || !Device.isDevice) return;
    (async () => {
      try {
        let granted = (await Notifications.getPermissionsAsync()).status === 'granted';
        if (!granted) {
          granted = (await Notifications.requestPermissionsAsync()).status === 'granted';
        }
        if (!granted) return;
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
        const token = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        await registrarPushToken(token.data, Platform.OS);
      } catch {
        /* sin permiso / sin projectId / no-device → ignora */
      }
    })();
  }, [status]);
}
