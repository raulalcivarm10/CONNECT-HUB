import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Skeleton, Chip } from '@/design-system/components';
import { Avatar } from '@/design-system/avatar';
import { useTheme } from '@/design-system/theme';
import { radius, spacing } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { usePerfil } from '@/api/perfil';
import { solicitarConexion } from '@/api/conexiones';
import { abrirChat } from '@/api/chats';
import { ApiError } from '@/api/client';

export default function VerPerfil() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const { idCliente } = useLocalSearchParams<{ idCliente: string }>();
  const { data: p, isLoading, isError, refetch } = usePerfil(idCliente ?? null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => { if (idCliente) refetch(); }, [idCliente, refetch]));

  async function conectar() {
    if (!idCliente) return;
    setBusy(true);
    try {
      await solicitarConexion(idCliente);
      await qc.invalidateQueries({ queryKey: ['perfil', idCliente] });
      await qc.invalidateQueries({ queryKey: ['conexiones'] });
    } catch (err) {
      Alert.alert(tr('common.error'), err instanceof ApiError ? err.message : '');
    } finally {
      setBusy(false);
    }
  }

  async function mensaje() {
    if (!idCliente) return;
    setBusy(true);
    try {
      const { idChat } = await abrirChat(idCliente);
      await qc.invalidateQueries({ queryKey: ['chats'] });
      router.push({ pathname: '/chat/[idChat]', params: { idChat } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        Alert.alert(tr('profile.privateTitle'), tr('profile.needConnect'));
      } else {
        Alert.alert(tr('common.error'), err instanceof ApiError ? err.message : '');
      }
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color={t.colors.text} />
      </Pressable>
      <AppText variant="title">{tr('profile.viewTitle')}</AppText>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
        {header}
        <View style={{ alignItems: 'center', gap: spacing.md, padding: spacing.xl }}>
          <Skeleton width={88} height={88} radius={radius.full} />
          <Skeleton width="60%" height={22} />
          <Skeleton width="40%" height={16} />
        </View>
      </SafeAreaView>
    );
  }
  if (isError || !p) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
          <Ionicons name="person-outline" size={44} color={t.colors.textFaint} />
          <AppText muted>{tr('profile.notFound')}</AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing['4xl'] }}>
        <View style={{ alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
          <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} size={96} />
          <AppText variant="title" style={{ textAlign: 'center' }}>{p.nombre}</AppText>
          {p.profesion ? <AppText color={t.colors.brandText} variant="bodyStrong">{p.profesion}</AppText> : null}
          {p.empresa ? <AppText muted>{p.empresa}</AppText> : null}
          {p.visibilidad === 'PRIVADO' ? (
            <Chip label={tr('profile.privateBadge')} tone="warning" />
          ) : null}
        </View>

        {p.limitado ? (
          <View style={{ alignItems: 'center', gap: spacing.sm, backgroundColor: t.colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.colors.border, padding: spacing.lg }}>
            <Ionicons name="lock-closed-outline" size={28} color={t.colors.textFaint} />
            <AppText muted style={{ textAlign: 'center' }}>{tr('profile.privateLocked')}</AppText>
          </View>
        ) : (
          <>
            {p.bio ? (
              <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
                <AppText variant="subtitle">{tr('profile.bio')}</AppText>
                <AppText color={t.colors.textMuted} style={{ lineHeight: 22 }}>{p.bio}</AppText>
              </View>
            ) : null}
            {p.linkedinUrl ? (
              <Pressable
                onPress={() => Linking.openURL(p.linkedinUrl!).catch(() => {})}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}
              >
                <Ionicons name="logo-linkedin" size={20} color="#0A66C2" />
                <AppText color={t.colors.brandText} numberOfLines={1} style={{ flex: 1 }}>{p.linkedinUrl}</AppText>
              </Pressable>
            ) : null}
          </>
        )}

        {/* Acciones */}
        {p.esYo ? (
          <Button title={tr('profile.editTitle')} variant="secondary" onPress={() => router.push('/editar-perfil')} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {p.puedeChatear ? (
              <Button title={tr('profile.sendMessage')} onPress={mensaje} loading={busy} />
            ) : null}
            {p.relacion === 'ninguna' ? (
              <Button title={tr('profile.connect')} variant={p.puedeChatear ? 'secondary' : 'primary'} onPress={conectar} loading={busy} />
            ) : p.relacion === 'pendiente_enviada' ? (
              <Button title={tr('profile.requestSent')} variant="secondary" disabled onPress={() => {}} />
            ) : p.relacion === 'pendiente_recibida' ? (
              <Button title={tr('profile.acceptRequest')} onPress={conectar} loading={busy} />
            ) : p.relacion === 'conectado' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center', paddingTop: spacing.xs }}>
                <Ionicons name="checkmark-circle" size={16} color={t.colors.success} />
                <AppText variant="caption" color={t.colors.success}>{tr('profile.connected')}</AppText>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
