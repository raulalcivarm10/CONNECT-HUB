import { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MiEntrada } from '@connecthub/shared-types';
import { AppText, Chip } from '@/design-system/components';
import { useTheme } from '@/design-system/theme';
import { radius, spacing, shadow } from '@/design-system/tokens';
import { useI18n, type Lang } from '@/i18n';
import {
  keyOf,
  monthCells,
  monthLabel,
  monthOf,
  todayKey,
  weekdayHeadersMon,
} from '@/lib/fecha';

/** Tarjeta de una entrada (compartida por la lista y el calendario). */
function EntradaCardBase({
  item,
  onEvento,
  onQr,
}: {
  item: MiEntrada;
  onEvento: (idEvento: number) => void;
  onQr: (idEntrada: number) => void;
}) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <Pressable
      onPress={() => onEvento(item.idEvento)}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: t.colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: t.colors.border,
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        shadow.card,
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
          {item.esWorkshop ? <Chip label={tr('entradas.workshop')} tone="brand" /> : null}
          {item.asistio ? <Chip label={tr('entradas.attended')} tone="success" /> : null}
        </View>
        <AppText variant="bodyStrong" numberOfLines={2}>{item.titulo}</AppText>
        <AppText muted variant="caption">
          {item.horaInicio && item.horaFin ? `${item.horaInicio} – ${item.horaFin}` : ''}
          {item.salonNombre ? `${item.horaInicio ? ' · ' : ''}${item.salonNombre}` : ''}
        </AppText>
      </View>
      <Pressable
        onPress={() => onQr(item.idEventoUsuario)}
        hitSlop={8}
        style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: t.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="qr-code" size={20} color={t.colors.brand} />
      </Pressable>
    </Pressable>
  );
}
// Memoizada: la SectionList de la agenda se re-renderiza al refrescar y al
// cambiar de vista; las filas cuya entrada no cambió ya no se vuelven a pintar.
// Requiere que onEvento/onQr lleguen estables (useCallback en el padre).
export const EntradaCard = memo(EntradaCardBase);

export function AgendaCalendario({
  entradas,
  onEvento,
  onQr,
}: {
  entradas: MiEntrada[];
  onEvento: (idEvento: number) => void;
  onQr: (idEntrada: number) => void;
}) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const today = todayKey();

  // Mapa día -> entradas (una entrada aparece en cada día que abarca).
  const porDia = useMemo(() => {
    const m: Record<string, MiEntrada[]> = {};
    for (const e of entradas) for (const d of e.dias) (m[d] ??= []).push(e);
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (a.horaInicio ?? '99').localeCompare(b.horaInicio ?? '99'));
    }
    return m;
  }, [entradas]);

  // Mes inicial: el del primer evento >= hoy, o el actual.
  const inicial = useMemo(() => {
    const futuros = Object.keys(porDia).filter((k) => k >= today).sort();
    return monthOf(futuros[0] ?? today);
  }, [porDia, today]);

  const [ym, setYm] = useState(inicial);
  const [sel, setSel] = useState<string>(() => {
    const futuros = Object.keys(porDia).filter((k) => k >= today).sort();
    return futuros[0] ?? today;
  });

  const cells = useMemo(() => monthCells(ym.y, ym.m), [ym]);
  const cabeceras = weekdayHeadersMon(lang as Lang);
  const shiftMonth = (delta: number) => {
    const m = ym.m + delta;
    if (m < 1) setYm({ y: ym.y - 1, m: 12 });
    else if (m > 12) setYm({ y: ym.y + 1, m: 1 });
    else setYm({ y: ym.y, m });
  };

  const selItems = porDia[sel] ?? [];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing['3xl'] }}>
      {/* Navegación de mes */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.md }}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={{ padding: spacing.xs }}>
          <Ionicons name="chevron-back" size={22} color={t.colors.text} />
        </Pressable>
        <Pressable onPress={() => { setYm(monthOf(today)); setSel(today); }}>
          <AppText variant="subtitle">{monthLabel(ym.y, ym.m, lang as Lang)}</AppText>
        </Pressable>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={{ padding: spacing.xs }}>
          <Ionicons name="chevron-forward" size={22} color={t.colors.text} />
        </Pressable>
      </View>

      {/* Encabezados de días */}
      <View style={{ flexDirection: 'row' }}>
        {cabeceras.map((c, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', paddingBottom: spacing.xs }}>
            <AppText variant="label" muted style={{ textTransform: 'uppercase' }}>{c}</AppText>
          </View>
        ))}
      </View>

      {/* Grilla del mes */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day) => {
          const { m: cm, d: dd } = { m: Number(day.slice(5, 7)), d: Number(day.slice(8, 10)) };
          const outMonth = cm !== ym.m;
          const has = !!porDia[day]?.length;
          const isToday = day === today;
          const isSel = day === sel;
          return (
            <Pressable
              key={day}
              onPress={() => setSel(day)}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  backgroundColor: isSel ? t.colors.brand : isToday ? t.colors.brandSoft : 'transparent',
                  borderWidth: isToday && !isSel ? 1 : 0,
                  borderColor: t.colors.brand,
                }}
              >
                <AppText
                  variant="caption"
                  color={isSel ? t.colors.onBrand : outMonth ? t.colors.textFaint : t.colors.text}
                  style={{ fontWeight: isToday || isSel ? '700' : '400' }}
                >
                  {dd}
                </AppText>
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: has ? (isSel ? t.colors.onBrand : t.colors.brand) : 'transparent',
                  }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Eventos del día seleccionado */}
      <View style={{ marginTop: spacing.lg }}>
        {selItems.length > 0 ? (
          selItems.map((item, i) => (
            <EntradaCard key={`${item.idEventoUsuario}-${i}`} item={item} onEvento={onEvento} onQr={onQr} />
          ))
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs }}>
            <Ionicons name="calendar-clear-outline" size={32} color={t.colors.textFaint} />
            <AppText muted variant="caption">{tr('agenda.noEventsDay')}</AppText>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
