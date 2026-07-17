import { FlatList, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InstitucionResumen } from '@connecthub/shared-types';
import { AppText, Button, Skeleton } from '@/design-system/components';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, shadow, fontWeight } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useInstitucion } from '@/store/institucion';
import { useMisInstituciones } from '@/api/catalogo';
import { absoluteUrl } from '@/api/client';

function Row({ inst, active, onPress }: { inst: InstitucionResumen; active: boolean; onPress: () => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const inicial = (inst.nombre ?? 'C').trim().charAt(0).toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radius.lg,
          borderWidth: 1.5,
          borderColor: active ? t.colors.brand : t.colors.border,
          backgroundColor: active ? t.colors.brandSoft : t.colors.card,
        },
      ]}
    >
      {inst.logoUrl ? (
        <Image
          source={{ uri: absoluteUrl(inst.logoUrl) }}
          style={{ width: 46, height: 46, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt }}
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: radius.md,
            backgroundColor: t.colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText color={palette.white} style={{ fontWeight: fontWeight.heavy, fontSize: 18 }}>
            {inicial}
          </AppText>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>{inst.nombre}</AppText>
        {inst.ciudad || inst.pais ? (
          <AppText muted variant="caption" numberOfLines={1}>
            {[inst.ciudad, inst.pais].filter(Boolean).join(', ')}
          </AppText>
        ) : null}
      </View>
      {active ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="checkmark-circle" size={20} color={t.colors.brand} />
          <AppText variant="caption" color={t.colors.brandText} style={{ fontWeight: fontWeight.semibold }}>
            {tr('inst.active')}
          </AppText>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
      )}
    </Pressable>
  );
}

export default function Instituciones() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const filtro = useInstitucion((s) => s.filtro);
  const setFiltro = useInstitucion((s) => s.setFiltro);
  const { data, isLoading } = useMisInstituciones();
  const multiple = (data?.length ?? 0) > 1;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md }}>
          <AppText variant="title">{tr('inst.title')}</AppText>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={26} color={t.colors.textMuted} />
          </Pressable>
        </View>

        <FlatList
          data={data ?? []}
          keyExtractor={(i) => String(i.idInstitucion)}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            multiple ? (
              <Pressable
                onPress={() => {
                  setFiltro(null);
                  router.replace('/(tabs)');
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                  borderRadius: radius.lg,
                  borderWidth: 1.5,
                  borderColor: filtro === null ? t.colors.brand : t.colors.border,
                  backgroundColor: filtro === null ? t.colors.brandSoft : t.colors.card,
                }}
              >
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: radius.md,
                    backgroundColor: t.colors.brand,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="apps" size={22} color={palette.white} />
                </View>
                <AppText variant="bodyStrong" style={{ flex: 1 }}>{tr('home.scopeAll')}</AppText>
                {filtro === null ? (
                  <Ionicons name="checkmark-circle" size={20} color={t.colors.brand} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
                )}
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <Row
              inst={item}
              active={filtro === item.idInstitucion}
              onPress={() => {
                setFiltro(item.idInstitucion);
                router.replace('/(tabs)');
              }}
            />
          )}
          ListEmptyComponent={
            isLoading ? (
              <View style={{ gap: spacing.sm }}>
                {[0, 1].map((i) => (
                  <Skeleton key={i} height={74} radius={radius.lg} />
                ))}
              </View>
            ) : null
          }
        />

        <View style={{ paddingVertical: spacing.md, ...shadow.card }}>
          <Button
            title={`＋  ${tr('inst.add')}`}
            variant="secondary"
            onPress={() => router.push('/onboarding')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
