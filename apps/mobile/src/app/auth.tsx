import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { AppText, Button, Card } from '@/design-system/components';
import { useTheme, useThemeMode, palette } from '@/design-system/theme';
import { radius, spacing, fontSize, fontWeight, shadow } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useConfirm } from '@/design-system/confirm';
import { useAuth } from '@/store/auth';
import { verifyReq, forgotReq } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useGoogleAuth } from '@/features/auth/useGoogleAuth';
import { LoginHero } from '@/features/auth/LoginHero';

type Mode = 'login' | 'register';

function Field({
  icon,
  secureTextEntry,
  ...props
}: { icon: keyof typeof Ionicons.glyphMap } & React.ComponentProps<typeof TextInput>) {
  const t = useTheme();
  // Campos de contraseña: ojo para mostrar/ocultar lo que se escribe.
  const isPassword = !!secureTextEntry;
  const [reveal, setReveal] = useState(false);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        height: 52,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderColor: t.colors.border,
        backgroundColor: t.colors.surface,
        paddingHorizontal: spacing.md,
      }}
    >
      <Ionicons name={icon} size={18} color={t.colors.textFaint} />
      <TextInput
        placeholderTextColor={t.colors.textFaint}
        style={{ flex: 1, color: t.colors.text, fontSize: fontSize.md }}
        secureTextEntry={isPassword && !reveal}
        {...props}
      />
      {isPassword ? (
        <Pressable onPress={() => setReveal((v) => !v)} hitSlop={10}>
          <Ionicons
            name={reveal ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={t.colors.textFaint}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Auth() {
  const t = useTheme();
  const themeMode = useThemeMode();
  const { t: tr } = useI18n();
  const confirm = useConfirm();
  const router = useRouter();
  const register = useAuth((s) => s.register);
  const login = useAuth((s) => s.login);
  const googleSignIn = useAuth((s) => s.google);
  const appleSignIn = useAuth((s) => s.apple);
  const [appleAvailable, setAppleAvailable] = useState(false);

  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  // Abre en LOGIN salvo que se pida registro explícitamente (?mode=register).
  // Antes abría en registro y quien ya tenía cuenta escribía sus credenciales
  // en el formulario equivocado ("el correo ya existe"); asi le paso al revisor
  // de Google Play. Registrarse sigue a un toque, con el enlace de abajo.
  const [mode, setMode] = useState<Mode>(modeParam === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const isRegister = mode === 'register';

  // Recuperar contraseña: dispara el correo con el enlace de reset (nuestro
  // backend /public/auth/forgot + SMTP propio). La clave nueva se pone en la
  // página web /reset a la que apunta el correo. No revela si el correo existe.
  async function onForgot() {
    const dest = email.trim();
    if (!dest) {
      await confirm({ title: tr('auth.forgot'), message: tr('auth.forgotNeedEmail'), confirmText: tr('common.close'), icon: 'mail-outline' });
      return;
    }
    setForgotLoading(true);
    setError(null);
    try {
      await forgotReq(dest);
    } catch {
      /* respuesta uniforme: nunca revela si el correo existe */
    } finally {
      setForgotLoading(false);
    }
    await confirm({ title: tr('auth.forgotSent'), message: tr('auth.forgotSentBody'), confirmText: tr('common.close'), icon: 'mail-outline' });
  }

  const onGoogleToken = useCallback(
    async (idToken: string, accessToken: string) => {
      setError(null);
      try {
        await googleSignIn(idToken, accessToken);
        router.replace('/');
      } catch (e) {
        setError(e instanceof ApiError ? e.message : tr('common.error'));
      }
    },
    [googleSignIn, router, tr],
  );
  const google = useGoogleAuth(onGoogleToken);

  // Sign in with Apple: solo iOS y si el dispositivo lo soporta (Apple 4.8).
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const onApplePress = useCallback(async () => {
    setError(null);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) throw new ApiError(401, 'no identity token');
      await appleSignIn({
        identityToken: cred.identityToken,
        // Apple entrega email/nombre SOLO la primera vez → se reenvían al backend.
        email: cred.email ?? undefined,
        nombre: cred.fullName?.givenName ?? undefined,
        apellido: cred.fullName?.familyName ?? undefined,
      });
      router.replace('/');
    } catch (e) {
      // El usuario canceló el diálogo de Apple → no es error.
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      setError(e instanceof ApiError ? e.message : tr('common.error'));
    }
  }, [appleSignIn, router, tr]);

  function mapError(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 401) return tr('auth.invalidCreds');
      if (e.status === 409) return tr('auth.emailTaken');
      if (e.status === 400) return tr('auth.weakPassword');
    }
    return tr('common.error');
  }

  async function submit() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      if (isRegister) {
        const res = await register({
          email: email.trim(),
          password,
          nombre: nombre.trim() || undefined,
          apellido: apellido.trim() || undefined,
        });
        if (res.devVerificationToken) setDevToken(res.devVerificationToken);
        else router.replace('/');
      } else {
        await login({ email: email.trim(), password });
        router.replace('/');
      }
    } catch (e) {
      setError(mapError(e));
    } finally {
      setLoading(false);
    }
  }

  async function doVerify() {
    if (!devToken) return;
    try {
      await verifyReq(devToken);
      setVerified(true);
    } catch {
      /* noop */
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {/* Hero de marca animado (logo intacto + ondas + diamantes flotando) */}
      <LoginHero isRegister={isRegister} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <AppText variant="title">{isRegister ? tr('auth.signUp') : tr('auth.signIn')}</AppText>

          <Animated.View entering={FadeIn.duration(300)} style={{ gap: spacing.md }}>
            {isRegister && (
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field icon="person-outline" placeholder={tr('auth.name')} value={nombre} onChangeText={setNombre} autoCapitalize="words" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field icon="person-outline" placeholder={tr('auth.lastName')} value={apellido} onChangeText={setApellido} autoCapitalize="words" />
                </View>
              </View>
            )}
            <Field
              icon="mail-outline"
              placeholder={tr('auth.email')}
              value={email}
              onChangeText={(v) => { setEmail(v); if (error) setError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
            />
            <Field
              icon="lock-closed-outline"
              placeholder={tr('auth.password')}
              value={password}
              onChangeText={(v) => { setPassword(v); if (error) setError(null); }}
              secureTextEntry
              onSubmitEditing={submit}
              returnKeyType="go"
            />

            {error ? <AppText color={t.colors.danger} variant="caption">{error}</AppText> : null}

            <Button
              title={isRegister ? tr('auth.signUp') : tr('auth.signIn')}
              onPress={submit}
              loading={loading}
              disabled={!email.trim() || !password}
              style={{ marginTop: spacing.sm }}
            />

            {/* Recuperar contraseña — solo en modo login */}
            {!isRegister ? (
              <Pressable
                onPress={onForgot}
                disabled={forgotLoading}
                hitSlop={8}
                style={{ alignSelf: 'center', paddingVertical: spacing.xs, opacity: forgotLoading ? 0.5 : 1 }}
              >
                <AppText variant="caption" color={t.colors.brandText} style={{ fontWeight: fontWeight.semibold }}>
                  {tr('auth.forgot')}
                </AppText>
              </Pressable>
            ) : null}
          </Animated.View>

          {/* Divisor */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.sm }}>
            <View style={{ flex: 1, height: 1, backgroundColor: t.colors.border }} />
            <AppText muted variant="caption">{tr('auth.or')}</AppText>
            <View style={{ flex: 1, height: 1, backgroundColor: t.colors.border }} />
          </View>

          {/* Google — solo en Android (y web para pruebas); en iOS se usa Apple */}
          {Platform.OS !== 'ios' ? (
            <>
              <Pressable
                onPress={() => google.available && google.promptAsync()}
                disabled={!google.available}
                style={({ pressed }) => ({
                  height: 52,
                  borderRadius: radius.lg,
                  borderWidth: 1.5,
                  borderColor: t.colors.border,
                  backgroundColor: t.colors.surface,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.sm,
                  opacity: google.available ? (pressed ? 0.85 : 1) : 0.5,
                })}
              >
                <Ionicons name="logo-google" size={20} color="#EA4335" />
                <AppText variant="bodyStrong">{tr('auth.continueGoogle')}</AppText>
              </Pressable>
              {!google.available ? (
                <AppText muted variant="caption" style={{ textAlign: 'center' }}>
                  {tr('auth.googleUnavailable')}
                </AppText>
              ) : null}
            </>
          ) : null}

          {/* Sign in with Apple — solo iOS (requisito App Store 4.8) */}
          {Platform.OS === 'ios' && appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                themeMode === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.lg}
              style={{ height: 52, width: '100%' }}
              onPress={onApplePress}
            />
          ) : null}

          {/* Verificación dev */}
          {devToken ? (
            <Animated.View entering={FadeInDown}>
              <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
                <AppText variant="bodyStrong">{verified ? tr('auth.verified') : tr('auth.verifyPending')}</AppText>
                {verified ? (
                  <Button title={tr('auth.continue')} onPress={() => router.replace('/')} />
                ) : (
                  <>
                    <AppText muted variant="caption">{tr('auth.devToken')} {devToken.slice(0, 12)}…</AppText>
                    <Button title={tr('auth.verifyNow')} variant="secondary" onPress={doVerify} />
                    <Button title={tr('auth.continue')} variant="ghost" onPress={() => router.replace('/')} />
                  </>
                )}
              </Card>
            </Animated.View>
          ) : null}

          {/* Toggle modo */}
          <Pressable
            onPress={() => { setMode(isRegister ? 'login' : 'register'); setError(null); }}
            style={{ alignSelf: 'center', marginTop: spacing.sm, paddingVertical: spacing.sm }}
          >
            <AppText color={t.colors.brandText} style={{ fontWeight: fontWeight.semibold }}>
              {isRegister ? tr('auth.haveAccount') : tr('auth.noAccount')}
            </AppText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
