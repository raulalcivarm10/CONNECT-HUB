import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { Tarjeta } from '@connecthub/shared-types';
import { AppText, Button, Skeleton } from '@/design-system/components';
import { useTheme } from '@/design-system/theme';
import { radius, spacing, fontSize, fontWeight } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useInstitucion } from '@/store/institucion';
import { useTarjetas, agregarTarjeta, eliminarTarjeta } from '@/api/pagos';
import { ApiError } from '@/api/client';
import { useConfirm } from '@/design-system/confirm';

const BRAND: Record<string, string> = { vi: 'Visa', mc: 'Mastercard', ax: 'Amex', di: 'Diners', dc: 'Diners' };

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
  flex,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'number-pad' | 'default';
  maxLength?: number;
  flex?: number;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, flex }}>
      <AppText variant="caption" muted style={{ fontWeight: fontWeight.semibold }}>{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.textFaint}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={{
          height: 48,
          borderRadius: radius.md,
          backgroundColor: t.colors.surfaceAlt,
          paddingHorizontal: spacing.md,
          color: t.colors.text,
          fontSize: fontSize.md,
        }}
      />
    </View>
  );
}

function CardRow({ c, onDelete }: { c: Tarjeta; onDelete: () => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: t.colors.card,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: t.colors.border,
        padding: spacing.md,
      }}
    >
      <View style={{ width: 44, height: 30, borderRadius: 6, backgroundColor: t.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="card" size={18} color={t.colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{BRAND[c.tipo ?? ''] ?? tr('cards.card')} •••• {c.last4}</AppText>
        <AppText muted variant="caption">
          {String(c.expiryMonth).padStart(2, '0')}/{String(c.expiryYear).slice(-2)}
          {c.predeterminado ? ` · ${tr('cards.default')}` : ''}
        </AppText>
      </View>
      <Pressable onPress={onDelete} hitSlop={10} style={{ padding: spacing.xs }}>
        <Ionicons name="trash-outline" size={20} color={t.colors.danger} />
      </Pressable>
    </View>
  );
}

export default function Tarjetas() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const params = useLocalSearchParams<{ inst?: string }>();
  const filtro = useInstitucion((s) => s.filtro);
  const primary = useInstitucion((s) => s.institucion);
  const idInst = params.inst ? Number(params.inst) : (filtro ?? primary?.idInstitucion ?? null);

  const { data: cards, isLoading, refetch } = useTarjetas(idInst);

  const [numero, setNumero] = useState('');
  const [holder, setHolder] = useState('');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');
  const [cvc, setCvc] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  function resetForm() {
    setNumero(''); setHolder(''); setMes(''); setAnio(''); setCvc(''); setShowForm(false);
  }

  async function guardar() {
    if (idInst == null) return;
    const num = numero.replace(/\s+/g, '');
    const mm = Number(mes);
    let yy = Number(anio);
    if (yy < 100) yy += 2000;
    if (num.length < 13 || !holder.trim() || !(mm >= 1 && mm <= 12) || yy < 2024 || cvc.length < 3) {
      Alert.alert(tr('cards.invalid'), tr('cards.checkFields'));
      return;
    }
    setSaving(true);
    try {
      await agregarTarjeta({ idInstitucion: idInst, numero: num, holderName: holder.trim(), expiryMonth: mm, expiryYear: yy, cvc });
      void qc.invalidateQueries({ queryKey: ['tarjetas', idInst] });
      resetForm();
    } catch (err) {
      Alert.alert(tr('cards.addError'), err instanceof ApiError ? err.message : '');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(c: Tarjeta) {
    const ok = await confirm({
      title: tr('cards.removeTitle'),
      message: `•••• ${c.last4}`,
      confirmText: tr('cards.remove'),
      cancelText: tr('common.cancel'),
      destructive: true,
      icon: 'trash-outline',
    });
    if (!ok) return;
    try {
      await eliminarTarjeta(c.id);
      void qc.invalidateQueries({ queryKey: ['tarjetas', idInst] });
    } catch {
      Alert.alert(tr('common.error'), '');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.colors.text} />
        </Pressable>
        <AppText variant="title">{tr('cards.title')}</AppText>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.md }}>
        {idInst == null ? (
          <AppText muted style={{ marginTop: spacing.xl }}>{tr('cards.noInstitution')}</AppText>
        ) : isLoading ? (
          [0, 1].map((i) => <Skeleton key={i} height={64} radius={radius.lg} />)
        ) : (cards?.length ?? 0) === 0 && !showForm ? (
          <View style={{ alignItems: 'center', gap: spacing.md, marginTop: spacing.xl }}>
            <Ionicons name="card-outline" size={44} color={t.colors.textFaint} />
            <AppText muted>{tr('cards.empty')}</AppText>
          </View>
        ) : (
          cards?.map((c) => <CardRow key={c.id} c={c} onDelete={() => confirmDelete(c)} />)
        )}

        {/* formulario */}
        {idInst != null && (showForm ? (
          <View style={{ gap: spacing.md, backgroundColor: t.colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.colors.border, padding: spacing.lg, marginTop: spacing.sm }}>
            <AppText variant="subtitle">{tr('cards.addTitle')}</AppText>
            <Field label={tr('cards.number')} value={numero} onChangeText={setNumero} placeholder="4111 1111 1111 1111" keyboardType="number-pad" maxLength={19} />
            <Field label={tr('cards.holder')} value={holder} onChangeText={setHolder} placeholder="JOHN DOE" />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Field label={tr('cards.month')} value={mes} onChangeText={setMes} placeholder="MM" keyboardType="number-pad" maxLength={2} flex={1} />
              <Field label={tr('cards.year')} value={anio} onChangeText={setAnio} placeholder="YYYY" keyboardType="number-pad" maxLength={4} flex={1} />
              <Field label="CVC" value={cvc} onChangeText={setCvc} placeholder="123" keyboardType="number-pad" maxLength={4} flex={1} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="lock-closed" size={14} color={t.colors.textFaint} />
              <AppText muted variant="caption" style={{ flex: 1 }}>{tr('cards.secure')}</AppText>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}><Button title={tr('common.cancel')} variant="secondary" onPress={resetForm} /></View>
              <View style={{ flex: 1 }}><Button title={tr('cards.save')} onPress={guardar} loading={saving} /></View>
            </View>
          </View>
        ) : (
          <Button title={tr('cards.add')} variant="secondary" onPress={() => setShowForm(true)} style={{ marginTop: spacing.sm }} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
