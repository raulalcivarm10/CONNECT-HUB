import { useCallback } from 'react';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';
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
import { useMisComunidades } from '@/api/comunidad';
import { useChats } from '@/api/chats';

function hora(fecha: string | null): string {
  if (!fecha) return '';
  const [d, t] = fecha.split('T');
  const hoy = new Date().toISOString().slice(0, 10);
  return d === hoy ? (t ?? '') : d.slice(5);
}

function ChatRow({ c, onPress }: { c: ChatResumen; onPress: () => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, opacity: pressed ? 0.6 : 1 })}>
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

function CommRow({ c, onPress }: { c: ComunidadResumen; onPress: () => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, opacity: pressed ? 0.6 : 1 })}>
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

export default function Hub() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const { data: comunidades, isLoading: l1, refetch: r1, isRefetching: rf1 } = useMisComunidades();
  const { data: chats, isLoading: l2, refetch: r2, isRefetching: rf2 } = useChats();
  useFocusEffect(useCallback(() => { r1(); r2(); }, [r1, r2]));

  type Item = ChatResumen | ComunidadResumen;
  type Sec = { kind: 'chat' | 'comm'; title: string; data: Item[] };
  const sections: Sec[] = [
    ...((chats?.length ?? 0) > 0 ? [{ kind: 'chat' as const, title: tr('community.sectionChats'), data: chats! }] : []),
    { kind: 'comm' as const, title: tr('community.sectionCommunities'), data: comunidades ?? [] },
  ];
  const loading = l1 || l2;
  const vacio = !loading && (chats?.length ?? 0) === 0 && (comunidades?.length ?? 0) === 0;

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
          keyExtractor={(item) => ('idChat' in item ? 'chat-' + item.idChat : 'comm-' + item.idEvento)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={rf1 || rf2} onRefresh={() => { r1(); r2(); }} tintColor={t.colors.brand} />}
          renderSectionHeader={({ section }) =>
            section.data.length ? (
              <AppText muted variant="label" style={{ textTransform: 'uppercase', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs }}>
                {section.title}
              </AppText>
            ) : null
          }
          renderItem={({ item, section }) =>
            section.kind === 'chat' ? (
              <ChatRow c={item as ChatResumen} onPress={() => router.push({ pathname: '/chat/[idChat]', params: { idChat: (item as ChatResumen).idChat } })} />
            ) : (
              <CommRow c={item as ComunidadResumen} onPress={() => router.push({ pathname: '/muro/[idEvento]', params: { idEvento: (item as ComunidadResumen).idEvento } })} />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}
