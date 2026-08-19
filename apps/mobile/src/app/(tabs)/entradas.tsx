import { memo, useCallback, useRef } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { MiEntrada } from '@connecthub/shared-types';
import { Screen, AppText, Chip, Skeleton, Button } from '@/design-system/components';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, shadow, fontWeight } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useMisEntradas } from '@/api/entradas';
import { resumenDias } from '@/lib/fecha';

function TicketCardBase({ entrada }: { entrada: MiEntrada }) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/entrada/[id]', params: { id: entrada.idEventoUsuario } })}
      style={[
        {
          flexDirection: 'row',
          backgroundColor: t.colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: t.colors.border,
          overflow: 'hidden',
        },
        shadow.card,
      ]}
    >
      <Image
        source={{ uri: entrada.portadaUrl }}
        contentFit="cover"
        transition={200}
        style={{ width: 96, height: 118, backgroundColor: palette.slate800 }}
      />
      <View style={{ flex: 1, padding: spacing.md, justifyContent: 'space-between' }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            {entrada.esWorkshop ? <Chip label={tr('entradas.workshop')} tone="brand" /> : null}
            {entrada.asistio ? <Chip label={tr('entradas.attended')} tone="success" /> : null}
          </View>
          <AppText variant="bodyStrong" numberOfLines={2}>{entrada.titulo}</AppText>
          <AppText muted variant="caption">{resumenDias(entrada.dias, lang)}</AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="qr-code" size={16} color={t.colors.brand} />
            <AppText variant="caption" color={t.colors.brandText} style={{ fontWeight: fontWeight.semibold }}>
              {tr('entradas.showQr')}
            </AppText>
          </View>
          {entrada.certificadoCodigo ? (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/certificado/[codigo]', params: { codigo: entrada.certificadoCodigo! } })
              }
              hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Ionicons name="ribbon" size={16} color={t.colors.success} />
              <AppText variant="caption" color={t.colors.success} style={{ fontWeight: fontWeight.semibold }}>
                {tr('entradas.certificate')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
// Memoizada: no re-renderiza cada fila cuando el padre refresca (isRefetching).
const TicketCard = memo(TicketCardBase);

// Todo esto vivía en línea dentro del JSX de la FlatList. El separador era el
// peor caso: al ser una función anónima nueva en cada render, React lo trataba
// como un componente distinto y DESMONTABA/remontaba todos los separadores.
const entradaKey = (e: MiEntrada) => String(e.idEventoUsuario);
const Separador = () => <View style={{ height: spacing.md }} />;
const LISTA_PAD = { paddingBottom: spacing['3xl'] };
const renderEntrada: ListRenderItem<MiEntrada> = ({ item, index }) =>
  // Solo las primeras filas animan la entrada (evita el parpadeo al
  // reciclarse en scroll).
  index < 8 ? (
    <Animated.View entering={FadeInDown.delay(index * 40)}>
      <TicketCard entrada={item} />
    </Animated.View>
  ) : (
    <TicketCard entrada={item} />
  );

export default function Entradas() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const { data, isLoading, isError, refetch, isRefetching } = useMisEntradas();

  // Refresca al enfocar la tab (las tabs no se re-montan al cambiar), pero se
  // salta el montaje —useQuery ya trae los datos— y no repite si acaba de
  // refrescar: antes cada toque en la tab lanzaba red, mostraba el spinner de
  // RefreshControl y re-renderizaba la lista entera con objetos nuevos.
  const ultimoRefresco = useRef(Date.now());
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - ultimoRefresco.current < 30_000) return;
      ultimoRefresco.current = Date.now();
      refetch();
    }, [refetch]),
  );

  return (
    <Screen padded>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <AppText variant="display">{tr('entradas.title')}</AppText>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={entradaKey}
        ItemSeparatorComponent={Separador}
        contentContainerStyle={LISTA_PAD}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={t.colors.brand} />
        }
        renderItem={renderEntrada}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: spacing.md }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={118} radius={radius.lg} />
              ))}
            </View>
          ) : isError ? (
            <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing['3xl'] }}>
              <AppText variant="subtitle">{tr('common.error')}</AppText>
              <Button title={tr('common.retry')} variant="secondary" onPress={() => refetch()} />
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: spacing['4xl'] }}>
              <Ionicons name="ticket-outline" size={48} color={t.colors.textFaint} />
              <AppText variant="subtitle">{tr('entradas.empty')}</AppText>
              <AppText muted variant="caption" style={{ textAlign: 'center', maxWidth: 260 }}>
                {tr('entradas.emptyDesc')}
              </AppText>
            </View>
          )
        }
      />
    </Screen>
  );
}
