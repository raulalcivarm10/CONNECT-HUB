/**
 * Visor del log de diagnóstico (OCULTO — se llega manteniendo presionada la
 * fila de versión en Perfil). Muestra el flujo login → tokens → checkout para
 * depurar builds de tienda sin consola. "Share" exporta todo como texto.
 */
import { useEffect, useReducer } from 'react';
import { FlatList, Pressable, Share, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/design-system/components';
import { useTheme } from '@/design-system/theme';
import { radius, spacing } from '@/design-system/tokens';
import {
  clearDebugLog,
  debugLogAsText,
  getDebugEntries,
  subscribeDebugLog,
} from '@/lib/debuglog';

export default function DebugLog() {
  const t = useTheme();
  const router = useRouter();
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => subscribeDebugLog(force), []);

  const entries = getDebugEntries();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/perfil'))} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.colors.text} />
        </Pressable>
        <AppText variant="title" style={{ flex: 1 }}>Debug log</AppText>
        <Pressable
          onPress={() => void Share.share({ message: debugLogAsText() || '(log vacío)' }).catch(() => {})}
          hitSlop={10}
        >
          <Ionicons name="share-outline" size={22} color={t.colors.text} />
        </Pressable>
        <Pressable onPress={clearDebugLog} hitSlop={10}>
          <Ionicons name="trash-outline" size={22} color={t.colors.danger} />
        </Pressable>
      </View>

      {entries.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
          <Ionicons name="document-text-outline" size={40} color={t.colors.textFaint} />
          <AppText muted>No entries yet. Log in / pay to capture.</AppText>
        </View>
      ) : (
        <FlatList
          data={[...entries].reverse()} // lo más reciente arriba
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing['4xl'] }}
          renderItem={({ item }) => {
            const esError = /ERROR|FALLÓ|RECHAZADA|SIN TOKEN/i.test(item.tag);
            return (
              <View
                style={{
                  backgroundColor: t.colors.card,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: esError ? t.colors.danger : t.colors.border,
                  padding: spacing.md,
                  gap: 4,
                }}
              >
                <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                  <AppText variant="caption" color={esError ? t.colors.danger : t.colors.brandText} style={{ flex: 1 }}>
                    {item.tag}
                  </AppText>
                  <AppText variant="caption" muted>{item.ts}</AppText>
                </View>
                {item.data != null ? (
                  <AppText variant="caption" muted style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {JSON.stringify(item.data, null, 1)}
                  </AppText>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
