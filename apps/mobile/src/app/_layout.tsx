import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/api/query-client';
import { useThemeMode } from '@/design-system/theme';
import { ConfirmProvider } from '@/design-system/confirm';
import { I18nProvider } from '@/i18n';
import { useInstitucion } from '@/store/institucion';
import { useAuth } from '@/store/auth';
import { usePushRegistration } from '@/features/notifications/usePushRegistration';

SplashScreen.preventAutoHideAsync().catch(() => {});

// La configuración del QueryClient (reintentos, staleTime, recuperación al
// volver a primer plano) vive en `src/api/query-client.ts`, junto al cliente HTTP.

export default function RootLayout() {
  const mode = useThemeMode();
  const hydrated = useInstitucion((s) => s.hydrated);
  const bootstrap = useAuth((s) => s.bootstrap);
  const status = useAuth((s) => s.status);
  const bootstrapped = useAuth((s) => s.bootstrapped);
  const router = useRouter();
  const segments = useSegments();
  usePushRegistration();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  // Sin sesión (logout o refresh expirado) → al login desde cualquier pantalla.
  useEffect(() => {
    if (!bootstrapped) return;
    const top = segments[0];
    const enAuth = top === 'auth' || top === 'onboarding' || top === undefined;
    if (status === 'idle' && !enAuth) router.replace('/auth');
  }, [status, bootstrapped, segments, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <ConfirmProvider>
            <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="verificar-correo" options={{ animation: 'fade' }} />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="evento/[id]"
                options={{ presentation: 'card', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="auth" options={{ animation: 'fade' }} />
              <Stack.Screen
                name="instituciones"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="entrada/[id]"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="certificado/[codigo]"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="checkout/[idEvento]"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="tarjetas"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="muro/[idEvento]" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="chat/[idChat]" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="asistente/[idCliente]" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="mi-perfil" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="editar-perfil" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="conexiones" options={{ animation: 'slide_from_right' }} />
            </Stack>
            </ConfirmProvider>
          </I18nProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
