import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { EventoResumen } from '@connecthub/shared-types';
import { AppText, Skeleton, Button, Chip } from '@/design-system/components';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, shadow, fontSize, fontWeight } from '@/design-system/tokens';
import { useI18n, LANGS } from '@/i18n';
import { useSettings } from '@/store/settings';
import { useInstitucion } from '@/store/institucion';
import { useDestacados, useEventos, useMisEventos, useMisInstituciones } from '@/api/catalogo';
import { absoluteUrl } from '@/api/client';
import { EventCard } from '@/features/eventos/cards';
import { resumenDias } from '@/lib/fecha';

type Filtro = 'all' | 'featured' | 'free';

/* ---------- Top bar ---------- */
function TopBar() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useI18n();
  const institucion = useInstitucion((s) => s.institucion);
  const filtro = useInstitucion((s) => s.filtro);
  const misInst = useMisInstituciones();
  const list = misInst.data ?? [];
  const hasMultiple = list.length > 1;
  const lang = useSettings((s) => s.lang);
  const setLang = useSettings((s) => s.setLang);

  const showAll = filtro === null && hasMultiple;
  const selected = filtro
    ? list.find((i) => i.idInstitucion === filtro)
    : list.length === 1
      ? list[0]
      : null;
  const nombre = showAll ? tr('home.scopeAll') : (selected?.nombre ?? institucion?.nombre ?? 'ConnectHub');
  const ciudad = showAll ? null : (selected?.ciudad ?? institucion?.ciudad ?? null);
  const logoUrl = showAll ? null : (selected?.logoUrl ?? institucion?.logoUrl ?? null);
  const inicial = (nombre || 'C').trim().charAt(0).toUpperCase();

  const cycleLang = () => {
    const i = LANGS.findIndex((l) => l.code === lang);
    setLang(LANGS[(i + 1) % LANGS.length].code);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
      <Pressable
        onPress={() => router.push('/instituciones')}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
      >
        {logoUrl ? (
          <Image
            source={{ uri: absoluteUrl(logoUrl) }}
            style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: t.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {showAll ? (
              <Ionicons name="apps" size={20} color={palette.white} />
            ) : (
              <AppText color={palette.white} style={{ fontWeight: fontWeight.heavy, fontSize: fontSize.lg }}>
                {inicial}
              </AppText>
            )}
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {nombre}
            </AppText>
            <Ionicons name="chevron-down" size={14} color={t.colors.textMuted} />
          </View>
          {ciudad ? (
            <AppText muted variant="caption" numberOfLines={1}>
              {ciudad}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        onPress={cycleLang}
        hitSlop={8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: spacing.md,
          height: 34,
          borderRadius: radius.full,
          backgroundColor: t.colors.surfaceAlt,
        }}
      >
        <Ionicons name="globe-outline" size={15} color={t.colors.textMuted} />
        <AppText variant="caption" style={{ fontWeight: fontWeight.bold, textTransform: 'uppercase' }}>
          {lang}
        </AppText>
      </Pressable>
    </View>
  );
}

/* ---------- Hero carousel ---------- */
function HeroCard({ evento, width }: { evento: EventoResumen; width: number }) {
  const router = useRouter();
  const { t: tr, lang } = useI18n();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/evento/[id]', params: { id: evento.id } })}
      style={[{ width, height: 200, borderRadius: radius.xl, overflow: 'hidden' }, shadow.card]}
    >
      <Image
        source={{ uri: evento.portadaUrl }}
        contentFit="cover"
        transition={300}
        style={{ width: '100%', height: '100%', backgroundColor: palette.slate800 }}
      />
      <LinearGradient
        colors={['transparent', 'rgba(8,13,26,0.25)', 'rgba(8,13,26,0.92)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '80%' }}
      />
      <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: 6 }}>
        <Chip label={resumenDias(evento.dias, lang)} tone="brand" />
        <AppText variant="subtitle" color={palette.white} numberOfLines={2}>
          {evento.titulo}
        </AppText>
        <AppText variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1}>
          {evento.precio ? `${tr('common.from')} $${evento.precio}` : tr('common.free')}
          {evento.salonNombre ? ` · ${evento.salonNombre}` : ''}
        </AppText>
      </View>
    </Pressable>
  );
}

function HeroCarousel({ items, loading }: { items: EventoResumen[]; loading: boolean }) {
  const { width: screenW } = useWindowDimensions();
  const cardW = screenW - spacing.lg * 2;
  const [active, setActive] = useState(0);
  const viewRef = useRef(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      if (viewableItems.length) setActive(viewableItems[0].index ?? 0);
    },
  );
  const t = useTheme();

  if (loading) return <Skeleton height={200} radius={radius.xl} />;
  if (!items.length) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <FlatList
        data={items}
        keyExtractor={(e) => `hero-${e.id}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardW + spacing.md}
        decelerationRate="fast"
        onViewableItemsChanged={viewRef.current}
        renderItem={({ item }) => <HeroCard evento={item} width={cardW} />}
        ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
      />
      {items.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {items.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === active ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === active ? t.colors.brand : t.colors.border,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ---------- Quick access grid ---------- */
function QuickTile({
  icon,
  label,
  color,
  active,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  active?: boolean;
  badge?: number;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.lg,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: active ? 2 : 0,
          borderColor: t.colors.text,
        }}
      >
        <Ionicons name={icon} size={26} color="#FFFFFF" />
        {badge ? (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              paddingHorizontal: 4,
              backgroundColor: t.colors.danger,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText color={palette.white} style={{ fontSize: 10, fontWeight: fontWeight.bold }}>
              {badge}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="caption" style={{ fontWeight: fontWeight.semibold }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/* ---------- Screen ---------- */
export default function Home() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const instFiltro = useInstitucion((s) => s.filtro);
  const setInstFiltro = useInstitucion((s) => s.setFiltro);
  const misInst = useMisInstituciones();
  const list = misInst.data ?? [];
  const hasMultiple = list.length > 1;

  const [filtro, setFiltro] = useState<Filtro>('all');

  // Robusto: SIN filtro = TODAS (feed agregado, solo necesita auth). CON filtro
  // pero la institución aún no está en la lista (cargando) o ya no es mía →
  // también cae al agregado, así el Home NUNCA queda vacío indebidamente.
  const selectedInst = instFiltro ? (list.find((i) => i.idInstitucion === instFiltro) ?? null) : null;
  const showAggregated = instFiltro === null || !selectedInst;
  const selectedCodigo = selectedInst?.codigo ?? null;

  // Filtro colgante (apunta a una institución que ya no es mía) → resetéalo.
  useEffect(() => {
    if (instFiltro !== null && misInst.isSuccess && !selectedInst) setInstFiltro(null);
  }, [instFiltro, misInst.isSuccess, selectedInst, setInstFiltro]);

  const destacados = useDestacados(selectedCodigo);
  const eventos = useEventos(selectedCodigo, '');
  const aggregated = useMisEventos('', showAggregated);
  const source = showAggregated ? aggregated : eventos;

  // refetch estable al enfocar el Home (los refetch de React Query son estables)
  const aggRefetch = aggregated.refetch;
  const evRefetch = eventos.refetch;
  const destRefetch = destacados.refetch;
  useFocusEffect(
    useCallback(() => {
      (showAggregated ? aggRefetch : evRefetch)();
      if (!showAggregated) destRefetch();
    }, [showAggregated, aggRefetch, evRefetch, destRefetch]),
  );

  const allItems = useMemo(
    () => source.data?.pages.flatMap((p) => p.items) ?? [],
    [source.data],
  );
  // hero: en agregado = destacados combinados de todas; por-institución = sus destacados
  const heroItems = showAggregated ? allItems.filter((e) => e.destacado) : (destacados.data ?? []);
  const heroLoading = showAggregated ? source.isLoading : destacados.isLoading;
  const items = useMemo(() => {
    if (filtro === 'featured') return allItems.filter((e) => e.destacado);
    if (filtro === 'free') return allItems.filter((e) => !e.precio);
    return allItems;
  }, [allItems, filtro]);

  // Con filtro cliente (destacados/gratis) auto-carga las páginas siguientes:
  // así ningún evento que matchea queda "escondido" en una página no cargada.
  const srcHasNext = source.hasNextPage;
  const srcFetchingNext = source.isFetchingNextPage;
  const srcFetchNext = source.fetchNextPage;
  useEffect(() => {
    if (filtro !== 'all' && srcHasNext && !srcFetchingNext) srcFetchNext();
  }, [filtro, allItems.length, srcHasNext, srcFetchingNext, srcFetchNext]);

  const Header = (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.md }}>
      <TopBar />

      {/* Filtro por institución — default "Todas" para enterarte de todo */}
      {hasMultiple ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
        >
          {[{ id: null as number | null, nombre: tr('home.scopeAll') }, ...list.map((i) => ({ id: i.idInstitucion, nombre: i.nombre }))].map(
            (opt) => {
              const on = instFiltro === opt.id;
              return (
                <Pressable
                  key={String(opt.id)}
                  onPress={() => setInstFiltro(opt.id)}
                  style={{
                    paddingHorizontal: spacing.md,
                    height: 34,
                    borderRadius: radius.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? t.colors.brand : t.colors.surfaceAlt,
                  }}
                >
                  <AppText
                    variant="caption"
                    color={on ? t.colors.onBrand : t.colors.textMuted}
                    style={{ fontWeight: fontWeight.semibold }}
                  >
                    {opt.nombre}
                  </AppText>
                </Pressable>
              );
            },
          )}
        </ScrollView>
      ) : null}

      {filtro === 'all' ? <HeroCarousel items={heroItems} loading={heroLoading} /> : null}

      {/* Filtros rápidos */}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <QuickTile
          icon="calendar"
          label={tr('home.programa')}
          color={palette.brand600}
          active={filtro === 'all'}
          onPress={() => setFiltro('all')}
        />
        <QuickTile
          icon="star"
          label={tr('home.featured')}
          color={palette.amber500}
          active={filtro === 'featured'}
          onPress={() => setFiltro('featured')}
        />
        <QuickTile
          icon="pricetag"
          label={tr('home.free')}
          color={palette.green500}
          active={filtro === 'free'}
          onPress={() => setFiltro('free')}
        />
        <QuickTile
          icon="ticket"
          label={tr('tabs.tickets')}
          color={palette.pink500}
          onPress={() => router.push('/(tabs)/entradas')}
        />
      </View>

      <AppText variant="subtitle">
        {filtro === 'featured'
          ? tr('home.featured')
          : filtro === 'free'
            ? tr('home.free')
            : tr('home.upcoming')}
      </AppText>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        data={items}
        keyExtractor={(e) => String(e.id)}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(320)}>
            <EventCard evento={item} />
          </Animated.View>
        )}
        ListHeaderComponent={Header}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'] }}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (filtro === 'all' && source.hasNextPage && !source.isFetchingNextPage) {
            source.fetchNextPage();
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={source.isRefetching && !source.isFetchingNextPage}
            onRefresh={() => {
              source.refetch();
              if (!showAggregated) destacados.refetch();
            }}
            tintColor={t.colors.brand}
          />
        }
        ListEmptyComponent={
          source.isLoading ? (
            <View style={{ gap: spacing.md }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={118} radius={radius.lg} />
              ))}
            </View>
          ) : source.isError ? (
            <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl }}>
              <AppText variant="subtitle">{tr('common.error')}</AppText>
              <Button title={tr('common.retry')} variant="secondary" onPress={() => source.refetch()} />
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl }}>
              <Ionicons name="calendar-clear-outline" size={44} color={t.colors.textFaint} />
              <AppText variant="subtitle">{tr('home.empty')}</AppText>
              <AppText muted variant="caption" style={{ textAlign: 'center' }}>
                {tr('home.emptyDesc')}
              </AppText>
            </View>
          )
        }
        ListFooterComponent={
          source.isFetchingNextPage ? (
            <View style={{ paddingTop: spacing.md }}>
              <Skeleton height={118} radius={radius.lg} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
