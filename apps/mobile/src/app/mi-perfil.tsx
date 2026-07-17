import { useCallback } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, Chip, Skeleton } from '@/design-system/components';
import { Avatar } from '@/design-system/avatar';
import { useTheme } from '@/design-system/theme';
import { radius, spacing, fontWeight } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useMiPerfil } from '@/api/perfil';
import { useAuth } from '@/store/auth';

/** Fila de dato: ícono en círculo, etiqueta arriba y valor (o "sin especificar"). */
function InfoRow({
  icon,
  label,
  value,
  onPress,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | null;
  onPress?: () => void;
  first?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const has = !!value;
  return (
    <Pressable
      onPress={has ? onPress : undefined}
      disabled={!has || !onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: t.colors.border,
        opacity: pressed && has && onPress ? 0.6 : 1,
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: t.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={t.colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText muted variant="caption">{label}</AppText>
        <AppText color={has ? undefined : t.colors.textFaint} numberOfLines={2}>
          {has ? value : tr('profile.notSet')}
        </AppText>
      </View>
      {has && onPress ? <Ionicons name="open-outline" size={16} color={t.colors.textFaint} /> : null}
    </Pressable>
  );
}

export default function MiPerfil() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const { data: p, isLoading, refetch } = useMiPerfil();
  const userId = useAuth((s) => s.user?.id);
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/perfil'))} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color={t.colors.text} />
      </Pressable>
      <AppText variant="title">{tr('profile.myProfile')}</AppText>
    </View>
  );

  if (isLoading || !p) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
        {header}
        <View style={{ alignItems: 'center', gap: spacing.md, padding: spacing.xl }}>
          <Skeleton width={104} height={104} radius={radius.full} />
          <Skeleton width="60%" height={22} />
          <Skeleton width="40%" height={16} />
        </View>
      </SafeAreaView>
    );
  }

  const nombre = [p.nombre, p.apellido].filter(Boolean).join(' ').trim() || p.email;
  const esPublico = p.visibilidad !== 'PRIVADO';
  const incompleto = !p.profesion && !p.empresa && !p.bio && !p.linkedinUrl;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg }}>
        {/* Cabecera con foto (tocar = editar) */}
        <View style={{ alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm }}>
          <Pressable onPress={() => router.push('/editar-perfil')} hitSlop={6}>
            <Avatar nombre={nombre} fotoUrl={p.fotoUrl} size={104} />
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 32,
                height: 32,
                borderRadius: radius.full,
                backgroundColor: t.colors.brand,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: t.colors.bg,
              }}
            >
              <Ionicons name="pencil" size={14} color={t.colors.onBrand} />
            </View>
          </Pressable>
          <AppText variant="title" style={{ textAlign: 'center', marginTop: spacing.sm }}>{nombre}</AppText>
          {p.profesion ? <AppText color={t.colors.brandText} variant="bodyStrong">{p.profesion}</AppText> : null}
          {p.empresa ? <AppText muted>{p.empresa}</AppText> : null}
          <View style={{ marginTop: spacing.xs }}>
            <Chip label={esPublico ? tr('profile.public') : tr('profile.private')} tone={esPublico ? 'success' : 'warning'} />
          </View>
        </View>

        {/* Aviso de completar (solo si faltan datos de networking) */}
        {incompleto ? (
          <Card style={{ padding: spacing.lg, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Ionicons name="sparkles-outline" size={22} color={t.colors.brand} />
            <AppText muted style={{ flex: 1 }}>{tr('profile.completeHint')}</AppText>
          </Card>
        ) : null}

        {/* Bio */}
        {p.bio ? (
          <Card style={{ padding: spacing.lg, gap: spacing.xs }}>
            <AppText muted variant="caption">{tr('profile.bio')}</AppText>
            <AppText style={{ lineHeight: 22 }}>{p.bio}</AppText>
          </Card>
        ) : null}

        {/* Datos */}
        <Card style={{ overflow: 'hidden' }}>
          <InfoRow first icon="mail-outline" label={tr('auth.email')} value={p.email} />
          <InfoRow icon="call-outline" label={tr('profile.phone')} value={p.numeroCelular} />
          <InfoRow icon="briefcase-outline" label={tr('profile.profession')} value={p.profesion} />
          <InfoRow icon="business-outline" label={tr('profile.company')} value={p.empresa} />
          <InfoRow
            icon="logo-linkedin"
            label="LinkedIn"
            value={p.linkedinUrl}
            onPress={() => p.linkedinUrl && Linking.openURL(p.linkedinUrl).catch(() => {})}
          />
          <InfoRow
            icon={esPublico ? 'earth-outline' : 'lock-closed-outline'}
            label={tr('profile.visibility')}
            value={esPublico ? tr('profile.public') : tr('profile.private')}
          />
        </Card>

        {/* Acciones */}
        <View style={{ gap: spacing.sm }}>
          <Button title={tr('profile.editTitle')} onPress={() => router.push('/editar-perfil')} />
          {userId ? (
            <Pressable
              onPress={() => router.push({ pathname: '/asistente/[idCliente]', params: { idCliente: userId } })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.xs,
                paddingVertical: spacing.md,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name="eye-outline" size={18} color={t.colors.brandText} />
              <AppText color={t.colors.brandText} style={{ fontWeight: fontWeight.semibold }}>{tr('profile.previewAsOthers')}</AppText>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
