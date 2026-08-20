/**
 * Registra el Expo push token del dispositivo cuando hay sesión. Solo corre en
 * NATIVO en un dispositivo real (no en web ni simulador). No es fatal: si falla,
 * la app sigue funcionando sin push, pero AVISA por consola con el motivo.
 *
 * OJO: antes este catch era mudo, y eso ocultó durante toda la preparación del
 * lanzamiento que en Android falta la configuración de FCM (no hay
 * `google-services.json` ni `android.googleServicesFile` en app.json, ambos
 * exigidos por Expo SDK 57). Si vuelves a ver el warning de abajo en Android,
 * es ese pendiente. Ver docs/handbook/06-tiendas-ios-android.md §12.
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
        if (Platform.OS === 'android') {
          // Android 13+ NO llega a mostrar el diálogo de permiso mientras no
          // exista al menos un canal, y el canal de reserva de expo solo se
          // crea al PRESENTAR una notificación — o sea, nunca en el arranque.
          // Sin esto, en Android ni se pide permiso ni suena nada.
          await Notifications.setNotificationChannelAsync('mensajes', {
            name: 'Mensajes',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
            vibrationPattern: [0, 250, 250, 250],
          }).catch(() => undefined);
        }
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
      } catch (e) {
        // No relanzamos: la app debe seguir usable sin push. Pero dejamos
        // rastro del motivo (sin permiso / sin projectId / FCM sin configurar).
        console.warn('[push] no se pudo registrar el token:', e);
      }
    })();
  }, [status]);
}
