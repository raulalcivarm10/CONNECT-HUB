import { memo, useCallback, useMemo, useRef } from 'react';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';
import type { SectionListRenderItem } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChatResumen, ComunidadResumen } from '@connecthub/shared-types';
import { AppText, Skeleton } from '@/design-system/components';
import { Avatar } from '@/design-system/avatar';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, fontWeight } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { usePullToRefresh } from '@/lib/pull-to-refresh';
import { useMisComunidades } from '@/api/comunidad';
import { useChats } from '@/api/chats';

function hora(fecha: string | null): string {
  if (!fecha) return '';
  const [d, t] = fecha.split('T');
  const hoy = new Date().toISOString().slice(0, 10);
  return d === hoy ? (t ?? '') : d.slice(5);
}

// onPress recibe el id (en vez de ser un closure por fila): así el padre puede
// pasar UNA función estable y el memo de la fila realmente sirve.
function ChatRowBase({ c, onPress }: { c: ChatResumen; onPress: (idChat: number) => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <Pressable onPress={() => onPress(c.idChat)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, opacity: pressed ? 0.6 : 1 })}>
      <Avatar nombre={c.nombre} fotoUrl={c.fotoUrl} size={52} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{c.nombre}</AppText>
          {c.ultimaFecha ? <AppText muted variant="caption">{hora(c.ultimaFecha)}</AppText> : null}
        </View>
        <AppText muted variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>{c.ultimoMensaje ?? tr('chat.empty')}</AppText>
      </View>
      {c.noLeidos > 0 ? (
        <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: t.colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
          <AppText color={palette.white} style={{ fontSize: 11, fontWeight: fontWeight.bold }}>{c.noLeidos}</AppText>
        </View>
      ) : <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />}
    </Pressable>
  );
}
const ChatRow = memo(ChatRowBase);

function CommRowBase({ c, onPress }: { c: ComunidadResumen; onPress: (idEvento: number) => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <Pressable onPress={() => onPress(c.idEvento)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, opacity: pressed ? 0.6 : 1 })}>
      <Image source={{ uri: c.portadaUrl }} style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt }} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{c.titulo}</AppText>
          {c.ultimaFecha ? <AppText muted variant="caption">{hora(c.ultimaFecha)}</AppText> : null}
        </View>
        <AppText muted variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>{c.ultimoMensaje ?? tr('community.noMessages')}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 }}>
          <Ionicons name="people-outline" size={13} color={t.colors.textFaint} />
          <AppText muted variant="caption">{c.participantes} {tr('community.members')}</AppText>
          {!c.soyMiembro ? <AppText variant="caption" color={t.colors.warning} style={{ marginLeft: spacing.sm, fontWeight: fontWeight.semibold }}>· {tr('community.leftBadge')}</AppText> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
    </Pressable>
  );
}
// Memoizadas: el hub se re-renderiza con cada refresco de las DOS queries; sin
// memo se repintaban todas las filas (con sus avatares/portadas) cada vez.
const CommRow = memo(CommRowBase);

type Item = ChatResumen | ComunidadResumen;
type Sec = { kind: 'chat' | 'comm'; title: string; data: Item[] };

const hubKey = (item: Item) => ('idChat' in item ? 'chat-' + item.idChat : 'comm-' + item.idEvento);
const LISTA_PAD = { paddingBottom: spacing.xl };

export default function Hub() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const { data: comunidades, isLoading: l1, refetch: r1 } = useMisComunidades();
  const { data: chats, isLoading: l2, refetch: r2 } = useChats();
  // Dos queries: al enfocar la tab se lanzaban SIEMPRE las dos peticiones (y en
  // el montaje se duplicaban con las de useQuery). Ahora solo si pasaron 10 s.
  const { refrescando, onRefresh } = usePullToRefresh(() => Promise.all([r1(), r2()]));
  const ultimoRefresco = useRef(Date.now());
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - ultimoRefresco.current < 10_000) return;
      ultimoRefresco.current = Date.now();
      r1();
      r2();
    }, [r1, r2]),
  );

  // Antes se construía en cada render: array y objetos nuevos ⇒ la SectionList
  // consideraba que TODO había cambiado.
  const sections = useMemo<Sec[]>(
    () => [
      ...((chats?.length ?? 0) > 0 ? [{ kind: 'chat' as const, title: tr('community.sectionChats'), data: chats! }] : []),
      { kind: 'comm' as const, title: tr('community.sectionCommunities'), data: comunidades ?? [] },
    ],
    [chats, comunidades, tr],
  );
  const loading = l1 || l2;
  const vacio = !loading && (chats?.length ?? 0) === 0 && (comunidades?.length ?? 0) === 0;

  const abrirChat = useCallback(
    (idChat: number) => router.push({ pathname: '/chat/[idChat]', params: { idChat } }),
    [router],
  );
  const abrirMuro = useCallback(
    (idEvento: number) => router.push({ pathname: '/muro/[idEvento]', params: { idEvento } }),
    [router],
  );

  const renderItem = useCallback<SectionListRenderItem<Item, Sec>>(
    ({ item, section }) =>
      section.kind === 'chat' ? (
        <ChatRow c={item as ChatResumen} onPress={abrirChat} />
      ) : (
        <CommRow c={item as ComunidadResumen} onPress={abrirMuro} />
      ),
    [abrirChat, abrirMuro],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Sec }) =>
      section.data.length ? (
        <AppText muted variant="label" style={{ textTransform: 'uppercase', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs }}>
          {section.title}
        </AppText>
      ) : null,
    [],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <AppText variant="display">{tr('community.title')}</AppText>
        <AppText muted variant="caption">{tr('community.hubSubtitle')}</AppText>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={60} radius={radius.lg} />)}
        </View>
      ) : vacio ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
          <Ionicons name="chatbubbles-outline" size={48} color={t.colors.textFaint} />
          <AppText variant="subtitle" style={{ textAlign: 'center' }}>{tr('community.hubEmpty')}</AppText>
          <AppText muted style={{ textAlign: 'center' }}>{tr('community.hubEmptyDesc')}</AppText>
        </View>
      ) : (
        <SectionList<Item, Sec>
          sections={sections}
          keyExtractor={hubKey}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={LISTA_PAD}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={t.colors.brand} />}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
        />
      )}
    </SafeAreaView>
  );
}
