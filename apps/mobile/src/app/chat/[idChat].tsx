import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatMensaje } from '@connecthub/shared-types';
import { AppText, Skeleton } from '@/design-system/components';
import { Avatar } from '@/design-system/avatar';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, fontSize } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useChatMensajes, enviarPrivado } from '@/api/chats';

function hora(fecha?: string): string {
  return fecha && fecha.includes('T') ? fecha.split('T')[1] : '';
}

function BurbujaBase({ m }: { m: ChatMensaje }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: m.esMio ? 'flex-end' : 'flex-start', marginBottom: spacing.sm }}>
      <View
        style={{
          backgroundColor: m.esMio ? t.colors.brand : t.colors.surfaceAlt,
          borderRadius: radius.lg,
          borderBottomRightRadius: m.esMio ? 4 : radius.lg,
          borderTopLeftRadius: m.esMio ? radius.lg : 4,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          maxWidth: '82%',
        }}
      >
        <AppText color={m.esMio ? t.colors.onBrand : t.colors.text}>{m.mensaje}</AppText>
      </View>
      {m.fecha ? <AppText muted variant="caption" style={{ marginTop: 2, marginHorizontal: 4 }}>{hora(m.fecha)}</AppText> : null}
    </View>
  );
}
// Memoizada: teclear en el composer no re-renderiza todas las burbujas visibles.
const Burbuja = memo(BurbujaBase);
const chatKey = (m: ChatMensaje) => String(m.id);

export default function ChatPrivado() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const { idChat } = useLocalSearchParams<{ idChat: string }>();
  const chatId = Number(idChat);

  const { data, isLoading, refetch } = useChatMensajes(chatId);
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const mensajes = useMemo(() => [...(data?.items ?? [])].reverse(), [data?.items]);
  const listRef = useRef<FlatList<ChatMensaje>>(null);
  const atBottom = useRef(true);
  const inited = useRef(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atBottom.current = contentSize.height - (layoutMeasurement.height + contentOffset.y) < 80;
  }, []);
  const maybeScroll = useCallback(() => {
    if (atBottom.current) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
  }, []);
  useEffect(() => {
    if (!inited.current && mensajes.length) {
      inited.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    }
  }, [mensajes.length]);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const otro = data?.otro;

  async function enviar() {
    const m = text.trim();
    if (!m || sending) return;
    setSending(true);
    setText('');
    try {
      await enviarPrivado(chatId, m);
      await qc.invalidateQueries({ queryKey: ['chat', chatId] });
      await qc.invalidateQueries({ queryKey: ['chats'] });
      atBottom.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch {
      setText(m);
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Cabecera */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/comunidad'))} hitSlop={10} style={{ padding: spacing.xs }}>
            <Ionicons name="chevron-back" size={26} color={t.colors.text} />
          </Pressable>
          <Pressable
            onPress={() => otro && router.push({ pathname: '/asistente/[idCliente]', params: { idCliente: otro.idCliente } })}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
          >
            <Avatar nombre={otro?.nombre} fotoUrl={otro?.fotoUrl} size={36} />
            <View style={{ flex: 1 }}>
              <AppText variant="subtitle" numberOfLines={1}>{otro?.nombre ?? tr('chat.title')}</AppText>
              {otro?.profesion ? <AppText muted variant="caption" numberOfLines={1}>{otro.profesion}</AppText> : null}
            </View>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            {[0, 1, 2].map((i) => <Skeleton key={i} height={40} radius={radius.lg} />)}
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={mensajes}
            keyExtractor={chatKey}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={100}
            onContentSizeChange={maybeScroll}
            renderItem={({ item }) => <Burbuja m={item} />}
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing['4xl'] }}>
                <Ionicons name="chatbubble-ellipses-outline" size={44} color={t.colors.textFaint} />
                <AppText muted style={{ marginTop: spacing.sm }}>{tr('chat.empty')}</AppText>
              </View>
            }
          />
        )}

        {/* Composer */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: t.colors.border, backgroundColor: t.colors.bgElevated }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={tr('chat.placeholder')}
            placeholderTextColor={t.colors.textFaint}
            multiline
            style={{ flex: 1, maxHeight: 110, minHeight: 44, borderRadius: radius.xl, backgroundColor: t.colors.surfaceAlt, paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 8, color: t.colors.text, fontSize: fontSize.md }}
          />
          <Pressable
            onPress={enviar}
            disabled={!text.trim() || sending}
            style={{ width: 44, height: 44, borderRadius: radius.full, backgroundColor: text.trim() ? t.colors.brand : t.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="send" size={20} color={text.trim() ? palette.white : t.colors.textFaint} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
