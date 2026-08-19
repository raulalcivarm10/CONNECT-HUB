import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { ComunidadMensaje } from '@connecthub/shared-types';
import { AppText, Button, Skeleton } from '@/design-system/components';
import { useConfirm } from '@/design-system/confirm';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, fontWeight, fontSize } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useComunidad, publicarMensaje, salirComunidad, ingresarComunidad } from '@/api/comunidad';
import { absoluteUrl } from '@/api/client';

function hora(fecha: string): string {
  return fecha.includes('T') ? fecha.split('T')[1] : '';
}

function Burbuja({ m, onAutor }: { m: ComunidadMensaje; onAutor?: () => void }) {
  const t = useTheme();
  const inicial = (m.autor || '?').trim().charAt(0).toUpperCase();
  if (m.esMio) {
    return (
      <View style={{ alignItems: 'flex-end', marginBottom: spacing.md }}>
        <View
          style={{
            backgroundColor: t.colors.brand,
            borderRadius: radius.lg,
            borderBottomRightRadius: 4,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            maxWidth: '82%',
          }}
        >
          <AppText color={t.colors.onBrand}>{m.mensaje}</AppText>
        </View>
        <AppText muted variant="caption" style={{ marginTop: 2, marginRight: 4 }}>{hora(m.fecha)}</AppText>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, maxWidth: '90%' }}>
      <Pressable onPress={onAutor} hitSlop={6}>
        {m.fotoUrl ? (
          <Image source={{ uri: absoluteUrl(m.fotoUrl) }} style={{ width: 32, height: 32, borderRadius: radius.full, marginTop: 16 }} />
        ) : (
          <View
            style={{
              width: 32, height: 32, borderRadius: radius.full, marginTop: 16,
              backgroundColor: t.colors.brandSoft, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <AppText color={t.colors.brandText} style={{ fontWeight: fontWeight.bold, fontSize: 13 }}>{inicial}</AppText>
          </View>
        )}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Pressable onPress={onAutor} hitSlop={6}>
          <AppText variant="caption" color={t.colors.brandText} style={{ fontWeight: fontWeight.semibold, marginLeft: 4, marginBottom: 2 }}>
            {m.autor}
          </AppText>
        </Pressable>
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: radius.lg,
            borderTopLeftRadius: 4,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <AppText>{m.mensaje}</AppText>
        </View>
        <AppText muted variant="caption" style={{ marginTop: 2, marginLeft: 4 }}>{hora(m.fecha)}</AppText>
      </View>
    </View>
  );
}

export default function ComunidadEvento() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const confirm = useConfirm();
  const router = useRouter();
  const qc = useQueryClient();
  const { idEvento } = useLocalSearchParams<{ idEvento: string }>();
  const evId = Number(idEvento);

  const { data, isLoading, refetch, isRefetching } = useComunidad(evId);
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Orden natural (WhatsApp): antiguos arriba, recientes abajo.
  const mensajes = useMemo(() => [...(data?.items ?? [])].reverse(), [data?.items]);
  const listRef = useRef<FlatList<ComunidadMensaje>>(null);
  const atBottom = useRef(true);
  const inited = useRef(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atBottom.current = contentSize.height - (layoutMeasurement.height + contentOffset.y) < 80;
  }, []);
  // Solo auto-scroll si el usuario ya estaba abajo (no interrumpe lectura de historial).
  const maybeScroll = useCallback(() => {
    if (atBottom.current) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
  }, []);
  const forceScroll = useCallback(() => {
    atBottom.current = true;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);
  // Primer render con datos → posicionar al fondo una vez.
  useEffect(() => {
    if (!inited.current && mensajes.length) {
      inited.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    }
  }, [mensajes.length]);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  const soyMiembro = data?.soyMiembro !== false;

  async function invalidar() {
    await qc.invalidateQueries({ queryKey: ['comunidad', evId] });
    await qc.invalidateQueries({ queryKey: ['mis-comunidades'] });
  }

  async function enviar() {
    const m = text.trim();
    if (!m || sending) return;
    setSending(true);
    setText('');
    try {
      await publicarMensaje(evId, m);
      await invalidar();
      forceScroll();
    } catch {
      setText(m);
    } finally {
      setSending(false);
    }
  }

  async function doSalir() {
    setBusy(true);
    try {
      await salirComunidad(evId);
      await invalidar();
      // salir = volver al hub (más claro que quedarse en la pantalla)
      if (router.canGoBack()) router.back();
    } finally {
      setBusy(false);
    }
  }

  async function salir() {
    const ok = await confirm({
      title: tr('community.leaveTitle'),
      message: tr('community.leaveBody'),
      confirmText: tr('community.leave'),
      cancelText: tr('common.cancel'),
      destructive: true,
      icon: 'exit-outline',
    });
    if (ok) doSalir();
  }

  async function ingresar() {
    setBusy(true);
    try { inited.current = false; await ingresarComunidad(evId); await invalidar(); } finally { setBusy(false); }
  }

  // Mismo arreglo que el chat 1-a-1: en Android borde a borde el composer del
  // muro quedaba detrás de la barra de navegación del sistema.
  return (
    <SafeAreaView
      edges={Platform.OS === 'android' ? ['top', 'bottom'] : ['top']}
      style={{ flex: 1, backgroundColor: t.colors.bg }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Cabecera */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/comunidad'))} hitSlop={10} style={{ padding: spacing.xs }}>
            <Ionicons name="chevron-back" size={26} color={t.colors.text} />
          </Pressable>
          <Pressable
            style={{ flex: 1 }}
            hitSlop={6}
            onPress={() => router.push({ pathname: '/muro/miembros/[idEvento]', params: { idEvento: String(evId) } })}
          >
            <AppText variant="subtitle" numberOfLines={1}>{data?.titulo ?? tr('community.title')}</AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="people-outline" size={13} color={t.colors.textFaint} />
              <AppText muted variant="caption">{data?.participantes ?? 0} {tr('community.members')}</AppText>
              <Ionicons name="chevron-forward" size={12} color={t.colors.textFaint} />
            </View>
          </Pressable>
          {!isLoading && soyMiembro ? (
            <Pressable onPress={salir} hitSlop={10} disabled={busy} style={{ padding: spacing.xs }}>
              <Ionicons name="exit-outline" size={22} color={t.colors.textFaint} />
            </Pressable>
          ) : null}
        </View>

        {isLoading ? (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md }}>
            {[0, 1, 2].map((i) => <Skeleton key={i} height={50} radius={radius.lg} />)}
          </View>
        ) : !soyMiembro ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
            <Ionicons name="chatbubbles-outline" size={48} color={t.colors.textFaint} />
            <AppText variant="subtitle" style={{ textAlign: 'center' }}>{tr('community.leftTitle')}</AppText>
            <AppText muted style={{ textAlign: 'center' }}>{tr('community.leftBody')}</AppText>
            <View style={{ width: '70%', marginTop: spacing.sm }}>
              <Button title={tr('community.join')} onPress={ingresar} loading={busy} />
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={mensajes}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={100}
            onContentSizeChange={maybeScroll}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={t.colors.brand} />}
            renderItem={({ item }) => (
              <Burbuja
                m={item}
                onAutor={() => router.push({ pathname: '/asistente/[idCliente]', params: { idCliente: item.idCliente } })}
              />
            )}
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing['4xl'] }}>
                <Ionicons name="chatbubbles-outline" size={44} color={t.colors.textFaint} />
                <AppText muted style={{ marginTop: spacing.sm }}>{tr('community.empty')}</AppText>
              </View>
            }
          />
        )}

        {/* Composer */}
        {soyMiembro && !isLoading ? (
          <View
            style={{
              flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
              paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
              borderTopWidth: 1, borderTopColor: t.colors.border, backgroundColor: t.colors.bgElevated,
            }}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={tr('community.placeholder')}
              placeholderTextColor={t.colors.textFaint}
              multiline
              style={{
                flex: 1, maxHeight: 110, minHeight: 44, borderRadius: radius.xl,
                backgroundColor: t.colors.surfaceAlt, paddingHorizontal: spacing.md,
                paddingTop: 12, paddingBottom: 8, color: t.colors.text, fontSize: fontSize.md,
              }}
            />
            <Pressable
              onPress={enviar}
              disabled={!text.trim() || sending}
              style={{
                width: 44, height: 44, borderRadius: radius.full,
                backgroundColor: text.trim() ? t.colors.brand : t.colors.surfaceAlt,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="send" size={20} color={text.trim() ? palette.white : t.colors.textFaint} />
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
