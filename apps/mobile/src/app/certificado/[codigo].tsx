import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Certificado } from '@connecthub/shared-types';
import { AppText, Button } from '@/design-system/components';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, shadow, fontSize, fontWeight } from '@/design-system/tokens';
import { useI18n, StringKey, Lang } from '@/i18n';
import { useCertificado } from '@/api/entradas';
import { API_BASE } from '@/api/client';
import { shortDate } from '@/lib/fecha';
import LogoIcon from '@/assets/logo-icon.svg';

export default function CertificadoView() {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const router = useRouter();
  const { codigo } = useLocalSearchParams<{ codigo: string }>();
  const { data, isLoading, isError } = useCertificado(codigo);
  const [imgError, setImgError] = useState(false);
  const [aspect, setAspect] = useState(1.414);

  const imagenUrl = `${API_BASE}/public/certificados/${encodeURIComponent(codigo)}/imagen`;
  const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://connecthub.fourstacklabs.com').replace(/\/$/, '');
  const landingUrl = `${WEB_URL}/c/${encodeURIComponent(codigo)}`;

  // LinkedIn "Add to profile" (estilo Credly): prellena la certificación en el perfil.
  function abrirLinkedin() {
    if (!data) return;
    const params: Record<string, string | undefined> = {
      startTask: 'CERTIFICATION_NAME',
      name: data.tituloEvento ?? tr('cert.title'),
      organizationName: data.institucion ?? undefined,
      issueYear: data.fechaEmision?.slice(0, 4),
      issueMonth: data.fechaEmision ? String(Number(data.fechaEmision.slice(5, 7))) : undefined,
      certUrl: landingUrl,
      certId: data.codigo,
    };
    const q = Object.entries(params)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    void Linking.openURL(`https://www.linkedin.com/profile/add?${q}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.lg }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/entradas'))} hitSlop={10}>
            <Ionicons name="close" size={28} color={t.colors.textMuted} />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.colors.brand} />
          </View>
        ) : isError || !data ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="subtitle">{tr('common.error')}</AppText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}>
            {!imgError ? (
              // Imagen renderizada del certificado (plantilla + overlay). Fallback a la
              // tarjeta dibujada si el evento no tiene plantilla configurada (404).
              <Animated.View
                entering={FadeIn.duration(400)}
                style={[{ borderRadius: radius['2xl'], overflow: 'hidden', backgroundColor: palette.white }, shadow.floating]}
              >
                <Image
                  source={{ uri: imagenUrl }}
                  style={{ width: '100%', aspectRatio: aspect, backgroundColor: palette.white }}
                  contentFit="contain"
                  onError={() => setImgError(true)}
                  onLoad={(e) => {
                    const w = e.source?.width;
                    const h = e.source?.height;
                    if (w && h) setAspect(w / h);
                  }}
                />
              </Animated.View>
            ) : (
              <TarjetaDibujada data={data} tr={tr} lang={lang} />
            )}

            <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
              <Button title={tr('cert.shareLinkedin')} onPress={abrirLinkedin} />
              <Button title={tr('cert.download')} variant="secondary" onPress={() => void Linking.openURL(imagenUrl)} />
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

/** Fallback dibujado (cuando el evento no tiene plantilla-imagen). */
function TarjetaDibujada({
  data,
  tr,
  lang,
}: {
  data: Certificado;
  tr: (k: StringKey) => string;
  lang: Lang;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={[
        { borderRadius: radius['2xl'], overflow: 'hidden', backgroundColor: palette.white, borderWidth: 2, borderColor: palette.brand200 },
        shadow.floating,
      ]}
    >
      <LinearGradient
        colors={[palette.brand700, palette.brand500, palette.violet500]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm }}
      >
        <View style={{ width: 56, height: 56, borderRadius: radius.lg, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' }}>
          <LogoIcon width={34} height={34} />
        </View>
        <AppText color={palette.white} variant="label" style={{ letterSpacing: 3, textTransform: 'uppercase' }}>
          {tr('cert.title')}
        </AppText>
      </LinearGradient>

      <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.md }}>
        <AppText color={palette.slate500} style={{ textAlign: 'center' }}>{tr('cert.awards')}</AppText>
        <AppText style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.heavy, color: palette.brand700, textAlign: 'center' }}>
          {data.nombreAsistente}
        </AppText>
        <AppText color={palette.slate500} style={{ textAlign: 'center' }}>{tr('cert.attended')}</AppText>
        <AppText style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: palette.slate900, textAlign: 'center' }}>
          {data.tituloEvento}
        </AppText>
        {data.institucion ? (
          <AppText color={palette.slate600} style={{ textAlign: 'center' }}>{data.institucion}</AppText>
        ) : null}

        <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: palette.slate200, marginVertical: spacing.md }} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' }}>
          <View>
            <AppText color={palette.slate400} variant="label" style={{ textTransform: 'uppercase' }}>{tr('cert.code')}</AppText>
            <AppText color={palette.slate700} style={{ fontWeight: fontWeight.semibold, letterSpacing: 1 }}>{data.codigo}</AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Ionicons name="ribbon" size={22} color={palette.brand600} />
            <AppText color={palette.slate500} variant="caption">{shortDate(data.fechaEmision, lang)}</AppText>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
