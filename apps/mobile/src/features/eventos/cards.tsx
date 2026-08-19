import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { EventoResumen } from '@connecthub/shared-types';
import { imagenAncho } from '@/api/client';
import { AppText, Chip } from '@/design-system/components';
import { AppImage, IMAGE_PLACEHOLDER } from '@/design-system/image';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, shadow, fontSize, fontWeight } from '@/design-system/tokens';
import { useAgenda, SavedEvent } from '@/store/agenda';
import { useI18n } from '@/i18n';
import { resumenDias } from '@/lib/fecha';

function toSaved(e: EventoResumen): SavedEvent {
  return {
    id: e.id,
    titulo: e.titulo,
    portadaUrl: e.portadaUrl,
    fechaInicio: e.fechaInicio,
    dias: e.dias,
    precio: e.precio,
  };
}

export function SaveButton({ evento, size = 34 }: { evento: SavedEvent; size?: number }) {
  const t = useTheme();
  const saved = useAgenda((s) => s.saved.some((x) => x.id === evento.id));
  const toggle = useAgenda((s) => s.toggle);
  return (
    <Pressable
      onPress={() => toggle(evento)}
      hitSlop={8}
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        backgroundColor: 'rgba(8,13,26,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={saved ? 'heart' : 'heart-outline'}
        size={size * 0.55}
        color={saved ? palette.pink500 : palette.white}
      />
    </Pressable>
  );
}

function priceLabel(precio: number | null, tr: (k: 'common.free') => string) {
  if (precio == null || precio === 0) return tr('common.free');
  return `$${precio}`;
}

/** Tarjeta grande (carrusel de destacados). */
function FeaturedCardBase({ evento }: { evento: EventoResumen }) {
  const router = useRouter();
  const { t: tr, lang } = useI18n();
  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <Pressable
        onPress={() => router.push({ pathname: '/evento/[id]', params: { id: evento.id } })}
        style={({ pressed }) => [
          {
            width: 300,
            height: 380,
            borderRadius: radius.xl,
            overflow: 'hidden',
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
          shadow.floating,
        ]}
      >
        <AppImage
          source={{ uri: imagenAncho(evento.portadaUrl, 800) }}
          placeholder={IMAGE_PLACEHOLDER}
          placeholderContentFit="cover"
          contentFit="cover"
          transition={300}
          // Carrusel horizontal: las tarjetas se reciclan al deslizar.
          recyclingKey={String(evento.id)}
          priority="high"
          style={{ width: '100%', height: '100%', backgroundColor: palette.slate800 }}
        />
        <LinearGradient
          colors={['transparent', 'rgba(8,13,26,0.15)', 'rgba(8,13,26,0.92)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '75%' }}
        />
        <View style={{ position: 'absolute', top: spacing.md, right: spacing.md }}>
          <SaveButton evento={toSaved(evento)} />
        </View>
        <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Chip label={resumenDias(evento.dias, lang)} tone="brand" />
            <Chip label={priceLabel(evento.precio, tr)} tone={evento.precio ? 'neutral' : 'success'} />
          </View>
          <AppText variant="title" color={palette.white} numberOfLines={2}>
            {evento.titulo}
          </AppText>
          {evento.salonNombre ? (
            <AppText variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={1}>
              {evento.localNombre ? `${evento.localNombre} · ` : ''}
              {evento.salonNombre}
            </AppText>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Tarjeta de lista (vertical). */
function EventCardBase({ evento }: { evento: EventoResumen }) {
  const t = useTheme();
  const router = useRouter();
  const { t: tr, lang } = useI18n();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/evento/[id]', params: { id: evento.id } })}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          backgroundColor: t.colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: t.colors.border,
          overflow: 'hidden',
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        shadow.card,
      ]}
    >
      <AppImage
        source={{ uri: imagenAncho(evento.portadaUrl, 800) }}
        placeholder={IMAGE_PLACEHOLDER}
        placeholderContentFit="cover"
        contentFit="cover"
        transition={250}
        // Filas de FlatList: sin recyclingKey se ve un instante la portada de
        // la fila anterior al reciclar la vista.
        recyclingKey={String(evento.id)}
        style={{ width: 108, height: 118, backgroundColor: palette.slate800 }}
      />
      <View style={{ flex: 1, padding: spacing.md, justifyContent: 'space-between' }}>
        <View style={{ gap: 4 }}>
          {evento.institucionNombre ? (
            <AppText
              variant="label"
              color={t.colors.brandText}
              numberOfLines={1}
              style={{ textTransform: 'uppercase' }}
            >
              {evento.institucionNombre}
            </AppText>
          ) : null}
          <AppText variant="bodyStrong" numberOfLines={2}>
            {evento.titulo}
          </AppText>
          {evento.salonNombre ? (
            <AppText muted variant="caption" numberOfLines={1}>
              {evento.salonNombre}
            </AppText>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="calendar-outline" size={14} color={t.colors.brand} />
            <AppText variant="caption" color={t.colors.brandText} style={{ fontWeight: fontWeight.semibold }}>
              {resumenDias(evento.dias, lang)}
            </AppText>
          </View>
          <AppText
            variant="caption"
            color={evento.precio ? t.colors.text : t.colors.success}
            style={{ fontWeight: fontWeight.bold, fontSize: fontSize.sm }}
          >
            {priceLabel(evento.precio, tr)}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

// Memoizadas: las filas del Home no se re-renderizan si su prop `evento` no
// cambia (react-query mantiene referencias estables). Gran mejora de fluidez.
export const FeaturedCard = memo(FeaturedCardBase);
export const EventCard = memo(EventCardBase);
