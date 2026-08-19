import { memo, useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PersonaResumen } from '@connecthub/shared-types';
import { AppText, Skeleton } from '@/design-system/components';
import { Avatar } from '@/design-system/avatar';
import { useTheme } from '@/design-system/theme';
import { spacing } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useMiembrosComunidad } from '@/api/comunidad';

/* Identidades ESTABLES a nivel de módulo. Declaradas dentro del componente se
 * recreaban en cada render: el separador anónimo era un componente NUEVO cada
 * vez (React desmontaba y remontaba todos), y el `renderItem` en línea obligaba
 * a la FlatList a rehacer todas las celdas. Mismo criterio que en el resto de
 * listas de la app. */
const listaKey = (p: PersonaResumen) => p.idCliente;
const LISTA_PAD = { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl };

function Separador() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.colors.border, marginLeft: 62 }} />;
}

/** onAbrir recibe el id (no un closure por fila) para que el padre pase una
 *  función estable y el memo sirva de verdad. */
function MiembroBase({
  p,
  onAbrir,
}: {
  p: PersonaResumen;
  onAbrir: (idCliente: string) => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => onAbrir(p.idCliente)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} size={46} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>{p.nombre}</AppText>
        {p.profesion ? <AppText muted variant="caption" numberOfLines={1}>{p.profesion}</AppText> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
    </Pressable>
  );
}
const Miembro = memo(MiembroBase);

export default function MiembrosComunidad() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const { idEvento } = useLocalSearchParams<{ idEvento: string }>();
  const evId = Number(idEvento);
  const { data, isLoading, refetch, isRefetching } = useMiembrosComunidad(evId);

  const abrir = useCallback(
    (idCliente: string) => router.push({ pathname: '/asistente/[idCliente]', params: { idCliente } }),
    [router],
  );
  const renderMiembro = useCallback(
    ({ item }: { item: PersonaResumen }) => <Miembro p={item} onAbrir={abrir} />,
    [abrir],
  );
  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {/* Cabecera */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/comunidad'))} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.colors.text} />
        </Pressable>
        <View>
          <AppText variant="title">{tr('community.membersTitle')}</AppText>
          {data ? <AppText muted variant="caption">{data.length}</AppText> : null}
        </View>
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.sm }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Skeleton width={46} height={46} radius={23} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="55%" height={14} radius={6} />
                <Skeleton width="35%" height={11} radius={6} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={listaKey}
          contentContainerStyle={LISTA_PAD}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={t.colors.brand} />}
          ItemSeparatorComponent={Separador}
          renderItem={renderMiembro}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: spacing['3xl'], gap: spacing.sm }}>
              <Ionicons name="people-outline" size={48} color={t.colors.textFaint} />
              <AppText variant="subtitle">{tr('community.membersEmpty')}</AppText>
              <AppText muted variant="caption" style={{ textAlign: 'center', maxWidth: 280 }}>
                {tr('community.membersEmptyDesc')}
              </AppText>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
