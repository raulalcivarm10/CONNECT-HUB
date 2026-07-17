import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { AppText, Button } from '@/design-system/components';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, fontSize, fontWeight, shadow } from '@/design-system/tokens';
import LogoIcon from '@/assets/logo-icon.svg';
import { useI18n } from '@/i18n';
import { useInstitucion } from '@/store/institucion';
import { vincularInstitucion } from '@/api/catalogo';
import { ApiError } from '@/api/client';

export default function Onboarding() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const setInstitucion = useInstitucion((s) => s.setInstitucion);
  const qc = useQueryClient();

  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const code = codigo.trim();
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      const inst = await vincularInstitucion(code);
      setInstitucion(inst);
      // refresca la lista de instituciones (chips/switcher) y el feed agregado
      qc.invalidateQueries({ queryKey: ['mias'] });
      qc.invalidateQueries({ queryKey: ['mis-eventos'] });
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? tr('common.error') : tr('onboarding.invalid'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {/* Hero con gradiente de marca */}
      <LinearGradient
        colors={[palette.brand700, palette.brand500, palette.violet500]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: '48%', justifyContent: 'flex-end', padding: spacing.xl }}
      >
        <SafeAreaView edges={['top']}>
          {router.canGoBack() ? (
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={{ alignSelf: 'flex-end', marginBottom: spacing.sm }}
            >
              <Ionicons name="close" size={26} color="rgba(255,255,255,0.9)" />
            </Pressable>
          ) : null}
          <Animated.View entering={FadeIn.duration(500)}>
            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: radius.lg,
                backgroundColor: palette.white,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.lg,
                ...shadow.card,
              }}
            >
              <LogoIcon width={40} height={40} />
            </View>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(120).duration(500)}>
            <AppText variant="display" color={palette.white} style={{ fontSize: fontSize['4xl'] }}>
              ConnectHub
            </AppText>
            <AppText color="rgba(255,255,255,0.85)" variant="subtitle" style={{ marginTop: spacing.sm }}>
              {tr('onboarding.subtitle')}
            </AppText>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>

      {/* Formulario */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Animated.View
          entering={FadeInDown.delay(220).duration(500)}
          style={{ flex: 1, padding: spacing.xl, gap: spacing.lg }}
        >
          <AppText variant="title">{tr('onboarding.title')}</AppText>

          <View>
            <TextInput
              value={codigo}
              onChangeText={(v) => {
                setCodigo(v);
                if (error) setError(null);
              }}
              placeholder={tr('onboarding.placeholder')}
              placeholderTextColor={t.colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={submit}
              style={{
                height: 56,
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderColor: error ? t.colors.danger : t.colors.border,
                backgroundColor: t.colors.surface,
                paddingHorizontal: spacing.lg,
                color: t.colors.text,
                fontSize: fontSize.lg,
                fontWeight: fontWeight.semibold,
                letterSpacing: 1,
              }}
            />
            {error ? (
              <AppText color={t.colors.danger} variant="caption" style={{ marginTop: spacing.sm }}>
                {error}
              </AppText>
            ) : (
              <AppText muted variant="caption" style={{ marginTop: spacing.sm }}>
                {tr('onboarding.hint')}
              </AppText>
            )}
          </View>

          <Button
            title={tr('onboarding.cta')}
            onPress={submit}
            loading={loading}
            disabled={!codigo.trim()}
          />

          <Pressable
            onPress={() => {
              setCodigo('DEMO123');
              setError(null);
            }}
            style={{ alignSelf: 'center', paddingVertical: spacing.sm }}
          >
            <AppText muted variant="caption">
              Demo: DEMO123
            </AppText>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
