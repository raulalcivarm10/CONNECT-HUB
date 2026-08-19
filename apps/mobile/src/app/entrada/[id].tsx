import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppText, Chip } from '@/design-system/components';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, shadow } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useEntradaQr } from '@/api/entradas';

export default function EntradaQr() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useEntradaQr(Number(id));

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {/* Android edge-to-edge (targetSdk 36): en pantallas bajas el pie del
          contenido centrado (token del QR) quedaba tras la barra del sistema.
          iOS queda intacto. */}
      <SafeAreaView edges={Platform.OS === 'android' ? ['top', 'bottom'] : ['top']} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.lg }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/entradas'))} hitSlop={10}>
            <Ionicons name="close" size={28} color={t.colors.textMuted} />
          </Pressable>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.xl }}>
          {isLoading ? (
            <ActivityIndicator color={t.colors.brand} />
          ) : isError || !data ? (
            <AppText variant="subtitle">{tr('common.error')}</AppText>
          ) : (
            <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center', gap: spacing.xl }}>
              <View style={{ alignItems: 'center', gap: spacing.sm }}>
                <AppText variant="title" style={{ textAlign: 'center' }} numberOfLines={2}>
                  {data.titulo}
                </AppText>
                {data.asistio ? <Chip label={tr('entradas.attended')} tone="success" /> : null}
              </View>

              {/* QR sobre tarjeta blanca (para escaneo fiable) */}
              <View
                style={[
                  {
                    backgroundColor: palette.white,
                    padding: spacing.xl,
                    borderRadius: radius['2xl'],
                  },
                  shadow.floating,
                ]}
              >
                <QRCode
                  value={data.qrToken}
                  size={240}
                  color={palette.slate900}
                  backgroundColor={palette.white}
                />
              </View>

              <AppText muted style={{ textAlign: 'center' }}>
                {tr('entradas.qrHint')}
              </AppText>
              <AppText variant="caption" color={t.colors.textFaint} style={{ letterSpacing: 2 }}>
                {data.qrToken}
              </AppText>
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
