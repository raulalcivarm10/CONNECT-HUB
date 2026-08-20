import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';
import type { SectionListRenderItem } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import type { MiEntrada } from '@connecthub/shared-types';
import { Screen, AppText, Skeleton, Button } from '@/design-system/components';
import { useTheme } from '@/design-system/theme';
import { radius, spacing } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { usePullToRefresh } from '@/lib/pull-to-refresh';
import { useMisEntradas } from '@/api/entradas';
import { weekday, dayNum, shortDate, todayKey } from '@/lib/fecha';
import { AgendaCalendario, EntradaCard } from '@/features/agenda/AgendaCalendario';

type Vista = 'lista' | 'calendario';
type Seccion = { title: string; data: MiEntrada[]; past: boolean };

// Fuera del componente: identidades estables → la SectionList no rehace sus
// celdas en cada render del padre.
// (se mantiene el sufijo de índice del original: una entrada puede repetirse
// dentro de un día si el backend devuelve la fecha duplicada en `dias`)
const agendaKey = (item: MiEntrada, i: number) => `${item.idEventoUsuario}-${i}`;
const LISTA_PAD = { paddingBottom: spacing['3xl'] };
const SANGRIA = { marginLeft: 58 };

export default function Agenda() {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const router = useRouter();
  const [vista, setVista] = useState<Vista>('lista');
  const { data, isLoading, isError, refetch } = useMisEntradas();
  const { refrescando, onRefresh } = usePullToRefresh(refetch);

  // Refresco al enfocar la tab, PERO no en el montaje (useQuery ya trae los
  // datos) ni si se refrescó hace poco: antes cada toque en la tab disparaba
  // red + el spinner de RefreshControl + un re-render completo de la lista
  // (JSON nuevo ⇒ referencias nuevas), y eso es lo que se sentía como tirón.
  const ultimoRefresco = useRef(Date.now());
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - ultimoRefresco.current < 30_000) return;
      ultimoRefresco.current = Date.now();
      refetch();
    }, [refetch]),
  );

  const onEvento = useCallback(
    (id: number) => router.push({ pathname: '/evento/[id]', params: { id } }),
    [router],
  );
  const onQr = useCallback(
    (id: number) => router.push({ pathname: '/entrada/[id]', params: { id } }),
    [router],
  );

  // Lista agrupada por día: dentro de cada día ordena por hora; los días PRÓXIMOS
  // (>= hoy) primero en ascendente, luego los PASADOS en descendente.
  const sections = useMemo<Seccion[]>(() => {
    const byDay: Record<string, MiEntrada[]> = {};
    for (const e of data ?? []) for (const d of e.dias) (byDay[d] ??= []).push(e);
    for (const k of Object.keys(byDay)) {
      byDay[k].sort((a, b) => (a.horaInicio ?? '99').localeCompare(b.horaInicio ?? '99'));
    }
    const today = todayKey();
    const keys = Object.keys(byDay);
    const up = keys.filter((k) => k >= today).sort();
    const past = keys.filter((k) => k < today).sort().reverse();
    return [...up, ...past].map((day) => ({ title: day, data: byDay[day], past: day < today }));
  }, [data]);

  const vacio = !isLoading && !isError && (data?.length ?? 0) === 0;

  // renderItem / renderSectionHeader estables: si se declaran en línea, la
  // SectionList vuelve a renderizar TODAS las celdas en cada render del padre.
  const renderItem = useCallback<SectionListRenderItem<MiEntrada, Seccion>>(
    ({ item }) => (
      <View style={SANGRIA}>
        <EntradaCard item={item} onEvento={onEvento} onQr={onQr} />
      </View>
    ),
    [onEvento, onQr],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Seccion }) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm, backgroundColor: t.colors.bg, opacity: section.past ? 0.55 : 1 }}>
        <View style={{ width: 46, height: 46, borderRadius: radius.md, backgroundColor: t.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="label" color={t.colors.brandText} style={{ textTransform: 'uppercase' }}>
            {weekday(section.title, lang)}
          </AppText>
          <AppText variant="subtitle" color={t.colors.brandText}>{dayNum(section.title)}</AppText>
        </View>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="bodyStrong">{shortDate(section.title, lang)}</AppText>
          {section.past ? <AppText muted variant="caption">· {tr('agenda.past')}</AppText> : null}
        </View>
      </View>
    ),
    [t, lang, tr],
  );

  return (
    <Screen padded>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <AppText variant="display">{tr('agenda.title')}</AppText>
      </View>

      {/* Toggle Lista / Calendario */}
      {!vacio && !isLoading ? (
        <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.lg, backgroundColor: t.colors.surfaceAlt, marginBottom: spacing.md }}>
          {(['lista', 'calendario'] as const).map((v) => {
            const active = vista === v;
            return (
              <Pressable
                key={v}
                onPress={() => setVista(v)}
                style={{ flex: 1, height: 40, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: active ? t.colors.brand : 'transparent' }}
              >
                <Ionicons name={v === 'lista' ? 'list' : 'calendar'} size={16} color={active ? t.colors.onBrand : t.colors.textMuted} />
                <AppText variant="caption" color={active ? t.colors.onBrand : t.colors.textMuted} style={{ fontWeight: '600' }}>
                  {tr(v === 'lista' ? 'agenda.viewList' : 'agenda.viewCalendar')}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {isLoading ? (
        <View style={{ gap: spacing.md }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={80} radius={radius.lg} />)}
        </View>
      ) : isError ? (
        <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing['3xl'] }}>
          <AppText variant="subtitle">{tr('common.error')}</AppText>
          <Button title={tr('common.retry')} variant="secondary" onPress={() => refetch()} />
        </View>
      ) : vacio ? (
        <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: spacing['4xl'] }}>
          <Ionicons name="calendar-outline" size={48} color={t.colors.textFaint} />
          <AppText variant="subtitle">{tr('entradas.empty')}</AppText>
          <AppText muted variant="caption" style={{ textAlign: 'center', maxWidth: 260 }}>
            {tr('entradas.emptyDesc')}
          </AppText>
        </View>
      ) : vista === 'calendario' ? (
        <AgendaCalendario entradas={data ?? []} onEvento={onEvento} onQr={onQr} />
      ) : (
        <SectionList<MiEntrada, Seccion>
          sections={sections}
          keyExtractor={agendaKey}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={LISTA_PAD}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={t.colors.brand} />}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
        />
      )}
    </Screen>
  );
}
