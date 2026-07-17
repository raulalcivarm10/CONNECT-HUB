import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import type { MiEntrada } from '@connecthub/shared-types';
import { Screen, AppText, Chip, Skeleton, Button } from '@/design-system/components';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, shadow, fontWeight } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useMisEntradas } from '@/api/entradas';
import { weekday, dayNum, shortDate } from '@/lib/fecha';

export default function Agenda() {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useMisEntradas();
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Agrupar entradas adquiridas por día (una entrada puede abarcar varios días).
  const sections = useMemo(() => {
    const byDay: Record<string, MiEntrada[]> = {};
    for (const e of data ?? []) {
      for (const d of e.dias) (byDay[d] ??= []).push(e);
    }
    return Object.keys(byDay)
      .sort()
      .map((day) => ({ title: day, data: byDay[day] }));
  }, [data]);

  return (
    <Screen padded>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <AppText variant="display">{tr('agenda.title')}</AppText>
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={80} radius={radius.lg} />
          ))}
        </View>
      ) : isError ? (
        <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing['3xl'] }}>
          <AppText variant="subtitle">{tr('common.error')}</AppText>
          <Button title={tr('common.retry')} variant="secondary" onPress={() => refetch()} />
        </View>
      ) : sections.length === 0 ? (
        <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: spacing['4xl'] }}>
          <Ionicons name="calendar-outline" size={48} color={t.colors.textFaint} />
          <AppText variant="subtitle">{tr('entradas.empty')}</AppText>
          <AppText muted variant="caption" style={{ textAlign: 'center', maxWidth: 260 }}>
            {tr('entradas.emptyDesc')}
          </AppText>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => `${item.idEventoUsuario}-${i}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={t.colors.brand} />
          }
          renderSectionHeader={({ section }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingTop: spacing.lg,
                paddingBottom: spacing.sm,
                backgroundColor: t.colors.bg,
              }}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: radius.md,
                  backgroundColor: t.colors.brandSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppText variant="label" color={t.colors.brandText} style={{ textTransform: 'uppercase' }}>
                  {weekday(section.title, lang)}
                </AppText>
                <AppText variant="subtitle" color={t.colors.brandText}>
                  {dayNum(section.title)}
                </AppText>
              </View>
              <AppText variant="bodyStrong">{shortDate(section.title, lang)}</AppText>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/evento/[id]', params: { id: item.idEvento } })}
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  backgroundColor: t.colors.card,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: t.colors.border,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                  marginLeft: 58,
                },
                shadow.card,
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
                  {item.esWorkshop ? <Chip label={tr('entradas.workshop')} tone="brand" /> : null}
                  {item.asistio ? <Chip label={tr('entradas.attended')} tone="success" /> : null}
                </View>
                <AppText variant="bodyStrong" numberOfLines={2}>{item.titulo}</AppText>
                <AppText muted variant="caption">
                  {item.horaInicio && item.horaFin ? `${item.horaInicio} – ${item.horaFin}` : ''}
                  {item.salonNombre ? `${item.horaInicio ? ' · ' : ''}${item.salonNombre}` : ''}
                </AppText>
              </View>
              <Pressable
                onPress={() => router.push({ pathname: '/entrada/[id]', params: { id: item.idEventoUsuario } })}
                hitSlop={8}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.md,
                  backgroundColor: t.colors.brandSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="qr-code" size={20} color={t.colors.brand} />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
