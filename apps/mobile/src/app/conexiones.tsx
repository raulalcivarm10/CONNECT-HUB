import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { PersonaResumen, SolicitudConexion } from '@connecthub/shared-types';
import { AppText, Button, Skeleton } from '@/design-system/components';
import { Avatar } from '@/design-system/avatar';
import { useTheme } from '@/design-system/theme';
import { radius, spacing } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useSolicitudes, useConexiones, responderConexion } from '@/api/conexiones';
import { ApiError } from '@/api/client';

function PersonRow({ p, onPress, right }: { p: PersonaResumen; onPress?: () => void; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, opacity: pressed ? 0.6 : 1 })}
    >
      <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} size={46} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>{p.nombre}</AppText>
        {p.profesion ? <AppText muted variant="caption" numberOfLines={1}>{p.profesion}</AppText> : null}
      </View>
      {right}
    </Pressable>
  );
}

export default function Conexiones() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: solicitudes, isLoading: l1, refetch: r1 } = useSolicitudes();
  const { data: conexiones, isLoading: l2, refetch: r2 } = useConexiones();
  const [busyId, setBusyId] = useState<number | null>(null);

  useFocusEffect(useCallback(() => { r1(); r2(); }, [r1, r2]));

  async function responder(s: SolicitudConexion, aceptar: boolean) {
    setBusyId(s.idConexion);
    try {
      await responderConexion(s.idConexion, aceptar);
      void qc.invalidateQueries({ queryKey: ['solicitudes'] });
      void qc.invalidateQueries({ queryKey: ['conexiones'] });
    } catch (err) {
      Alert.alert(tr('common.error'), err instanceof ApiError ? err.message : '');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/perfil'))} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.colors.text} />
        </Pressable>
        <AppText variant="title">{tr('connections.title')}</AppText>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'] }}>
        {/* Solicitudes */}
        <AppText muted variant="label" style={{ textTransform: 'uppercase', marginBottom: spacing.sm }}>
          {tr('connections.requests')}{solicitudes?.length ? ` (${solicitudes.length})` : ''}
        </AppText>
        {l1 ? (
          <Skeleton height={56} radius={radius.md} />
        ) : (solicitudes?.length ?? 0) === 0 ? (
          <AppText muted variant="caption" style={{ marginBottom: spacing.lg }}>{tr('connections.noRequests')}</AppText>
        ) : (
          <View style={{ marginBottom: spacing.lg }}>
            {solicitudes!.map((s) => (
              <PersonRow
                key={s.idConexion}
                p={s}
                onPress={() => router.push({ pathname: '/asistente/[idCliente]', params: { idCliente: s.idCliente } })}
                right={
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    <Pressable onPress={() => responder(s, true)} disabled={busyId === s.idConexion} style={{ width: 40, height: 40, borderRadius: radius.full, backgroundColor: t.colors.brand, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </Pressable>
                    <Pressable onPress={() => responder(s, false)} disabled={busyId === s.idConexion} style={{ width: 40, height: 40, borderRadius: radius.full, backgroundColor: t.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="close" size={20} color={t.colors.textFaint} />
                    </Pressable>
                  </View>
                }
              />
            ))}
          </View>
        )}

        {/* Conexiones */}
        <AppText muted variant="label" style={{ textTransform: 'uppercase', marginBottom: spacing.sm }}>
          {tr('connections.mine')}{conexiones?.length ? ` (${conexiones.length})` : ''}
        </AppText>
        {l2 ? (
          <Skeleton height={56} radius={radius.md} />
        ) : (conexiones?.length ?? 0) === 0 ? (
          <AppText muted variant="caption">{tr('connections.noConnections')}</AppText>
        ) : (
          conexiones!.map((c) => (
            <PersonRow
              key={c.idCliente}
              p={c}
              onPress={() => router.push({ pathname: '/asistente/[idCliente]', params: { idCliente: c.idCliente } })}
              right={<Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
