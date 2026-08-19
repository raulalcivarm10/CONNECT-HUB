import { ReactNode, useCallback, useState } from 'react';
import { Alert, Linking, Modal, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type { DiaEvento, Expositor, WorkshopResumen } from '@connecthub/shared-types';
import { AppText, Button, Chip, Skeleton } from '@/design-system/components';
import { AppImage, IMAGE_PLACEHOLDER } from '@/design-system/image';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, shadow, fontWeight } from '@/design-system/tokens';
import { useI18n, Lang } from '@/i18n';
import { useEvento } from '@/api/catalogo';
import { useMisEntradas, inscribirEvento } from '@/api/entradas';
import { ApiError, errorCode } from '@/api/client';
import { ImageViewer } from '@/design-system/image-viewer';
import { SaveButton } from '@/features/eventos/cards';
import { AgendaDiaSheet, sesionesDeDia } from '@/features/eventos/agenda-dia';
import { resumenDias, shortDate, weekday, dayNum } from '@/lib/fecha';

const HERO_H = 330;

/* ---------- helpers ---------- */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
      <AppText variant="subtitle">{title}</AppText>
      {children}
    </View>
  );
}

function Bullets({ items }: { items: string[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Ionicons name="checkmark-circle" size={18} color={t.colors.brand} style={{ marginTop: 1 }} />
          <AppText style={{ flex: 1 }}>{it}</AppText>
        </View>
      ))}
    </View>
  );
}

function DayRow({
  dia,
  index,
  lang,
  onPress,
}: {
  dia: DiaEvento;
  index: number;
  lang: Lang;
  onPress: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useI18n();
  // Sin sesiones (API sin desplegar o día sin agenda cargada) el día NO es
  // tocable y se pinta exactamente igual que antes: nada de afordancia falsa.
  const nSesiones = sesionesDeDia(dia).length;
  const tocable = nSesiones > 0;

  const base = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    backgroundColor: t.colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  };

  const contenido = (
    <>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.md,
          backgroundColor: t.colors.brandSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppText variant="caption" color={t.colors.brandText} style={{ textTransform: 'uppercase' }}>
          {weekday(dia.fecha, lang)}
        </AppText>
        <AppText variant="subtitle" color={t.colors.brandText}>
          {dayNum(dia.fecha)}
        </AppText>
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">
          {tr('event.day')} {index + 1}
        </AppText>
        <AppText muted variant="caption">
          {dia.horaInicio && dia.horaFin ? `${dia.horaInicio} – ${dia.horaFin}` : shortDate(dia.fecha, lang)}
          {tocable
            ? ` · ${nSesiones} ${nSesiones === 1 ? tr('agendaDia.session') : tr('agendaDia.sessions')}`
            : ''}
        </AppText>
      </View>
      {tocable ? <Ionicons name="chevron-forward" size={18} color={t.colors.textMuted} /> : null}
    </>
  );

  if (!tocable) return <View style={base}>{contenido}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={tr('agendaDia.viewAgenda')}
      style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }]}
    >
      {contenido}
    </Pressable>
  );
}

function SpeakerCard({ exp, onPress }: { exp: Expositor; onPress: () => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: 150, gap: spacing.sm, opacity: pressed ? 0.85 : 1 })}>
      <View>
        <AppImage
          source={{ uri: exp.fotoUrl }}
          contentFit="cover"
          transition={250}
          // Carrusel horizontal de expositores: sin recyclingKey se ve un
          // instante la foto del expositor anterior.
          recyclingKey={exp.fotoUrl}
          style={{ width: 150, height: 150, borderRadius: radius.lg, backgroundColor: t.colors.surfaceAlt }}
        />
        {exp.esDestacado ? (
          <View style={{ position: 'absolute', top: 8, left: 8 }}>
            <Chip label={tr('event.keynote')} tone="brand" />
          </View>
        ) : null}
      </View>
      <View>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {exp.nombreCompleto}
        </AppText>
        {exp.cargo || exp.organizacion ? (
          <AppText muted variant="caption" numberOfLines={2}>
            {[exp.cargo, exp.organizacion].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
          <AppText variant="caption" color={t.colors.brandText} style={{ fontWeight: fontWeight.semibold }}>
            {tr('event.seeMore')}
          </AppText>
          <Ionicons name="chevron-forward" size={12} color={t.colors.brandText} />
        </View>
      </View>
    </Pressable>
  );
}

/* ---------- ficha del expositor (ver más) ---------- */
function ExpositorSheet({ exp, onClose }: { exp: Expositor | null; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const [zoom, setZoom] = useState<string | null>(null);
  return (
    <Modal visible={!!exp} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: t.colors.bgElevated,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
            paddingBottom: insets.bottom + spacing.lg,
            maxHeight: '88%',
          }}
        >
          {/* grabber + cerrar */}
          <View style={{ alignItems: 'center', paddingTop: spacing.sm }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.border }} />
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={{ position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 2 }}>
            <Ionicons name="close" size={24} color={t.colors.textMuted} />
          </Pressable>

          {exp ? (
            <Animated.ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: 'center', gap: spacing.sm }}>
                <Pressable onPress={() => setZoom(exp.fotoUrl)}>
                  <AppImage
                    source={{ uri: exp.fotoUrl }}
                    contentFit="cover"
                    recyclingKey={exp.fotoUrl}
                    style={{ width: 110, height: 110, borderRadius: radius.full, backgroundColor: t.colors.surfaceAlt }}
                  />
                </Pressable>
                <AppText variant="title" style={{ textAlign: 'center' }}>{exp.nombreCompleto}</AppText>
                {exp.cargo || exp.organizacion ? (
                  <AppText color={t.colors.brandText} variant="bodyStrong" style={{ textAlign: 'center' }}>
                    {[exp.cargo, exp.organizacion].filter(Boolean).join(' · ')}
                  </AppText>
                ) : null}
                {exp.rol ? <Chip label={exp.rol} tone="neutral" /> : null}
              </View>

              {exp.tagline ? (
                <AppText style={{ textAlign: 'center', fontStyle: 'italic' }} color={t.colors.textMuted}>
                  “{exp.tagline}”
                </AppText>
              ) : null}

              {exp.bio ? (
                <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
                  <AppText variant="subtitle">{tr('event.bio')}</AppText>
                  <AppText color={t.colors.textMuted} style={{ lineHeight: 22 }}>{exp.bio}</AppText>
                </View>
              ) : null}

              {exp.sitioWebUrl ? (
                <Pressable
                  onPress={() => Linking.openURL(exp.sitioWebUrl!).catch(() => {})}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}
                >
                  <Ionicons name="globe-outline" size={18} color={t.colors.brand} />
                  <AppText color={t.colors.brandText} numberOfLines={1} style={{ flex: 1 }}>{exp.sitioWebUrl}</AppText>
                </Pressable>
              ) : null}

              {exp.redesSociales?.length ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                  {exp.redesSociales.map((r, i) => (
                    <Pressable
                      key={i}
                      onPress={() => Linking.openURL(r).catch(() => {})}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                    >
                      <Ionicons name="link-outline" size={18} color={t.colors.brand} />
                      <AppText color={t.colors.brandText} numberOfLines={1} style={{ flex: 1 }}>{r}</AppText>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Animated.ScrollView>
          ) : null}
        </Pressable>
      </Pressable>
      <ImageViewer uri={zoom} onClose={() => setZoom(null)} />
    </Modal>
  );
}

function WorkshopRow({ w, lang }: { w: WorkshopResumen; lang: Lang }) {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useI18n();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/evento/[id]', params: { id: w.id } })}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: t.colors.card,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: t.colors.border,
          padding: spacing.md,
        },
      ]}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.sm,
          backgroundColor: t.colors.brandSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="construct-outline" size={20} color={t.colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {w.titulo}
        </AppText>
        <AppText muted variant="caption">
          {resumenDias(w.dias, lang)}
          {w.horaInicio ? ` · ${w.horaInicio}` : ''}
        </AppText>
      </View>
      <AppText variant="caption" color={w.precio ? t.colors.text : t.colors.success} style={{ fontWeight: fontWeight.bold }}>
        {w.precio ? `$${w.precio}` : tr('common.free')}
      </AppText>
    </Pressable>
  );
}

/* ---------- pantalla ---------- */
export default function EventoDetalle() {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventoId = Number(id);
  const { data: e, isLoading, isError, refetch } = useEvento(eventoId);
  // refresca al volver a la pantalla (recoge cambios hechos en el panel)
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const qc = useQueryClient();
  const { data: entradas } = useMisEntradas();
  const miEntrada = entradas?.find((x) => x.idEvento === eventoId) ?? null;
  const [registering, setRegistering] = useState(false);
  const [selectedExp, setSelectedExp] = useState<Expositor | null>(null);
  const [heroZoom, setHeroZoom] = useState<string | null>(null);
  const [diaAgenda, setDiaAgenda] = useState<number | null>(null);

  async function handleInscribir() {
    if (miEntrada) {
      router.push({ pathname: '/entrada/[id]', params: { id: miEntrada.idEventoUsuario } });
      return;
    }
    // evento de pago → pantalla de checkout (tarjeta guardada / hospedado)
    if (e?.precio) {
      router.push({ pathname: '/checkout/[idEvento]', params: { idEvento: eventoId } });
      return;
    }
    setRegistering(true);
    try {
      const res = await inscribirEvento(eventoId);
      if (res.requierePago) {
        router.push({ pathname: '/checkout/[idEvento]', params: { idEvento: eventoId } });
      } else {
        void qc.invalidateQueries({ queryKey: ['mis-entradas'] });
        if (res.idEventoUsuario) {
          router.push({ pathname: '/entrada/[id]', params: { id: res.idEventoUsuario } });
        }
      }
    } catch (err) {
      if (errorCode(err) === 'PROFILE_INCOMPLETE') {
        // falta nombre/apellido (van al certificado) → completar perfil
        Alert.alert(tr('profile.completeTitle'), tr('profile.completeBody'), [
          { text: tr('common.cancel'), style: 'cancel' },
          { text: tr('profile.completeCta'), onPress: () => router.push('/editar-perfil') },
        ]);
      } else if (err instanceof ApiError && err.status === 409) {
        Alert.alert(tr('event.parentFirst'), err.message);
      } else {
        Alert.alert(tr('common.error'), '');
      }
    } finally {
      setRegistering(false);
    }
  }

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((ev) => {
    scrollY.value = ev.contentOffset.y;
  });
  const heroStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    return {
      transform: [
        { translateY: y < 0 ? y * 0.5 : y * 0.25 },
        { scale: y < 0 ? 1 + -y / HERO_H : 1 },
      ],
    };
  });

  const FloatingButtons = (
    <View
      style={{
        position: 'absolute',
        top: insets.top + spacing.sm,
        left: spacing.lg,
        right: spacing.lg,
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: 10,
      }}
    >
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.full,
          backgroundColor: 'rgba(8,13,26,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="chevron-back" size={22} color={palette.white} />
      </Pressable>
      {e ? (
        <SaveButton
          evento={{
            id: e.id,
            titulo: e.titulo,
            portadaUrl: e.portadaUrl,
            fechaInicio: e.fechaInicio,
            dias: e.dias.map((d) => d.fecha),
            precio: e.precio,
          }}
          size={40}
        />
      ) : null}
    </View>
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Skeleton height={HERO_H} radius={0} />
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={28} width="80%" />
          <Skeleton height={18} width="50%" />
          <Skeleton height={120} />
        </View>
      </View>
    );
  }

  if (isError || !e) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
        <Ionicons name="alert-circle-outline" size={48} color={t.colors.textFaint} />
        <AppText variant="subtitle">{tr('event.notFound')}</AppText>
        <Button title={tr('common.close')} variant="secondary" onPress={() => router.replace('/(tabs)')} />
      </SafeAreaView>
    );
  }

  const priceText = e.precio ? `$${e.precio}` : tr('common.free');

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {FloatingButtons}
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Hero */}
        <View style={{ height: HERO_H, overflow: 'hidden' }}>
          <Animated.View style={[{ height: HERO_H }, heroStyle]}>
            <AppImage
              source={{ uri: e.portadaUrl }}
              placeholder={IMAGE_PLACEHOLDER}
              placeholderContentFit="cover"
              contentFit="cover"
              transition={300}
              // Misma URL que la portada de la tarjeta del Home: con
              // cachePolicy 'memory-disk' entra directo desde memoria.
              recyclingKey={String(eventoId)}
              priority="high"
              style={{ width: '100%', height: '100%', backgroundColor: palette.slate800 }}
            />
          </Animated.View>
          <LinearGradient
            colors={['rgba(8,13,26,0.35)', 'transparent', 'rgba(8,13,26,0.2)']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HERO_H }}
          />
          {/* zona tocable para ampliar la portada (debajo de los botones flotantes) */}
          <Pressable
            onPress={() => setHeroZoom(e.portadaUrl)}
            style={{ position: 'absolute', top: 64, left: 0, right: 0, bottom: 0 }}
          />
        </View>

        {/* Cuerpo */}
        <View
          style={{
            marginTop: -spacing.xl,
            backgroundColor: t.colors.bg,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xl,
          }}
        >
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
            <Chip label={resumenDias(e.dias.map((d) => d.fecha), lang)} tone="brand" />
            <Chip label={priceText} tone={e.precio ? 'neutral' : 'success'} />
          </View>

          <AppText variant="title">{e.titulo}</AppText>
          {e.institucion ? (
            <AppText muted variant="caption" style={{ marginTop: spacing.xs }}>
              {e.institucion}
            </AppText>
          ) : null}

          {/* meta ubicación/hora */}
          <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
            {(e.salonNombre || e.localNombre) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="location-outline" size={18} color={t.colors.brand} />
                <AppText variant="body" style={{ flex: 1 }}>
                  {[e.localNombre, e.salonNombre].filter(Boolean).join(' · ')}
                </AppText>
              </View>
            )}
            {e.horaInicio && e.horaFin ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="time-outline" size={18} color={t.colors.brand} />
                <AppText variant="body">{`${e.horaInicio} – ${e.horaFin}`}</AppText>
              </View>
            ) : null}
          </View>

          {/* About */}
          {(e.detalle?.descripcionLarga || e.descripcion) && (
            <Section title={tr('event.about')}>
              <AppText style={{ lineHeight: 22 }} color={t.colors.textMuted}>
                {e.detalle?.descripcionLarga || e.descripcion}
              </AppText>
            </Section>
          )}

          {/* Qué aprenderás */}
          {e.detalle?.queAprenderas?.length ? (
            <Section title={tr('event.learn')}>
              <Bullets items={e.detalle.queAprenderas} />
            </Section>
          ) : null}

          {/* Temas */}
          {e.detalle?.temas?.length ? (
            <Section title={tr('event.topics')}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {e.detalle.temas.map((tema, i) => (
                  <Chip key={i} label={tema} />
                ))}
              </View>
            </Section>
          ) : null}

          {/* Agenda */}
          {e.dias.length > 0 && (
            <Section title={tr('event.agenda')}>
              <View style={{ gap: spacing.sm }}>
                {e.dias.map((d, i) => (
                  <DayRow key={d.id} dia={d} index={i} lang={lang} onPress={() => setDiaAgenda(i)} />
                ))}
              </View>
            </Section>
          )}

          {/* Expositores */}
          {e.expositores.length > 0 && (
            <Section title={tr('event.speakers')}>
              <Animated.ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.lg, paddingRight: spacing.lg }}
              >
                {e.expositores.map((exp) => (
                  <SpeakerCard key={exp.id} exp={exp} onPress={() => setSelectedExp(exp)} />
                ))}
              </Animated.ScrollView>
            </Section>
          )}

          {/* Workshops */}
          {e.workshops.length > 0 && (
            <Section title={tr('event.workshops')}>
              <View style={{ gap: spacing.sm }}>
                {e.workshops.map((w) => (
                  <WorkshopRow key={w.id} w={w} lang={lang} />
                ))}
              </View>
            </Section>
          )}
        </View>
      </Animated.ScrollView>

      {/* CTA fija */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          backgroundColor: t.colors.bgElevated,
          borderTopWidth: 1,
          borderTopColor: t.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
          ...shadow.floating,
        }}
      >
        <View>
          {miEntrada ? (
            <Chip label={tr('event.registered')} tone="success" />
          ) : (
            <>
              <AppText muted variant="caption">{e.precio ? tr('common.from') : ''}</AppText>
              <AppText variant="subtitle" color={e.precio ? t.colors.text : t.colors.success}>
                {priceText}
              </AppText>
            </>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={
              miEntrada
                ? tr('event.viewTicket')
                : e.precio
                  ? tr('event.registerPaid')
                  : tr('event.registerFree')
            }
            onPress={handleInscribir}
            loading={registering}
          />
        </View>
      </View>

      <ExpositorSheet exp={selectedExp} onClose={() => setSelectedExp(null)} />
      <AgendaDiaSheet
        dia={diaAgenda === null ? null : (e.dias[diaAgenda] ?? null)}
        indice={diaAgenda ?? 0}
        lang={lang}
        onClose={() => setDiaAgenda(null)}
      />
      <ImageViewer uri={heroZoom} onClose={() => setHeroZoom(null)} />
    </View>
  );
}
