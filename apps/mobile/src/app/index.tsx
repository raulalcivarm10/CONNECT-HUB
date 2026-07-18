import { Redirect, type Href } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useInstitucion } from '@/store/institucion';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/design-system/theme';

/**
 * Gate de entrada. Orden del flujo:
 *   1) sin sesión → /auth (registro/login/Google + verificación)
 *   2) con sesión pero sin institución → /onboarding (ingresar código)
 *   3) con sesión + institución → /(tabs)
 */
export default function Gate() {
  const t = useTheme();
  const authReady = useAuth((s) => s.bootstrapped);
  const authed = useAuth((s) => s.status === 'authed');
  const user = useAuth((s) => s.user);
  const instHydrated = useInstitucion((s) => s.hydrated);
  const institucion = useInstitucion((s) => s.institucion);

  if (!authReady || !instHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bg }}>
        <ActivityIndicator color={t.colors.brand} />
      </View>
    );
  }
  if (!authed) return <Redirect href="/auth" />;
  // Correo/clave sin verificar → bloquea hasta confirmar (Apple/Google entran
  // verificados, así que isVerified es true para ellos).
  if (user && !user.isVerified) return <Redirect href={'/verificar-correo' as Href} />;
  if (!institucion) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
